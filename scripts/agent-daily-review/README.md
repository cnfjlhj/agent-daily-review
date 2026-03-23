# Agent Daily Review

`Agent Daily Review` turns one natural day of `Codex` and `Claude Code` session history into:

- a readable HTML daily reflection report
- a machine-readable `report.json`
- an optional Telegram document delivery
- a nightly cron workflow that can run unattended

This is the same pipeline already used locally in this repository. The open-source packaging keeps the behavior, but adds a public-facing config layer so it can run without your private `cc-connect` setup.

## What It Does

```text
raw session logs
    |
    +--> Codex logs (~/.codex/sessions)
    +--> Claude Code logs (~/.claude/projects)
    |
    v
natural-day slicing (Asia/Shanghai)
    |
    v
heuristic pre-pass
    |
    +--> selective semantic compact (optional)
    |
    v
day synthesis
    |
    +--> report.json
    +--> report.html
    +--> Telegram full HTML delivery (optional)
```

The report is optimized for daily self-audit:

- what you actually did today
- which sessions produced real output
- where the user behavior was good or bad
- where the assistant behavior was good or bad
- what to change tomorrow

## First-Principles Method

The analysis is intentionally not "just a stats dump". It follows a first-principles frame:

```text
What was the declared goal?
        |
        v
What activity really happened today?
        |
        v
What did the session actually land on?
        |
        +--> same as goal      => disciplined / productive
        +--> mixed in sidework => session hygiene warning
        +--> different target  => drift / boundary failure
```

The key operating assumptions are:

- one session should normally have one primary task
- if a second topic enters the same session, that is a workflow smell
- a session is counted by the activity that happened on the target day, not only by its creation date
- a short session still matters if it consumed attention or changed direction

## Time Slicing Rules

This system uses `Asia/Shanghai` natural days.

Important detail:

- a session created yesterday but used again today is included in today's report
- the report only counts the activities that happened on the target day
- the appendix explicitly marks these as `跨天续用`

So the model is:

```text
session creation time   != report ownership
activity time on date   == report ownership
```

That is how long-lived sessions and stop-resume workflows stay visible instead of becoming a black box.

## Stable vs Experimental

Use these modes intentionally:

- `heuristic`
  This is the stable default for unattended nightly runs.
- `auto`
  Uses heuristics first and selectively calls semantic compact when useful.
- `compact-first`
  Stronger semantic reading, but still slower on very long tool-heavy sessions.

If you want a reliable 23:30 cron job, use `heuristic` first.

## Quick Start

Install dependencies:

```bash
npm install
```

Create a config file from the example:

```bash
cp scripts/agent-daily-review/agent-daily-review.example.json ./agent-daily-review.json
```

Then edit:

- `homeDir`
- `outRoot`
- `telegram.botToken`
- `telegram.chatId`

Generate one manual preview:

```bash
node scripts/agent-daily-review/run-daily-report.js \
  --config ./agent-daily-review.json \
  --date 2026-03-23
```

Run the full nightly flow without sending:

```bash
node scripts/agent-daily-review/run-nightly-report.js \
  --config ./agent-daily-review.json \
  --date 2026-03-23 \
  --dry-run
```

Run the full nightly flow and send the HTML:

```bash
node scripts/agent-daily-review/run-nightly-report.js \
  --config ./agent-daily-review.json
```

## Config File

Example:

```json
{
  "homeDir": "/home/your-user",
  "outRoot": "/absolute/path/to/repo/work/agent-daily-review",
  "analysisMode": "heuristic",
  "session": "daily_review_bot",
  "caption": "完整 HTML 日报",
  "telegram": {
    "botToken": "123456:replace-me",
    "chatId": "123456789",
    "botName": "agent-daily-review"
  }
}
```

Notes:

- `session` is optional when you use direct Telegram config.
- If you omit direct Telegram fields, the runner can still fall back to the existing `cc-connect` session-based resolver.
- `homeDir` should point to the account that owns `~/.codex/sessions` and `~/.claude/projects`.

## Cron Setup

Install the nightly cron:

```bash
bash scripts/agent-daily-review/install-cron.sh \
  --config /absolute/path/to/agent-daily-review.json
```

Default schedule:

```text
30 23 * * *
```

Custom schedule:

```bash
bash scripts/agent-daily-review/install-cron.sh \
  --config /absolute/path/to/agent-daily-review.json \
  --cron "30 23 * * *"
```

Remove the cron block:

```bash
bash scripts/agent-daily-review/install-cron.sh --remove
```

## Skill Mode

If you want to trigger the same flow manually from Codex as a reusable skill, symlink the packaged skill into your local skills directory:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -s "$(pwd)/skills/agent-daily-review" "${CODEX_HOME:-$HOME/.codex}/skills/agent-daily-review"
```

The skill contains thin wrappers around the same repo scripts, so the nightly output stays consistent with the manual preview.

## Delivery Modes

There are now three delivery modes:

- `direct`
  Pass `--bot-token` and `--chat-id` explicitly.
- `config`
  Put `telegram.botToken` and `telegram.chatId` in the JSON config.
- `cc-connect`
  Keep using the existing session-to-bot resolution path.

This means the public/open-source path no longer depends on your private `cc-connect` runtime.

## Verification

Run the focused test suite:

```bash
npm run agent-daily-review:test
```

This covers:

- report synthesis
- compact-first synthesis
- nightly dry-run
- HTML Telegram dry-run
- public config delivery
- cron install with config
