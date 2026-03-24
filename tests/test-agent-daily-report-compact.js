#!/usr/bin/env node

const assert = require('assert');

const { analyzeDayActivity, renderDailyHtml } = require('../src/utils/agent-daily-report');

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

function buildSyntheticCompact(session) {
  const map = {
    'codex-feature-1': {
      title: '播客文字版那条',
      declaredGoal: '帮我把这个播客弄成文字版，最好带时间戳，我想看完整内容。',
      actualLanding: '本来要做播客转写，结果主线被“Telegram 完整 HTML 发送链路”接管了。',
      landingSummary: '播客转写主线被 Telegram 完整 HTML 发送旁支接管。',
      promptArchetype: 'direct-task',
      resolutionType: 'adjacent-infra-takeover',
      goalFidelity: 'low',
      semanticPivot: true,
      goalTag: 'transcription',
      goalLabel: '播客转写',
      landingTag: 'telegram-html',
      landingLabel: 'Telegram HTML 发送',
      problemSource: 'workflow',
      driftOrigin: 'user-opened-side-quest',
      bucket: 'risk',
      badge: '主线被带偏',
      worth: '这条不是完全没产出，但产出的已经不是你原本最想解决的事。',
      verdict: '真正的问题不是没做事，而是主线被顺手问题偷走了。',
      turnLabel: '第一次偏掉',
      turnText: '你：telegram 我也需要直接把 html 发给我，最好完整保留文件。',
      userVerdict: '你这轮的错误不是目标太难，而是把新的 Telegram 诉求直接塞回播客主线。',
      agentVerdict: 'Codex 做错了：它没有把 Telegram 旁支隔离成待办，而是顺着把主线切走了。',
      interactionVerdict: '这轮是典型的“双边偏航”：你打开旁支，Codex 又没有守住边界。',
      userQuote: {
        text: 'telegram 我也需要直接把 html 发给我，最好完整保留文件。',
        judgment: '这句话把一个新需求直接插进当前主线，是这轮真正开始偏掉的位置。',
        polarity: 'bad'
      },
      agentQuote: {
        text: '主线已经从播客转写偏到 Telegram HTML 发送链路，我先把 mubu-cli 和 Telegram 文档发送补齐。',
        judgment: '这里 Codex 已经明确承认换题，却没有把换题当作风险刹车点。',
        polarity: 'bad'
      },
      carryForward: [
        '播客转写和 Telegram 发送拆成两个独立 session',
        '主线 session 内新增诉求一律先放停车场'
      ]
    },
    'codex-diagnosis-1': {
      title: '/star 排查那条',
      declaredGoal: '/star 为什么会失败？先帮我定位根因，不要急着改文件。',
      actualLanding: '没有改文件，但 /star 失败的根因已经被钉死：cc-connect 解析的是内部 session key，不是原生 Codex session id。',
      landingSummary: '/star 的根因被清楚定位。',
      promptArchetype: 'direct-task',
      resolutionType: 'diagnosis-complete',
      goalFidelity: 'high',
      semanticPivot: false,
      goalTag: 'session-tooling',
      goalLabel: 'Session 工具链',
      landingTag: 'session-tooling',
      landingLabel: 'Session 工具链',
      problemSource: 'none',
      driftOrigin: 'none',
      bucket: 'clarified',
      badge: '查清根因',
      worth: '这条不是无用功，因为它真正减少了后续乱试。',
      verdict: '这是典型的高质量诊断：先把根因钉死，再决定要不要改。',
      turnLabel: '闭环发生在这里',
      turnText: 'Codex 说了：已经定位到根因：cc-connect 当前绑定的是内部 session key，不是原生 Codex session id。',
      userVerdict: '你这轮用得对：先要求定位根因，不让 agent 上来乱改。',
      agentVerdict: 'Codex 做对了：它没有急着改文件，而是先把错误边界说清楚。',
      interactionVerdict: '当你先要求诊断，Codex 的表现明显更稳。',
      userQuote: {
        text: '/star 为什么会失败？先帮我定位根因，不要急着改文件。',
        judgment: '这句把任务框成“先诊断”，是好的 agent 用法。',
        polarity: 'good'
      },
      agentQuote: {
        text: '已经定位到根因：cc-connect 当前绑定的是内部 session key，不是原生 Codex session id，所以 /star 在解析阶段就失败了。',
        judgment: '这是完整的诊断闭环，不是表面猜测。',
        polarity: 'good'
      },
      carryForward: [
        '确认 root cause 后再决定是否改命令解析链',
        '把内部 key / 原生 session id 的映射逻辑单独补测试'
      ]
    },
    'claude-packaging-1': {
      title: 'research-intel README 宣传那条',
      declaredGoal: 'README 宣传写得太差了，先帮我对齐功能后再重写。',
      actualLanding: 'README 主体已经推进到可交付前，但最后被 Request too large (max 20MB) 卡在传输阶段。',
      landingSummary: 'README 推到了交付前，但卡在最后一公里。',
      promptArchetype: 'project-reentry',
      resolutionType: 'packaging-blocked',
      goalFidelity: 'high',
      semanticPivot: false,
      goalTag: 'research-intel',
      goalLabel: 'research-intel 论文推送系统',
      landingTag: 'readme-marketing',
      landingLabel: 'README/宣传包装',
      problemSource: 'environment',
      driftOrigin: 'environment-limit',
      bucket: 'progress',
      badge: '推进到最后一公里',
      worth: '这条不是无用功，因为内容本体已经推进，只是交付链路没提前验收。',
      verdict: '这条的教训不是“没做好内容”，而是“快交付时还没有交付意识”。',
      turnLabel: '真正卡住的那一句',
      turnText: 'Claude Code 说了：README 主体已经重写完成，但最后在 transfer 阶段被 Request too large (max 20MB) 卡住。',
      userVerdict: '你这轮目标很清楚，问题不在你，而在交付链路没有被前置检查。',
      agentVerdict: 'Claude Code 做错了：它没有提前检查体积或传输限制，导致最后一公里才暴露风险。',
      interactionVerdict: '人机目标是对齐的，真正卡住你们的是外部交付约束。',
      userQuote: {
        text: 'README 宣传写得太差了，先帮我对齐功能后再重写。',
        judgment: '这是一个相对清楚的项目重入型需求。',
        polarity: 'good'
      },
      agentQuote: {
        text: 'README 主体已经重写完成，但最后在 transfer 阶段被 Request too large (max 20MB) 卡住。',
        judgment: '这里暴露的是交付前验收意识不足，而不是内容主线错了。',
        polarity: 'bad'
      },
      carryForward: [
        '凡是要发 Telegram / HTML 的任务都先验收传输上限',
        '把交付链路 checklist 放到任务开头'
      ]
    }
  };

  return map[session.sessionId] || {
    title: `${session.sessionId} 那条`,
    declaredGoal: session.prompt,
    actualLanding: '这条会话没有形成足够清晰的落点。',
    landingSummary: '没有形成明确结果。',
    promptArchetype: 'direct-task',
    resolutionType: 'exploration',
    goalFidelity: 'medium',
    semanticPivot: false,
    goalTag: '',
    goalLabel: '未归类任务',
    landingTag: '',
    landingLabel: '未归类任务',
    problemSource: 'none',
    driftOrigin: 'none',
    bucket: 'risk',
    badge: '继续观察',
    worth: '这条没有清楚证明自己不是无用功。',
    verdict: '这条会话价值一般，更多像探索。',
    turnLabel: '真正停下来的地方',
    turnText: '这条没有形成明确停点。',
    userVerdict: '用户行为没有形成明确结论。',
    agentVerdict: 'agent 行为没有形成明确结论。',
    interactionVerdict: '互动模式没有形成明确结论。',
    userQuote: {
      text: session.prompt,
      judgment: '这句说明了任务起点。',
      polarity: 'neutral'
    },
    agentQuote: {
      text: session.assistantExcerpt || '—',
      judgment: '这句说明了最后停点。',
      polarity: 'neutral'
    },
    carryForward: ['需要更强的 compact 才能继续判断']
  };
}

async function run() {
  const collected = {
    date: '2026-03-23',
    homeDir: '/tmp/codex-home',
    sessions: [
      createSession({
        sessionId: 'codex-feature-1',
        prompt: '帮我把这个播客弄成文字版，最好带时间戳，我想看完整内容。',
        lastUserRequest: 'telegram 我也需要直接把 html 发给我，最好完整保留文件。',
        assistantExcerpt: '主线已经从播客转写偏到 Telegram HTML 发送链路，我先把 mubu-cli 和 Telegram 文档发送补齐。',
        toolCounts: { update_plan: 1, exec_command: 1 },
        touchedFiles: ['scripts/telegram/send-daily-html-report.js']
      }),
      createSession({
        sessionId: 'codex-diagnosis-1',
        prompt: '/star 为什么会失败？先帮我定位根因，不要急着改文件。',
        assistantExcerpt: '已经定位到根因：cc-connect 当前绑定的是内部 session key，不是原生 Codex session id，所以 /star 在解析阶段就失败了。'
      }),
      createSession({
        agent: 'claude',
        model: 'claude-opus-4-6',
        sessionId: 'claude-packaging-1',
        prompt: 'README 宣传写得太差了，先帮我对齐功能后再重写。',
        assistantExcerpt: 'README 主体已经重写完成，但最后在 transfer 阶段被 Request too large (max 20MB) 卡住。',
        toolCounts: { TaskUpdate: 1, Edit: 1 },
        touchedFiles: ['/home/cnfjlhj/projects/research-intel/README.md']
      })
    ],
    summary: {
      totalSessions: 3,
      byAgent: {
        codex: 2,
        claude: 1
      }
    }
  };

  const compactCalls = [];
  const daySynthCalls = [];
  const analyzed = await analyzeDayActivity(collected, {
    analysisMode: 'compact-first',
    sessionCompactor: {
      compactSession: async (session, context) => {
        compactCalls.push({
          sessionId: session.sessionId,
          date: context.date,
          homeDir: context.homeDir
        });
        return buildSyntheticCompact(session);
      }
    },
    daySynthesizer: {
      synthesizeDay: async (sessions, context) => {
        daySynthCalls.push({
          sessionIds: sessions.map((session) => session.sessionId),
          date: context.date
        });
        return {
          headline: '边界漏水，但不是没干活的一天',
          summary: '真正推进的是 /star 根因定位和 README 交付前推进；最值得警惕的是播客主线被 Telegram 旁支偷走了。',
          goodPatterns: [
            {
              title: '先诊断再动手',
              detail: '当你明确要求先定位根因时，agent 的表现明显更稳。',
              evidence: ['/star 排查那条']
            }
          ],
          issues: [
            {
              title: 'Boundary leakage let adjacent infra take over primary tasks',
              humanTitle: '主线边界漏水：旁支任务接管了原始目标',
              primaryBucket: 'workflow',
              confidence: 'high',
              evidence: ['播客文字版那条'],
              recommendation: '主线 session 里想到的新问题先写进停车场，不直接插进当前会话。'
            }
          ],
          behavioralAudit: {
            user: [
              {
                title: '你会在主线里插入顺手问题',
                detail: '你一旦想到“这个也顺手做了吧”，就容易把旁支重新塞回当前主线。',
                evidence: ['播客文字版那条']
              }
            ],
            agent: [
              {
                title: 'Codex / Claude Code 还不会主动守住主线',
                detail: '当你突然开旁支时，AI 助手现在更倾向于顺势接题，而不是帮你守边界。',
                evidence: ['播客文字版那条', 'research-intel README 宣传那条']
              }
            ],
            interaction: [
              {
                title: '你的旁支冲动 + AI 的顺手倾向，会把一天做成假忙',
                detail: '最危险的不是单边失误，而是你开旁支、agent 不刹车，最后一起偏离真正目标。',
                evidence: ['播客文字版那条']
              }
            ]
          },
          tomorrowRule: '主线 session 里想到的新问题，先写进“停车场”，不直接插入当前会话。'
        };
      }
    }
  });

  assert.strictEqual(compactCalls.length, 3, 'should compact each session before synthesizing the day');
  assert.strictEqual(daySynthCalls.length, 1, 'should run one day-level synthesis after per-session compact');
  assert.deepStrictEqual(
    compactCalls.map((item) => item.sessionId),
    ['codex-feature-1', 'codex-diagnosis-1', 'claude-packaging-1'],
    'should compact all sessions in-order'
  );

  const pivotSession = analyzed.sessions.find((session) => session.sessionId === 'codex-feature-1');
  const diagnosisSession = analyzed.sessions.find((session) => session.sessionId === 'codex-diagnosis-1');
  const packagingSession = analyzed.sessions.find((session) => session.sessionId === 'claude-packaging-1');

  assert.ok(pivotSession, 'should preserve compacted session entries');
  assert.strictEqual(
    pivotSession.analysis.resolutionType,
    'adjacent-infra-takeover',
    'should use the compactor result instead of only rule-derived resolution types'
  );
  assert.match(
    pivotSession.behavior.userVerdict,
    /Telegram 诉求直接塞回播客主线/,
    'should expose sharp user-side diagnosis from compact output'
  );
  assert.match(
    pivotSession.behavior.agentVerdict,
    /没有把 Telegram 旁支隔离/,
    'should expose sharp agent-side diagnosis from compact output'
  );
  assert.match(
    pivotSession.caseSummary.userQuote.text,
    /完整保留文件/,
    'should keep the compactor-chosen user evidence quote'
  );
  assert.match(
    pivotSession.caseSummary.agentQuote.text,
    /主线已经从播客转写偏到 Telegram HTML 发送链路/,
    'should keep the compactor-chosen agent evidence quote'
  );

  assert.strictEqual(
    diagnosisSession.analysis.resolutionType,
    'diagnosis-complete',
    'should keep compactor-generated diagnosis sessions as clarified work'
  );
  assert.match(
    diagnosisSession.behavior.agentVerdict,
    /没有急着改文件/,
    'should preserve good diagnosis behavior from compact output'
  );

  assert.strictEqual(
    packagingSession.analysis.resolutionType,
    'packaging-blocked',
    'should keep packaging blockers from compact output'
  );
  assert.match(
    packagingSession.caseSummary.turnText,
    /Request too large|max 20MB/,
    'should keep the delivery-blocking evidence in the session case'
  );

  assert.match(
    analyzed.dayNarrative.headline,
    /边界漏水/,
    'should adopt the day-level synthesis headline'
  );
  assert.ok(
    analyzed.behavioralAudit.user.some((item) => /顺手/.test(item.detail)),
    'should use day-level synthesis for user habit findings'
  );
  assert.ok(
    analyzed.behavioralAudit.agent.some((item) => /守边界|守住主线/.test(item.detail)),
    'should use day-level synthesis for agent habit findings'
  );
  assert.strictEqual(
    analyzed.dailyReality.buckets.progress.length,
    1,
    'should classify packaging-blocked but real progress into the progress bucket'
  );
  assert.strictEqual(
    analyzed.dailyReality.buckets.clarified.length,
    1,
    'should classify diagnosis sessions into the clarified bucket'
  );
  assert.strictEqual(
    analyzed.dailyReality.buckets.risk.length,
    1,
    'should keep drifted work in the risk bucket'
  );
  assert.match(
    analyzed.tomorrowRule,
    /停车场/,
    'should carry the synthesized tomorrow rule into the final report'
  );
  assert.ok(
    pivotSession.facts,
    'compact-mode analysis should still attach stable session facts'
  );
  assert.match(
    pivotSession.facts.location,
    /Codex|demo-app/,
    'stable session facts should include a readable location in compact mode'
  );

  const html = renderDailyHtml(analyzed);
  assert.match(html, /这一天你把 Codex \/ Claude Code 用对了吗/, 'html should avoid ambiguous yesterday/today wording');
  assert.match(html, /今天按事情看，你一共做了这些事/, 'html should lead with a human-readable work overview');
  assert.match(html, /你能定位的地方：/, 'html compact view should include the human-readable location line');
  assert.match(html, /核实状态：/, 'html compact view should include verification labels in the work overview');
  assert.match(html, /第一性原理判断：/, 'html compact view should include the first-principles value judgment');
  assert.match(html, /为什么会显得很忙：/, 'html compact view should explain the busy-looking mechanism');
  assert.match(html, /责任拆解：/, 'html compact view should expose user\/agent\/mechanism accountability');
  assert.match(html, /这一天你实际上把时间花在了哪里/, 'html should keep the day-truth section with neutral wording');
  assert.match(html, /播客文字版那条/, 'html should show human-readable case titles');
  assert.match(html, /停车场/, 'html should surface the synthesized tomorrow rule');
  assert.match(html, /Claude Code 回错的话/, 'html should preserve agent-specific evidence labels');

  console.log('✅ compact-first daily report checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
