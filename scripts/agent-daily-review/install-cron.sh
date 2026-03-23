#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_SCRIPT="$SCRIPT_DIR/run-nightly-report.sh"
BEGIN_TAG="# BEGIN agent-daily-review-nightly"
END_TAG="# END agent-daily-review-nightly"

SESSION="${AGENT_DAILY_REPORT_SESSION:-}"
CONFIG_PATH="${AGENT_DAILY_REPORT_CONFIG:-}"
CRON_EXPR="${AGENT_DAILY_REPORT_CRON:-30 23 * * *}"
REMOVE_ONLY="false"

shell_escape() {
  printf '%q' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      SESSION="${2:-}"
      shift 2
      ;;
    --config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    --cron)
      CRON_EXPR="${2:-}"
      shift 2
      ;;
    --remove)
      REMOVE_ONLY="true"
      shift
      ;;
    --help|-h)
      cat <<'EOF'
Usage:
  bash scripts/agent-daily-review/install-cron.sh --session codex_new
  bash scripts/agent-daily-review/install-cron.sh --config ./agent-daily-review.json

Options:
  --session <name>   Fixed Telegram session/bot binding
  --config <path>    JSON config file for open-source/public use
  --cron "<expr>"    Cron expression, default: 30 23 * * *
  --remove           Remove the installed nightly cron block

Environment:
  AGENT_DAILY_REPORT_CONFIG    Default JSON config path
  AGENT_DAILY_REPORT_SESSION   Default session when --session is omitted
  AGENT_DAILY_REPORT_CRON      Default cron expression
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

chmod +x "$RUN_SCRIPT"
CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "$CURRENT_CRONTAB" | awk -v begin="$BEGIN_TAG" -v end="$END_TAG" '
  $0 == begin { skip = 1; next }
  $0 == end { skip = 0; next }
  !skip { print }
')"

if [[ "$REMOVE_ONLY" == "true" ]]; then
  printf '%s\n' "$FILTERED_CRONTAB" | awk 'NF { print }' | crontab -
  echo "Removed agent-daily-review nightly cron block."
  exit 0
fi

if [[ -z "$SESSION" && -z "$CONFIG_PATH" ]]; then
  echo "--session/AGENT_DAILY_REPORT_SESSION or --config/AGENT_DAILY_REPORT_CONFIG is required" >&2
  exit 1
fi

PROJECT_DIR_ESCAPED="$(shell_escape "$PROJECT_DIR")"
RUN_SCRIPT_ESCAPED="$(shell_escape "$RUN_SCRIPT")"

CRON_COMMAND="cd ${PROJECT_DIR_ESCAPED} &&"
if [[ -n "$CONFIG_PATH" ]]; then
  CRON_COMMAND="${CRON_COMMAND} AGENT_DAILY_REPORT_CONFIG=$(shell_escape "$CONFIG_PATH")"
fi
if [[ -n "$SESSION" ]]; then
  CRON_COMMAND="${CRON_COMMAND} AGENT_DAILY_REPORT_SESSION=$(shell_escape "$SESSION")"
fi
CRON_COMMAND="${CRON_COMMAND} bash ${RUN_SCRIPT_ESCAPED}"

{
  printf '%s\n' "$FILTERED_CRONTAB"
  printf '%s\n' "$BEGIN_TAG"
  printf '%s\n' 'CRON_TZ=Asia/Shanghai'
  printf '%s\n' "${CRON_EXPR} ${CRON_COMMAND}"
  printf '%s\n' "$END_TAG"
} | awk 'NF { print }' | crontab -

echo "Installed agent-daily-review nightly cron:"
crontab -l | sed -n "/BEGIN agent-daily-review-nightly/,/END agent-daily-review-nightly/p"
