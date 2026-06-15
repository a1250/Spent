#!/usr/bin/env bash
# qa-sandbox.sh -- creates a timestamped copy of the live DB for mutation QA.
#
# Usage:
#   SPENT_DATA_DIR=$(./scripts/qa-sandbox.sh) npm run dev
#
# The script prints the sandbox directory path to stdout so it can be captured
# with $(...) and passed directly as SPENT_DATA_DIR. The app then reads/writes
# data/spent.db relative to that directory, leaving the live DB untouched.
#
# Clean up afterwards:
#   rm -rf data/tmp/qa-*

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIVE_DIR="$REPO_ROOT/data"
LIVE_DB="$LIVE_DIR/spent.db"

if [ ! -f "$LIVE_DB" ]; then
  echo "Error: live DB not found at $LIVE_DB" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
SANDBOX_DIR="$LIVE_DIR/tmp/qa-$STAMP"
mkdir -p "$SANDBOX_DIR"
cp "$LIVE_DB" "$SANDBOX_DIR/spent.db"

echo "$SANDBOX_DIR"
