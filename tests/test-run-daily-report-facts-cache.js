#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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
  const repoRoot = path.join(__dirname, '..');
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-facts-cli-home-'));
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-facts-cli-out-'));
  const date = '2026-03-23';
  const sessionPath = path.join(
    tempHome,
    '.codex',
    'sessions',
    '2026',
    '03',
    '23',
    'rollout-2026-03-23T10-00-00-facts-cli.jsonl'
  );

  writeJsonl(sessionPath, [
    {
      type: 'session_meta',
      payload: {
        id: 'facts-cli-session',
        timestamp: '2026-03-23T02:00:00.000Z',
        cwd: '/home/cnfjlhj/projects/demo-cli-facts'
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
            text: '帮我确认今天到底做了什么，不要只罗列。'
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
            text: '我会先梳理主线，再识别哪些地方只是空转。'
          }
        ]
      }
    },
    {
      type: 'event_msg',
      payload: {
        type: 'user_message'
      },
      timestamp: '2026-03-23T02:00:05.000Z'
    }
  ]);

  const first = spawnSync('node', [
    path.join(repoRoot, 'scripts', 'agent-daily-review', 'run-daily-report.js'),
    '--date', date,
    '--home-dir', tempHome,
    '--out-dir', path.join(outRoot, 'first')
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENT_DAILY_REPORT_ANALYSIS_MODE: 'heuristic'
    },
    encoding: 'utf8'
  });

  assert.strictEqual(first.status, 0, `first daily report should succeed: ${first.stderr}`);
  assert.match(first.stdout, /SESSIONS=1/, 'first daily report should see one raw session');

  fs.rmSync(sessionPath);

  const second = spawnSync('node', [
    path.join(repoRoot, 'scripts', 'agent-daily-review', 'run-daily-report.js'),
    '--date', date,
    '--home-dir', tempHome,
    '--out-dir', path.join(outRoot, 'second')
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENT_DAILY_REPORT_ANALYSIS_MODE: 'heuristic'
    },
    encoding: 'utf8'
  });

  assert.strictEqual(second.status, 0, `second daily report should succeed from cached facts: ${second.stderr}`);
  assert.match(second.stdout, /SESSIONS=1/, 'second daily report should still recover one cached session');
  assert.doesNotMatch(second.stderr, /ExperimentalWarning/, 'facts-backed CLI should not leak SQLite experimental warnings');

  console.log('✅ daily report CLI facts-cache checks passed');
}

run();
