---
name: agent-daily-review
description: Use when generating a daily reflection report from local Codex and Claude Code sessions, especially for HTML output, Telegram delivery, reruns, nightly review, or behavior/habit auditing.
---

# Agent Daily Review

Use this skill when the goal is to generate or resend the daily reflection report built from local `Codex` and `Claude Code` session logs.

## What This Skill Is For

This skill wraps the repository's real daily-review pipeline:

- collect `Codex` sessions from `~/.codex/sessions`
- collect `Claude Code` sessions from `~/.claude/projects`
- slice by natural day in `Asia/Shanghai`
- synthesize a readable HTML reflection report
- optionally send the full HTML file to Telegram

## Preferred Commands

Generate one day locally:

```bash
bash skills/agent-daily-review/scripts/preview.sh --config ./agent-daily-review.json --date 2026-03-23
```

Run the nightly report flow:

```bash
bash skills/agent-daily-review/scripts/nightly.sh --config ./agent-daily-review.json --dry-run
```

Install the nightly cron:

```bash
bash skills/agent-daily-review/scripts/install-cron.sh --config ./agent-daily-review.json
```

## Working Rules

- Prefer `heuristic` mode for unattended cron runs.
- Use `compact-first` only when the user explicitly wants deeper semantic reading and accepts slower runs.
- Do not downgrade to plain stats-only summaries; preserve the HTML reflection structure.
- Keep the output focused on:
  what happened, what was productive, what drifted, what the user did wrong, what the assistant did wrong, and what to change tomorrow.
- Treat `one session = one primary task` as the default norm. If multiple themes enter one session, call that out explicitly.
- Count sessions by same-day activity timestamps, not only by creation time. Cross-day reused sessions must still appear in the correct natural-day report.
- Do not drop short sessions just because they are short. If they consumed attention, they belong in the audit.

## Files To Know

- `scripts/agent-daily-review/README.md`
- `scripts/agent-daily-review/agent-daily-review.example.json`
- `scripts/agent-daily-review/run-daily-report.js`
- `scripts/agent-daily-review/run-nightly-report.js`
- `scripts/agent-daily-review/install-cron.sh`
