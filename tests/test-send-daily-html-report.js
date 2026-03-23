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

function run() {
  const repoRoot = path.join(__dirname, '..');
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-html-report-home-'));
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-html-report-artifacts-'));
  const reportPath = path.join(artifactsDir, 'report.html');

  const toml = [
    '[[projects]]',
    '  name = "codex_new1"',
    '  [projects.agent]',
    '    type = "codex"',
    '  [[projects.platforms]]',
    '    type = "telegram"',
    '    [projects.platforms.options]',
    '      allow_from = "6756742471"',
    '      token = "token-from-cc-connect"',
    ''
  ].join('\n');

  const sessionState = {
    sessions: {
      s1: {
        id: 's1',
        updated_at: '2026-03-23T09:31:15.421528669+08:00'
      }
    },
    active_session: {
      'telegram:999888777:6756742471': 's1'
    }
  };

  writeFile(path.join(tempHome, '.cc-connect', 'config.toml'), toml);
  writeFile(
    path.join(tempHome, '.cc-connect', 'sessions', 'codex_new1_16d4fc98.json'),
    JSON.stringify(sessionState, null, 2)
  );
  writeFile(reportPath, '<html><body><h1>Daily Report</h1></body></html>');

  const result = spawnSync('node', [
    path.join(repoRoot, 'scripts', 'telegram', 'send-daily-html-report.js'),
    '--session', 'codex_new1',
    '--report-file', reportPath,
    '--caption', '完整 HTML 日报',
    '--dry-run'
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: tempHome
    },
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, `dry-run should succeed: ${result.stderr}`);
  assert.match(result.stdout, /DRY_RUN=yes/, 'should report dry-run');
  assert.match(result.stdout, /SESSION=codex_new1/, 'should resolve session target');
  assert.match(result.stdout, /HTML_PATH=.*report\.html/, 'should expose html path');
  assert.match(result.stdout, /CHAT_ID=999888777/, 'should expose target chat id');

  console.log('✅ daily html telegram dry-run checks passed');
}

run();
