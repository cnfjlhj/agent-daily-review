#!/usr/bin/env node

const os = require('os');
const path = require('path');

const { generateDailyReport } = require('./run-daily-report');
const { sendDailyHtmlReport } = require('../telegram/send-daily-html-report');
const { toLocalDateString } = require('../../src/utils/agent-daily-report');
const {
  resolveAgentDailyReviewConfig
} = require('../../src/utils/agent-daily-review-config');

function parseArgs(argv) {
  const args = {
    date: '',
    homeDir: '',
    outRoot: '',
    config: '',
    session: '',
    caption: '',
    analysisMode: '',
    botToken: '',
    chatId: '',
    botName: '',
    dryRun: false,
    skipSend: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];

    if (current === '--date' && next) {
      args.date = next;
      i += 1;
    } else if (current === '--config' && next) {
      args.config = next;
      i += 1;
    } else if (current === '--home-dir' && next) {
      args.homeDir = next;
      i += 1;
    } else if (current === '--out-root' && next) {
      args.outRoot = next;
      i += 1;
    } else if (current === '--session' && next) {
      args.session = next;
      i += 1;
    } else if (current === '--caption' && next) {
      args.caption = next;
      i += 1;
    } else if (current === '--analysis-mode' && next) {
      args.analysisMode = next;
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
    } else if (current === '--dry-run') {
      args.dryRun = true;
    } else if (current === '--skip-send') {
      args.skipSend = true;
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
    '  node scripts/agent-daily-review/run-nightly-report.js --session codex_new',
    '  node scripts/agent-daily-review/run-nightly-report.js --config ./agent-daily-review.json',
    '',
    'Options:',
    '  --date <YYYY-MM-DD>    Day to analyze (default: today in Asia/Shanghai)',
    '  --config <path>        JSON config file for open-source/public use',
    '  --home-dir <path>      Home directory to read Codex/Claude logs from',
    '  --out-root <path>      Root output directory (default: work/agent-daily-review)',
    '  --session <name>       Fixed Telegram session/bot binding for the nightly report',
    '  --caption <text>       Optional Telegram caption',
    '  --analysis-mode <m>    heuristic | compact-first | auto',
    '  --bot-token <token>    Send directly without cc-connect',
    '  --chat-id <id>         Target chat id for direct send',
    '  --bot-name <name>      Optional bot/display name for direct send',
    '  --dry-run              Resolve Telegram target only, do not send',
    '  --skip-send            Generate report only, skip Telegram delivery',
    '',
    'Environment:',
    '  AGENT_DAILY_REPORT_CONFIG    Default JSON config path',
    '  AGENT_DAILY_REPORT_SESSION   Default Telegram session when --session is omitted',
    '  AGENT_DAILY_REPORT_BOT_TOKEN Direct-send bot token',
    '  AGENT_DAILY_REPORT_CHAT_ID   Direct-send chat id'
  ].join('\n'));
}

async function runNightlyReport(options = {}) {
  const resolved = resolveAgentDailyReviewConfig(options);
  const date = resolved.date || toLocalDateString(new Date().toISOString());
  const outRoot = resolved.outRoot || path.join(process.cwd(), 'work', 'agent-daily-review');
  const outDir = path.join(outRoot, date);
  const generated = await generateDailyReport({
    date,
    homeDir: resolved.homeDir,
    outDir,
    analysisMode: resolved.analysisMode || process.env.AGENT_DAILY_REPORT_ANALYSIS_MODE || 'auto'
  });

  const caption = resolved.caption || `${generated.report.date} 使用习惯审计`;
  let delivery = null;

  if (!resolved.skipSend) {
    delivery = await sendDailyHtmlReport({
      ...resolved,
      reportFile: generated.htmlPath,
      caption,
      dryRun: resolved.dryRun,
      homeDir: resolved.homeDir
    });
  }

  return {
    ...generated,
    caption,
    delivery
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const output = await runNightlyReport(args);
  console.log(`DATE=${output.report.date}`);
  console.log(`SESSIONS=${output.report.sessions.length}`);
  console.log(`VERDICT=${output.report.verdict}`);
  console.log(`HTML_PATH=${output.htmlPath}`);
  console.log(`JSON_PATH=${output.jsonPath}`);

  if (args.skipSend) {
    console.log('SEND=skipped');
    return;
  }

  console.log(`SESSION=${output.delivery.target.session}`);
  console.log(`TARGET_SOURCE=${output.delivery.target.source}`);
  console.log(`CHAT_ID=${output.delivery.target.chatId}`);

  if (args.dryRun) {
    console.log('DRY_RUN=yes');
    return;
  }

  console.log(`SEND_MODE=${output.delivery.sent.mode}`);
  console.log(`MESSAGE_ID=${output.delivery.result.message_id}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ run-nightly-report failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  printHelp,
  runNightlyReport
};
