const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createDefaultDaySynthesizer,
  createDefaultSessionCompactor,
  resolveAnalysisMode
} = require('./agent-session-compact');

const NOISE_PREFIXES = [
  '# AGENTS.md instructions',
  '<environment_context>',
  '<INSTRUCTIONS>',
  '<subagent_notification>'
];

const TOPIC_PATTERNS = [
  {
    tag: 'transcription',
    label: '播客转写',
    patterns: [/小宇宙|播客|音频|文字版|时间戳|transcript|transcribe|audio/i]
  },
  {
    tag: 'telegram-html',
    label: 'Telegram HTML 发送',
    patterns: [/telegram|senddocument|report\.html|完整.*html|\bhtml\b/i]
  },
  {
    tag: 'mubu-cli',
    label: 'Mubu CLI 维护',
    patterns: [/\bmubu\b|幕布|mubu-cli|cli_anything\/mubu/i]
  },
  {
    tag: 'session-tooling',
    label: 'Session 工具链',
    patterns: [/\/star|resumeid|cc-connect|session[- ]?stars?|open\.js|stars?\.js|session id|native codex session/i]
  },
  {
    tag: 'readme-marketing',
    label: 'README/宣传包装',
    patterns: [/README|readme|宣传|github|badge|hero|star history/i]
  },
  {
    tag: 'research-intel',
    label: 'research-intel 论文推送系统',
    patterns: [/research-intel|论文推送|paper intelligence|paper push/i]
  }
];

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(isoString) {
  if (!isoString) {
    return '';
  }

  try {
    return new Date(isoString).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false
    });
  } catch (error) {
    return isoString;
  }
}

function formatTimeOnly(isoString) {
  if (!isoString) {
    return '';
  }

  try {
    return new Date(isoString).toLocaleTimeString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '';
  }
}

function toLocalDateString(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function compareDateStrings(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function readFileMtimeDate(filePath) {
  try {
    return toLocalDateString(fs.statSync(filePath).mtime.toISOString());
  } catch (error) {
    return '';
  }
}

function codexSessionStartDateFromPath(filePath) {
  const match = String(filePath || '').match(/[\\/]\.codex[\\/]sessions[\\/](\d{4})[\\/](\d{2})[\\/](\d{2})[\\/]/);
  if (!match) {
    return '';
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function isFileCandidateForDay(filePath, date, options = {}) {
  const modifiedDate = readFileMtimeDate(filePath);
  if (modifiedDate && compareDateStrings(modifiedDate, date) < 0) {
    return false;
  }

  const startDate = options.startDate || '';
  if (startDate && compareDateStrings(startDate, date) > 0) {
    return false;
  }

  return true;
}

function listFilesRecursive(rootDir, predicate) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const stack = [rootDir];
  const files = [];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && predicate(entryPath, entry)) {
        files.push(entryPath);
      }
    }
  }
  return files.sort();
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function looksLikeNoisePrompt(text) {
  const stripped = String(text || '').trimStart();
  return NOISE_PREFIXES.some((prefix) => stripped.startsWith(prefix));
}

function normalizePrompt(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, maxLength = 160) {
  const normalized = normalizePrompt(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function readCodexMessageText(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const textParts = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    if (!['input_text', 'output_text', 'text'].includes(item.type)) {
      continue;
    }

    const text = normalizePrompt(item.text || '');
    if (!text) {
      continue;
    }
    if (payload.role === 'user' && looksLikeNoisePrompt(text)) {
      continue;
    }

    textParts.push(text);
  }
  return normalizePrompt(textParts.join(' '));
}

function readClaudeMessageText(message) {
  const content = message && message.content;
  if (typeof content === 'string') {
    return normalizePrompt(content);
  }
  if (Array.isArray(content)) {
    const textParts = content
      .filter((item) => item && typeof item === 'object' && item.type === 'text')
      .map((item) => normalizePrompt(item.text || ''))
      .filter(Boolean);
    return normalizePrompt(textParts.join(' '));
  }
  return '';
}

function pathBasenameSafe(filePath) {
  if (!filePath) {
    return 'home';
  }
  const normalized = filePath.replace(/\/+$/, '');
  return path.basename(normalized) || normalized;
}

function looksLikeHomeDir(cwd, homeDir) {
  return path.resolve(cwd || '') === path.resolve(homeDir || os.homedir());
}

function classifyPrompt(prompt) {
  const text = normalizePrompt(prompt);
  const recoveryPattern = /(找回|找一下|恢复|会话|恢复上下文|继续上次|继续昨天)/i;
  const memoryCuePattern = /(我记得|还记得|上次|之前的|昨天的|延续|接着)/i;
  const uncertaintyPattern = /(我记得|好像|大概|应该|似乎|不知道)/i;
  const anchoredProjectPattern = /(https?:\/\/|README|readme|仓库|repo|项目|系统|skill|agent|html|telegram|播客|小宇宙|论文|research-intel|baohe|\/star|\bstar\b|mubu|幕布)/i;
  const memoryCue = memoryCuePattern.test(text);
  const reentry = memoryCue && anchoredProjectPattern.test(text);

  return {
    recovery: recoveryPattern.test(text),
    uncertain: uncertaintyPattern.test(text),
    memoryCue,
    reentry,
    vague: uncertaintyPattern.test(text) && !reentry && text.length < 80
  };
}

function uniquePush(target, value) {
  if (!value || target.includes(value)) {
    return;
  }
  target.push(value);
}

function extractChangedFilesFromText(text) {
  const changedFiles = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = line.match(/^(?:[AMDR]|\?\?)\s+(.+)$/);
    if (match) {
      const candidate = match[1].trim();
      if (looksLikeChangedFilePath(candidate)) {
        uniquePush(changedFiles, candidate);
      }
    }
  }
  return changedFiles;
}

function looksLikeChangedFilePath(candidate) {
  if (!candidate || candidate.includes(':') && /:\d+:/.test(candidate)) {
    return false;
  }

  const normalized = candidate.trim();
  if (!normalized || /\s{2,}/.test(normalized) || normalized.includes('\t')) {
    return false;
  }

  if (normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../')) {
    return /^[A-Za-z0-9_./-]+$/.test(normalized);
  }

  if (/^[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$/.test(normalized)) {
    return true;
  }

  return /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(normalized);
}

function collectTopicScores(values = []) {
  const scores = {};
  for (const rawValue of values) {
    const value = String(rawValue || '');
    if (!value) {
      continue;
    }

    for (const topic of TOPIC_PATTERNS) {
      if (topic.patterns.some((pattern) => pattern.test(value))) {
        scores[topic.tag] = (scores[topic.tag] || 0) + 1;
      }
    }
  }
  return scores;
}

function mergeTopicScores(...maps) {
  const merged = {};
  for (const scoreMap of maps) {
    for (const [tag, score] of Object.entries(scoreMap || {})) {
      merged[tag] = (merged[tag] || 0) + score;
    }
  }
  return merged;
}

function topTopic(scores = {}, fallback = '') {
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  return ranked.length ? ranked[0][0] : fallback;
}

function rankTopics(scores = {}) {
  return Object.entries(scores)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([tag, score]) => ({ tag, score, label: topicLabel(tag) }));
}

function topicLabel(tag, fallback = '未归类任务') {
  const matched = TOPIC_PATTERNS.find((topic) => topic.tag === tag);
  return matched ? matched.label : fallback;
}

function listFileBasenames(files = [], limit = 3) {
  return files.slice(0, limit).map((filePath) => path.basename(filePath));
}

function matchesAnyPattern(values, pattern) {
  return values.some((value) => pattern.test(String(value || '')));
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function detectTurnTopic(text, fallback = '') {
  const scores = collectTopicScores([text]);
  return {
    tag: topTopic(scores, fallback),
    scores
  };
}

function findFirstWrongTurn(session, goalTag) {
  if (!goalTag) {
    return null;
  }

  let skippedInitialUserPrompt = false;
  const turns = session.transcriptTurns || [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn.role === 'user' && !skippedInitialUserPrompt) {
      skippedInitialUserPrompt = true;
      continue;
    }

    const detected = detectTurnTopic(turn.text, '');
    if (!detected.tag || detected.tag === goalTag) {
      continue;
    }

    return {
      index,
      role: turn.role,
      tag: detected.tag,
      label: topicLabel(detected.tag),
      text: truncate(turn.text, 180)
    };
  }

  return null;
}

function estimateReviewDepth(session, resolutionType, semanticPivot) {
  const turns = (session.transcriptTurns || []).length;
  let score = 0;
  if (turns >= 18) {
    score += 3;
  } else if (turns >= 8) {
    score += 2;
  } else if (turns >= 4) {
    score += 1;
  }
  if (semanticPivot) {
    score += 2;
  }
  if (['adjacent-infra-takeover', 'packaging-blocked', 'churned-exploration'].includes(resolutionType)) {
    score += 2;
  }
  if (['diagnosis-complete', 'disproved-path'].includes(resolutionType)) {
    score += 1;
  }
  if ((session.eventCounts.context_compacted || 0) > 0 || (session.eventCounts.turn_aborted || 0) > 0) {
    score += 1;
  }

  if (score >= 5) {
    return 'deep';
  }
  if (score >= 3) {
    return 'focused';
  }
  return 'skim';
}

function buildHumanTaskTitle(session, goalLabel) {
  const prompt = String(session.prompt || session.lastUserRequest || '');
  if (/\/star|star 为什么会失败|排查\s*\/star/i.test(prompt)) {
    return '/star 排查那条';
  }
  if (/Star History|star history|star-history/i.test(prompt)) {
    return 'ai-collab-playbook README 星标那条';
  }
  if (/(research-intel|论文推送).*(README|宣传)|(?:README|宣传).*(research-intel|论文推送)/i.test(prompt)) {
    return 'research-intel README 宣传那条';
  }
  if (/播客|小宇宙|文字版|时间戳|音频/i.test(prompt)) {
    return '播客文字版那条';
  }
  if (/日报|daily report|会话和思路都找回来/i.test(prompt)) {
    return '日报找回那条';
  }
  if (/幕布|mubu/i.test(prompt)) {
    return '幕布那条';
  }
  if (/README|readme|宣传/i.test(prompt)) {
    return 'README 宣传那条';
  }
  if (/research-intel|论文推送/i.test(prompt)) {
    return '论文推送系统那条';
  }
  return `${goalLabel}那条`;
}

function formatAgentName(agent) {
  return agent === 'claude' ? 'Claude Code' : 'Codex';
}

function assistantPrefix(session) {
  return formatAgentName(session.agent);
}

function renderTurnSpeaker(session, role) {
  return role === 'user' ? '你' : `${assistantPrefix(session)} 说了`;
}

function summarizeAgentSet(sessions = []) {
  const labels = uniqueValues(sessions.map((session) => formatAgentName(session.agent)));
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length > 1) {
    return 'AI 助手';
  }
  return 'AI 助手';
}

function buildAgentScope(byAgent = {}) {
  const labels = [];
  if (byAgent.codex) {
    labels.push('Codex');
  }
  if (byAgent.claude) {
    labels.push('Claude Code');
  }
  return labels.length ? labels.join(' / ') : 'AI 助手';
}

function buildAgentBreakdown(byAgent = {}) {
  const parts = [];
  if (byAgent.codex) {
    parts.push(`Codex ${byAgent.codex} 条`);
  }
  if (byAgent.claude) {
    parts.push(`Claude Code ${byAgent.claude} 条`);
  }
  return parts.join('，');
}

function findAssistantFollowup(session, options = {}) {
  const turns = session.transcriptTurns || [];
  const startIndex = options.startIndex == null ? -1 : options.startIndex;
  const expectedTag = options.expectedTag || '';
  const fallbackPattern = options.fallbackPattern || null;

  for (let index = startIndex + 1; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn.role !== 'assistant') {
      continue;
    }

    const tag = topTopic(collectTopicScores([turn.text]), '');
    if ((expectedTag && tag === expectedTag) || (fallbackPattern && fallbackPattern.test(turn.text))) {
      return {
        index,
        text: truncate(turn.text, 200)
      };
    }
  }

  for (let index = startIndex + 1; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn.role === 'assistant') {
      return {
        index,
        text: truncate(turn.text, 200)
      };
    }
  }

  return {
    index: -1,
    text: truncate(session.assistantExcerpt || session.assistantMessages[session.assistantMessages.length - 1] || '—', 200)
  };
}

function findFirstMatchingTurn(session, pattern, roles = []) {
  const turns = session.transcriptTurns || [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (roles.length > 0 && !roles.includes(turn.role)) {
      continue;
    }
    if (!pattern.test(String(turn.text || ''))) {
      continue;
    }
    return {
      index,
      role: turn.role,
      text: truncate(turn.text, 200)
    };
  }
  return null;
}

function buildCaseSummary(session, goalLabel, landingLabel, landingTag, resolutionType, firstWrongTurn, driftOrigin) {
  const title = buildHumanTaskTitle(session, goalLabel);
  const wrongTurnText = firstWrongTurn ? firstWrongTurn.text : '';
  const assistantLabel = assistantPrefix(session);
  let userQuote = {
    text: truncate(session.prompt || session.lastUserRequest || '—', 200),
    judgment: '这句话定义了任务起点。',
    polarity: 'neutral'
  };
  let agentQuote = {
    text: truncate(session.assistantExcerpt || '—', 200),
    judgment: '这是 agent 最后形成的结论。',
    polarity: 'neutral'
  };
  let turnLabel = '关键转折';
  let turnText = firstWrongTurn
    ? `${renderTurnSpeaker(session, firstWrongTurn.role)}：${firstWrongTurn.text}`
    : '没有明显的偏航转折。';

  if (driftOrigin === 'user-opened-side-quest') {
    turnLabel = '第一次偏掉';
    userQuote = {
      text: wrongTurnText || userQuote.text,
      judgment: '这句话把新的旁支问题插进了当前主线，会让会话开始漂移。',
      polarity: 'bad'
    };
    const assistantFollow = findAssistantFollowup(session, {
      startIndex: firstWrongTurn ? firstWrongTurn.index : -1,
      expectedTag: landingTag,
      fallbackPattern: /mubu|telegram|html|README|tool|skill/i
    });
    agentQuote = {
      text: assistantFollow.text,
      judgment: '这里 agent 没有把旁支压回待办，而是顺着把主线切走了。',
      polarity: 'bad'
    };
  } else if (driftOrigin === 'assistant-hijack') {
    turnLabel = '第一次偏掉';
    userQuote = {
      text: truncate(session.prompt || session.lastUserRequest || '—', 200),
      judgment: '开场任务本身是清楚的，问题不在你的起始要求。',
      polarity: 'good'
    };
    agentQuote = {
      text: wrongTurnText || truncate(session.assistantExcerpt || '—', 200),
      judgment: '这里是 agent 自己开始换题的地方，它没有继续守住你的原始目标。',
      polarity: 'bad'
    };
  } else if (resolutionType === 'diagnosis-complete') {
    const diagnosisTurn = findFirstMatchingTurn(
      session,
      /根因|原因是|问题在于|定位到|结论是|解析阶段就失败|root cause|failure is caused by|isolated/i,
      ['assistant']
    );
    turnLabel = '闭环发生在这里';
    turnText = diagnosisTurn
      ? `${assistantLabel} 说了：${diagnosisTurn.text}`
      : `${assistantLabel} 说了：${truncate(session.assistantExcerpt || '—', 200)}`;
    userQuote = {
      text: truncate(session.prompt || session.lastUserRequest || '—', 200),
      judgment: '这句话把任务框成了“先定位根因”，是正确的用法。',
      polarity: 'good'
    };
    agentQuote = {
      text: truncate(session.assistantExcerpt || '—', 200),
      judgment: '这里 agent 没有急着改文件，而是先把根因说清。',
      polarity: 'good'
    };
  } else if (resolutionType === 'packaging-blocked') {
    const blockingTurn = findFirstMatchingTurn(
      session,
      /Request too large|max 20MB|too large|上传.*失败|transfer.*卡住|blocked by|卡住/i
    );
    turnLabel = '第一次暴露交付风险';
    turnText = blockingTurn
      ? `${renderTurnSpeaker(session, blockingTurn.role)}：${blockingTurn.text}`
      : `${assistantLabel} 说了：${truncate(session.assistantExcerpt || '—', 200)}`;
    userQuote = {
      text: truncate(session.prompt || session.lastUserRequest || '—', 200),
      judgment: '开场任务本身是清楚的，问题不在你的目标定义。',
      polarity: 'good'
    };
    agentQuote = {
      text: truncate(session.assistantExcerpt || '—', 200),
      judgment: '这里暴露出 agent 在交付前没有提前检查体积或传输限制。',
      polarity: 'bad'
    };
  } else if (resolutionType === 'disproved-path') {
    const disproofTurn = findFirstMatchingTurn(
      session,
      /没找到|找不到|不存在|没有现成|只能自己转录|需要自己转写|not found|need to transcribe|disproved/i,
      ['assistant']
    );
    turnLabel = '证伪发生在这里';
    turnText = disproofTurn
      ? `${assistantLabel} 说了：${disproofTurn.text}`
      : `${assistantLabel} 说了：${truncate(session.assistantExcerpt || '—', 200)}`;
    userQuote = {
      text: truncate(session.prompt || session.lastUserRequest || '—', 200),
      judgment: '这条任务允许先验证路径是否存在，本身是合理的。',
      polarity: 'good'
    };
    agentQuote = {
      text: truncate(session.assistantExcerpt || '—', 200),
      judgment: 'agent 做对了：它把错误路径尽快证伪，没有继续假装推进。',
      polarity: 'good'
    };
  } else if (resolutionType === 'context-recovery') {
    turnLabel = '这轮主要在做什么';
    turnText = truncate(session.prompt || session.lastUserRequest || '—', 200);
    userQuote = {
      text: truncate(session.prompt || session.lastUserRequest || '—', 200),
      judgment: '这条主要是在找回上下文，不算错误，但会吃掉执行时间。',
      polarity: 'neutral'
    };
  } else if (resolutionType === 'shipped') {
    turnLabel = '真正落地的时刻';
    turnText = `${assistantLabel} 说了：${truncate(session.assistantExcerpt || '已经完成并落地。', 200)}`;
  }

  let verdict = '这条会话整体是中性的。';
  if (resolutionType === 'adjacent-infra-takeover') {
    verdict = `你原本在做 ${goalLabel}，最后却做到了 ${landingLabel}。真正的问题不是工作没做，而是主线被换掉了。`;
  } else if (resolutionType === 'diagnosis-complete') {
    verdict = `这条会话虽然没写文件，但 ${goalLabel} 的根因被清楚定位了，这是一次正确使用 agent 的例子。`;
  } else if (resolutionType === 'packaging-blocked') {
    verdict = `${goalLabel} 本身推进得不错，但最后一公里卡在交付约束，说明 agent 在“快完成时的验收意识”还不够。`;
  } else if (resolutionType === 'disproved-path') {
    verdict = `${goalLabel} 这条的价值在于快速排除错误路径，而不是假装把路径走通。`;
  } else if (resolutionType === 'shipped') {
    verdict = `${goalLabel} 这条最后真正落地了，说明这轮主线是守住的。`;
  }

  return {
    title,
    verdict,
    agentLabel: assistantLabel,
    userQuote,
    agentQuote,
    turnLabel,
    turnText,
    firstWrongTurn: firstWrongTurn
      ? `${renderTurnSpeaker(session, firstWrongTurn.role)}：${firstWrongTurn.text}`
      : '没有明显的偏航转折。',
    compactSummary: `${title}：${verdict}`,
    shortLanding: `${goalLabel} -> ${landingLabel}`
  };
}

function casePriorityScore(session) {
  const resolutionWeights = {
    'adjacent-infra-takeover': 120,
    'packaging-blocked': 110,
    'churned-exploration': 100,
    'diagnosis-complete': 85,
    'disproved-path': 80,
    shipped: 75,
    'context-recovery': 40,
    exploration: 20
  };

  return (resolutionWeights[session.analysis.resolutionType] || 0)
    + ((session.compaction.reviewDepth === 'deep') ? 20 : session.compaction.reviewDepth === 'focused' ? 10 : 0)
    + ((session.analysis.goalFidelity === 'low') ? 10 : 0);
}

function sortActivitiesByTimestamp(left, right) {
  return (left.timestamp || '').localeCompare(right.timestamp || '');
}

function pushActivity(activities, activity) {
  if (!activity || !activity.timestamp) {
    return;
  }
  activities.push(activity);
}

function pushMessageActivity(activities, timestamp, role, text, extra = {}) {
  if (!text) {
    return;
  }
  pushActivity(activities, {
    kind: 'message',
    timestamp,
    role,
    text,
    model: extra.model || ''
  });
}

function pushToolActivity(activities, timestamp, name) {
  if (!name) {
    return;
  }
  pushActivity(activities, {
    kind: 'tool',
    timestamp,
    name
  });
}

function pushFilesActivity(activities, timestamp, files) {
  const filtered = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!filtered.length) {
    return;
  }
  pushActivity(activities, {
    kind: 'files',
    timestamp,
    files: filtered
  });
}

function pushEventActivity(activities, timestamp, name) {
  if (!name) {
    return;
  }
  pushActivity(activities, {
    kind: 'event',
    timestamp,
    name
  });
}

function findLastMessageAtOrBefore(activities, role, timestamp) {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== 'message' || activity.role !== role || !activity.text) {
      continue;
    }
    if (!timestamp || !activity.timestamp || activity.timestamp <= timestamp) {
      return activity.text;
    }
  }
  return '';
}

function buildSessionSlice(session, sliceActivities, date) {
  const activities = (sliceActivities || []).slice().sort(sortActivitiesByTimestamp);
  if (!activities.length) {
    return null;
  }

  const toolCounts = {};
  const eventCounts = {};
  const touchedFiles = [];
  const userMessages = [];
  const assistantMessages = [];
  const transcriptTurns = [];
  let model = '';

  for (const activity of activities) {
    if (activity.kind === 'message') {
      transcriptTurns.push({
        role: activity.role,
        text: activity.text,
        timestamp: activity.timestamp
      });

      if (activity.role === 'user') {
        userMessages.push(activity.text);
      } else if (activity.role === 'assistant') {
        assistantMessages.push(activity.text);
        if (activity.model) {
          model = activity.model;
        }
      }
      continue;
    }

    if (activity.kind === 'tool') {
      toolCounts[activity.name] = (toolCounts[activity.name] || 0) + 1;
      continue;
    }

    if (activity.kind === 'files') {
      for (const file of activity.files) {
        uniquePush(touchedFiles, file);
      }
      continue;
    }

    if (activity.kind === 'event') {
      eventCounts[activity.name] = (eventCounts[activity.name] || 0) + 1;
    }
  }

  const startAt = activities[0].timestamp || session.sessionStartAt || '';
  const endAt = activities[activities.length - 1].timestamp || startAt;
  const prompt = userMessages[0]
    || findLastMessageAtOrBefore(session.activities || [], 'user', startAt)
    || session.prompt
    || '';
  const lastUserRequest = userMessages[userMessages.length - 1] || prompt;
  const assistantExcerpt = assistantMessages[assistantMessages.length - 1]
    || findLastMessageAtOrBefore(session.activities || [], 'assistant', endAt)
    || '';

  const agentModel = model || session.model || session.agent;

  return {
    agent: session.agent,
    sessionId: session.sessionId,
    date,
    startAt,
    endAt,
    cwd: session.cwd,
    projectLabel: session.projectLabel,
    prompt,
    promptFlags: classifyPrompt(prompt || lastUserRequest),
    toolCounts,
    eventCounts,
    touchedFiles,
    userMessages,
    assistantMessages,
    activities: activities.map((activity) => ({
      kind: activity.kind,
      timestamp: activity.timestamp,
      role: activity.role,
      text: activity.text,
      name: activity.name,
      files: activity.files
    })),
    transcriptTurns,
    lastUserRequest,
    assistantExcerpt,
    planCount: session.agent === 'codex' ? (toolCounts.update_plan || 0) : (toolCounts.TaskUpdate || 0),
    writeCount: session.agent === 'codex'
      ? touchedFiles.length
      : (toolCounts.Edit || 0) + (toolCounts.Write || 0),
    readCount: session.agent === 'codex'
      ? (toolCounts.exec_command || 0) + (toolCounts.view_image || 0)
      : (toolCounts.Read || 0) + (toolCounts.Grep || 0) + (toolCounts.Glob || 0),
    model: agentModel,
    sourceFile: session.sourceFile,
    sessionStartAt: session.sessionStartAt || '',
    sessionEndAt: session.sessionEndAt || '',
    continuedFromPreviousDay: Boolean(
      session.sessionStartAt
      && toLocalDateString(session.sessionStartAt) !== date
    )
  };
}

function parseCodexSession(filePath, homeDir) {
  const rows = readJsonl(filePath);
  let meta = {};
  let firstPrompt = '';
  const activities = [];
  let lastTimestamp = '';

  for (const row of rows) {
    if (row.type === 'session_meta') {
      meta = row.payload || {};
      if (meta.timestamp) {
        lastTimestamp = meta.timestamp;
      }
      continue;
    }

    const activityTimestamp = row.timestamp || lastTimestamp || meta.timestamp || '';
    if (row.timestamp) {
      lastTimestamp = row.timestamp;
    }

    if (row.type === 'response_item') {
      const payload = row.payload || {};
      if (payload.type === 'message' && payload.role === 'user' && !firstPrompt) {
        firstPrompt = readCodexMessageText(payload);
      }

      if (payload.type === 'message' && payload.role === 'user') {
        const text = readCodexMessageText(payload);
        if (text) {
          pushMessageActivity(activities, activityTimestamp, 'user', text);
        }
      } else if (payload.type === 'message' && payload.role === 'assistant') {
        const text = readCodexMessageText(payload);
        if (text) {
          pushMessageActivity(activities, activityTimestamp, 'assistant', text);
        }
      } else if (payload.type === 'function_call') {
        pushToolActivity(activities, activityTimestamp, payload.name || 'unknown');
      } else if (payload.type === 'function_call_output') {
        pushFilesActivity(activities, activityTimestamp, extractChangedFilesFromText(payload.output || ''));
      }
      continue;
    }

    if (row.type === 'event_msg') {
      const eventType = row.payload && row.payload.type ? row.payload.type : 'unknown';
      pushEventActivity(activities, activityTimestamp, eventType);
    }
  }

  activities.sort(sortActivitiesByTimestamp);
  const sessionStartAt = activities[0] ? activities[0].timestamp : (meta.timestamp || '');
  const sessionEndAt = activities.length > 0
    ? (activities[activities.length - 1].timestamp || sessionStartAt)
    : (lastTimestamp || meta.timestamp || '');
  const cwd = meta.cwd || '';
  return {
    agent: 'codex',
    sessionId: meta.id || path.basename(filePath, '.jsonl'),
    cwd,
    projectLabel: looksLikeHomeDir(cwd, homeDir) ? 'home' : pathBasenameSafe(cwd),
    prompt: firstPrompt,
    model: 'codex',
    sourceFile: filePath,
    activities,
    sessionStartAt,
    sessionEndAt
  };
}

function collectClaudeToolActivities(content, timestamp, activities) {
  if (!Array.isArray(content)) {
    return;
  }

  for (const item of content) {
    if (!item || typeof item !== 'object' || item.type !== 'tool_use') {
      continue;
    }

    const name = item.name || 'unknown';
    pushToolActivity(activities, timestamp, name);
    const input = item.input || {};
    if ((name === 'Edit' || name === 'Write') && input.file_path) {
      pushFilesActivity(activities, timestamp, [input.file_path]);
    }
  }
}

function parseClaudeSession(filePath, homeDir) {
  const rows = readJsonl(filePath);
  if (!rows.length) {
    return null;
  }

  let firstPrompt = '';
  const activities = [];
  let startAt = '';
  let endAt = '';
  let cwd = '';
  let sessionId = path.basename(filePath, '.jsonl');
  let model = '';

  for (const row of rows) {
    if (!startAt && row.timestamp) {
      startAt = row.timestamp;
    }
    if (row.timestamp) {
      endAt = row.timestamp;
    }
    if (!cwd && row.cwd) {
      cwd = row.cwd;
    }
    if (row.sessionId) {
      sessionId = row.sessionId;
    }

    const activityTimestamp = row.timestamp || endAt || startAt || '';

    if (row.type === 'user') {
      const text = readClaudeMessageText(row.message || {});
      if (!firstPrompt) {
        firstPrompt = text;
      }
      if (text) {
        pushMessageActivity(activities, activityTimestamp, 'user', text);
      }
      continue;
    }

    if (row.type === 'assistant') {
      const message = row.message || {};
      if (!model && message.model) {
        model = message.model;
      }
      const text = readClaudeMessageText(message);
      if (text) {
        pushMessageActivity(activities, activityTimestamp, 'assistant', text, { model: message.model || model });
      }
      collectClaudeToolActivities(message.content, activityTimestamp, activities);
      continue;
    }

    if (row.type === 'progress') {
      const progressType = row.data && row.data.type ? row.data.type : 'unknown';
      pushEventActivity(activities, activityTimestamp, progressType);
    }
  }

  activities.sort(sortActivitiesByTimestamp);
  const sessionStartAt = activities[0] ? activities[0].timestamp : startAt;
  const sessionEndAt = activities.length > 0
    ? (activities[activities.length - 1].timestamp || sessionStartAt)
    : endAt;
  return {
    agent: 'claude',
    sessionId,
    cwd,
    projectLabel: looksLikeHomeDir(cwd, homeDir) ? 'home' : pathBasenameSafe(cwd),
    prompt: firstPrompt,
    model: model || 'claude',
    sourceFile: filePath,
    activities,
    sessionStartAt,
    sessionEndAt
  };
}

function collectDayActivity(options = {}) {
  const date = options.date || toLocalDateString(new Date().toISOString());
  const homeDir = options.homeDir || os.homedir();
  const sessions = [];

  const codexDir = path.join(homeDir, '.codex', 'sessions');
  const codexFiles = listFilesRecursive(codexDir, (filePath) => {
    return filePath.endsWith('.jsonl')
      && isFileCandidateForDay(filePath, date, {
        startDate: codexSessionStartDateFromPath(filePath)
      });
  });
  for (const filePath of codexFiles) {
    const session = parseCodexSession(filePath, homeDir);
    const slice = session ? buildSessionSlice(
      session,
      (session.activities || []).filter((activity) => toLocalDateString(activity.timestamp) === date),
      date
    ) : null;
    if (slice) {
      sessions.push(slice);
    }
  }

  const claudeDir = path.join(homeDir, '.claude', 'projects');
  const claudeFiles = listFilesRecursive(
    claudeDir,
    (filePath) => filePath.endsWith('.jsonl')
      && !filePath.includes(`${path.sep}subagents${path.sep}`)
      && isFileCandidateForDay(filePath, date)
  );
  for (const filePath of claudeFiles) {
    const session = parseClaudeSession(filePath, homeDir);
    const slice = session ? buildSessionSlice(
      session,
      (session.activities || []).filter((activity) => toLocalDateString(activity.timestamp) === date),
      date
    ) : null;
    if (slice) {
      sessions.push(slice);
    }
  }

  sessions.sort((left, right) => {
    return (left.startAt || '').localeCompare(right.startAt || '');
  });

  const byAgent = sessions.reduce((acc, session) => {
    acc[session.agent] = (acc[session.agent] || 0) + 1;
    return acc;
  }, {});

  return {
    date,
    homeDir,
    sessions,
    summary: {
      totalSessions: sessions.length,
      byAgent
    }
  };
}

function formatResolutionType(value) {
  const labels = {
    shipped: '守住主线并落地',
    'adjacent-infra-takeover': '旁支接管主线',
    'diagnosis-complete': '诊断闭环',
    'disproved-path': '快速证伪',
    'packaging-blocked': '交付受阻',
    'context-recovery': '只找回上下文',
    'churned-exploration': '空转/抖动',
    exploration: '探索中'
  };
  return labels[value] || value;
}

function formatGoalFidelity(value) {
  const labels = {
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  };
  return labels[value] || value;
}

function formatPromptArchetype(value) {
  const labels = {
    'direct-task': '直接任务',
    'project-reentry': '项目重入',
    'session-recovery': '会话恢复',
    'vague-memory': '模糊记忆开场'
  };
  return labels[value] || value;
}

function formatReviewDepth(value) {
  const labels = {
    skim: '快速扫过',
    focused: '重点压缩',
    deep: '深度压缩'
  };
  return labels[value] || value;
}

function formatMainlineDiscipline(value) {
  const labels = {
    'single-thread': '守住单线程',
    mixed: '混入多个主题',
    drifted: '明显偏航'
  };
  return labels[value] || value;
}

function buildSessionAnalysis(session, homeDir) {
  const totalTools = Object.values(session.toolCounts || {}).reduce((sum, value) => sum + value, 0);
  const compactions = session.eventCounts.context_compacted || 0;
  const aborts = session.eventCounts.turn_aborted || 0;
  const hasDeliverable = session.writeCount > 0 || session.touchedFiles.length > 0;
  const atHome = looksLikeHomeDir(session.cwd, homeDir);
  const hasPlan = session.planCount > 0;
  const promptArchetype = session.promptFlags.reentry
    ? 'project-reentry'
    : session.promptFlags.recovery
      ? 'session-recovery'
      : session.promptFlags.vague
        ? 'vague-memory'
        : 'direct-task';

  const goalScores = collectTopicScores([session.prompt || session.lastUserRequest]);
  const continuationScores = collectTopicScores([
    ...session.userMessages.slice(1),
    ...session.assistantMessages.slice(-3),
    session.lastUserRequest,
    session.assistantExcerpt
  ]);
  const fileScores = collectTopicScores(session.touchedFiles);
  const landingScores = mergeTopicScores(continuationScores, fileScores);
  const goalTag = topTopic(goalScores, '');
  const landingTag = topTopic(landingScores, goalTag);
  const rankedLandingTopics = rankTopics(landingScores);
  const firstWrongTurn = findFirstWrongTurn(session, goalTag);
  const semanticPivot = Boolean(
    goalTag
    && landingTag
    && goalTag !== landingTag
    && ((fileScores[landingTag] || 0) > 0 || (landingScores[landingTag] || 0) > (landingScores[goalTag] || 0))
  );
  const secondaryTopicLabels = rankedLandingTopics
    .filter((item) => item.tag !== landingTag)
    .filter((item) => item.score >= 2)
    .slice(0, 2)
    .map((item) => item.label);
  const mainlineDiscipline = semanticPivot
    ? 'drifted'
    : secondaryTopicLabels.length > 0
      ? 'mixed'
      : 'single-thread';

  const transcriptTail = [
    session.assistantExcerpt,
    session.lastUserRequest,
    ...session.assistantMessages.slice(-2)
  ].filter(Boolean);

  const hasBlockingSignal = hasDeliverable && matchesAnyPattern(
    transcriptTail,
    /Request too large|max 20MB|too large|上传.*失败|transfer.*卡住|blocked by|卡住/i
  );
  const hasDiagnosisSignal = !hasDeliverable && matchesAnyPattern(
    transcriptTail,
    /根因|原因是|问题在于|定位到|结论是|解析阶段就失败|root cause|failure is caused by|isolated/i
  );
  const hasDisproofSignal = !hasDeliverable && matchesAnyPattern(
    transcriptTail,
    /没找到|找不到|不存在|没有现成|只能自己转录|需要自己转写|not found|need to transcribe|disproved/i
  );

  let resolutionType = 'exploration';
  if (hasBlockingSignal) {
    resolutionType = 'packaging-blocked';
  } else if (hasDiagnosisSignal) {
    resolutionType = 'diagnosis-complete';
  } else if (hasDisproofSignal) {
    resolutionType = 'disproved-path';
  } else if (semanticPivot && hasDeliverable) {
    resolutionType = 'adjacent-infra-takeover';
  } else if (hasDeliverable) {
    resolutionType = 'shipped';
  } else if (promptArchetype === 'session-recovery') {
    resolutionType = 'context-recovery';
  } else if (compactions > 0 || aborts > 0 || totalTools >= 8) {
    resolutionType = 'churned-exploration';
  }

  let goalFidelity = 'medium';
  if (['shipped', 'diagnosis-complete', 'disproved-path', 'packaging-blocked'].includes(resolutionType) && !semanticPivot) {
    goalFidelity = 'high';
  } else if (['adjacent-infra-takeover', 'churned-exploration'].includes(resolutionType)) {
    goalFidelity = 'low';
  }

  let problemSource = 'none';
  if (resolutionType === 'adjacent-infra-takeover') {
    problemSource = 'workflow';
  } else if (resolutionType === 'packaging-blocked') {
    problemSource = 'environment';
  } else if (resolutionType === 'churned-exploration') {
    problemSource = 'tool-model';
  } else if (promptArchetype === 'vague-memory') {
    problemSource = 'user';
  }

  let driftOrigin = 'none';
  if (semanticPivot) {
    if (firstWrongTurn && firstWrongTurn.role === 'user') {
      driftOrigin = 'user-opened-side-quest';
    } else if (firstWrongTurn && firstWrongTurn.role === 'assistant') {
      driftOrigin = 'assistant-hijack';
    } else {
      driftOrigin = 'mixed';
    }
  } else if (resolutionType === 'packaging-blocked') {
    driftOrigin = 'environment-limit';
  }

  const goalLabel = goalTag ? topicLabel(goalTag) : truncate(session.prompt || '未命名任务', 64);
  const landingLabel = landingTag ? topicLabel(landingTag) : goalLabel;
  const touchedNames = listFileBasenames(session.touchedFiles, 3);
  const reviewDepth = estimateReviewDepth(session, resolutionType, semanticPivot);

  let actualLanding = '停留在探索阶段，没有形成清晰落点。';
  let landingSummary = `${goalLabel} 仍停留在探索阶段。`;
  if (resolutionType === 'adjacent-infra-takeover') {
    actualLanding = `会话最后落在 ${landingLabel}，而不是起始想做的 ${goalLabel}${touchedNames.length ? `（落盘文件：${touchedNames.join(', ')}）` : ''}。`;
    landingSummary = `${goalLabel} 主线被 ${landingLabel} 接管。`;
  } else if (resolutionType === 'diagnosis-complete') {
    actualLanding = `没有改文件，但根因已经被定位清楚：${truncate(session.assistantExcerpt || session.lastUserRequest, 120)}。`;
    landingSummary = `${goalLabel} 的根因被定位清楚。`;
  } else if (resolutionType === 'disproved-path') {
    actualLanding = `这轮主要价值是证伪原路径，逼出了真实下一步，而不是继续假装推进。`;
    landingSummary = `${goalLabel} 的原路径被证伪。`;
  } else if (resolutionType === 'packaging-blocked') {
    actualLanding = `核心工作已经推进到 ${landingLabel}，但最后被包装/传输问题卡住：${truncate(session.assistantExcerpt || session.lastUserRequest, 120)}。`;
    landingSummary = `${landingLabel} 推进到了交付前，但被包装/传输卡住。`;
  } else if (resolutionType === 'shipped') {
    actualLanding = `${landingLabel} 已经落地${touchedNames.length ? `（主要文件：${touchedNames.join(', ')}）` : ''}。`;
    landingSummary = `${landingLabel} 已经落地。`;
  } else if (resolutionType === 'context-recovery') {
    actualLanding = '这轮主要在找回上下文，为下一轮开工做准备，没有形成独立产物。';
    landingSummary = `${goalLabel} 只完成了上下文找回。`;
  } else if (resolutionType === 'churned-exploration') {
    actualLanding = '会话里出现了明显的上下文抖动，但没有转换成清晰结论或交付。';
    landingSummary = `${goalLabel} 出现上下文抖动，未形成落点。`;
  }

  let userVerdict = '这轮里你的使用行为没有暴露出明显坏习惯。';
  if (driftOrigin === 'user-opened-side-quest') {
    userVerdict = `你在主线中途引入了旁支诉求：${firstWrongTurn ? firstWrongTurn.text : landingLabel}。这不是不能问，但应该被隔离成后续任务，而不是插进当前主线。`;
  } else if (/不要急着改文件|先帮我定位根因|先排查/i.test(session.prompt || '')) {
    userVerdict = '你这轮做对了：先要求定位根因，而不是上来就让 agent 乱改。';
  } else if (promptArchetype === 'vague-memory') {
    userVerdict = '你这轮开场规格偏虚，给了 agent 太大的自由度。';
  } else if (promptArchetype === 'project-reentry' && goalFidelity === 'high') {
    userVerdict = '你这轮做对了：虽然是从记忆重入，但锚点是具体的，agent 能接得住。';
  } else if (resolutionType === 'context-recovery') {
    userVerdict = '你这轮主要在找回上下文，本身不算错，但要警惕恢复工作吞掉真正执行时间。';
  } else if (mainlineDiscipline === 'mixed') {
    userVerdict = `你这轮的问题是：一个 session 里同时塞了不止一件事。主线还是 ${goalLabel}，但次级主题 ${secondaryTopicLabels.join('、')} 已经混进来了，说明单主线纪律开始松动。`;
  }

  const agentLabel = assistantPrefix(session);
  let agentVerdict = '这轮里 agent 的行为总体没有明显失守。';
  if (resolutionType === 'adjacent-infra-takeover') {
    agentVerdict = `${agentLabel} 做错了：它没有把旁支隔离成待办或下一轮任务，而是让旁支直接接管了当前主线。`;
  } else if (resolutionType === 'diagnosis-complete') {
    agentVerdict = `${agentLabel} 做对了：没有急着改文件，而是先把根因说清，保住了诊断闭环。`;
  } else if (resolutionType === 'disproved-path') {
    agentVerdict = `${agentLabel} 做对了：没有继续假装推进，而是把错误路径尽快证伪。`;
  } else if (resolutionType === 'packaging-blocked') {
    agentVerdict = `${agentLabel} 做错了：在交付前没有提前检查文件体积或传输约束，导致最后一公里被卡住。`;
  } else if (resolutionType === 'churned-exploration') {
    agentVerdict = `${agentLabel} 做错了：探索回合太散，没有及时收敛成结论、计划或明确停点。`;
  } else if (mainlineDiscipline === 'mixed') {
    agentVerdict = `${agentLabel} 没有彻底失守，但也没有把次级主题压回“停车场”，于是一个 session 里开始同时推进多件事。`;
  }

  let interactionVerdict = '这轮人机配合总体稳定。';
  if (driftOrigin === 'user-opened-side-quest') {
    interactionVerdict = '互动模式的问题是：你先开了旁支，agent 又没有设边界，于是整轮被顺势带偏。';
  } else if (driftOrigin === 'assistant-hijack') {
    interactionVerdict = '互动模式的问题是：agent 自己把主线偷换成了另一个更顺手的任务。';
  } else if (mainlineDiscipline === 'mixed') {
    interactionVerdict = `这轮虽然没有彻底偏航，但 ${goalLabel} 之外的 ${secondaryTopicLabels.join('、')} 已经混进同一个 session，单主线纪律开始松动。`;
  } else if (driftOrigin === 'environment-limit') {
    interactionVerdict = '互动模式本身不是主因，真正卡住你们的是外部环境或交付链路约束。';
  }

  const loopRisk = resolutionType === 'churned-exploration';
  const caseSummary = buildCaseSummary(
    session,
    goalLabel,
    landingLabel,
    landingTag,
    resolutionType,
    firstWrongTurn,
    driftOrigin
  );

  return {
    ...session,
    analysis: {
      declaredGoal: truncate(session.prompt || '未命名任务', 160),
      actualLanding,
      landingSummary,
      promptArchetype,
      resolutionType,
      goalFidelity,
      semanticPivot,
      goalTag,
      goalLabel,
      landingTag,
      landingLabel,
      secondaryTopicLabels,
      mainlineDiscipline,
      problemSource,
      firstWrongTurn
    },
    compaction: {
      reviewDepth,
      summary: caseSummary.compactSummary
    },
    caseSummary,
    behavior: {
      driftOrigin,
      userVerdict,
      agentVerdict,
      interactionVerdict
    },
    derived: {
      label: resolutionType,
      totalTools,
      compactions,
      aborts,
      hasDeliverable,
      hasPlan,
      atHome,
      loopRisk
    }
  };
}

function buildWorkstreams(sessions) {
  const grouped = new Map();

  for (const session of sessions) {
    const key = `${session.projectLabel}::${session.analysis.landingLabel}::${session.analysis.resolutionType}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        projectLabel: session.projectLabel,
        label: session.analysis.landingLabel,
        resolutionType: session.analysis.resolutionType,
        sessions: []
      });
    }
    grouped.get(key).sessions.push(session);
  }

  return Array.from(grouped.values()).map((workstream) => ({
    ...workstream,
    title: `${workstream.projectLabel} · ${workstream.label}`,
    prompts: workstream.sessions.map((session) => session.analysis.declaredGoal)
  }));
}

function buildDayNarrative(sessions) {
  const adjacentSessions = sessions.filter((session) => session.analysis.resolutionType === 'adjacent-infra-takeover');
  const diagnosisSessions = sessions.filter((session) => ['diagnosis-complete', 'disproved-path'].includes(session.analysis.resolutionType));
  const blockedSessions = sessions.filter((session) => session.analysis.resolutionType === 'packaging-blocked');
  const shippedSessions = sessions.filter((session) => session.analysis.resolutionType === 'shipped');
  const resolvedSessions = sessions.filter((session) => !['exploration', 'churned-exploration', 'context-recovery'].includes(session.analysis.resolutionType));

  let headline = 'Mixed execution day';
  let summary = '这一天既有产出，也有一些会话没有把起始目标守住。';

  if (resolvedSessions.length >= 3 && adjacentSessions.length > 0) {
    headline = 'High-output day with boundary leakage';
    summary = '真实产出是有的，但至少有一条主线被邻近的工具/基础设施工作接管了，看起来很忙，实际上偏离了原始目标。';
  } else if (diagnosisSessions.length >= 2 && shippedSessions.length === 0) {
    headline = 'Diagnostic day';
    summary = '这一天更像在排除错误路径、定位根因，而不是把代码和内容直接推到终态。';
  } else if (blockedSessions.length > 0 && shippedSessions.length === 0) {
    headline = 'Blocked packaging day';
    summary = '核心内容并不是没做出来，而是在最后的包装、传输或交付环节被卡住。';
  } else if (shippedSessions.length >= 2) {
    headline = 'Shipping day';
    summary = '多数会话都能把目标推进到落盘或可交付状态。';
  }

  const bestLeverageSession = diagnosisSessions[0] || shippedSessions[0] || resolvedSessions[0] || sessions[0];
  const biggestLeakageSession = adjacentSessions[0];

  return {
    headline,
    summary,
    intendedAgenda: uniqueValues(sessions.map((session) => session.analysis.goalLabel)).slice(0, 3),
    actualChange: uniqueValues(resolvedSessions.map((session) => session.analysis.landingSummary)).slice(0, 3),
    bestLeverage: bestLeverageSession
      ? `${bestLeverageSession.caseSummary.title} · ${bestLeverageSession.analysis.actualLanding}`
      : '—',
    biggestLeakage: biggestLeakageSession
      ? `${biggestLeakageSession.caseSummary.title} · ${biggestLeakageSession.analysis.actualLanding}`
      : '今天没有明显的邻近任务接管主线。',
    tomorrowCorrection: adjacentSessions.length > 0
      ? '先写清本轮“必须守住的原始目标”和“允许顺手修、但不能接管会话的旁支工作”，让 agent 遇到偏航时主动提醒。'
      : blockedSessions.length > 0
        ? '优先补齐交付链路里的包装/传输约束，再继续扩写内容，避免卡在最后一米。'
        : '保持诊断闭环和计划前置，继续把探索尽快收敛成可交付落点。'
  };
}

function buildBehavioralAudit(sessions) {
  const user = [];
  const agent = [];
  const interaction = [];

  const userSideQuestSessions = sessions.filter((session) => session.behavior.driftOrigin === 'user-opened-side-quest');
  if (userSideQuestSessions.length > 0) {
    user.push({
      title: '你会在主线里临时开旁支',
      detail: '你会在主线任务进行中插入新的旁支诉求，这会让 agent 合理化偏航，而不是守住原始目标。',
      evidence: userSideQuestSessions.map((session) => session.caseSummary.title)
    });
  }

  const diagnosisPromptSessions = sessions.filter((session) => /不要急着改文件|先帮我定位根因|先排查/i.test(session.prompt || ''));
  if (diagnosisPromptSessions.length > 0) {
    user.push({
      title: '你其实很会把 agent 用在诊断上',
      detail: '当你先要求定位根因时，agent 的表现会明显更稳，这是一条应该保留的好习惯。',
      evidence: diagnosisPromptSessions.map((session) => session.caseSummary.title)
    });
  }

  const vaguePromptSessions = sessions.filter((session) => session.analysis.promptArchetype === 'vague-memory');
  if (vaguePromptSessions.length > 0) {
    user.push({
      title: '有些开场还是给了 agent 太大自由度',
      detail: '有些会话开头规格偏虚，会把任务边界交给 agent 自己解释。',
      evidence: vaguePromptSessions.map((session) => session.caseSummary.title)
    });
  }

  const pivotSessions = sessions.filter((session) => session.analysis.resolutionType === 'adjacent-infra-takeover');
  if (pivotSessions.length > 0) {
    const pivotAgentLabel = summarizeAgentSet(pivotSessions);
    agent.push({
      title: `${pivotAgentLabel} 还不会主动隔离旁支任务`,
      detail: `当你抛出旁支问题时，${pivotAgentLabel} 现在更倾向于顺着做下去，没有把旁支隔离成后续任务。`,
      evidence: pivotSessions.map((session) => session.caseSummary.title)
    });
  }

  const goodDiagnosisSessions = sessions.filter((session) => session.analysis.resolutionType === 'diagnosis-complete');
  if (goodDiagnosisSessions.length > 0) {
    const diagnosisAgentLabel = summarizeAgentSet(goodDiagnosisSessions);
    agent.push({
      title: `当任务是先诊断时，${diagnosisAgentLabel} 表现更稳`,
      detail: `在明确要求先定位根因的场景里，${diagnosisAgentLabel} 的结论闭环能力是可靠的。`,
      evidence: goodDiagnosisSessions.map((session) => session.caseSummary.title)
    });
  }

  const blockedSessions = sessions.filter((session) => session.analysis.resolutionType === 'packaging-blocked');
  if (blockedSessions.length > 0) {
    const blockedAgentLabel = summarizeAgentSet(blockedSessions);
    agent.push({
      title: `${blockedAgentLabel} 还容易漏掉最后一公里的交付约束`,
      detail: `${blockedAgentLabel} 在内容快完成时，仍然容易忘记提前检查传输、体积和平台限制。`,
      evidence: blockedSessions.map((session) => session.caseSummary.title)
    });
  }

  if (userSideQuestSessions.length > 0 && pivotSessions.length > 0) {
    const interactionAgentLabel = summarizeAgentSet(pivotSessions);
    interaction.push({
      title: `你开旁支，${interactionAgentLabel} 又没守边界，于是一起偏航`,
      detail: '这不是单边错误。更准确的模式是：你开旁支，agent 不设边界，结果协作一起偏航。',
      evidence: uniqueValues([...userSideQuestSessions, ...pivotSessions].map((session) => session.caseSummary.title))
    });
  }

  if (goodDiagnosisSessions.length > 0) {
    interaction.push({
      title: '当你先要求诊断再动手时，人机配合最好',
      detail: '当你先要求“解释清楚再动手”时，人机协作更稳定，误改和乱扩展都更少。',
      evidence: goodDiagnosisSessions.map((session) => session.caseSummary.title)
    });
  }

  return { user, agent, interaction };
}

function buildDailyRealityEntry(session) {
  if (session.summaryBucket) {
    return {
      sessionId: session.sessionId,
      title: session.caseSummary.title,
      agent: formatAgentName(session.agent),
      time: formatTimeOnly(session.startAt),
      badge: session.dailyBadge || '继续观察',
      bucket: session.summaryBucket,
      goal: session.analysis.goalLabel,
      actual: truncate(session.analysis.actualLanding || session.analysis.landingSummary || '—', 180),
      worth: session.dailyWorth || '这条没有形成足够清晰的价值判断。'
    };
  }

  const resolutionType = session.analysis.resolutionType;
  let bucket = 'risk';
  let badge = '值得警惕';
  let worth = '这条最像无用功风险：既没有形成稳定交付，也没有明显减少关键不确定性。';

  if (['shipped', 'packaging-blocked'].includes(resolutionType)) {
    bucket = 'progress';
    badge = resolutionType === 'shipped' ? '真正推进' : '推进到最后一公里';
    worth = resolutionType === 'shipped'
      ? '这条不是无用功，因为它真的把外部世界往前推了一步。'
      : '这条不是无用功，因为内容本身已经推进了，只是最后卡在交付链路。';
  } else if (['diagnosis-complete', 'disproved-path'].includes(resolutionType)) {
    bucket = 'clarified';
    badge = resolutionType === 'diagnosis-complete' ? '查清根因' : '证伪路径';
    worth = resolutionType === 'diagnosis-complete'
      ? '这条不是无用功，因为它把关键根因钉死了，减少了后续乱试。'
      : '这条不是无用功，因为它尽快证伪了错误路径，避免继续白跑。';
  } else if (resolutionType === 'adjacent-infra-takeover') {
    worth = '这条最值得警惕：有产出，但产出已经不是你本来要的那件事。';
  } else if (resolutionType === 'context-recovery') {
    worth = '这条主要只是准备动作或上下文找回，不能算当天真正完成了一件事。';
  } else if (resolutionType === 'churned-exploration') {
    worth = '这条最接近无用功：看起来很忙，但没有形成清晰结论、交付或停点。';
  }

  return {
    sessionId: session.sessionId,
    title: session.caseSummary.title,
    agent: formatAgentName(session.agent),
    time: formatTimeOnly(session.startAt),
    badge,
    bucket,
    goal: session.analysis.goalLabel,
    actual: truncate(session.analysis.actualLanding || session.analysis.landingSummary || '—', 180),
    worth
  };
}

function buildDailyReality(sessions) {
  const buckets = {
    progress: [],
    clarified: [],
    risk: []
  };

  for (const session of sessions) {
    const entry = buildDailyRealityEntry(session);
    buckets[entry.bucket].push(entry);
  }

  return {
    summary: `昨天一共 ${sessions.length} 条会话：${buckets.progress.length} 条真正推进，${buckets.clarified.length} 条查清关键问题，${buckets.risk.length} 条最值得警惕。真正的无用功不是“没写文件”，而是“既没形成交付，也没减少关键不确定性”。`,
    buckets
  };
}

function buildCaseItem(session) {
  return {
    sessionId: session.sessionId,
    title: session.caseSummary.title,
    agentLabel: session.caseSummary.agentLabel || formatAgentName(session.agent),
    verdict: session.caseSummary.verdict,
    userQuote: session.caseSummary.userQuote,
    agentQuote: session.caseSummary.agentQuote,
    turnLabel: session.caseSummary.turnLabel,
    turnText: session.caseSummary.turnText,
    firstWrongTurn: session.caseSummary.firstWrongTurn,
    reviewDepth: session.compaction.reviewDepth,
    resolutionType: session.analysis.resolutionType
  };
}

function buildWorkOverviewItems(sessions) {
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    time: formatTimeOnly(session.startAt),
    agent: formatAgentName(session.agent),
    title: session.caseSummary.title,
    goal: session.analysis.goalLabel || session.analysis.declaredGoal,
    actual: truncate(session.analysis.actualLanding || session.analysis.landingSummary || '—', 180),
    discipline: session.analysis.mainlineDiscipline && session.analysis.mainlineDiscipline !== 'single-thread'
      ? formatMainlineDiscipline(session.analysis.mainlineDiscipline)
      : '',
    verdict: truncate(session.caseSummary.verdict || session.behavior.interactionVerdict || '—', 150)
  }));
}

function buildHeuristicGoodPatterns(sessions) {
  const goodPatterns = [];
  for (const session of sessions) {
    if (session.analysis.resolutionType === 'diagnosis-complete') {
      goodPatterns.push({
        title: 'Diagnosis before rewrite',
        detail: `${session.sessionId} 先把根因钉死，再决定要不要改文件。`,
        sessionId: session.sessionId
      });
    } else if (session.derived.hasPlan && session.derived.hasDeliverable && session.analysis.goalFidelity !== 'low') {
      goodPatterns.push({
        title: 'Plan before change',
        detail: `${session.sessionId} 先列计划，再把改动落盘。`,
        sessionId: session.sessionId
      });
    } else if (session.analysis.promptArchetype === 'project-reentry' && session.analysis.goalFidelity === 'high') {
      goodPatterns.push({
        title: 'Project re-entry without drift',
        detail: `${session.sessionId} 从记忆线索重回项目，但没有把开场的模糊感直接传染成执行偏航。`,
        sessionId: session.sessionId
      });
    }
  }
  return goodPatterns;
}

function buildHeuristicIssues(sessions) {
  const deliverables = sessions.filter((session) => session.derived.hasDeliverable);
  const adjacentSessions = sessions.filter((session) => session.analysis.resolutionType === 'adjacent-infra-takeover');
  const mixedMainlineSessions = sessions.filter((session) => session.analysis.mainlineDiscipline === 'mixed');
  const blockedSessions = sessions.filter((session) => session.analysis.resolutionType === 'packaging-blocked');
  const vaguePromptSessions = sessions.filter((session) => session.analysis.promptArchetype === 'vague-memory');
  const issues = [];

  if (adjacentSessions.length > 0) {
    issues.push({
      title: 'Boundary leakage let adjacent infra take over primary tasks',
      humanTitle: '主线边界漏水：旁支任务接管了原始目标',
      primaryBucket: 'workflow',
      confidence: adjacentSessions.length >= 2 ? 'high' : 'medium',
      evidence: adjacentSessions.map((session) => session.caseSummary.title),
      recommendation: '每轮开头写清“今天必须完成的世界状态变化”，把 Telegram、skill、CLI、session 工具链列为可顺手修但不得接管主线的旁支。'
    });
  }
  if (mixedMainlineSessions.length > 0) {
    issues.push({
      title: 'Multiple problem frames were mixed into single-thread sessions',
      humanTitle: '有些 session 已经开始一轮多题',
      primaryBucket: 'workflow',
      confidence: 'medium',
      evidence: mixedMainlineSessions.map((session) => session.caseSummary.title),
      recommendation: '一个 session 默认只保留一条主线。次级问题先记停车场，不要把“顺手看看”直接并进当前回合。'
    });
  }
  if (sessions.some((session) => session.derived.compactions > 0 || session.derived.aborts > 0)) {
    issues.push({
      title: 'Context churn is visible in compact or abort signals',
      humanTitle: '会话里出现了明显的上下文抖动',
      primaryBucket: 'tool-model',
      confidence: 'high',
      evidence: sessions
        .filter((session) => session.derived.compactions > 0 || session.derived.aborts > 0)
        .map((session) => session.caseSummary.title),
      recommendation: '把长探索拆成更小的可验证回合，并在每轮结束时写出 carry-forward，避免 compact/abort 把论证链掐断。'
    });
  }
  if (blockedSessions.length > 0) {
    issues.push({
      title: 'Packaging or transfer blockers stopped otherwise-good work',
      humanTitle: '最后一公里卡在交付或传输约束',
      primaryBucket: 'environment',
      confidence: 'medium',
      evidence: blockedSessions.map((session) => session.caseSummary.title),
      recommendation: '把“文件大小、传输方式、Telegram 限制、打包路径”前置成 checklist，减少最后一米失败。'
    });
  }
  if (vaguePromptSessions.length > 0) {
    issues.push({
      title: 'Some prompts are still too vague to be treated as clean specifications',
      humanTitle: '有些开场规格仍然太虚',
      primaryBucket: 'user',
      confidence: 'medium',
      evidence: vaguePromptSessions.map((session) => session.caseSummary.title),
      recommendation: '把“我记得/好像”后的真实约束补成一行规格，再让 agent 开始执行。'
    });
  }
  if (deliverables.filter((session) => !session.derived.hasPlan && session.analysis.goalFidelity === 'low').length > 0) {
    issues.push({
      title: 'Write-heavy drift happened without an explicit task frame',
      humanTitle: '写了很多，但其实是在无边界漂移',
      primaryBucket: 'rules',
      confidence: 'medium',
      evidence: deliverables
        .filter((session) => !session.derived.hasPlan && session.analysis.goalFidelity === 'low')
        .map((session) => session.caseSummary.title),
      recommendation: '复杂会话开头先把 plan 或 stop condition 写出来，不要让“顺手修一下”接管整轮。'
    });
  }

  return issues;
}

function mergeCompactedSession(heuristicSession, compact) {
  if (!compact) {
    return heuristicSession;
  }

  const analysis = {
    ...heuristicSession.analysis,
    declaredGoal: compact.declaredGoal || heuristicSession.analysis.declaredGoal,
    actualLanding: compact.actualLanding || heuristicSession.analysis.actualLanding,
    landingSummary: compact.landingSummary || heuristicSession.analysis.landingSummary,
    promptArchetype: compact.promptArchetype || heuristicSession.analysis.promptArchetype,
    resolutionType: compact.resolutionType || heuristicSession.analysis.resolutionType,
    goalFidelity: compact.goalFidelity || heuristicSession.analysis.goalFidelity,
    semanticPivot: typeof compact.semanticPivot === 'boolean' ? compact.semanticPivot : heuristicSession.analysis.semanticPivot,
    goalTag: compact.goalTag || heuristicSession.analysis.goalTag,
    goalLabel: compact.goalLabel || heuristicSession.analysis.goalLabel,
    landingTag: compact.landingTag || heuristicSession.analysis.landingTag,
    landingLabel: compact.landingLabel || heuristicSession.analysis.landingLabel,
    secondaryTopicLabels: Array.isArray(compact.secondaryTopicLabels) ? compact.secondaryTopicLabels : heuristicSession.analysis.secondaryTopicLabels,
    mainlineDiscipline: compact.mainlineDiscipline || heuristicSession.analysis.mainlineDiscipline,
    problemSource: compact.problemSource || heuristicSession.analysis.problemSource
  };

  const caseSummary = {
    ...heuristicSession.caseSummary,
    title: compact.title || heuristicSession.caseSummary.title,
    verdict: compact.verdict || heuristicSession.caseSummary.verdict,
    userQuote: compact.userQuote || heuristicSession.caseSummary.userQuote,
    agentQuote: compact.agentQuote || heuristicSession.caseSummary.agentQuote,
    turnLabel: compact.turnLabel || heuristicSession.caseSummary.turnLabel,
    turnText: compact.turnText || heuristicSession.caseSummary.turnText,
    compactSummary: `${compact.title || heuristicSession.caseSummary.title}：${compact.verdict || heuristicSession.caseSummary.verdict}`,
    shortLanding: `${analysis.goalLabel} -> ${analysis.landingLabel}`
  };

  return {
    ...heuristicSession,
    analysis,
    compaction: {
      ...heuristicSession.compaction,
      reviewDepth: compact.reviewDepth || heuristicSession.compaction.reviewDepth,
      summary: caseSummary.compactSummary,
      source: 'compact'
    },
    caseSummary,
    behavior: {
      ...heuristicSession.behavior,
      driftOrigin: compact.driftOrigin || heuristicSession.behavior.driftOrigin,
      userVerdict: compact.userVerdict || heuristicSession.behavior.userVerdict,
      agentVerdict: compact.agentVerdict || heuristicSession.behavior.agentVerdict,
      interactionVerdict: compact.interactionVerdict || heuristicSession.behavior.interactionVerdict
    },
    derived: {
      ...heuristicSession.derived,
      label: compact.resolutionType || heuristicSession.derived.label,
      loopRisk: (compact.resolutionType || heuristicSession.derived.label) === 'churned-exploration'
    },
    summaryBucket: compact.bucket || '',
    dailyBadge: compact.badge || '',
    dailyWorth: compact.worth || '',
    carryForward: Array.isArray(compact.carryForward) ? compact.carryForward : []
  };
}

function shouldRunSemanticCompact(heuristicSession) {
  if (!heuristicSession) {
    return false;
  }

  if ((heuristicSession.compaction && heuristicSession.compaction.reviewDepth) === 'deep') {
    return true;
  }

  if ((heuristicSession.transcriptTurns || []).length >= 8) {
    return true;
  }

  return [
    'adjacent-infra-takeover',
    'diagnosis-complete',
    'disproved-path',
    'packaging-blocked',
    'churned-exploration'
  ].includes(heuristicSession.analysis && heuristicSession.analysis.resolutionType);
}

function buildTomorrowRule(sessions) {
  if (sessions.some((session) => session.behavior.driftOrigin === 'user-opened-side-quest')) {
    return '主线 session 内想到的新问题一律先放进“停车场”，不直接插进当前会话。';
  }
  if (sessions.some((session) => session.analysis.resolutionType === 'packaging-blocked')) {
    return '凡是最终要发 Telegram / 发 HTML / 发文档的任务，开头先检查交付约束，不要等到最后一公里才发现限制。';
  }
  if (sessions.some((session) => session.analysis.resolutionType === 'churned-exploration')) {
    return '当一个探索回合开始发散时，先要求 Codex 用一句话总结当前结论，再决定是否继续。';
  }
  return '先让 Codex 解释清楚根因，再决定要不要改文件。';
}

async function analyzeDayActivity(collected, options = {}) {
  const analysisMode = resolveAnalysisMode(options.analysisMode);
  const sessionCompactor = options.sessionCompactor || createDefaultSessionCompactor({
    analysisMode,
    cacheDir: options.cacheDir || ''
  });
  const daySynthesizer = options.daySynthesizer || createDefaultDaySynthesizer({
    analysisMode,
    cacheDir: options.cacheDir || ''
  });

  const sessions = [];
  for (const session of collected.sessions) {
    const heuristicSession = buildSessionAnalysis(session, collected.homeDir);
    const useSemanticCompact = Boolean(sessionCompactor)
      && (options.sessionCompactor || shouldRunSemanticCompact(heuristicSession));

    if (!useSemanticCompact) {
      sessions.push(heuristicSession);
      continue;
    }

    try {
      const compact = await sessionCompactor.compactSession(session, {
        date: collected.date,
        homeDir: collected.homeDir,
        heuristicSession
      });
      sessions.push(mergeCompactedSession(heuristicSession, compact));
    } catch (error) {
      sessions.push(heuristicSession);
    }
  }

  const deliverables = sessions.filter((session) => session.derived.hasDeliverable);
  const adjacentSessions = sessions.filter((session) => session.analysis.resolutionType === 'adjacent-infra-takeover');
  const churnSessions = sessions.filter((session) => session.analysis.resolutionType === 'churned-exploration');
  const resolvedSessions = sessions.filter((session) => !['exploration', 'churned-exploration', 'context-recovery'].includes(session.analysis.resolutionType));
  const highFidelitySessions = sessions.filter((session) => session.analysis.goalFidelity === 'high');
  const boundaryPenalty = adjacentSessions.length * 20 + churnSessions.length * 12
    + sessions.reduce((sum, session) => sum + session.derived.compactions * 3 + session.derived.aborts * 6, 0);
  const fallbackDayNarrative = buildDayNarrative(sessions);
  const fallbackBehavioralAudit = buildBehavioralAudit(sessions);
  const fallbackGoodPatterns = buildHeuristicGoodPatterns(sessions);
  const fallbackIssues = buildHeuristicIssues(sessions);
  const dailyReality = buildDailyReality(sessions);
  const topMistakes = sessions
    .filter((session) => ['adjacent-infra-takeover', 'packaging-blocked', 'churned-exploration'].includes(session.analysis.resolutionType))
    .sort((left, right) => casePriorityScore(right) - casePriorityScore(left))
    .slice(0, 3)
    .map(buildCaseItem);
  const topWins = sessions
    .filter((session) => ['diagnosis-complete', 'disproved-path', 'shipped'].includes(session.analysis.resolutionType))
    .sort((left, right) => casePriorityScore(right) - casePriorityScore(left))
    .slice(0, 2)
    .map(buildCaseItem);
  const topCases = [...topMistakes, ...topWins]
    .sort((left, right) => {
      const leftSession = sessions.find((session) => session.sessionId === left.sessionId);
      const rightSession = sessions.find((session) => session.sessionId === right.sessionId);
      return casePriorityScore(rightSession) - casePriorityScore(leftSession);
    })
    .slice(0, 3);
  let synthesized = {};
  if (daySynthesizer) {
    try {
      synthesized = await daySynthesizer.synthesizeDay(sessions, {
        date: collected.date,
        homeDir: collected.homeDir,
        byAgent: (collected.summary && collected.summary.byAgent) || {}
      });
    } catch (error) {
      synthesized = {};
    }
  }

  const dayNarrative = {
    headline: synthesized.headline || fallbackDayNarrative.headline,
    summary: synthesized.summary || fallbackDayNarrative.summary,
    intendedAgenda: fallbackDayNarrative.intendedAgenda,
    actualChange: fallbackDayNarrative.actualChange,
    bestLeverage: fallbackDayNarrative.bestLeverage,
    biggestLeakage: fallbackDayNarrative.biggestLeakage,
    tomorrowCorrection: fallbackDayNarrative.tomorrowCorrection
  };
  const behavioralAudit = {
    user: (synthesized.behavioralAudit && Array.isArray(synthesized.behavioralAudit.user) && synthesized.behavioralAudit.user.length)
      ? synthesized.behavioralAudit.user
      : fallbackBehavioralAudit.user,
    agent: (synthesized.behavioralAudit && Array.isArray(synthesized.behavioralAudit.agent) && synthesized.behavioralAudit.agent.length)
      ? synthesized.behavioralAudit.agent
      : fallbackBehavioralAudit.agent,
    interaction: (synthesized.behavioralAudit && Array.isArray(synthesized.behavioralAudit.interaction) && synthesized.behavioralAudit.interaction.length)
      ? synthesized.behavioralAudit.interaction
      : fallbackBehavioralAudit.interaction
  };
  const goodPatterns = Array.isArray(synthesized.goodPatterns) && synthesized.goodPatterns.length
    ? synthesized.goodPatterns
    : fallbackGoodPatterns;
  const issues = Array.isArray(synthesized.issues) && synthesized.issues.length
    ? synthesized.issues
    : fallbackIssues;
  const tomorrowRule = synthesized.tomorrowRule || buildTomorrowRule(sessions);

  return {
    ...collected,
    generatedAt: new Date().toISOString(),
    verdict: dayNarrative.headline,
    dayNarrative,
    workOverview: buildWorkOverviewItems(sessions),
    dailyReality,
    behavioralAudit,
    topMistakes,
    topWins,
    topCases,
    tomorrowRule,
    sessions,
    workstreams: buildWorkstreams(sessions),
    deliverables: deliverables.map((session) => ({
      sessionId: session.sessionId,
      agent: session.agent,
      projectLabel: session.projectLabel,
      files: session.touchedFiles,
      prompt: session.analysis.declaredGoal,
      resolutionType: session.analysis.resolutionType
    })),
    goodPatterns,
    issues,
    metrics: {
      resolution: Math.round((resolvedSessions.length / Math.max(1, sessions.length)) * 100),
      fidelity: Math.round((highFidelitySessions.length / Math.max(1, sessions.length)) * 100),
      boundaries: Math.max(0, 100 - boundaryPenalty)
    }
  };
}

function renderEvidenceCards(sessions) {
  return sessions.map((session) => {
    const touched = session.touchedFiles.length
      ? `<div class="meta-row"><strong>Files:</strong> ${esc(session.touchedFiles.join(', '))}</div>`
      : '';
    const assistantExcerpt = session.assistantExcerpt
      ? `<div class="meta-row"><strong>Assistant Excerpt:</strong> ${esc(truncate(session.assistantExcerpt, 220))}</div>`
      : '';
    return `
      <details class="evidence-card">
        <summary>${esc(session.sessionId)} · ${esc(session.agent)} · ${esc(formatResolutionType(session.analysis.resolutionType))}</summary>
        <div class="evidence-body">
          <div class="meta-row"><strong>Project:</strong> ${esc(session.projectLabel)}</div>
          <div class="meta-row"><strong>Started:</strong> ${esc(formatDateTime(session.startAt))}</div>
          <div class="meta-row"><strong>Prompt Archetype:</strong> ${esc(formatPromptArchetype(session.analysis.promptArchetype))}</div>
          <div class="meta-row"><strong>Prompt:</strong> ${esc(session.prompt || '—')}</div>
          <div class="meta-row"><strong>Tools:</strong> ${esc(JSON.stringify(session.toolCounts))}</div>
          <div class="meta-row"><strong>Signals:</strong> compactions=${session.derived.compactions}, aborts=${session.derived.aborts}, plan=${session.derived.hasPlan ? 'yes' : 'no'}</div>
          ${assistantExcerpt}
          ${touched}
        </div>
      </details>
    `;
  }).join('\n');
}

function renderListItems(items, formatter) {
  if (!items.length) {
    return '<li>—</li>';
  }
  return items.map((item) => `<li>${formatter(item)}</li>`).join('\n');
}

function renderAuditCards(items) {
  if (!items.length) {
    return '<div class="subtle">—</div>';
  }

  return items.map((item) => `
    <div class="audit-card">
      <strong>${esc(item.title)}</strong>
      <div class="meta-row">${esc(item.detail)}</div>
      <div class="meta-row">证据：${esc((item.evidence || []).join(', '))}</div>
    </div>
  `).join('\n');
}

function renderCaseBullets(items, emptyText) {
  if (!items.length) {
    return `<div class="subtle">${esc(emptyText)}</div>`;
  }

  return items.map((item, index) => `
    <div class="bullet-card">
      <div class="badge">#${index + 1}</div>
      <strong>${esc(item.title)}</strong>
      <div class="meta-row">${esc(item.verdict)}</div>
    </div>
  `).join('\n');
}

function renderRealityCards(items, emptyText) {
  if (!items.length) {
    return `<div class="subtle">${esc(emptyText)}</div>`;
  }

  return items.map((item) => `
    <div class="session-card">
      <div class="session-header">
        <div>
          <div class="badge">${esc(item.time || '—')}</div>
          <div class="badge">${esc(item.agent)}</div>
          <div class="badge">${esc(item.badge)}</div>
        </div>
      </div>
      <strong>${esc(item.title)}</strong>
      <div class="meta-row">本来要做：${esc(item.goal)}</div>
      <div class="meta-row">实际发生：${esc(item.actual)}</div>
      <div class="meta-row">这条怎么看：${esc(item.worth)}</div>
    </div>
  `).join('\n');
}

function renderWorkOverview(items) {
  if (!items.length) {
    return '<div class="subtle">这一天没有采集到可展示的 session。</div>';
  }

  return items.map((item) => `
    <article class="session-card">
      <div class="session-header">
        <div>
          <div class="badge">${esc(item.time || '—')}</div>
          <div class="badge">${esc(item.agent)}</div>
        </div>
      </div>
      <strong>${esc(item.title)}</strong>
      <div class="meta-row">本来要做：${esc(item.goal)}</div>
      <div class="meta-row">实际做了：${esc(item.actual)}</div>
      ${item.discipline ? `<div class="meta-row">单主线纪律：${esc(item.discipline)}</div>` : ''}
      <div class="meta-row">一句话判断：${esc(item.verdict)}</div>
    </article>
  `).join('\n');
}

function quoteLabel(actor, polarity) {
  if (actor === 'user') {
    if (polarity === 'bad') {
      return '你说错的话';
    }
    if (polarity === 'good') {
      return '你说对的话';
    }
    return '你说的关键一句';
  }

  const agentLabel = typeof actor === 'string' && actor ? actor : 'AI 助手';
  if (polarity === 'bad') {
    return `${agentLabel} 回错的话`;
  }
  if (polarity === 'good') {
    return `${agentLabel} 回对的话`;
  }
  return `${agentLabel} 的关键一句`;
}

function renderCaseCards(items) {
  if (!items.length) {
    return '<div class="subtle">今天没有足够强的 case 可展示。</div>';
  }

  return items.map((item) => `
    <article class="session-card">
      <div class="session-header">
        <div>
          <div class="badge">${esc(item.title)}</div>
          <div class="badge">${esc(formatReviewDepth(item.reviewDepth))}</div>
          <div class="badge">${esc(formatResolutionType(item.resolutionType))}</div>
        </div>
      </div>
      <div class="meta-row">${esc(item.verdict)}</div>
      <div class="case-grid">
        <div class="quote-block">
          <div class="label">${esc(quoteLabel('user', item.userQuote.polarity))}</div>
          <blockquote>${esc(item.userQuote.text)}</blockquote>
          <div class="meta-row">${esc(item.userQuote.judgment)}</div>
        </div>
        <div class="quote-block">
          <div class="label">${esc(quoteLabel(item.agentLabel, item.agentQuote.polarity))}</div>
          <blockquote>${esc(item.agentQuote.text)}</blockquote>
          <div class="meta-row">${esc(item.agentQuote.judgment)}</div>
        </div>
      </div>
      <div class="case-grid">
        <div>
          <div class="label">${esc(item.turnLabel || '关键转折')}</div>
          <div>${esc(item.turnText || item.firstWrongTurn || '—')}</div>
        </div>
        <div>
          <div class="label">为什么值得看</div>
          <div>${esc(item.verdict)}</div>
        </div>
      </div>
    </article>
  `).join('\n');
}

function renderAppendixSessions(sessions) {
  return sessions.map((session) => {
    const filenames = listFileBasenames(session.touchedFiles, 6);
    const continuationNote = session.continuedFromPreviousDay
      ? `<div class="meta-row"><strong>跨天续用：</strong>这个 session 最早开始于 ${esc(formatDateTime(session.sessionStartAt))}，本日报只统计 ${esc(session.date)} 这一天的 activity。</div>`
      : '';
    return `
      <details class="evidence-card">
        <summary>${esc(session.caseSummary.title)} · ${esc(session.sessionId)}</summary>
        <div class="evidence-body">
          ${continuationNote}
          <div class="meta-row"><strong>阅读深度：</strong>${esc(formatReviewDepth(session.compaction.reviewDepth))}</div>
          <div class="meta-row"><strong>单主线纪律：</strong>${esc(formatMainlineDiscipline(session.analysis.mainlineDiscipline || 'single-thread'))}</div>
          <div class="meta-row"><strong>原始目标：</strong>${esc(session.analysis.declaredGoal)}</div>
          <div class="meta-row"><strong>实际落点：</strong>${esc(session.analysis.actualLanding)}</div>
          <div class="meta-row"><strong>用户行为：</strong>${esc(session.behavior.userVerdict)}</div>
          <div class="meta-row"><strong>${esc(formatAgentName(session.agent))} 行为：</strong>${esc(session.behavior.agentVerdict)}</div>
          <div class="meta-row"><strong>互动模式：</strong>${esc(session.behavior.interactionVerdict)}</div>
          <div class="meta-row"><strong>文件痕迹：</strong>${esc(filenames.length ? filenames.join(', ') : '无明显落盘')}</div>
        </div>
      </details>
    `;
  }).join('\n');
}

function renderDailyHtml(report) {
  const agentScope = buildAgentScope((report.summary && report.summary.byAgent) || {});
  const agentBreakdown = buildAgentBreakdown((report.summary && report.summary.byAgent) || {});
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(agentScope)} 使用习惯审计 ${esc(report.date)}</title>
  <style>
    :root {
      --paper: #fffdf8;
      --ink: #1f1b16;
      --muted: #6f675c;
      --line: #ddd4c4;
      --accent: #21443b;
      --accent-soft: #edf4f0;
      --warn: #8d4e2f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: linear-gradient(180deg, #ece4d7 0%, #f7f2e8 100%);
      color: var(--ink);
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
      line-height: 1.7;
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 36px 24px 64px;
    }
    .hero, .panel {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 14px 28px rgba(40, 31, 22, 0.06);
      padding: 24px 28px;
      margin-bottom: 18px;
    }
    .hero h1 {
      margin: 8px 0 4px;
      font-size: 38px;
      line-height: 1.15;
    }
    .hero h2 {
      margin: 0;
      font-size: 22px;
      line-height: 1.3;
    }
    .hero p {
      margin: 10px 0 0;
      color: var(--muted);
    }
    .subtle {
      color: var(--muted);
      font-size: 14px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 24px;
    }
    .two-col {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .three-col {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }
    .bullet-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px 16px;
      background: #fcfaf5;
      margin-bottom: 12px;
    }
    .badge {
      display: inline-block;
      margin-right: 6px;
      margin-bottom: 6px;
      border-radius: 999px;
      padding: 4px 10px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
    }
    .session-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 18px;
      background: #fcfaf5;
      margin-bottom: 12px;
    }
    .audit-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
      background: #fcfaf5;
      margin-bottom: 12px;
    }
    .session-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .case-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-top: 12px;
    }
    .label {
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }
    blockquote {
      margin: 0;
      padding: 12px 14px;
      border-left: 3px solid var(--accent);
      background: #f6f2e8;
      border-radius: 10px;
      color: var(--ink);
    }
    .evidence-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fcfaf6;
      margin-bottom: 12px;
      padding: 14px 16px;
    }
    .evidence-card summary {
      cursor: pointer;
      font-weight: 700;
    }
    .evidence-body {
      margin-top: 12px;
    }
    .meta-row {
      margin-top: 6px;
      color: var(--muted);
    }
    @media (max-width: 860px) {
      .two-col, .three-col, .case-grid {
        grid-template-columns: 1fr;
      }
      .session-header {
        display: block;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="subtle">生成时间：${esc(formatDateTime(report.generatedAt))}</div>
      <div><span class="badge">${esc(report.date)}</span></div>
      <h1>${esc(agentScope)} 使用习惯审计</h1>
      <h2>这一天你把 ${esc(agentScope)} 用对了吗？</h2>
      <p>${esc(report.dayNarrative.summary)}</p>
      <p class="subtle">来源：${esc(agentBreakdown || '未识别到有效来源')}。</p>
      <p class="subtle">这份审计只基于本地 session 内容。重点不是“你今天用了多少次 agent”，而是“你今天有没有把 agent 用对、哪里第一次开始偏”。</p>
    </section>

    <section class="panel">
      <h2>今天按事情看，你一共做了这些事</h2>
      <div class="subtle">先按人能读懂的方式看这一天都做了哪些事情，再看哪些是真推进、哪些是假忙。</div>
      ${renderWorkOverview(report.workOverview || [])}
    </section>

    <section class="panel">
      <h2>这一天你实际上把时间花在了哪里</h2>
      <p class="subtle">${esc(report.dailyReality.summary)}</p>
      <div class="three-col">
        <div>
          <h2>真正推进了什么</h2>
          ${renderRealityCards(report.dailyReality.buckets.progress, '昨天没有明确推进到交付前的会话。')}
        </div>
        <div>
          <h2>查清了什么</h2>
          ${renderRealityCards(report.dailyReality.buckets.clarified, '昨天没有把关键不确定性钉死的会话。')}
        </div>
        <div>
          <h2>哪些时间最值得警惕</h2>
          ${renderRealityCards(report.dailyReality.buckets.risk, '昨天没有明显接近无用功的会话。')}
        </div>
      </div>
    </section>

    <section class="panel two-col">
      <div>
        <h2>你这一天用错的 3 个地方</h2>
        ${renderCaseBullets(report.topMistakes, '昨天没有明显的严重错例。')}
      </div>
      <div>
        <h2>你这一天用对的 2 个地方</h2>
        ${renderCaseBullets(report.topWins, '昨天没有足够清晰的正例。')}
      </div>
    </section>

    <section class="panel">
      <h2>明天只改 1 条规则</h2>
      <div class="audit-card">
        <strong>${esc(report.tomorrowRule)}</strong>
        <div class="meta-row">这条规则不是泛建议，而是明天最值得先改的一条行为规则。</div>
      </div>
    </section>

    <section class="panel two-col">
      <div>
        <h2>你的稳定习惯</h2>
        ${renderAuditCards(report.behavioralAudit.user)}
      </div>
      <div>
        <h2>AI 助手的稳定问题</h2>
        ${renderAuditCards(report.behavioralAudit.agent)}
      </div>
    </section>

    <section class="panel two-col">
      <div>
        <h2>你和 AI 助手的互动模式</h2>
        ${renderAuditCards(report.behavioralAudit.interaction)}
      </div>
      <div>
        <h2>这些问题为什么会发生</h2>
        ${report.issues.length ? renderAuditCards(report.issues.map((issue) => ({
          title: issue.humanTitle || issue.title,
          detail: issue.recommendation,
          evidence: issue.evidence
        }))) : '<div class="subtle">昨天没有需要特别展开的系统性问题。</div>'}
      </div>
    </section>

    <section class="panel">
      <h2>最值得看的 3 条 case</h2>
      ${renderCaseCards(report.topCases)}
    </section>

    <section class="panel">
      <h2>技术附录</h2>
      <div class="subtle">这里保留 session id 和更技术化的证据，正文不再直接用这些内容轰炸你。</div>
      ${renderAppendixSessions(report.sessions)}
    </section>
  </main>
</body>
</html>`;
}

module.exports = {
  analyzeDayActivity,
  classifyPrompt,
  collectDayActivity,
  renderDailyHtml,
  toLocalDateString
};
