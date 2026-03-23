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
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-html-public-artifacts-'));
  const reportPath = path.join(artifactsDir, 'report.html');
  const configPath = path.join(artifactsDir, 'agent-daily-review.json');

  writeFile(reportPath, '<html><body><h1>Daily Report</h1></body></html>');
  writeFile(configPath, JSON.stringify({
    session: 'daily_review_bot',
    telegram: {
      botToken: 'token-from-config',
      chatId: '555333111',
      botName: 'daily-review-bot'
    }
  }, null, 2));

  const directResult = spawnSync('node', [
    path.join(repoRoot, 'scripts', 'telegram', 'send-daily-html-report.js'),
    '--bot-token', 'token-direct',
    '--chat-id', '246810',
    '--report-file', reportPath,
    '--caption', '完整 HTML 日报',
    '--dry-run'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(directResult.status, 0, `direct dry-run should succeed: ${directResult.stderr}`);
  assert.match(directResult.stdout, /DRY_RUN=yes/, 'direct mode should report dry-run');
  assert.match(directResult.stdout, /TARGET_SOURCE=direct/, 'direct mode should expose direct source');
  assert.match(directResult.stdout, /CHAT_ID=246810/, 'direct mode should expose the explicit chat id');

  const configResult = spawnSync('node', [
    path.join(repoRoot, 'scripts', 'telegram', 'send-daily-html-report.js'),
    '--config', configPath,
    '--report-file', reportPath,
    '--dry-run'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.strictEqual(configResult.status, 0, `config dry-run should succeed: ${configResult.stderr}`);
  assert.match(configResult.stdout, /DRY_RUN=yes/, 'config mode should report dry-run');
  assert.match(configResult.stdout, /TARGET_SOURCE=config/, 'config mode should expose config source');
  assert.match(configResult.stdout, /SESSION=daily_review_bot/, 'config mode should expose the configured session');
  assert.match(configResult.stdout, /CHAT_ID=555333111/, 'config mode should expose the configured chat id');

  console.log('✅ public telegram config checks passed');
}

run();
