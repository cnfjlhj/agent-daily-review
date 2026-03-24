const fs = require('fs');
const os = require('os');
const path = require('path');

let sqliteModule = null;
let sqliteUnavailable = false;

function loadSqliteModule() {
  if (sqliteUnavailable) {
    return null;
  }
  if (sqliteModule) {
    return sqliteModule;
  }
  const originalEmitWarning = process.emitWarning;
  try {
    process.emitWarning = function patchedEmitWarning(warning, ...args) {
      const warningType = typeof args[0] === 'string'
        ? args[0]
        : (warning && warning.name) || '';
      const warningMessage = typeof warning === 'string'
        ? warning
        : (warning && warning.message) || '';
      if (
        warningType === 'ExperimentalWarning'
        && /SQLite is an experimental feature/i.test(warningMessage)
      ) {
        return;
      }
      return originalEmitWarning.call(process, warning, ...args);
    };
    sqliteModule = require('node:sqlite');
    return sqliteModule;
  } catch (error) {
    sqliteUnavailable = true;
    return null;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function defaultFactsPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.agent-daily-review', 'facts.db');
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonFallbackStore(factsPath) {
  if (!fs.existsSync(factsPath)) {
    return { days: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.days && typeof parsed.days === 'object'
      ? parsed
      : { days: {} };
  } catch (error) {
    return { days: {} };
  }
}

function writeJsonFallbackStore(factsPath, payload) {
  ensureParentDir(factsPath);
  fs.writeFileSync(factsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function openFactsDb(factsPath) {
  const sqlite = loadSqliteModule();
  if (!sqlite || !sqlite.DatabaseSync) {
    return null;
  }

  ensureParentDir(factsPath);
  const db = new sqlite.DatabaseSync(factsPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_day_facts (
      agent TEXT NOT NULL,
      session_id TEXT NOT NULL,
      date TEXT NOT NULL,
      start_at TEXT,
      end_at TEXT,
      session_start_at TEXT,
      session_end_at TEXT,
      project_label TEXT,
      cwd TEXT,
      prompt TEXT,
      source_file TEXT,
      payload_json TEXT NOT NULL,
      source_scan_at TEXT NOT NULL,
      PRIMARY KEY (agent, session_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_session_day_facts_date
      ON session_day_facts(date, start_at);

    CREATE TABLE IF NOT EXISTS day_fact_runs (
      date TEXT PRIMARY KEY,
      total_sessions INTEGER NOT NULL DEFAULT 0,
      by_agent_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function buildSummary(sessions = []) {
  const byAgent = sessions.reduce((acc, session) => {
    acc[session.agent] = (acc[session.agent] || 0) + 1;
    return acc;
  }, {});

  return {
    totalSessions: sessions.length,
    byAgent
  };
}

function sortSessions(sessions = []) {
  sessions.sort((left, right) => {
    return String(left.startAt || '').localeCompare(String(right.startAt || ''));
  });
  return sessions;
}

function saveDayFacts({ date, factsPath, sessions = [] }) {
  const db = openFactsDb(factsPath);
  const summary = buildSummary(sessions);
  const scanAt = new Date().toISOString();
  if (!db) {
    const store = readJsonFallbackStore(factsPath);
    store.days[date] = {
      sessions,
      summary,
      updatedAt: scanAt
    };
    writeJsonFallbackStore(factsPath, store);
    return true;
  }
  const insertRow = db.prepare(`
    INSERT INTO session_day_facts (
      agent,
      session_id,
      date,
      start_at,
      end_at,
      session_start_at,
      session_end_at,
      project_label,
      cwd,
      prompt,
      source_file,
      payload_json,
      source_scan_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent, session_id, date) DO UPDATE SET
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      session_start_at = excluded.session_start_at,
      session_end_at = excluded.session_end_at,
      project_label = excluded.project_label,
      cwd = excluded.cwd,
      prompt = excluded.prompt,
      source_file = excluded.source_file,
      payload_json = excluded.payload_json,
      source_scan_at = excluded.source_scan_at
  `);
  const deleteRows = db.prepare(`DELETE FROM session_day_facts WHERE date = ?`);
  const saveRun = db.prepare(`
    INSERT INTO day_fact_runs (date, total_sessions, by_agent_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      total_sessions = excluded.total_sessions,
      by_agent_json = excluded.by_agent_json,
      updated_at = excluded.updated_at
  `);

  try {
    db.exec('BEGIN');
    deleteRows.run(date);
    for (const session of sessions) {
      insertRow.run(
        session.agent || '',
        session.sessionId || '',
        date,
        session.startAt || '',
        session.endAt || '',
        session.sessionStartAt || '',
        session.sessionEndAt || '',
        session.projectLabel || '',
        session.cwd || '',
        session.prompt || '',
        session.sourceFile || '',
        JSON.stringify(session),
        scanAt
      );
    }
    saveRun.run(
      date,
      summary.totalSessions,
      JSON.stringify(summary.byAgent || {}),
      scanAt
    );
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback failure and surface the original write error.
    }
    db.close();
    throw error;
  }
  db.close();
  return true;
}

function loadDayFacts({ date, factsPath, homeDir }) {
  const db = openFactsDb(factsPath);
  if (!db) {
    const store = readJsonFallbackStore(factsPath);
    const day = store.days && store.days[date];
    if (!day || !Array.isArray(day.sessions) || day.sessions.length === 0) {
      return null;
    }
    const sessions = sortSessions(day.sessions.slice());
    const summary = day.summary && typeof day.summary === 'object'
      ? day.summary
      : buildSummary(sessions);
    return {
      date,
      homeDir: homeDir || os.homedir(),
      sessions,
      summary
    };
  }

  const rows = db.prepare(`
    SELECT payload_json
    FROM session_day_facts
    WHERE date = ?
    ORDER BY start_at ASC, agent ASC, session_id ASC
  `).all(date);

  const runRow = db.prepare(`
    SELECT total_sessions, by_agent_json
    FROM day_fact_runs
    WHERE date = ?
  `).get(date);

  db.close();

  if (!rows.length) {
    return null;
  }

  const sessions = sortSessions(rows
    .map((row) => {
      try {
        return JSON.parse(row.payload_json);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean));

  const byAgent = runRow && runRow.by_agent_json
    ? (() => {
      try {
        return JSON.parse(runRow.by_agent_json);
      } catch (error) {
        return buildSummary(sessions).byAgent;
      }
    })()
    : buildSummary(sessions).byAgent;

  return {
    date,
    homeDir: homeDir || os.homedir(),
    sessions,
    summary: {
      totalSessions: Number(runRow && runRow.total_sessions) || sessions.length,
      byAgent
    }
  };
}

module.exports = {
  defaultFactsPath,
  loadDayFacts,
  saveDayFacts
};
