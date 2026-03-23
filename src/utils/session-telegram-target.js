const fs = require('fs');
const os = require('os');
const path = require('path');

function normalizeSessionName(name) {
  return String(name || '').trim().replace(/-/g, '_');
}

function sessionNamesMatch(left, right) {
  return normalizeSessionName(left) === normalizeSessionName(right);
}

function stripInlineComment(rawValue) {
  let result = '';
  let inQuote = false;
  let escaped = false;

  for (const ch of String(rawValue || '')) {
    if (ch === '"' && !escaped) {
      inQuote = !inQuote;
    }

    if (ch === '#' && !inQuote) {
      break;
    }

    result += ch;
    escaped = ch === '\\' && !escaped;
    if (ch !== '\\') {
      escaped = false;
    }
  }

  return result.trim();
}

function parseTomlValue(rawValue) {
  const value = stripInlineComment(rawValue);

  if (!value.length) {
    return '';
  }

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

function parseCcConnectConfig(content) {
  const projects = [];
  let currentProject = null;
  let currentAgent = null;
  let currentPlatform = null;
  let currentSection = '';

  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line === '[[projects]]') {
      currentProject = { agent: { options: {} }, platforms: [] };
      currentAgent = null;
      currentPlatform = null;
      currentSection = 'projects';
      projects.push(currentProject);
      continue;
    }

    if (line === '[[projects.platforms]]') {
      if (!currentProject) {
        continue;
      }
      currentPlatform = { options: {} };
      currentSection = 'projects.platforms';
      currentProject.platforms.push(currentPlatform);
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      if (line === '[projects.agent]') {
        if (!currentProject) {
          continue;
        }
        currentAgent = currentProject.agent || { options: {} };
        currentProject.agent = currentAgent;
        currentSection = 'projects.agent';
        continue;
      }

      if (line === '[projects.agent.options]') {
        if (!currentProject) {
          continue;
        }
        currentAgent = currentProject.agent || { options: {} };
        currentAgent.options = currentAgent.options || {};
        currentProject.agent = currentAgent;
        currentSection = 'projects.agent.options';
        continue;
      }

      currentSection = line.slice(1, -1);
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = parseTomlValue(rawValue);

    if (currentSection === 'projects.agent.options' && currentAgent) {
      currentAgent.options[key] = value;
      continue;
    }

    if (currentSection === 'projects.agent' && currentAgent) {
      currentAgent[key] = value;
      continue;
    }

    if (currentSection === 'projects.platforms.options' && currentPlatform) {
      currentPlatform.options[key] = value;
      continue;
    }

    if (currentSection === 'projects.platforms' && currentPlatform) {
      currentPlatform[key] = value;
      continue;
    }

    if (currentSection === 'projects' && currentProject) {
      currentProject[key] = value;
    }
  }

  return { projects };
}

function loadCcConnectProjects(homeDir = os.homedir()) {
  const configPath = path.join(homeDir, '.cc-connect', 'config.toml');
  if (!fs.existsSync(configPath)) {
    return { configPath, projects: [] };
  }

  const parsed = parseCcConnectConfig(fs.readFileSync(configPath, 'utf8'));
  return {
    configPath,
    projects: parsed.projects || []
  };
}

function getCcConnectSessionFiles(sessionName, homeDir = os.homedir()) {
  const sessionsDir = path.join(homeDir, '.cc-connect', 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const normalizedPrefix = `${normalizeSessionName(sessionName)}_`;
  return fs.readdirSync(sessionsDir)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => normalizeSessionName(name).startsWith(normalizedPrefix))
    .map((name) => path.join(sessionsDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function sessionNameFromSessionFile(filePath) {
  return path.basename(filePath).replace(/_[^_]+\.json$/, '');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractChatIdFromSessionState(state) {
  const activeSession = state && typeof state.active_session === 'object'
    ? state.active_session
    : {};
  const sessions = state && typeof state.sessions === 'object'
    ? state.sessions
    : {};

  let best = null;

  for (const [sessionKey, internalId] of Object.entries(activeSession)) {
    const parts = String(sessionKey).split(':');
    if (parts[0] !== 'telegram' || !parts[1]) {
      continue;
    }

    const sessionData = sessions[internalId] || {};
    const updatedAt = Date.parse(sessionData.updated_at || sessionData.created_at || 0) || 0;

    if (!best || updatedAt > best.updatedAt) {
      best = {
        chatId: parts[1],
        sessionKey,
        internalId,
        updatedAt
      };
    }
  }

  return best;
}

function extractLatestSessionTimestamp(state) {
  const sessions = state && typeof state.sessions === 'object'
    ? state.sessions
    : {};

  let best = 0;
  for (const sessionData of Object.values(sessions)) {
    const updatedAt = Date.parse(sessionData.updated_at || sessionData.created_at || 0) || 0;
    if (updatedAt > best) {
      best = updatedAt;
    }
  }
  return best;
}

function getActiveTelegramChat(sessionName, homeDir = os.homedir()) {
  for (const filePath of getCcConnectSessionFiles(sessionName, homeDir)) {
    const state = readJsonFile(filePath);
    const activeChat = extractChatIdFromSessionState(state);
    if (activeChat) {
      return {
        ...activeChat,
        sessionFile: filePath
      };
    }
  }

  return null;
}

function extractActiveSessionMatch(state, matchText) {
  if (!matchText) {
    return null;
  }

  const activeSession = state && typeof state.active_session === 'object'
    ? state.active_session
    : {};
  const sessions = state && typeof state.sessions === 'object'
    ? state.sessions
    : {};

  let best = null;

  for (const internalId of Object.values(activeSession)) {
    const sessionData = sessions[internalId];
    if (!sessionData) {
      continue;
    }

    const historyText = JSON.stringify(sessionData.history || []);
    if (!historyText.includes(matchText)) {
      continue;
    }

    const updatedAt = Date.parse(sessionData.updated_at || sessionData.created_at || 0) || 0;
    if (!best || updatedAt > best.updatedAt) {
      best = {
        updatedAt,
        internalId
      };
    }
  }

  return best;
}

function resolveFromCcConnect(sessionName, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const { configPath, projects } = loadCcConnectProjects(homeDir);
  const project = projects.find((item) => sessionNamesMatch(item.name, sessionName));

  if (!project) {
    return null;
  }

  const telegramPlatform = (project.platforms || []).find((platform) => platform.type === 'telegram');
  if (!telegramPlatform || !telegramPlatform.options || !telegramPlatform.options.token) {
    return null;
  }

  const activeChat = getActiveTelegramChat(project.name, homeDir);
  const chatId = options.chatIdOverride
    || (activeChat && activeChat.chatId)
    || telegramPlatform.options.chat_id
    || telegramPlatform.options.allow_from;

  if (!chatId) {
    throw new Error(`No Telegram chat id found for session ${project.name}`);
  }

  return {
    source: 'cc-connect',
    session: project.name,
    botToken: String(telegramPlatform.options.token),
    botName: telegramPlatform.options.bot_name || project.name,
    chatId: String(chatId),
    allowFrom: telegramPlatform.options.allow_from
      ? String(telegramPlatform.options.allow_from)
      : null,
    configPath,
    sessionFile: activeChat ? activeChat.sessionFile : null,
    sessionKey: activeChat ? activeChat.sessionKey : null
  };
}

function resolveFromMultiTargets(sessionName, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const configPath = path.join(projectRoot, 'config', 'multi-targets.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const target = (config.targets || []).find((item) => sessionNamesMatch(item.session, sessionName));

  if (!target || !target.telegram || !target.telegram.botToken || !target.telegram.chatId) {
    return null;
  }

  return {
    source: 'multi-targets',
    session: target.session,
    botToken: String(target.telegram.botToken),
    botName: target.telegram.botName || target.session,
    chatId: String(target.telegram.chatId),
    configPath,
    sessionFile: null,
    sessionKey: null
  };
}

function detectSessionNameFromEnv() {
  const candidates = [
    process.env.CC_CONNECT_SESSION,
    process.env.TMUX_SESSION,
    process.env.CC_CONNECT_PROJECT,
    process.env.CC_PROJECT
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const trimmed = String(candidate).trim();
    if (/^(claude|codex)[_-]/.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

function detectSessionNameFromCcConnectSessions(homeDir = os.homedir()) {
  const sessionsDir = path.join(homeDir, '.cc-connect', 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    return null;
  }

  let best = null;

  for (const name of fs.readdirSync(sessionsDir)) {
    if (!name.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(sessionsDir, name);
    const sessionName = sessionNameFromSessionFile(filePath);
    if (!/^(claude|codex)[_-]/.test(sessionName)) {
      continue;
    }

    let state;
    try {
      state = readJsonFile(filePath);
    } catch (error) {
      continue;
    }

    const activeChat = extractChatIdFromSessionState(state);
    const updatedAt = activeChat ? activeChat.updatedAt : extractLatestSessionTimestamp(state);
    if (!updatedAt) {
      continue;
    }

    if (!best || updatedAt > best.updatedAt) {
      best = {
        sessionName,
        updatedAt
      };
    }
  }

  return best ? best.sessionName : null;
}

function detectSessionNameFromTranscript(matchText, homeDir = os.homedir()) {
  const needle = String(matchText || '').trim();
  if (!needle) {
    return null;
  }

  const sessionsDir = path.join(homeDir, '.cc-connect', 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    return null;
  }

  let best = null;

  for (const name of fs.readdirSync(sessionsDir)) {
    if (!name.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(sessionsDir, name);
    const sessionName = sessionNameFromSessionFile(filePath);
    if (!/^(claude|codex)[_-]/.test(sessionName)) {
      continue;
    }

    let state;
    let rawText = '';
    try {
      rawText = fs.readFileSync(filePath, 'utf8');
      if (!rawText.includes(needle)) {
        continue;
      }
      state = JSON.parse(rawText);
    } catch (error) {
      continue;
    }

    const activeMatch = extractActiveSessionMatch(state, needle);
    const updatedAt = activeMatch
      ? activeMatch.updatedAt
      : (extractChatIdFromSessionState(state)?.updatedAt || extractLatestSessionTimestamp(state));
    const score = activeMatch ? 2 : 1;

    if (!best || score > best.score || (score === best.score && updatedAt > best.updatedAt)) {
      best = {
        sessionName,
        updatedAt,
        score
      };
    }
  }

  return best ? best.sessionName : null;
}

function detectSessionName(options = {}) {
  return detectSessionNameFromEnv()
    || detectSessionNameFromTranscript(options.matchText, options.homeDir || os.homedir());
}

function resolveSessionTelegramTarget(sessionName, options = {}) {
  const explicitSession = sessionName || options.session || detectSessionName(options);

  if (!explicitSession) {
    throw new Error('Session name is required; pass --session, --match-text, or set CC_CONNECT_SESSION/TMUX_SESSION');
  }

  const ccConnectTarget = resolveFromCcConnect(explicitSession, options);
  if (ccConnectTarget) {
    return ccConnectTarget;
  }

  const multiTargetsTarget = resolveFromMultiTargets(explicitSession, options);
  if (multiTargetsTarget) {
    return multiTargetsTarget;
  }

  throw new Error(`Unable to resolve Telegram target for session ${explicitSession}`);
}

module.exports = {
  detectSessionName,
  detectSessionNameFromCcConnectSessions,
  detectSessionNameFromEnv,
  detectSessionNameFromTranscript,
  extractActiveSessionMatch,
  extractLatestSessionTimestamp,
  extractChatIdFromSessionState,
  getActiveTelegramChat,
  loadCcConnectProjects,
  normalizeSessionName,
  readJsonFile,
  parseCcConnectConfig,
  resolveFromCcConnect,
  resolveFromMultiTargets,
  resolveSessionTelegramTarget,
  sessionNameFromSessionFile,
  sessionNamesMatch
};
