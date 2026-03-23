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
}

function run() {
  const repoRoot = path.join(__dirname, '..');
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-public-home-'));
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-public-out-'));
  const configPath = path.join(outRoot, 'agent-daily-review.json');
  const date = '2026-03-23';

  writeJsonl(
    path.join(tempHome, '.codex', 'sessions', '2026', '03', '23', 'nightly-sample.jsonl'),
    [
      {
        type: 'session_meta',
        payload: {
          id: 'nightly-sample-session',
          timestamp: '2026-03-23T14:30:00.000Z',
          cwd: '/home/cnfjlhj/projects/demo-app',
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
              text: '/star 为什么会失败？先帮我定位根因，不要急着改文件。'
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
              text: '已经定位到根因：当前绑定的是内部 session key，不是原生 Codex session id。'
            }
          ]
        }
      },
      {
        type: 'event_msg',
        payload: {
          type: 'task_complete'
        },
        timestamp: '2026-03-23T14:45:00.000Z'
      }
    ]
  );

  writeFile(configPath, JSON.stringify({
    homeDir: tempHome,
    outRoot,
    analysisMode: 'heuristic',
    session: 'daily_review_bot',
    telegram: {
      botToken: 'token-from-config',
      chatId: '112233'
    }
  }, null, 2));

  const result = spawnSync('node', [
    path.join(repoRoot, 'scripts', 'agent-daily-review', 'run-nightly-report.js'),
    '--date', date,
    '--config', configPath,
    '--dry-run'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, `nightly config dry-run should succeed: ${result.stderr}`);
  assert.match(result.stdout, /DATE=2026-03-23/, 'should print analyzed date');
  assert.match(result.stdout, /SESSION=daily_review_bot/, 'should use configured session');
  assert.match(result.stdout, /TARGET_SOURCE=config/, 'should use config delivery target');
  assert.match(result.stdout, /CHAT_ID=112233/, 'should expose configured chat id');
  assert.match(result.stdout, /DRY_RUN=yes/, 'should support dry-run delivery');
  assert.match(result.stdout, /HTML_PATH=.*report\.html/, 'should write the html report artifact');

  const reportPath = path.join(outRoot, date, 'report.html');
  assert.ok(fs.existsSync(reportPath), 'nightly config runner should generate the HTML report file');

  console.log('✅ nightly public config checks passed');
}

run();
