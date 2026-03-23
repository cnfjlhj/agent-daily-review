const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_ANALYSIS_MODE = process.env.AGENT_DAILY_REPORT_ANALYSIS_MODE || 'auto';
const DEFAULT_PROVIDER = (process.env.AGENT_DAILY_REPORT_PROVIDER || 'auto').trim().toLowerCase();
const CODEX_BIN = process.env.AGENT_DAILY_REPORT_CODEX_BIN || 'codex';
const CODEX_MODEL = process.env.AGENT_DAILY_REPORT_CODEX_MODEL || '';
const CODEX_REASONING_EFFORT = process.env.AGENT_DAILY_REPORT_CODEX_REASONING || 'low';
const SESSION_MODEL_CANDIDATES = [
  process.env.AGENT_DAILY_REPORT_SESSION_MODEL,
  process.env.AGENT_DAILY_REPORT_MODEL,
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022'
].filter(Boolean);
const DAY_MODEL_CANDIDATES = [
  process.env.AGENT_DAILY_REPORT_DAY_MODEL,
  process.env.AGENT_DAILY_REPORT_MODEL,
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022'
].filter(Boolean);

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCodeFence(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return raw;
  }
  if (raw.startsWith('```json')) {
    return raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  }
  if (raw.startsWith('```')) {
    return raw.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return raw;
}

function parseJsonResponse(text) {
  const stripped = stripCodeFence(text);
  if (!stripped) {
    throw new Error('Empty compact response');
  }

  try {
    return JSON.parse(stripped);
  } catch (error) {
    const match = stripped.match(/\{[\s\S]*\}$/);
    if (!match) {
      throw error;
    }
    return JSON.parse(match[0]);
  }
}

function hhmm(isoString) {
  if (!isoString) {
    return '--:--';
  }
  try {
    return new Date(isoString).toLocaleTimeString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '--:--';
  }
}

function formatActivity(activity) {
  const prefix = `[${hhmm(activity.timestamp)}]`;
  if (activity.kind === 'summary') {
    return `${prefix} SUMMARY: ${normalizeWhitespace(activity.text).slice(0, 800)}`;
  }
  if (activity.kind === 'message') {
    const speaker = activity.role === 'user' ? 'USER' : 'ASSISTANT';
    return `${prefix} ${speaker}: ${normalizeWhitespace(activity.text).slice(0, 320)}`;
  }
  if (activity.kind === 'tool') {
    return `${prefix} TOOL: ${activity.name || 'unknown'}`;
  }
  if (activity.kind === 'files') {
    return `${prefix} FILES: ${(activity.files || []).join(', ')}`.slice(0, 600);
  }
  if (activity.kind === 'event') {
    return `${prefix} EVENT: ${activity.name || 'unknown'}`;
  }
  return `${prefix} OTHER`;
}

function serializeActivities(activities = []) {
  return activities
    .map(formatActivity)
    .filter(Boolean)
    .join('\n');
}

function flushActivityBurst(target, buffer) {
  if (!buffer.length) {
    return;
  }

  const toolCounts = {};
  const eventCounts = {};
  const files = [];
  for (const activity of buffer) {
    if (activity.kind === 'tool') {
      toolCounts[activity.name || 'unknown'] = (toolCounts[activity.name || 'unknown'] || 0) + 1;
    } else if (activity.kind === 'event') {
      eventCounts[activity.name || 'unknown'] = (eventCounts[activity.name || 'unknown'] || 0) + 1;
    } else if (activity.kind === 'files') {
      for (const file of activity.files || []) {
        if (file && !files.includes(file)) {
          files.push(file);
        }
      }
    }
  }

  const parts = [];
  if (Object.keys(toolCounts).length > 0) {
    parts.push(`TOOLS ${Object.entries(toolCounts).map(([name, count]) => `${name} x${count}`).join(', ')}`);
  }
  if (Object.keys(eventCounts).length > 0) {
    parts.push(`EVENTS ${Object.entries(eventCounts).map(([name, count]) => `${name} x${count}`).join(', ')}`);
  }
  if (files.length > 0) {
    parts.push(`FILES ${files.slice(0, 6).join(', ')}`);
  }

  target.push({
    kind: 'summary',
    timestamp: buffer[0].timestamp,
    text: parts.join(' | ')
  });
}

function condenseActivities(activities = []) {
  if (activities.length <= 24) {
    return activities;
  }

  const condensed = [];
  let buffer = [];
  for (const activity of activities) {
    if (activity.kind === 'message') {
      flushActivityBurst(condensed, buffer);
      buffer = [];
      condensed.push(activity);
      continue;
    }
    buffer.push(activity);
  }
  flushActivityBurst(condensed, buffer);
  return condensed;
}

function chunkActivities(activities = [], options = {}) {
  const maxChars = options.maxChars || 9000;
  const maxItems = options.maxItems || 30;
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const activity of activities) {
    const rendered = formatActivity(activity);
    const extraLength = rendered.length + 1;
    if (current.length > 0 && (current.length >= maxItems || currentLength + extraLength > maxChars)) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(activity);
    currentLength += extraLength;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function stableHash(value) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(value))
    .digest('hex');
}

function safeFilename(value) {
  return String(value || 'unknown')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'unknown';
}

function maybeReadCache(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function maybeWriteCache(filePath, payload) {
  if (!filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runCodexExec(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-daily-report-codex-'));
    const outputFile = path.join(tmpDir, 'last-message.txt');
    const args = ['exec', '-s', 'read-only', '--ephemeral', '-o', outputFile];

    if (CODEX_MODEL) {
      args.push('-m', CODEX_MODEL);
    }
    if (CODEX_REASONING_EFFORT) {
      args.push('-c', `reasoning_effort="${CODEX_REASONING_EFFORT}"`);
    }
    args.push(prompt);

    const child = spawn(CODEX_BIN, args, {
      cwd: options.workDir || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });

    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      try {
        if (code !== 0) {
          throw new Error(`codex exec failed with code ${code}: ${stderr.trim() || 'unknown error'}`);
        }
        const text = fs.readFileSync(outputFile, 'utf8').trim();
        resolve(text);
      } catch (error) {
        reject(error);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
}

function ensureArray(values, limit = 4) {
  return Array.isArray(values)
    ? values.map((value) => normalizeWhitespace(value)).filter(Boolean).slice(0, limit)
    : [];
}

function normalizeQuote(value, fallbackText = '') {
  const item = value && typeof value === 'object' ? value : {};
  return {
    text: normalizeWhitespace(item.text || fallbackText || '—').slice(0, 260),
    judgment: normalizeWhitespace(item.judgment || '').slice(0, 180),
    polarity: ['good', 'bad', 'neutral'].includes(item.polarity) ? item.polarity : 'neutral'
  };
}

function normalizeCompactOutput(session, heuristicSession, rawOutput = {}) {
  const heuristic = heuristicSession || {};
  const heuristicAnalysis = heuristic.analysis || {};
  const heuristicBehavior = heuristic.behavior || {};
  const heuristicCase = heuristic.caseSummary || {};
  const resolutionType = rawOutput.resolutionType || heuristicAnalysis.resolutionType || 'exploration';
  const goalFidelity = rawOutput.goalFidelity || heuristicAnalysis.goalFidelity || 'medium';
  const promptArchetype = rawOutput.promptArchetype || heuristicAnalysis.promptArchetype || 'direct-task';
  const bucket = ['progress', 'clarified', 'risk'].includes(rawOutput.bucket)
    ? rawOutput.bucket
    : ['shipped', 'packaging-blocked'].includes(resolutionType)
      ? 'progress'
      : ['diagnosis-complete', 'disproved-path'].includes(resolutionType)
        ? 'clarified'
        : 'risk';

  return {
    title: normalizeWhitespace(rawOutput.title || heuristicCase.title || `${session.sessionId} 那条`) || `${session.sessionId} 那条`,
    declaredGoal: normalizeWhitespace(rawOutput.declaredGoal || heuristicAnalysis.declaredGoal || session.prompt || session.lastUserRequest || '未命名任务'),
    actualLanding: normalizeWhitespace(rawOutput.actualLanding || heuristicAnalysis.actualLanding || heuristicCase.verdict || '没有形成清晰落点。'),
    landingSummary: normalizeWhitespace(rawOutput.landingSummary || heuristicAnalysis.landingSummary || rawOutput.actualLanding || '没有形成清晰落点。'),
    promptArchetype,
    resolutionType,
    goalFidelity,
    semanticPivot: typeof rawOutput.semanticPivot === 'boolean' ? rawOutput.semanticPivot : Boolean(heuristicAnalysis.semanticPivot),
    goalTag: rawOutput.goalTag || heuristicAnalysis.goalTag || '',
    goalLabel: normalizeWhitespace(rawOutput.goalLabel || heuristicAnalysis.goalLabel || '未归类任务'),
    landingTag: rawOutput.landingTag || heuristicAnalysis.landingTag || rawOutput.goalTag || '',
    landingLabel: normalizeWhitespace(rawOutput.landingLabel || heuristicAnalysis.landingLabel || rawOutput.goalLabel || '未归类任务'),
    problemSource: rawOutput.problemSource || heuristicAnalysis.problemSource || 'none',
    driftOrigin: rawOutput.driftOrigin || heuristicBehavior.driftOrigin || 'none',
    bucket,
    badge: normalizeWhitespace(rawOutput.badge || ''),
    worth: normalizeWhitespace(rawOutput.worth || ''),
    verdict: normalizeWhitespace(rawOutput.verdict || heuristicCase.verdict || rawOutput.actualLanding || ''),
    turnLabel: normalizeWhitespace(rawOutput.turnLabel || heuristicCase.turnLabel || '关键转折'),
    turnText: normalizeWhitespace(rawOutput.turnText || heuristicCase.turnText || heuristicCase.firstWrongTurn || '—'),
    userVerdict: normalizeWhitespace(rawOutput.userVerdict || heuristicBehavior.userVerdict || '这轮没有识别到明确的用户侧问题。'),
    agentVerdict: normalizeWhitespace(rawOutput.agentVerdict || heuristicBehavior.agentVerdict || '这轮没有识别到明确的 agent 侧问题。'),
    interactionVerdict: normalizeWhitespace(rawOutput.interactionVerdict || heuristicBehavior.interactionVerdict || '这轮没有识别到明确的人机互动模式。'),
    userQuote: normalizeQuote(rawOutput.userQuote, heuristicCase.userQuote && heuristicCase.userQuote.text),
    agentQuote: normalizeQuote(rawOutput.agentQuote, heuristicCase.agentQuote && heuristicCase.agentQuote.text),
    carryForward: ensureArray(rawOutput.carryForward, 4),
    confidence: Math.max(0, Math.min(100, Number(rawOutput.confidence || 0) || 0)),
    reviewDepth: ['skim', 'focused', 'deep'].includes(rawOutput.reviewDepth)
      ? rawOutput.reviewDepth
      : (heuristic.compaction && heuristic.compaction.reviewDepth) || 'focused'
  };
}

function buildSegmentPrompt(session, chunkIndex, totalChunks, transcript) {
  return [
    '你在为一份 AI 编程日报做“session compact”前处理。',
    '下面是同一个 session 在某个时间段里的活动片段。请只基于片段本身，提炼这个片段在做什么、哪里开始偏、有哪些硬证据。',
    '',
    '输出必须是 JSON：',
    '{',
    '  "segmentSummary": "1-2句中文总结这个片段在做什么",',
    '  "facts": ["最多4条事实，必须具体"],',
    '  "evidence": ["最多3条原句或工具/事件证据，保留关键字"],',
    '  "risks": ["最多3条风险或偏航信号"]',
    '}',
    '',
    `sessionId: ${session.sessionId}`,
    `agent: ${session.agent}`,
    `segment: ${chunkIndex + 1}/${totalChunks}`,
    '',
    '<segment>',
    transcript,
    '</segment>'
  ].join('\n');
}

function buildSessionPrompt(session, heuristicSession, sessionInput) {
  const safeHeuristic = heuristicSession || {
    analysis: {},
    behavior: {}
  };
  return [
    '你在写一份“AI 编程日报”的单 session 审计。目标不是罗列，而是判断：这条 session 实际做了什么、是否守住原始目标、用户哪里做错、agent 哪里做错、接下来怎么改。',
    '必须锐利、具体、接地气；不能空话；不能把 session id 当证据本身。',
    '',
    '输出必须是严格 JSON，字段如下：',
    '{',
    '  "title": "给人看的标题，格式像“播客文字版那条”",',
    '  "declaredGoal": "用户原始目标，中文一句",',
    '  "actualLanding": "这条 session 实际落到了什么地方，中文一句",',
    '  "landingSummary": "更短的一句总结",',
    '  "promptArchetype": "direct-task | project-reentry | session-recovery | vague-memory",',
    '  "resolutionType": "shipped | adjacent-infra-takeover | diagnosis-complete | disproved-path | packaging-blocked | context-recovery | churned-exploration | exploration",',
    '  "goalFidelity": "high | medium | low",',
    '  "semanticPivot": true,',
    '  "goalTag": "可空，英文短标签",',
    '  "goalLabel": "中文目标标签",',
    '  "landingTag": "可空，英文短标签",',
    '  "landingLabel": "中文落点标签",',
    '  "problemSource": "none | user | agent | workflow | environment | tool-model | mixed",',
    '  "driftOrigin": "none | user-opened-side-quest | assistant-hijack | environment-limit | mixed",',
    '  "bucket": "progress | clarified | risk",',
    '  "badge": "给人看的短标签",',
    '  "worth": "一句话解释这条为什么算真实推进/查清/值得警惕",',
    '  "verdict": "1-2句判断这条 session 的本质",',
    '  "turnLabel": "比如 第一次偏掉 / 闭环发生在这里 / 真正卡住的那一句",',
    '  "turnText": "一句人类可读的关键证据",',
    '  "userVerdict": "明确指出用户哪里做对/做错",',
    '  "agentVerdict": "明确指出 agent 哪里做对/做错",',
    '  "interactionVerdict": "指出人机互动模式",',
    '  "userQuote": {"text":"...","judgment":"...","polarity":"good|bad|neutral"},',
    '  "agentQuote": {"text":"...","judgment":"...","polarity":"good|bad|neutral"},',
    '  "carryForward": ["最多3条具体下一步"],',
    '  "confidence": 0,',
    '  "reviewDepth": "skim | focused | deep"',
    '}',
    '',
    '约束：',
    '- 必须用中文。',
    '- 证据句要让人一眼看懂，不要只写 session id。',
    '- 如果是“有产出但产出不是原始目标”，优先判为 adjacent-infra-takeover。',
    '- 如果没有改文件但真正钉死根因，优先判为 diagnosis-complete。',
    '- 如果内容基本做好但被 Telegram/体积/传输限制卡住，优先判为 packaging-blocked。',
    '- 如果主要在恢复上下文或确认口径，没有形成独立结果，判为 context-recovery 或 exploration。',
    '',
    '<objective_signals>',
    JSON.stringify({
      sessionId: session.sessionId,
      agent: session.agent,
      projectLabel: session.projectLabel,
      prompt: normalizeWhitespace(session.prompt).slice(0, 240),
      lastUserRequest: normalizeWhitespace(session.lastUserRequest).slice(0, 280),
      assistantExcerpt: normalizeWhitespace(session.assistantExcerpt).slice(0, 360),
      toolCounts: session.toolCounts,
      eventCounts: session.eventCounts,
      touchedFiles: session.touchedFiles,
      heuristic: {
        resolutionType: safeHeuristic.analysis && safeHeuristic.analysis.resolutionType,
        goalFidelity: safeHeuristic.analysis && safeHeuristic.analysis.goalFidelity,
        promptArchetype: safeHeuristic.analysis && safeHeuristic.analysis.promptArchetype,
        actualLanding: safeHeuristic.analysis && safeHeuristic.analysis.actualLanding,
        userVerdict: safeHeuristic.behavior && safeHeuristic.behavior.userVerdict,
        agentVerdict: safeHeuristic.behavior && safeHeuristic.behavior.agentVerdict
      }
    }, null, 2),
    '</objective_signals>',
    '',
    '<session_material>',
    sessionInput,
    '</session_material>'
  ].join('\n');
}

function buildDayPrompt(compactedSessions, context) {
  return [
    '你在写一份 AI 编程日报的“当天综合判断”。',
    '目标：让用户一眼看懂这一天到底做了什么、哪些是真推进、哪些是假忙、用户的稳定坏习惯是什么、AI 助手的稳定坏习惯是什么、明天只该改哪一条规则。',
    '',
    '输出必须是严格 JSON：',
    '{',
    '  "headline": "一句中文标题，必须锋利",',
    '  "summary": "2-3句中文总结当天本质",',
    '  "goodPatterns": [{"title":"...","detail":"...","evidence":["case title"]}],',
    '  "issues": [{"title":"英文机器键","humanTitle":"中文问题标题","primaryBucket":"workflow | tool-model | environment | user | agent | mixed","confidence":"high | medium | low","evidence":["case title"],"recommendation":"一句非常具体的改法"}],',
    '  "behavioralAudit": {',
    '    "user": [{"title":"...","detail":"...","evidence":["case title"]}],',
    '    "agent": [{"title":"...","detail":"...","evidence":["case title"]}],',
    '    "interaction": [{"title":"...","detail":"...","evidence":["case title"]}]',
    '  },',
    '  "tomorrowRule": "明天只改 1 条规则，必须具体"',
    '}',
    '',
    '要求：',
    '- 中文输出，尖锐但不空泛。',
    '- 证据只能引用下面这些 compact 的标题，不要凭空创造新 case。',
    '- 如果一天里同时有真实推进和明显偏航，headline 要体现“两件事同时成立”。',
    '',
    '<day_context>',
    JSON.stringify({
      date: context.date,
      byAgent: context.byAgent,
      sessionCount: compactedSessions.length
    }, null, 2),
    '</day_context>',
    '',
    '<session_compacts>',
    JSON.stringify(compactedSessions.map((session) => ({
      sessionId: session.sessionId,
      title: session.caseSummary && session.caseSummary.title,
      agent: session.agent,
      resolutionType: session.analysis && session.analysis.resolutionType,
      goalFidelity: session.analysis && session.analysis.goalFidelity,
      bucket: session.summaryBucket,
      declaredGoal: session.analysis && session.analysis.declaredGoal,
      actualLanding: session.analysis && session.analysis.actualLanding,
      userVerdict: session.behavior && session.behavior.userVerdict,
      agentVerdict: session.behavior && session.behavior.agentVerdict,
      interactionVerdict: session.behavior && session.behavior.interactionVerdict,
      worth: session.dailyReality && session.dailyReality.worth
    })), null, 2),
    '</session_compacts>'
  ].join('\n');
}

async function callAnthropicWithFallback(client, modelCandidates, prompt, maxTokens) {
  let lastError = null;
  for (const model of modelCandidates) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const text = (response.content || [])
        .filter((item) => item && item.type === 'text')
        .map((item) => item.text)
        .join('\n');
      return {
        model,
        text
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Anthropic call failed without an explicit error');
}

class AnthropicSessionCompactor {
  constructor(options = {}) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    });
    this.cacheDir = options.cacheDir || '';
  }

  buildCachePath(session, hash) {
    if (!this.cacheDir) {
      return '';
    }
    const fileName = `${safeFilename(session.agent)}-${safeFilename(session.sessionId)}-${hash.slice(0, 12)}.json`;
    return path.join(this.cacheDir, 'session-compacts', fileName);
  }

  async compactSession(session, context = {}) {
    const heuristicSession = context.heuristicSession;
    const rawActivities = Array.isArray(session.activities) && session.activities.length
      ? session.activities
      : (session.transcriptTurns || []).map((turn) => ({
        kind: 'message',
        timestamp: turn.timestamp,
        role: turn.role,
        text: turn.text
      }));
    const activities = condenseActivities(rawActivities);

    const cacheInput = {
      sessionId: session.sessionId,
      agent: session.agent,
      startAt: session.startAt,
      endAt: session.endAt,
      prompt: session.prompt,
      lastUserRequest: session.lastUserRequest,
      assistantExcerpt: session.assistantExcerpt,
      toolCounts: session.toolCounts,
      eventCounts: session.eventCounts,
      touchedFiles: session.touchedFiles,
      activities: rawActivities
    };
    const cacheHash = stableHash(cacheInput);
    const cachePath = this.buildCachePath(session, cacheHash);
    const cached = maybeReadCache(cachePath);
    if (cached && cached.hash === cacheHash && cached.compact) {
      return cached.compact;
    }

    const chunks = chunkActivities(activities);
    let sessionMaterial = '';
    let reviewDepth = 'focused';

    if (chunks.length <= 1) {
      sessionMaterial = serializeActivities(activities);
      reviewDepth = activities.length >= 16 ? 'focused' : 'skim';
    } else {
      const segmentSummaries = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const transcript = serializeActivities(chunks[index]);
        const { text } = await callAnthropicWithFallback(
          this.client,
          SESSION_MODEL_CANDIDATES,
          buildSegmentPrompt(session, index, chunks.length, transcript),
          1200
        );
        const parsed = parseJsonResponse(text);
        segmentSummaries.push({
          index,
          summary: normalizeWhitespace(parsed.segmentSummary || ''),
          facts: ensureArray(parsed.facts, 4),
          evidence: ensureArray(parsed.evidence, 4),
          risks: ensureArray(parsed.risks, 4)
        });
      }
      sessionMaterial = JSON.stringify({
        compressionStrategy: 'chunked',
        segmentCount: chunks.length,
        segmentSummaries
      }, null, 2);
      reviewDepth = 'deep';
    }

    const { text, model } = await callAnthropicWithFallback(
      this.client,
      SESSION_MODEL_CANDIDATES,
      buildSessionPrompt(session, heuristicSession, sessionMaterial),
      2500
    );
    const compact = normalizeCompactOutput(session, heuristicSession, {
      ...parseJsonResponse(text),
      reviewDepth
    });

    maybeWriteCache(cachePath, {
      hash: cacheHash,
      model,
      compact
    });
    return compact;
  }
}

class AnthropicDaySynthesizer {
  constructor(options = {}) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    });
    this.cacheDir = options.cacheDir || '';
  }

  buildCachePath(context, hash) {
    if (!this.cacheDir) {
      return '';
    }
    return path.join(this.cacheDir, 'day-synthesis', `${safeFilename(context.date)}-${hash.slice(0, 12)}.json`);
  }

  async synthesizeDay(compactedSessions, context = {}) {
    const cacheInput = {
      date: context.date,
      byAgent: context.byAgent,
      sessions: compactedSessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.caseSummary && session.caseSummary.title,
        resolutionType: session.analysis && session.analysis.resolutionType,
        goalFidelity: session.analysis && session.analysis.goalFidelity,
        declaredGoal: session.analysis && session.analysis.declaredGoal,
        actualLanding: session.analysis && session.analysis.actualLanding,
        userVerdict: session.behavior && session.behavior.userVerdict,
        agentVerdict: session.behavior && session.behavior.agentVerdict,
        interactionVerdict: session.behavior && session.behavior.interactionVerdict,
        worth: session.dailyReality && session.dailyReality.worth
      }))
    };
    const cacheHash = stableHash(cacheInput);
    const cachePath = this.buildCachePath(context, cacheHash);
    const cached = maybeReadCache(cachePath);
    if (cached && cached.hash === cacheHash && cached.synthesis) {
      return cached.synthesis;
    }

    const { text, model } = await callAnthropicWithFallback(
      this.client,
      DAY_MODEL_CANDIDATES,
      buildDayPrompt(compactedSessions, context),
      2600
    );
    const parsed = parseJsonResponse(text);
    const synthesis = {
      headline: normalizeWhitespace(parsed.headline || ''),
      summary: normalizeWhitespace(parsed.summary || ''),
      goodPatterns: Array.isArray(parsed.goodPatterns) ? parsed.goodPatterns : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      behavioralAudit: parsed.behavioralAudit && typeof parsed.behavioralAudit === 'object'
        ? parsed.behavioralAudit
        : {},
      tomorrowRule: normalizeWhitespace(parsed.tomorrowRule || '')
    };

    maybeWriteCache(cachePath, {
      hash: cacheHash,
      model,
      synthesis
    });
    return synthesis;
  }
}

class CodexCliSessionCompactor {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || '';
    this.workDir = options.workDir || process.cwd();
  }

  buildCachePath(session, hash) {
    if (!this.cacheDir) {
      return '';
    }
    const fileName = `${safeFilename(session.agent)}-${safeFilename(session.sessionId)}-${hash.slice(0, 12)}.json`;
    return path.join(this.cacheDir, 'session-compacts', fileName);
  }

  async compactSession(session, context = {}) {
    const heuristicSession = context.heuristicSession;
    const rawActivities = Array.isArray(session.activities) && session.activities.length
      ? session.activities
      : (session.transcriptTurns || []).map((turn) => ({
        kind: 'message',
        timestamp: turn.timestamp,
        role: turn.role,
        text: turn.text
      }));
    const activities = condenseActivities(rawActivities);

    const cacheInput = {
      sessionId: session.sessionId,
      agent: session.agent,
      prompt: session.prompt,
      lastUserRequest: session.lastUserRequest,
      assistantExcerpt: session.assistantExcerpt,
      toolCounts: session.toolCounts,
      eventCounts: session.eventCounts,
      touchedFiles: session.touchedFiles,
      activities: rawActivities
    };
    const cacheHash = stableHash(cacheInput);
    const cachePath = this.buildCachePath(session, cacheHash);
    const cached = maybeReadCache(cachePath);
    if (cached && cached.hash === cacheHash && cached.compact) {
      return cached.compact;
    }

    const chunks = chunkActivities(activities);
    let sessionMaterial = '';
    let reviewDepth = 'focused';

    if (chunks.length <= 1) {
      sessionMaterial = serializeActivities(activities);
      reviewDepth = activities.length >= 16 ? 'focused' : 'skim';
    } else {
      const segmentSummaries = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const transcript = serializeActivities(chunks[index]);
        const text = await runCodexExec(buildSegmentPrompt(session, index, chunks.length, transcript), {
          workDir: this.workDir
        });
        const parsed = parseJsonResponse(text);
        segmentSummaries.push({
          index,
          summary: normalizeWhitespace(parsed.segmentSummary || ''),
          facts: ensureArray(parsed.facts, 4),
          evidence: ensureArray(parsed.evidence, 4),
          risks: ensureArray(parsed.risks, 4)
        });
      }
      sessionMaterial = JSON.stringify({
        compressionStrategy: 'chunked',
        segmentCount: chunks.length,
        segmentSummaries
      }, null, 2);
      reviewDepth = 'deep';
    }

    const text = await runCodexExec(buildSessionPrompt(session, heuristicSession, sessionMaterial), {
      workDir: this.workDir
    });
    const compact = normalizeCompactOutput(session, heuristicSession, {
      ...parseJsonResponse(text),
      reviewDepth
    });

    maybeWriteCache(cachePath, {
      hash: cacheHash,
      provider: 'codex-cli',
      compact
    });
    return compact;
  }
}

class CodexCliDaySynthesizer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || '';
    this.workDir = options.workDir || process.cwd();
  }

  buildCachePath(context, hash) {
    if (!this.cacheDir) {
      return '';
    }
    return path.join(this.cacheDir, 'day-synthesis', `${safeFilename(context.date)}-${hash.slice(0, 12)}.json`);
  }

  async synthesizeDay(compactedSessions, context = {}) {
    const cacheInput = {
      date: context.date,
      byAgent: context.byAgent,
      sessions: compactedSessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.caseSummary && session.caseSummary.title,
        resolutionType: session.analysis && session.analysis.resolutionType,
        goalFidelity: session.analysis && session.analysis.goalFidelity,
        declaredGoal: session.analysis && session.analysis.declaredGoal,
        actualLanding: session.analysis && session.analysis.actualLanding,
        userVerdict: session.behavior && session.behavior.userVerdict,
        agentVerdict: session.behavior && session.behavior.agentVerdict,
        interactionVerdict: session.behavior && session.behavior.interactionVerdict,
        worth: session.dailyReality && session.dailyReality.worth
      }))
    };
    const cacheHash = stableHash(cacheInput);
    const cachePath = this.buildCachePath(context, cacheHash);
    const cached = maybeReadCache(cachePath);
    if (cached && cached.hash === cacheHash && cached.synthesis) {
      return cached.synthesis;
    }

    const text = await runCodexExec(buildDayPrompt(compactedSessions, context), {
      workDir: this.workDir
    });
    const parsed = parseJsonResponse(text);
    const synthesis = {
      headline: normalizeWhitespace(parsed.headline || ''),
      summary: normalizeWhitespace(parsed.summary || ''),
      goodPatterns: Array.isArray(parsed.goodPatterns) ? parsed.goodPatterns : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      behavioralAudit: parsed.behavioralAudit && typeof parsed.behavioralAudit === 'object'
        ? parsed.behavioralAudit
        : {},
      tomorrowRule: normalizeWhitespace(parsed.tomorrowRule || '')
    };

    maybeWriteCache(cachePath, {
      hash: cacheHash,
      provider: 'codex-cli',
      synthesis
    });
    return synthesis;
  }
}

function resolveAnalysisMode(requestedMode = '') {
  const mode = String(requestedMode || DEFAULT_ANALYSIS_MODE || 'auto').trim().toLowerCase();
  if (['auto', 'heuristic', 'compact-first', 'anthropic'].includes(mode)) {
    return mode;
  }
  return 'auto';
}

function shouldUseAnthropic(mode) {
  if (mode === 'heuristic') {
    return false;
  }
  if (mode === 'compact-first' || mode === 'anthropic') {
    return true;
  }
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function shouldUseCodexCli(mode) {
  if (mode === 'heuristic') {
    return false;
  }
  if (DEFAULT_PROVIDER === 'codex') {
    return true;
  }
  if (DEFAULT_PROVIDER === 'anthropic') {
    return false;
  }
  return true;
}

function createDefaultSessionCompactor(options = {}) {
  const mode = resolveAnalysisMode(options.analysisMode);
  if (shouldUseCodexCli(mode)) {
    try {
      return new CodexCliSessionCompactor(options);
    } catch (error) {
      // try next provider
    }
  }

  if (shouldUseAnthropic(mode)) {
    try {
      return new AnthropicSessionCompactor(options);
    } catch (error) {
      return null;
    }
  }
  return null;
}

function createDefaultDaySynthesizer(options = {}) {
  const mode = resolveAnalysisMode(options.analysisMode);
  if (shouldUseCodexCli(mode)) {
    try {
      return new CodexCliDaySynthesizer(options);
    } catch (error) {
      // try next provider
    }
  }

  if (shouldUseAnthropic(mode)) {
    try {
      return new AnthropicDaySynthesizer(options);
    } catch (error) {
      return null;
    }
  }
  return null;
}

module.exports = {
  createDefaultDaySynthesizer,
  createDefaultSessionCompactor,
  normalizeCompactOutput,
  resolveAnalysisMode,
  shouldUseAnthropic
};
