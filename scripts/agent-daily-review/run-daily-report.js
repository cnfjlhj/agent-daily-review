#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collectDayActivity,
  analyzeDayActivity,
  renderDailyHtml,
  toLocalDateString
} = require('../../src/utils/agent-daily-report');
const {
  resolveAgentDailyReviewConfig
} = require('../../src/utils/agent-daily-review-config');

function parseArgs(argv) {
  const args = {
    date: '',
    homeDir: '',
    outDir: '',
    config: '',
    factsPath: '',
    factsMode: '',
    analysisMode: '',
    jsonOnly: false
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
    } else if (current === '--out-dir' && next) {
      args.outDir = next;
      i += 1;
    } else if (current === '--facts-path' && next) {
      args.factsPath = next;
      i += 1;
    } else if (current === '--facts-mode' && next) {
      args.factsMode = next;
      i += 1;
    } else if (current === '--analysis-mode' && next) {
      args.analysisMode = next;
      i += 1;
    } else if (current === '--json-only') {
      args.jsonOnly = true;
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
    '  node scripts/agent-daily-review/run-daily-report.js --date 2026-03-23',
    '  node scripts/agent-daily-review/run-daily-report.js --config ./agent-daily-review.json',
    '',
    'Options:',
    '  --date <YYYY-MM-DD>    Day to analyze (default: today in Asia/Shanghai)',
    '  --config <path>        JSON config file for open-source/public use',
    '  --home-dir <path>      Home directory to read Codex/Claude logs from',
    '  --out-dir <path>       Output directory (default: work/agent-daily-review/<date>)',
    '  --facts-path <path>    Optional SQLite facts cache path (default: <home>/.agent-daily-review/facts.db)',
    '  --facts-mode <mode>    refresh | prefer-cache',
    '  --analysis-mode <m>    heuristic | compact-first | auto',
    '  --json-only            Print JSON summary and skip HTML write'
  ].join('\n'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function generateDailyReport(options = {}) {
  const resolved = resolveAgentDailyReviewConfig(options);
  const args = {
    date: resolved.date || toLocalDateString(new Date().toISOString()),
    homeDir: resolved.homeDir || os.homedir(),
    outDir: resolved.outDir || options.outDir || '',
    factsPath: resolved.factsPath || options.factsPath || '',
    factsMode: resolved.factsMode || options.factsMode || process.env.AGENT_DAILY_REPORT_FACTS_MODE || 'refresh',
    jsonOnly: Boolean(options.jsonOnly),
    analysisMode: resolved.analysisMode || process.env.AGENT_DAILY_REPORT_ANALYSIS_MODE || 'auto'
  };
  const collected = collectDayActivity({
    date: args.date,
    homeDir: args.homeDir,
    factsPath: args.factsPath,
    factsMode: args.factsMode
  });
  const report = await analyzeDayActivity(collected, {
    analysisMode: args.analysisMode,
    cacheDir: args.outDir || path.join(process.cwd(), 'work', 'agent-daily-review', args.date)
  });

  if (args.jsonOnly) {
    return {
      report,
      outDir: '',
      htmlPath: '',
      jsonPath: ''
    };
  }

  const outDir = args.outDir || path.join(process.cwd(), 'work', 'agent-daily-review', report.date);
  ensureDir(outDir);

  const htmlPath = path.join(outDir, 'report.html');
  const jsonPath = path.join(outDir, 'report.json');
  fs.writeFileSync(htmlPath, renderDailyHtml(report), 'utf8');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return {
    report,
    outDir,
    htmlPath,
    jsonPath
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const output = await generateDailyReport(args);

  if (args.jsonOnly) {
    console.log(JSON.stringify(output.report, null, 2));
    return;
  }

  console.log(`DATE=${output.report.date}`);
  console.log(`SESSIONS=${output.report.sessions.length}`);
  console.log(`VERDICT=${output.report.verdict}`);
  console.log(`HTML_PATH=${output.htmlPath}`);
  console.log(`JSON_PATH=${output.jsonPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ run-daily-report failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  generateDailyReport,
  parseArgs,
  printHelp
};
