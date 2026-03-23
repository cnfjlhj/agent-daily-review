#!/usr/bin/env node

const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

const {
  detectSessionName,
  resolveSessionTelegramTarget
} = require('../../src/utils/session-telegram-target');
const {
  resolveAgentDailyReviewConfig
} = require('../../src/utils/agent-daily-review-config');

function parseArgs(argv) {
  const args = {
    config: '',
    session: '',
    reportFile: '',
    caption: '',
    botToken: '',
    chatId: '',
    botName: '',
    dryRun: false,
    matchText: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];

    if (current === '--config' && next) {
      args.config = next;
      i += 1;
    } else if (current === '--session' && next) {
      args.session = next;
      i += 1;
    } else if (current === '--report-file' && next) {
      args.reportFile = next;
      i += 1;
    } else if (current === '--caption' && next) {
      args.caption = next;
      i += 1;
    } else if (current === '--bot-token' && next) {
      args.botToken = next;
      i += 1;
    } else if (current === '--chat-id' && next) {
      args.chatId = next;
      i += 1;
    } else if (current === '--bot-name' && next) {
      args.botName = next;
      i += 1;
    } else if (current === '--match-text' && next) {
      args.matchText = next;
      i += 1;
    } else if (current === '--dry-run') {
      args.dryRun = true;
    } else if (current === '--help' || current === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${current}`);
    }
  }

  return args;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/telegram/send-daily-html-report.js --session codex_new1 --report-file /tmp/report.html',
    '  node scripts/telegram/send-daily-html-report.js --config ./agent-daily-review.json --report-file /tmp/report.html',
    '',
    'Options:',
    '  --config <path>        JSON config file for open-source/public use',
    '  --session <name>       Telegram project/session name',
    '  --report-file <path>   HTML report to send as document',
    '  --caption <text>       Optional Telegram caption',
    '  --bot-token <token>    Send directly without cc-connect',
    '  --chat-id <id>         Target chat id for direct send',
    '  --bot-name <name>      Optional bot/display name for direct send',
    '  --match-text <text>    Match recent session transcript to infer target session',
    '  --dry-run              Resolve target only, do not send'
  ].join('\n'));
}

function sanitizeTarget(target) {
  return {
    source: target.source,
    session: target.session,
    botName: target.botName,
    chatId: target.chatId,
    configPath: target.configPath,
    sessionFile: target.sessionFile,
    sessionKey: target.sessionKey
  };
}

function resolveExplicitTarget(options = {}) {
  if (!options.botToken || !options.chatId) {
    return null;
  }

  const session = options.session || (options.configPath ? 'configured-report' : 'direct');
  return {
    source: options.configPath ? 'config' : 'direct',
    session,
    botToken: String(options.botToken),
    botName: options.botName || session,
    chatId: String(options.chatId),
    configPath: options.configPath || null,
    sessionFile: null,
    sessionKey: null
  };
}

async function postDocument(target, reportFile, caption) {
  const url = `https://api.telegram.org/bot${target.botToken}/sendDocument`;
  const modes = [
    { name: 'direct', axiosConfig: { proxy: false } },
    {
      name: 'proxy',
      axiosConfig: {
        proxy: {
          protocol: 'http',
          host: '127.0.0.1',
          port: 7890
        }
      }
    }
  ];

  let lastError = null;

  for (const mode of modes) {
    const formData = new FormData();
    formData.append('chat_id', target.chatId);
    formData.append('caption', caption || '');
    formData.append('document', fs.createReadStream(reportFile), {
      filename: 'report.html',
      contentType: 'text/html'
    });

    try {
      const response = await axios.post(url, formData, {
        headers: formData.getHeaders(),
        timeout: 90000,
        ...mode.axiosConfig
      });

      if (!response.data || !response.data.ok) {
        throw new Error(`Telegram API returned non-ok response: ${JSON.stringify(response.data)}`);
      }

      return {
        mode: mode.name,
        data: response.data
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to send Telegram document');
}

async function sendDailyHtmlReport(options = {}) {
  const resolved = resolveAgentDailyReviewConfig(options);
  const reportFile = resolved.reportFile;
  if (!reportFile || !fs.existsSync(reportFile)) {
    throw new Error('HTML report file is required and must exist');
  }

  const explicitTarget = resolveExplicitTarget(resolved);
  let target = explicitTarget;
  if (!target) {
    const session = resolved.session || detectSessionName({
      matchText: resolved.matchText,
      homeDir: resolved.homeDir
    });
    if (!session) {
      throw new Error('Cannot determine current session; pass --session/--config/--bot-token/--chat-id explicitly');
    }
    target = resolveSessionTelegramTarget(session, resolved);
  }
  const caption = resolved.caption || `完整 HTML 日报 · ${target.session}`;

  let sent = null;
  let result = null;
  if (!resolved.dryRun) {
    sent = await postDocument(target, reportFile, caption);
    result = sent.data.result || {};
  }

  return {
    target,
    reportFile,
    caption,
    sent,
    result
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const output = await sendDailyHtmlReport(args);
  console.log(`SESSION=${output.target.session}`);
  console.log(`TARGET_SOURCE=${output.target.source}`);
  console.log(`CHAT_ID=${output.target.chatId}`);
  console.log(`HTML_PATH=${output.reportFile}`);

  if (args.dryRun) {
    console.log('DRY_RUN=yes');
    console.log(JSON.stringify({
      target: sanitizeTarget(output.target),
      reportFile: output.reportFile,
      caption: output.caption
    }, null, 2));
    return;
  }

  console.log(`SEND_MODE=${output.sent.mode}`);
  console.log(`MESSAGE_ID=${output.result.message_id}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ send-daily-html-report failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  postDocument,
  printHelp,
  sanitizeTarget,
  sendDailyHtmlReport
};
