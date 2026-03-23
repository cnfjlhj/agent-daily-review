# Agent Daily Review

`Agent Daily Review` is a first-principles daily reflection system for `Codex` and `Claude Code`.

It scans the sessions you actually used on a given day, reconstructs what work really happened, points out where your usage pattern was good or bad, and renders the result as a readable HTML report that can also be sent to Telegram.

## Why This Exists

The goal is not to dump metrics.

The goal is to answer:

- What did I actually do today through vibe coding?
- Which sessions produced real output?
- Which sessions were just churn, drift, or split attention?
- Where did the user misuse the agent?
- Where did the agent answer badly or fail to hold boundaries?
- What is the one rule I should change tomorrow?

## First-Principles Model

```text
declared goal
    |
    v
same-day activity slice
    |
    v
actual landing
    |
    +--> same as goal      => productive
    +--> mixed side topic  => session hygiene warning
    +--> different target  => drift / boundary failure
```

Core rules:

- one session should usually contain one primary task
- if multiple themes enter one session, that is a workflow smell
- session ownership belongs to the day of the activity, not only the creation date
- short sessions still matter if they consumed attention or changed direction

## What You Get

- `report.html`
  The human-readable daily reflection report.
- `report.json`
  The machine-readable representation.
- Telegram full-HTML delivery
  Optional, either by direct token/chat id or via session-based resolver.
- Nightly cron
  Optional, defaulting to `23:30` in `Asia/Shanghai`.
- A packaged Codex skill
  For easy manual preview, rerun, and redistribution.

## Quick Start

Install:

```bash
npm install
```

Create a config:

```bash
cp agent-daily-review.example.json agent-daily-review.local.json
```

Edit at least:

- `homeDir`
- `outRoot`
- `session` or `telegram.botToken` / `telegram.chatId`

Generate one day:

```bash
npm run daily -- --config ./agent-daily-review.local.json --date 2026-03-23
```

Run the nightly flow:

```bash
npm run nightly -- --config ./agent-daily-review.local.json
```

Dry-run the nightly flow without sending:

```bash
npm run nightly -- --config ./agent-daily-review.local.json --dry-run
```

## Cron

Install the default `23:30` cron:

```bash
npm run install-cron -- --config "$(pwd)/agent-daily-review.local.json"
```

Remove it:

```bash
npm run install-cron -- --remove
```

## Skill

Install the bundled Codex skill:

```bash
npm run skill:install
```

After that, the local skill lives under:

```text
skills/agent-daily-review
```

and wraps the same `daily`, `nightly`, and `install-cron` flows used by the CLI.

## Delivery Modes

- `direct`
  Pass `--bot-token` and `--chat-id`.
- `config`
  Put the Telegram target in JSON config.
- `cc-connect`
  Reuse session-based Telegram resolution if your local environment already has it.

## Session Time Rules

This repo uses `Asia/Shanghai` natural-day slicing.

That means:

- a session created yesterday but used again today is included today
- only today's activities are counted in today's report
- the appendix marks such sessions as `跨天续用`

```text
session creation time != report ownership
activity timestamp    == report ownership
```

## Stable vs Experimental

- `heuristic`
  Best for reliable nightly cron jobs.
- `auto`
  Heuristics first, selective semantic compact.
- `compact-first`
  More semantic reading, but slower on very long tool-heavy sessions.

## Repo Layout

```text
src/utils/                  core analysis and target resolution
scripts/agent-daily-review/ CLI entrypoints and cron helpers
scripts/telegram/           Telegram HTML sender
skills/agent-daily-review/  packaged Codex skill
tests/                      focused verification suite
```

## Verification

Run the full focused suite:

```bash
npm test
```

This covers:

- day slicing
- cross-day session handling
- short-session inclusion
- mixed-topic session detection
- HTML rendering
- nightly dry-run
- public config mode
- Telegram dry-run
- cron installer behavior

## More Detail

The implementation notes and operational guide live at:

- [scripts/agent-daily-review/README.md](./scripts/agent-daily-review/README.md)
