#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  detectSessionNameFromEnv,
  detectSessionNameFromCcConnectSessions,
  detectSessionNameFromTranscript,
  parseCcConnectConfig,
  resolveSessionTelegramTarget
} = require('../src/utils/session-telegram-target');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function run() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-target-test-'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-target-project-'));

  const toml = [
    '[[projects]]',
    '  name = "codex_new1"',
    '  [projects.agent]',
    '    type = "codex"',
    '    [projects.agent.options]',
    '      work_dir = "/home/cnfjlhj/projects"',
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
        updated_at: '2026-03-11T14:31:15.421528669+08:00',
        history: [
          {
            role: 'user',
            content: '你试试简报能不能给我发哈。我发现现在基本都不会发简报了'
          }
        ]
      }
    },
    active_session: {
      'telegram:999888777:6756742471': 's1'
    }
  };

  const multiTargets = {
    targets: [
      {
        session: 'codex_new2',
        enabled: true,
        telegram: {
          botToken: 'token-from-multi-targets',
          botName: 'codex_new2_bot',
          chatId: '123456789'
        }
      }
    ]
  };

  writeFile(path.join(tempHome, '.cc-connect', 'config.toml'), toml);
  writeFile(
    path.join(tempHome, '.cc-connect', 'sessions', 'codex_new1_16d4fc98.json'),
    JSON.stringify(sessionState, null, 2)
  );
  writeFile(
    path.join(tempHome, '.cc-connect', 'sessions', 'codex_new2_16d4fc98.json'),
    JSON.stringify({
      sessions: {
        s2: {
          id: 's2',
          updated_at: '2026-03-11T11:54:25.797749003+08:00'
        }
      },
      active_session: {
        'telegram:111222333:6756742471': 's2'
      }
    }, null, 2)
  );
  writeFile(
    path.join(projectRoot, 'config', 'multi-targets.json'),
    JSON.stringify(multiTargets, null, 2)
  );

  const parsed = parseCcConnectConfig(toml);
  assert.strictEqual(parsed.projects.length, 1, 'should parse one cc-connect project');
  assert.strictEqual(parsed.projects[0].name, 'codex_new1', 'should parse project name');
  assert.strictEqual(
    parsed.projects[0].agent.options.work_dir,
    '/home/cnfjlhj/projects',
    'should parse agent work_dir from projects.agent.options'
  );
  assert.strictEqual(parsed.projects[0].platforms[0].options.token, 'token-from-cc-connect');

  const originalCcProject = process.env.CC_PROJECT;
  process.env.CC_PROJECT = 'codex_new1';
  assert.strictEqual(
    detectSessionNameFromEnv(),
    'codex_new1',
    'should accept CC_PROJECT as an explicit session source'
  );
  if (originalCcProject === undefined) {
    delete process.env.CC_PROJECT;
  } else {
    process.env.CC_PROJECT = originalCcProject;
  }

  assert.strictEqual(
    detectSessionNameFromCcConnectSessions(tempHome),
    'codex_new1',
    'should pick the most recently updated active cc-connect session'
  );
  assert.strictEqual(
    detectSessionNameFromTranscript('基本都不会发简报了', tempHome),
    'codex_new1',
    'should identify the session from active session history text'
  );

  const ccTarget = resolveSessionTelegramTarget('codex_new1', {
    homeDir: tempHome,
    projectRoot
  });
  assert.strictEqual(ccTarget.source, 'cc-connect');
  assert.strictEqual(ccTarget.botToken, 'token-from-cc-connect');
  assert.strictEqual(ccTarget.chatId, '999888777');

  const fallbackTarget = resolveSessionTelegramTarget('codex_new2', {
    homeDir: tempHome,
    projectRoot
  });
  assert.strictEqual(fallbackTarget.source, 'multi-targets');
  assert.strictEqual(fallbackTarget.botToken, 'token-from-multi-targets');
  assert.strictEqual(fallbackTarget.chatId, '123456789');

  console.log('✅ session-telegram-target checks passed');
}

run();
