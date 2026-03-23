#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function writeFile(filePath, content, mode) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  if (mode) {
    fs.chmodSync(filePath, mode);
  }
}

function run() {
  const repoRoot = path.join(__dirname, '..');
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-crontab-bin-'));
  const fakeStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-crontab-state-'));
  const fakeCrontab = path.join(fakeBin, 'crontab');
  const configPath = path.join(fakeStateDir, 'agent-daily-review.json');
  const currentFile = path.join(fakeStateDir, 'current-crontab.txt');
  const lastInstallFile = path.join(fakeStateDir, 'last-install.txt');

  writeFile(configPath, JSON.stringify({
    homeDir: '/tmp/fake-home',
    telegram: {
      botToken: 'token',
      chatId: '123'
    }
  }, null, 2));
  writeFile(currentFile, '# existing cron\n');
  writeFile(fakeCrontab, `#!/usr/bin/env bash
set -euo pipefail
CURRENT_FILE="${currentFile}"
LAST_INSTALL_FILE="${lastInstallFile}"

if [[ "$#" -eq 1 && "$1" == "-l" ]]; then
  if [[ -f "$CURRENT_FILE" ]]; then
    cat "$CURRENT_FILE"
  fi
  exit 0
fi

if [[ "$#" -eq 1 && "$1" == "-" ]]; then
  cat > "$LAST_INSTALL_FILE"
  cp "$LAST_INSTALL_FILE" "$CURRENT_FILE"
  exit 0
fi

echo "unsupported fake crontab args: $*" >&2
exit 1
`, 0o755);

  const result = spawnSync('bash', [
    path.join(repoRoot, 'scripts', 'agent-daily-review', 'install-cron.sh'),
    '--config', configPath,
    '--cron', '30 23 * * *'
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH || ''}`
    },
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, `cron install with config should succeed: ${result.stderr}`);
  const installed = fs.readFileSync(lastInstallFile, 'utf8');
  assert.match(installed, /BEGIN agent-daily-review-nightly/, 'should write the nightly cron block');
  assert.match(installed, /AGENT_DAILY_REPORT_CONFIG=/, 'should export config path into the cron job');
  assert.doesNotMatch(installed, /AGENT_DAILY_REPORT_SESSION=/, 'config-only install should not require a session');

  console.log('✅ install-cron config checks passed');
}

run();
