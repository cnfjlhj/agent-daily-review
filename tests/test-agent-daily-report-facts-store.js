#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collectDayActivity
} = require('../src/utils/agent-daily-report');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJsonl(filePath, rows) {
  writeFile(filePath, rows.map((row) => JSON.stringify(row)).join('\n'));
  const latest = rows.reduce((acc, row) => {
    const candidates = [
      row && row.timestamp,
      row && row.payload && row.payload.timestamp
    ].filter(Boolean);
    for (const candidate of candidates) {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime()) && (!acc || parsed > acc)) {
        acc = parsed;
      }
    }
    return acc;
  }, null);

  if (latest) {
    fs.utimesSync(filePath, latest, latest);
  }
}

function run() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-daily-facts-home-'));
  const factsPath = path.join(tempHome, '.agent-daily-review', 'facts.db');
  const date = '2026-03-23';
  const sessionPath = path.join(
    tempHome,
    '.codex',
    'sessions',
    '2026',
    '03',
    '23',
    'rollout-2026-03-23T09-00-00-facts.jsonl'
  );

  writeJsonl(sessionPath, [
    {
      type: 'session_meta',
      payload: {
        id: 'facts-session-1',
        timestamp: '2026-03-23T01:00:00.000Z',
        cwd: '/home/cnfjlhj/projects/demo-facts',
        git: { branch: 'main' }
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '帮我把日报首页按事情归类，并指出我是不是在无用功。'
          }
        ]
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: '我先把首页改成事情视图，再单独标出无效空转。'
          }
        ]
      }
    },
    {
      type: 'event_msg',
      payload: {
        type: 'user_message'
      },
      timestamp: '2026-03-23T01:00:05.000Z'
    },
    {
      type: 'event_msg',
      payload: {
        type: 'agent_message'
      },
      timestamp: '2026-03-23T01:02:05.000Z'
    }
  ]);

  const first = collectDayActivity({
    date,
    homeDir: tempHome,
    factsPath
  });

  assert.strictEqual(first.sessions.length, 1, 'first scan should discover one session from raw logs');
  assert.ok(fs.existsSync(factsPath), 'first scan should materialize a facts store');

  fs.rmSync(sessionPath);

  const second = collectDayActivity({
    date,
    homeDir: tempHome,
    factsPath
  });

  assert.strictEqual(
    second.sessions.length,
    1,
    'second scan should still recover the session from cached facts even after raw logs disappear'
  );
  assert.strictEqual(second.sessions[0].sessionId, first.sessions[0].sessionId, 'facts-backed collection should preserve session identity');
  assert.strictEqual(second.sessions[0].prompt, first.sessions[0].prompt, 'facts-backed collection should preserve the original prompt');

  console.log('✅ facts-store collection checks passed');
}

run();
