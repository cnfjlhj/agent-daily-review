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
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-gate-home-'));
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-gate-out-'));
  const date = '2026-03-23';

  writeJsonl(
    path.join(tempHome, '.codex', 'sessions', '2026', '03', '23', 'nightly-gate-sample.jsonl'),
    [
      {
        type: 'session_meta',
        payload: {
          id: 'nightly-gate-session',
          timestamp: '2026-03-23T10:00:00.000Z',
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
              text: '我最近看到一个项目，就是叫做 learn claude code 这个样子。先帮我调研别人怎么做这种心理学/哲学学习网站，然后一起构思方向。'
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
              text: '不是都中文。我刚核实过参考站后，结论是：更值得做的不是百科，而是把心理学现象做成可学习、可自测、可立即试用的网站。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          output: [
            'M bin/cc-connect-codex.sh',
            'M bin/codex',
            'M config/proxy-mode.json'
          ].join('\n')
        }
      }
    ]
  );

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
        updated_at: '2026-03-23T23:31:15.421528669+08:00'
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

  const result = spawnSync('node', [
    path.join(repoRoot, 'scripts', 'agent-daily-review', 'run-nightly-report.js'),
    '--date', date,
    '--home-dir', tempHome,
    '--out-root', outRoot,
    '--session', 'codex_new1',
    '--dry-run'
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENT_DAILY_REPORT_ANALYSIS_MODE: 'heuristic'
    },
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, `nightly quality-gate run should exit cleanly: ${result.stderr}`);
  assert.match(result.stdout, /DATE=2026-03-23/, 'should still analyze the day');
  assert.match(result.stdout, /SEND=blocked_by_quality_gate/, 'should block Telegram delivery when report truthfulness is too weak');
  assert.match(result.stdout, /QUALITY_ISSUES=\d+/, 'should expose how many quality-gate issues were found');

  const reportPath = path.join(outRoot, date, 'report.html');
  assert.ok(fs.existsSync(reportPath), 'should still generate the HTML artifact for inspection');

  console.log('✅ nightly quality-gate checks passed');
}

run();
