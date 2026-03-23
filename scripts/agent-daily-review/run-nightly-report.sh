#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

if [[ -f "$HOME/.bashrc" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.bashrc" >/dev/null 2>&1 || true
fi

if [[ -f "$HOME/.profile" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.profile" >/dev/null 2>&1 || true
fi

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

if [[ -z "$NODE_BIN" ]]; then
  echo "agent-daily-review cron failed: node executable not found" >&2
  exit 1
fi

if [[ -z "${AGENT_DAILY_REPORT_SESSION:-}" && -z "${AGENT_DAILY_REPORT_CONFIG:-}" ]]; then
  echo "agent-daily-review cron failed: AGENT_DAILY_REPORT_SESSION or AGENT_DAILY_REPORT_CONFIG is required" >&2
  exit 1
fi

cd "$PROJECT_DIR"

TODAY="${AGENT_DAILY_REPORT_DATE:-$(TZ=Asia/Shanghai date +%F)}"
LOG_DIR="$PROJECT_DIR/work/agent-daily-review/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/nightly-$TODAY.log"

{
  echo "[$(date --iso-8601=seconds)] agent-daily-review nightly start"
  echo "DATE=$TODAY"
  echo "SESSION=$AGENT_DAILY_REPORT_SESSION"
  if [[ -n "${AGENT_DAILY_REPORT_CONFIG:-}" ]]; then
    echo "CONFIG=$AGENT_DAILY_REPORT_CONFIG"
  fi

  CMD=("$NODE_BIN" "$SCRIPT_DIR/run-nightly-report.js" --date "$TODAY")
  if [[ -n "${AGENT_DAILY_REPORT_CONFIG:-}" ]]; then
    CMD+=(--config "$AGENT_DAILY_REPORT_CONFIG")
  fi
  if [[ -n "${AGENT_DAILY_REPORT_SESSION:-}" ]]; then
    CMD+=(--session "$AGENT_DAILY_REPORT_SESSION")
  fi
  "${CMD[@]}"
  echo "[$(date --iso-8601=seconds)] agent-daily-review nightly done"
} >>"$LOG_FILE" 2>&1
