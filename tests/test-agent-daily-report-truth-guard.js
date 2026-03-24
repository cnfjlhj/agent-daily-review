#!/usr/bin/env node

const assert = require('assert');

const { analyzeDayActivity } = require('../src/utils/agent-daily-report');

function createSession(overrides = {}) {
  return {
    agent: 'codex',
    sessionId: 'session-1',
    date: '2026-03-23',
    startAt: '2026-03-23T01:00:00.000Z',
    endAt: '2026-03-23T01:20:00.000Z',
    cwd: '/home/cnfjlhj/projects/demo-app',
    projectLabel: 'demo-app',
    prompt: '默认 prompt',
    promptFlags: {
      recovery: false,
      uncertain: false,
      memoryCue: false,
      reentry: false,
      vague: false
    },
    toolCounts: {},
    eventCounts: {},
    touchedFiles: [],
    userMessages: [],
    assistantMessages: [],
    transcriptTurns: [],
    activities: [],
    lastUserRequest: '默认 prompt',
    assistantExcerpt: '',
    planCount: 0,
    writeCount: 0,
    readCount: 0,
    model: 'codex',
    sourceFile: '/tmp/session.jsonl',
    sessionStartAt: '2026-03-23T01:00:00.000Z',
    sessionEndAt: '2026-03-23T01:20:00.000Z',
    continuedFromPreviousDay: false,
    ...overrides
  };
}

async function run() {
  const collected = {
    date: '2026-03-23',
    homeDir: '/tmp/codex-home',
    sessions: [
      createSession({
        sessionId: 'learn-inspiration-1',
        prompt: '我最近看到一个项目，就是叫做 learn claude code 这个样子。先帮我调研别人怎么做这种心理学/哲学学习网站，然后一起构思方向。',
        lastUserRequest: '他们这些是中文的吗？能做到什么呢',
        assistantExcerpt: '不是都中文。我刚核实过参考站后，结论是：更值得做的不是百科，而是把心理学现象做成可学习、可自测、可立即试用的网站。',
        userMessages: [
          '我最近看到一个项目，就是叫做 learn claude code 这个样子。先帮我调研别人怎么做这种心理学/哲学学习网站，然后一起构思方向。',
          '他们这些是中文的吗？能做到什么呢'
        ],
        assistantMessages: [
          '我会先看参考站结构，再找类似的心理学/哲学网站案例，最后给你 2 到 3 个可选方向。',
          '不是都中文。我刚核实过参考站后，结论是：更值得做的不是百科，而是把心理学现象做成可学习、可自测、可立即试用的网站。'
        ],
        transcriptTurns: [
          {
            role: 'user',
            text: '我最近看到一个项目，就是叫做 learn claude code 这个样子。先帮我调研别人怎么做这种心理学/哲学学习网站，然后一起构思方向。'
          },
          {
            role: 'assistant',
            text: '我会先看参考站结构，再找类似的心理学/哲学网站案例，最后给你 2 到 3 个可选方向。'
          },
          {
            role: 'user',
            text: '他们这些是中文的吗？能做到什么呢'
          },
          {
            role: 'assistant',
            text: '不是都中文。我刚核实过参考站后，结论是：更值得做的不是百科，而是把心理学现象做成可学习、可自测、可立即试用的网站。'
          }
        ],
        touchedFiles: [
          'bin/cc-connect-codex.sh',
          'bin/codex',
          'config/proxy-mode.json'
        ],
        writeCount: 3,
        activities: [
          { kind: 'message', timestamp: '2026-03-23T01:00:00.000Z', role: 'user', text: '我最近看到一个项目，就是叫做 learn claude code 这个样子。先帮我调研别人怎么做这种心理学/哲学学习网站，然后一起构思方向。' },
          { kind: 'message', timestamp: '2026-03-23T01:01:00.000Z', role: 'assistant', text: '我会先看参考站结构，再找类似的心理学/哲学网站案例，最后给你 2 到 3 个可选方向。' },
          { kind: 'files', timestamp: '2026-03-23T01:02:00.000Z', files: ['bin/cc-connect-codex.sh', 'bin/codex', 'config/proxy-mode.json'] },
          { kind: 'message', timestamp: '2026-03-23T01:03:00.000Z', role: 'assistant', text: '不是都中文。我刚核实过参考站后，结论是：更值得做的不是百科，而是把心理学现象做成可学习、可自测、可立即试用的网站。' }
        ]
      }),
      createSession({
        sessionId: 'learn-recovery-1',
        prompt: '最近我好像学了 Learn Claude Code 的一个东西，我现在需要继续往下学习。我记得之前有这样的 session 被我保留着，但是找不到了。',
        lastUserRequest: '那边是 Claude Code 的会话啊，可是我现在用不了 Claude Code 了，那就由你来接管吧。',
        assistantExcerpt: '可以，我来接管。已经确认之前的学习断点停在 s07 task system，所以现在最合理的继续点就是从 s07 继续。',
        userMessages: [
          '最近我好像学了 Learn Claude Code 的一个东西，我现在需要继续往下学习。我记得之前有这样的 session 被我保留着，但是找不到了。',
          '那边是 Claude Code 的会话啊，可是我现在用不了 Claude Code 了，那就由你来接管吧。'
        ],
        assistantMessages: [
          '我先扫描本地 Codex/Claude 会话，确认有没有对应的恢复入口。',
          '可以，我来接管。已经确认之前的学习断点停在 s07 task system，所以现在最合理的继续点就是从 s07 继续。'
        ],
        transcriptTurns: [
          {
            role: 'user',
            text: '最近我好像学了 Learn Claude Code 的一个东西，我现在需要继续往下学习。我记得之前有这样的 session 被我保留着，但是找不到了。'
          },
          {
            role: 'assistant',
            text: '我先扫描本地 Codex/Claude 会话，确认有没有对应的恢复入口。'
          },
          {
            role: 'user',
            text: '那边是 Claude Code 的会话啊，可是我现在用不了 Claude Code 了，那就由你来接管吧。'
          },
          {
            role: 'assistant',
            text: '可以，我来接管。已经确认之前的学习断点停在 s07 task system，所以现在最合理的继续点就是从 s07 继续。'
          }
        ],
        touchedFiles: ['/home/cnfjlhj/.codex/AGENTS.md'],
        writeCount: 1,
        activities: [
          { kind: 'message', timestamp: '2026-03-23T07:04:00.000Z', role: 'user', text: '最近我好像学了 Learn Claude Code 的一个东西，我现在需要继续往下学习。我记得之前有这样的 session 被我保留着，但是找不到了。' },
          { kind: 'message', timestamp: '2026-03-23T07:05:00.000Z', role: 'assistant', text: '我先扫描本地 Codex/Claude 会话，确认有没有对应的恢复入口。' },
          { kind: 'files', timestamp: '2026-03-23T07:06:00.000Z', files: ['/home/cnfjlhj/.codex/AGENTS.md'] },
          { kind: 'message', timestamp: '2026-03-23T07:17:00.000Z', role: 'assistant', text: '可以，我来接管。已经确认之前的学习断点停在 s07 task system，所以现在最合理的继续点就是从 s07 继续。' }
        ]
      })
    ],
    summary: {
      totalSessions: 2,
      byAgent: {
        codex: 2
      }
    }
  };

  const heuristicOnly = await analyzeDayActivity(collected, {
    analysisMode: 'heuristic',
    sessionCompactor: null,
    daySynthesizer: null
  });

  const inspiration = heuristicOnly.sessions.find((session) => session.sessionId === 'learn-inspiration-1');
  const recovery = heuristicOnly.sessions.find((session) => session.sessionId === 'learn-recovery-1');

  assert.ok(inspiration, 'should keep the inspiration session');
  assert.ok(recovery, 'should keep the recovery session');
  assert.notStrictEqual(
    inspiration.analysis.resolutionType,
    'shipped',
    'should not mark unrelated touched files as a shipped result when the conversation stayed on-topic'
  );
  assert.ok(
    !/Session 工具链 已经落地/.test(inspiration.analysis.actualLanding),
    'should not claim session-tooling delivery for the inspiration-research session'
  );
  assert.match(
    inspiration.analysis.actualLanding,
    /不能.*文件.*判断|不能仅凭文件判断|文件.*不能.*证明/,
    'should explicitly say file changes alone are not enough evidence'
  );
  assert.notStrictEqual(
    recovery.analysis.resolutionType,
    'shipped',
    'should not mark a learning-session recovery as shipped just because one config file was touched'
  );
  assert.ok(
    !/播客转写 已经落地/.test(recovery.analysis.actualLanding),
    'should not invent a podcast-transcription landing for a session-recovery conversation'
  );
  assert.strictEqual(
    heuristicOnly.qualityGate.pass,
    false,
    'should block auto-send when the report still contains truth-risk sessions without semantic review'
  );
  assert.ok(
    heuristicOnly.qualityGate.issues.some((issue) => /文件|落地|semantic|语义|对话/.test(issue.detail || issue.title || '')),
    'quality gate should explain why these sessions are not trustworthy yet'
  );

  const compacted = await analyzeDayActivity(collected, {
    analysisMode: 'compact-first',
    sessionCompactor: {
      compactSession: async (session) => {
        if (session.sessionId === 'learn-inspiration-1') {
          return {
            title: '心理学网站灵感调研那条',
            declaredGoal: '调研 Learn Claude Code 一类站点，判断适不适合做中文心理学/哲学学习网站。',
            actualLanding: '这轮真正完成的是：把参考站路线、中文支持情况和更值得做的产品方向讲清楚了，不应把顺手碰到的工具文件算成主线落地。',
            landingSummary: '灵感调研与方向判断已经形成清楚结论。',
            promptArchetype: 'direct-task',
            resolutionType: 'diagnosis-complete',
            goalFidelity: 'high',
            semanticPivot: false,
            goalLabel: '心理学网站方向调研',
            landingLabel: '心理学网站方向调研',
            problemSource: 'none',
            driftOrigin: 'none',
            bucket: 'clarified',
            badge: '查清方向',
            worth: '这条不是无用功，因为它把“要不要做、该怎么做”真正说明白了。',
            verdict: '这条的价值在于方向判断，不在于文件改动。',
            turnLabel: '真正形成判断的那一句',
            turnText: 'Codex 说了：更值得做的不是百科，而是把心理学现象做成可学习、可自测、可立即试用的网站。',
            userVerdict: '你这轮开场是清楚的，问题不在你。',
            agentVerdict: 'Codex 真正做对的是给出方向判断，而不是拿顺手改到的工具文件冒充主线落地。',
            interactionVerdict: '这轮对话主线是稳定的，真正要防的是会话过长后被顺手动作污染结论。',
            userQuote: {
              text: '先帮我调研别人怎么做这种心理学/哲学学习网站，然后一起构思方向。',
              judgment: '这句把任务定义成调研加方向判断。',
              polarity: 'good'
            },
            agentQuote: {
              text: '更值得做的不是百科，而是把心理学现象做成可学习、可自测、可立即试用的网站。',
              judgment: '这句才是本轮真正形成的判断。',
              polarity: 'good'
            }
          };
        }

        return {
          title: 'Learn Claude Code 学习接管那条',
          declaredGoal: '找回之前的 Learn Claude Code 学习会话，并确认现在该从哪里继续。',
          actualLanding: '这轮真正完成的是：确认 Claude 会话已被 Codex 接管，学习断点停在 s07 task system，可以直接从 s07 继续。',
          landingSummary: '学习恢复路径已经查清。',
          promptArchetype: 'session-recovery',
          resolutionType: 'diagnosis-complete',
          goalFidelity: 'high',
          semanticPivot: false,
          goalLabel: '学习会话恢复',
          landingLabel: '学习会话恢复',
          problemSource: 'none',
          driftOrigin: 'none',
          bucket: 'clarified',
          badge: '查清断点',
          worth: '这条不是无用功，因为它把继续学习的真实入口查清了。',
          verdict: '这条的价值在于恢复学习断点，而不是碰到了哪个配置文件。',
          turnLabel: '真正闭环的那一句',
          turnText: 'Codex 说了：已经确认之前的学习断点停在 s07 task system，所以现在最合理的继续点就是从 s07 继续。',
          userVerdict: '你这轮真正需要的是恢复入口，这个目标是清楚的。',
          agentVerdict: 'Codex 应该把“确认学习断点”当成主结果，而不是把顺手碰到的文件当成交付。',
          interactionVerdict: '这轮人机是对齐的，问题在于自动归因时不能拿文件替代会话事实。',
          userQuote: {
            text: '最近我好像学了 Learn Claude Code 的一个东西，我现在需要继续往下学习。',
            judgment: '这句明确说明了目标是恢复学习断点。',
            polarity: 'good'
          },
          agentQuote: {
            text: '已经确认之前的学习断点停在 s07 task system，所以现在最合理的继续点就是从 s07 继续。',
            judgment: '这句才是本轮真正的闭环。',
            polarity: 'good'
          }
        };
      }
    },
    daySynthesizer: {
      synthesizeDay: async () => ({
        headline: '有两条学习/调研会话被文件噪声污染过，需要靠语义审计纠偏',
        summary: '真正发生的不是工具链落地，而是方向判断和学习断点恢复。文件路径只能当噪声线索，不能冒充主结果。',
        behavioralAudit: {
          user: [],
          agent: [],
          interaction: []
        },
        issues: [],
        goodPatterns: [],
        tomorrowRule: '先看对话闭环，再看文件痕迹。'
      })
    }
  });

  assert.strictEqual(compacted.qualityGate.pass, true, 'semantic correction should allow the report to pass the quality gate');
  assert.match(
    compacted.sessions.find((session) => session.sessionId === 'learn-inspiration-1').analysis.actualLanding,
    /方向|调研/,
    'semantic compact should recover the real landing of the inspiration session'
  );
  assert.match(
    compacted.sessions.find((session) => session.sessionId === 'learn-recovery-1').analysis.actualLanding,
    /s07|断点|继续/,
    'semantic compact should recover the real landing of the learning-recovery session'
  );

  console.log('✅ truth-guard report checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
