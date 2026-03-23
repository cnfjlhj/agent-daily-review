#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  classifyPrompt,
  collectDayActivity,
  analyzeDayActivity,
  renderDailyHtml
} = require('../src/utils/agent-daily-report');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJsonl(filePath, rows) {
  writeFile(filePath, rows.map((row) => JSON.stringify(row)).join('\n'));
  const timestamp = rows.reduce((latest, row) => {
    const candidates = [
      row && row.timestamp,
      row && row.type === 'session_meta' && row.payload && row.payload.timestamp
    ].filter(Boolean);
    for (const candidate of candidates) {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime()) && (!latest || parsed > latest)) {
        latest = parsed;
      }
    }
    return latest;
  }, null);

  if (timestamp) {
    fs.utimesSync(filePath, timestamp, timestamp);
  }
}

function buildCodexSession(rows) {
  return rows;
}

async function run() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-daily-report-home-'));
  const date = '2026-03-23';

  writeJsonl(
    path.join(
      tempHome,
      '.codex',
      'sessions',
      '2026',
      '03',
      '23',
      'rollout-2026-03-23T09-00-00-feature.jsonl'
    ),
    buildCodexSession([
      {
        type: 'session_meta',
        payload: {
          id: 'codex-feature-1',
          timestamp: '2026-03-23T01:00:00.000Z',
          cwd: '/home/cnfjlhj/projects/demo-app',
          git: { branch: 'main' }
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '帮我把这个播客弄成文字版，最好带时间戳，我想看完整内容。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'telegram 我也需要直接把 html 发给我，最好完整保留文件。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: '主线已经从播客转写偏到 Telegram HTML 发送链路，我先把 mubu-cli 和 Telegram 文档发送补齐。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'update_plan',
          arguments: JSON.stringify({
            plan: [
              { step: 'write failing tests', status: 'completed' },
              { step: 'implement report collector', status: 'in_progress' }
            ]
          })
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"npm test"}'
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          output: [
            'M agent-harness/cli_anything/mubu/mubu_cli.py',
            'A scripts/telegram/send-daily-html-report.js',
            'A comprehensive verification system for Claude Code sessions.',
            '/tmp/demo/src/utils/agent-daily-report.js:74:const noisySearchOutput = true;'
          ].join('\n')
        }
      },
      {
        type: 'event_msg',
        payload: {
          type: 'user_message'
        },
        timestamp: '2026-03-23T01:00:10.000Z'
      },
      {
        type: 'event_msg',
        payload: {
          type: 'agent_message'
        },
        timestamp: '2026-03-23T01:02:10.000Z'
      }
    ])
  );

  writeJsonl(
    path.join(
      tempHome,
      '.codex',
      'sessions',
      '2026',
      '03',
      '23',
      'rollout-2026-03-23T11-30-00-mixed.jsonl'
    ),
    buildCodexSession([
      {
        type: 'session_meta',
        payload: {
          id: 'codex-mixed-1',
          timestamp: '2026-03-23T03:30:00.000Z',
          cwd: '/home/cnfjlhj/projects/Claude-Code-Remote',
          git: { branch: 'main' }
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '把日报 HTML 的第一模块整理得更清楚一点。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: '我先看 HTML 首页的结构和信息密度。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '顺便也看看 /star 和 resumeid 的表现是不是不对，但别让它污染日报 HTML 主线。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'HTML 主线我先守住，但 /star 工具链我也会一起看。'
            }
          ]
        }
      }
    ])
  );

  writeJsonl(
    path.join(
      tempHome,
      '.codex',
      'sessions',
      '2026',
      '03',
      '23',
      'rollout-2026-03-23T11-40-00-short.jsonl'
    ),
    buildCodexSession([
      {
        type: 'session_meta',
        payload: {
          id: 'codex-short-1',
          timestamp: '2026-03-23T03:40:00.000Z',
          cwd: '/home/cnfjlhj/projects/Claude-Code-Remote',
          git: { branch: 'main' }
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '确认一下 cron 默认是不是 23:30。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: '已经确认，nightly cron 默认就是 23:30。'
            }
          ]
        }
      }
    ])
  );

  writeJsonl(
    path.join(
      tempHome,
      '.codex',
      'sessions',
      '2026',
      '03',
      '23',
      'rollout-2026-03-23T10-00-00-recovery.jsonl'
    ),
    buildCodexSession([
      {
        type: 'session_meta',
        payload: {
          id: 'codex-recovery-1',
          timestamp: '2026-03-23T02:00:00.000Z',
          cwd: '/home/cnfjlhj',
          git: { branch: '' }
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '我记得之前有个日报方案，帮我把昨天的会话和思路都找回来。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"rg -n daily"}'
        }
      },
      {
        type: 'event_msg',
        payload: {
          type: 'context_compacted'
        },
        timestamp: '2026-03-23T02:20:00.000Z'
      },
      {
        type: 'event_msg',
        payload: {
          type: 'turn_aborted'
        },
        timestamp: '2026-03-23T02:25:00.000Z'
      }
    ])
  );

  writeJsonl(
    path.join(
      tempHome,
      '.codex',
      'sessions',
      '2026',
      '03',
      '23',
      'rollout-2026-03-23T11-00-00-diagnosis.jsonl'
    ),
    buildCodexSession([
      {
        type: 'session_meta',
        payload: {
          id: 'codex-diagnosis-1',
          timestamp: '2026-03-23T03:00:00.000Z',
          cwd: '/home/cnfjlhj',
          git: { branch: '' }
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '/star 为什么会失败？先帮我定位根因，不要急着改文件。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"rg -n session-stars"}'
        }
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: '已经定位到根因：cc-connect 当前绑定的是内部 session key，不是原生 Codex session id，所以 /star 在解析阶段就失败了。'
            }
          ]
        }
      },
      {
        type: 'event_msg',
        payload: {
          type: 'task_complete'
        },
        timestamp: '2026-03-23T03:20:00.000Z'
      }
    ])
  );

  writeJsonl(
    path.join(
      tempHome,
      '.codex',
      'sessions',
      '2026',
      '03',
      '22',
      'rollout-2026-03-22T23-55-00-crossday.jsonl'
    ),
    buildCodexSession([
      {
        type: 'session_meta',
        payload: {
          id: 'codex-crossday-1',
          timestamp: '2026-03-22T15:55:00.000Z',
          cwd: '/home/cnfjlhj/projects/demo-app',
          git: { branch: 'main' }
        }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-22T15:55:10.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '昨晚先把这个日报 session 开起来，先别急着总结。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-22T16:10:00.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '今天继续，把首页按事情，附录按时间线。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-22T16:11:00.000Z',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: '我先按今天这段 activity 切 slice，再决定今天到底做了几件事。'
            }
          ]
        }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-22T16:12:00.000Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: '{"cmd":"node scripts/agent-daily-review/run-daily-report.js"}'
        }
      }
    ])
  );

  writeJsonl(
    path.join(
      tempHome,
      '.claude',
      'projects',
      '-home-cnfjlhj-projects-demo-app',
      'session-1.jsonl'
    ),
    [
      {
        type: 'user',
        timestamp: '2026-03-23T03:00:00.000Z',
        cwd: '/home/cnfjlhj/projects/demo-app',
        sessionId: 'claude-packaging-1',
        message: {
          role: 'user',
          content: '你好，我记得我本地有个论文推送仓库 research-intel，README 宣传写得太差了，先帮我对齐功能后再重写。'
        }
      },
      {
        type: 'assistant',
        timestamp: '2026-03-23T03:00:10.000Z',
        cwd: '/home/cnfjlhj/projects/demo-app',
        sessionId: 'claude-packaging-1',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'TaskUpdate',
              input: { taskId: '1', status: 'in_progress' }
            }
          ]
        }
      },
      {
        type: 'assistant',
        timestamp: '2026-03-23T03:01:10.000Z',
        cwd: '/home/cnfjlhj/projects/demo-app',
        sessionId: 'claude-packaging-1',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/home/cnfjlhj/projects/research-intel/README.md' }
            },
            {
              type: 'text',
              text: 'README 主体已经重写完成，但最后在 transfer 阶段被 Request too large (max 20MB) 卡住。'
            }
          ]
        }
      }
    ]
  );

  writeJsonl(
    path.join(
      tempHome,
      '.claude',
      'projects',
      '-home-cnfjlhj-projects-demo-app',
      'session-crossday.jsonl'
    ),
    [
      {
        type: 'user',
        timestamp: '2026-03-22T15:58:00.000Z',
        cwd: '/home/cnfjlhj/projects/demo-app',
        sessionId: 'claude-crossday-1',
        message: {
          role: 'user',
          content: '昨晚先开个 Claude Code session，今天再继续。'
        }
      },
      {
        type: 'user',
        timestamp: '2026-03-22T16:08:00.000Z',
        cwd: '/home/cnfjlhj/projects/demo-app',
        sessionId: 'claude-crossday-1',
        message: {
          role: 'user',
          content: '今天继续，把完整 html 发到 telegram，不要只发 brief。'
        }
      },
      {
        type: 'assistant',
        timestamp: '2026-03-22T16:09:00.000Z',
        cwd: '/home/cnfjlhj/projects/demo-app',
        sessionId: 'claude-crossday-1',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-6',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/home/cnfjlhj/projects/Claude-Code-Remote/scripts/telegram/send-daily-html-report.js' }
            },
            {
              type: 'text',
              text: '我按今天的 activity 继续，不会把昨晚的开场整段算进今天。'
            }
          ]
        }
      }
    ]
  );

  const collected = collectDayActivity({ date, homeDir: tempHome });
  assert.strictEqual(collected.sessions.length, 8, 'should collect same-day slices from both Codex and Claude sessions, including short and mixed sessions');
  assert.deepStrictEqual(
    collected.summary.byAgent,
    { codex: 6, claude: 2 },
    'should count same-day slices per agent'
  );
  assert.ok(
    collected.sessions[0].touchedFiles.every((item) => !item.includes(':74:') && !item.includes('comprehensive verification')),
    'should ignore grep-style search output when extracting changed files'
  );

  const analyzed = await analyzeDayActivity(collected, { analysisMode: 'heuristic' });
  const pivotSession = analyzed.sessions.find((session) => session.sessionId === 'codex-feature-1');
  const diagnosisSession = analyzed.sessions.find((session) => session.sessionId === 'codex-diagnosis-1');
  const mixedSession = analyzed.sessions.find((session) => session.sessionId === 'codex-mixed-1');
  const shortSession = analyzed.sessions.find((session) => session.sessionId === 'codex-short-1');
  const packagingSession = analyzed.sessions.find((session) => session.sessionId === 'claude-packaging-1');
  const crossdayCodexSession = analyzed.sessions.find((session) => session.sessionId === 'codex-crossday-1');
  const crossdayClaudeSession = analyzed.sessions.find((session) => session.sessionId === 'claude-crossday-1');

  assert.ok(pivotSession, 'should keep the main codex feature session');
  assert.ok(diagnosisSession, 'should keep the diagnosis session');
  assert.ok(mixedSession, 'should keep mixed-topic sessions instead of silently dropping them');
  assert.ok(shortSession, 'should keep very short sessions instead of filtering them out');
  assert.ok(packagingSession, 'should keep the claude packaging session');
  assert.ok(crossdayCodexSession, 'should include Codex sessions that started yesterday but had activity today');
  assert.ok(crossdayClaudeSession, 'should include Claude sessions that started yesterday but had activity today');

  assert.strictEqual(
    crossdayCodexSession.startAt,
    '2026-03-22T16:10:00.000Z',
    'should start the Codex day slice at the first activity that happened on the target day'
  );
  assert.match(
    crossdayCodexSession.prompt,
    /今天继续，把首页按事情，附录按时间线/,
    'should use the first user activity from the target day as the slice prompt'
  );
  assert.doesNotMatch(
    crossdayCodexSession.prompt,
    /昨晚先把这个日报 session 开起来/,
    'should not leak the previous day opening prompt into today slice prompt'
  );
  assert.strictEqual(
    crossdayClaudeSession.startAt,
    '2026-03-22T16:08:00.000Z',
    'should start the Claude day slice at the first activity that happened on the target day'
  );
  assert.strictEqual(
    crossdayCodexSession.continuedFromPreviousDay,
    true,
    'should mark Codex cross-day slices as continuations'
  );
  assert.strictEqual(
    crossdayClaudeSession.continuedFromPreviousDay,
    true,
    'should mark Claude cross-day slices as continuations'
  );
  assert.match(
    crossdayClaudeSession.prompt,
    /今天继续，把完整 html 发到 telegram/,
    'should use the first Claude user activity from the target day as the slice prompt'
  );
  assert.doesNotMatch(
    crossdayClaudeSession.prompt,
    /昨晚先开个 Claude Code session/,
    'should not leak the previous Claude opening prompt into today slice prompt'
  );

  assert.strictEqual(
    pivotSession.analysis.resolutionType,
    'adjacent-infra-takeover',
    'should detect when the session shipped adjacent infra instead of the declared goal'
  );
  assert.strictEqual(
    pivotSession.analysis.semanticPivot,
    true,
    'should mark the feature session as a semantic pivot'
  );
  assert.strictEqual(
    pivotSession.behavior.driftOrigin,
    'user-opened-side-quest',
    'should attribute the first wrong turn to the user when the user injected a side quest'
  );
  assert.match(
    pivotSession.behavior.userVerdict,
    /主线中途引入了旁支诉求/,
    'should explain what the user did wrong in the pivot session'
  );
  assert.match(
    pivotSession.behavior.agentVerdict,
    /没有把旁支隔离/,
    'should explain what the agent did wrong in the pivot session'
  );
  assert.match(
    pivotSession.compaction.reviewDepth,
    /focused|deep/,
    'should assign a non-trivial review depth to important pivot sessions'
  );
  assert.match(
    pivotSession.caseSummary.title,
    /播客文字版那条/,
    'should generate a human-readable case title'
  );
  assert.match(
    pivotSession.caseSummary.userQuote.text,
    /mubu|幕布|html/,
    'should capture the actual user quote that opened the side quest'
  );
  assert.match(
    pivotSession.caseSummary.agentQuote.text,
    /mubu|Telegram|html/,
    'should capture the actual agent quote that followed the side quest'
  );

  assert.strictEqual(
    diagnosisSession.analysis.resolutionType,
    'diagnosis-complete',
    'should value diagnosis-only sessions when the root cause was isolated'
  );
  assert.strictEqual(
    diagnosisSession.derived.loopRisk,
    false,
    'should not treat diagnosis-complete sessions as loop risk just because they are write-light'
  );
  assert.match(
    diagnosisSession.behavior.userVerdict,
    /先要求定位根因/,
    'should recognize when the user used the agent correctly for diagnosis'
  );
  assert.match(
    diagnosisSession.behavior.agentVerdict,
    /没有急着改文件/,
    'should recognize good agent behavior in diagnosis sessions'
  );

  assert.strictEqual(
    mixedSession.analysis.mainlineDiscipline,
    'mixed',
    'should mark sessions that mix a second problem frame even when they do not fully drift away'
  );
  assert.deepStrictEqual(
    mixedSession.analysis.secondaryTopicLabels,
    ['Session 工具链'],
    'should expose the secondary topic that contaminated the mainline session'
  );
  assert.match(
    mixedSession.behavior.userVerdict,
    /一个 session 里同时塞了不止一件事|单主线纪律/,
    'should explicitly tell the user when one session mixed multiple tasks'
  );
  assert.match(
    mixedSession.behavior.interactionVerdict,
    /虽然没有彻底偏航|单主线纪律已经开始松动/,
    'should explain the mixed-but-not-fully-drifted interaction mode'
  );

  assert.strictEqual(
    shortSession.prompt,
    '确认一下 cron 默认是不是 23:30。',
    'should keep short sessions and preserve their actual prompt'
  );
  assert.strictEqual(
    shortSession.startAt,
    '2026-03-23T03:40:00.000Z',
    'should keep the true activity timestamp for short sessions'
  );

  assert.strictEqual(
    packagingSession.analysis.promptArchetype,
    'project-reentry',
    'should distinguish project re-entry from generic vague prompting'
  );
  assert.strictEqual(
    packagingSession.analysis.resolutionType,
    'packaging-blocked',
    'should detect packaging or transfer blockers from the session content'
  );
  assert.match(
    packagingSession.behavior.agentVerdict,
    /Claude Code 做错了：.*没有提前检查.*体积约束|Claude Code 做错了：.*没有提前检查.*传输约束/,
    'should explain the agent-side delivery mistake for blocked packaging sessions'
  );
  assert.match(
    packagingSession.caseSummary.turnText,
    /Claude Code 说了：Request too large|max 20MB/,
    'should attribute delivery-blocked evidence to Claude Code instead of Codex'
  );
  assert.match(
    packagingSession.caseSummary.title,
    /README.*那条/,
    'should generate a readable title for packaging-blocked sessions'
  );
  assert.match(
    packagingSession.caseSummary.turnLabel,
    /交付风险|真正卡住/,
    'should use a delivery-risk label instead of generic drift wording for packaging-blocked sessions'
  );
  assert.match(
    packagingSession.caseSummary.turnText,
    /Request too large|max 20MB/,
    'should surface the actual blocking evidence for packaging-blocked sessions'
  );

  assert.ok(
    analyzed.issues.some((issue) => issue.primaryBucket === 'workflow' && /boundary/i.test(issue.title)),
    'should flag boundary leakage when adjacent infra takes over the day'
  );
  assert.ok(
    analyzed.issues.some((issue) => issue.primaryBucket === 'workflow' && /multiple problem frames|single-thread/i.test(issue.title)),
    'should also flag sessions that mixed multiple problem frames without full drift'
  );
  assert.ok(
    analyzed.issues.some((issue) => issue.primaryBucket === 'tool-model'),
    'should still flag tool/model issues when abort or compaction appear'
  );
  assert.ok(
    analyzed.goodPatterns.some((pattern) => /diagnosis/i.test(pattern.title)),
    'should recognize diagnosis-first behavior as a good pattern'
  );
  assert.strictEqual(
    classifyPrompt('Star History Chart 帮我把这个加到 README').recovery,
    false,
    'should not mark generic History strings as session recovery'
  );
  assert.strictEqual(
    classifyPrompt('你还记得有关论文推送系统的事情吗？').reentry,
    true,
    'should mark project-memory prompts as legitimate re-entry'
  );
  assert.strictEqual(
    classifyPrompt('你还记得有关论文推送系统的事情吗？').vague,
    false,
    'should not treat specific project re-entry prompts as vague by default'
  );
  assert.match(
    analyzed.dayNarrative.headline,
    /boundary leakage/i,
    'should produce a day-level thesis instead of a generic verdict'
  );
  assert.ok(
    analyzed.behavioralAudit.user.some((item) => /旁支诉求/.test(item.detail)),
    'should include a user-side habit finding'
  );
  assert.ok(
    analyzed.behavioralAudit.agent.some((item) => /没有把旁支隔离/.test(item.detail)),
    'should include an agent-side habit finding'
  );
  assert.ok(
    analyzed.behavioralAudit.interaction.some((item) => /你开旁支.*agent 不设边界|user opens side quests/i.test(item.detail)),
    'should include an interaction-pattern finding'
  );
  assert.ok(
    analyzed.topMistakes.length >= 1,
    'should surface the top user-facing mistakes'
  );
  assert.ok(
    analyzed.topWins.length >= 1,
    'should surface the top user-facing wins'
  );
  assert.strictEqual(
    analyzed.dailyReality.buckets.progress.length,
    1,
    'should classify delivery-blocked but real progress sessions into the progress bucket'
  );
  assert.strictEqual(
    analyzed.dailyReality.buckets.clarified.length,
    1,
    'should classify diagnosis sessions into the clarified bucket'
  );
  assert.strictEqual(
    analyzed.dailyReality.buckets.risk.length,
    6,
    'should classify drift, recovery, short low-yield sessions, and continuation-only cross-day slices into the risk bucket'
  );
  assert.match(
    analyzed.dailyReality.summary,
    /真正推进|查清|值得警惕/,
    'should summarize the whole day in terms of progress, clarified uncertainty, and risk'
  );
  assert.ok(
    analyzed.dailyReality.buckets.risk.some((item) => /不是你本来要的|只是在准备|没有形成结果/.test(item.worth)),
    'risk entries should explain why some sessions are close to useless work'
  );
  assert.match(
    analyzed.topMistakes[0].title,
    /那条/,
    'top mistakes should be rendered as human-readable cases'
  );
  assert.match(
    analyzed.tomorrowRule,
    /旁支|停车场|主线/,
    'should distill the day into one concrete next-day rule'
  );

  const html = renderDailyHtml(analyzed);
  assert.match(html, /Codex \/ Claude Code 使用习惯审计/, 'html should reflect the mixed-agent daily scope in the title');
  assert.match(html, /这一天你把 Codex \/ Claude Code 用对了吗/, 'html should reflect the mixed-agent daily scope in the top-level question');
  assert.match(html, /来源：Codex 6 条，Claude Code 2 条/, 'html should show the per-agent source breakdown');
  assert.match(html, /今天按事情看，你一共做了这些事/, 'html should foreground the work overview first');
  assert.match(html, /这一天你实际上把时间花在了哪里/, 'html should foreground what the user actually did during the day');
  assert.match(html, /真正推进了什么/, 'html should show the progress bucket');
  assert.match(html, /查清了什么/, 'html should show the clarified bucket');
  assert.match(html, /哪些时间最值得警惕/, 'html should show the risk bucket');
  assert.match(html, /你这一天用错的 3 个地方/, 'html should foreground the top mistakes without falsely narrowing to one agent');
  assert.match(html, /你这一天用对的 2 个地方/, 'html should foreground the top wins without falsely narrowing to one agent');
  assert.match(html, /明天只改 1 条规则/, 'html should distill the audit into one concrete rule');
  assert.match(html, /你说错的话/, 'html should include the user-quote evidence block');
  assert.match(html, /Codex 回错的话/, 'html should include Codex-specific evidence labels when relevant');
  assert.match(html, /Claude Code 回错的话/, 'html should include Claude Code-specific evidence labels when relevant');
  assert.match(html, /跨天续用：<\/strong>这个 session 最早开始于/, 'html appendix should explain when a session is continued from a previous day');
  assert.match(html, /单主线纪律：<\/strong>混入多个主题/, 'html appendix should explicitly show when a session mixed more than one problem frame');
  assert.match(html, /第一次偏掉/, 'html should explain where the drift began');
  assert.match(html, /第一次暴露交付风险|真正卡住的那一句/, 'html should use a separate evidence label for delivery-blocked cases');
  assert.match(html, /播客文字版那条/, 'html should show human-readable case titles');
  assert.doesNotMatch(html, /<h2>Deliverables<\/h2>/, 'html should not expose the old developer-facing deliverables section');
  assert.doesNotMatch(html, /Boundary Control/, 'html should not expose unexplained developer metrics in the main body');

  console.log('✅ agent daily report synthesis checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
