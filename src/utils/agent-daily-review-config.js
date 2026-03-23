const fs = require('fs');
const os = require('os');

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function readAgentDailyReviewConfig(configPath) {
  const normalizedPath = normalizeString(configPath);
  if (!normalizedPath) {
    return {};
  }

  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Agent daily review config not found: ${normalizedPath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(normalizedPath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse agent daily review config ${normalizedPath}: ${error.message}`);
  }
}

function resolveAgentDailyReviewConfig(options = {}, env = process.env) {
  const configPath = normalizeString(options.config || options.configFile || env.AGENT_DAILY_REPORT_CONFIG);
  const fileConfig = readAgentDailyReviewConfig(configPath);
  const telegramConfig = fileConfig && typeof fileConfig.telegram === 'object'
    ? fileConfig.telegram
    : {};

  return {
    config: configPath,
    configPath,
    date: normalizeString(options.date || fileConfig.date || env.AGENT_DAILY_REPORT_DATE),
    homeDir: normalizeString(options.homeDir || fileConfig.homeDir || env.AGENT_DAILY_REPORT_HOME_DIR) || os.homedir(),
    outRoot: normalizeString(options.outRoot || fileConfig.outRoot || env.AGENT_DAILY_REPORT_OUT_ROOT),
    outDir: normalizeString(options.outDir || fileConfig.outDir || env.AGENT_DAILY_REPORT_OUT_DIR),
    analysisMode: normalizeString(options.analysisMode || fileConfig.analysisMode || env.AGENT_DAILY_REPORT_ANALYSIS_MODE),
    session: normalizeString(options.session || fileConfig.session || env.AGENT_DAILY_REPORT_SESSION),
    caption: normalizeString(options.caption || fileConfig.caption || env.AGENT_DAILY_REPORT_CAPTION),
    matchText: normalizeString(options.matchText || fileConfig.matchText || env.AGENT_DAILY_REPORT_MATCH_TEXT),
    reportFile: normalizeString(options.reportFile || fileConfig.reportFile || env.AGENT_DAILY_REPORT_REPORT_FILE),
    botToken: normalizeString(options.botToken || telegramConfig.botToken || fileConfig.botToken || env.AGENT_DAILY_REPORT_BOT_TOKEN),
    chatId: normalizeString(options.chatId || telegramConfig.chatId || fileConfig.chatId || env.AGENT_DAILY_REPORT_CHAT_ID),
    botName: normalizeString(options.botName || telegramConfig.botName || fileConfig.botName || env.AGENT_DAILY_REPORT_BOT_NAME),
    dryRun: Boolean(options.dryRun),
    skipSend: Boolean(options.skipSend)
  };
}

module.exports = {
  normalizeString,
  readAgentDailyReviewConfig,
  resolveAgentDailyReviewConfig
};
