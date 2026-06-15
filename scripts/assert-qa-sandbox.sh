#!/usr/bin/env bash
# assert-qa-sandbox.sh -- guard that must be called before any mutation QA test.
#
# Exits 1 if SPENT_DATA_DIR is not set or if it resolves to the live data dir.
# Source this or call it at the top of every mutation test script.
#
# Usage:
#   ./scripts/assert-qa-sandbox.sh || exit 1
#   # ... mutation test commands below ...

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIVE_DIR="$(cd "$REPO_ROOT/data" && pwd)"

if [ -z "${SPENT_DATA_DIR:-}" ]; then
  echo "ERROR: SPENT_DATA_DIR is not set." >&2
  echo "  Create a sandbox first:" >&2
  echo "    SPENT_DATA_DIR=\$(./scripts/qa-sandbox.sh) npm run dev" >&2
  echo "  Then set SPENT_DATA_DIR in your shell before running mutation tests." >&2
  exit 1
fi

SANDBOX_DIR="$(cd "$SPENT_DATA_DIR" && pwd)"

if [ "$SANDBOX_DIR" = "$LIVE_DIR" ]; then
  echo "ERROR: SPENT_DATA_DIR points to the live data directory ($LIVE_DIR)." >&2
  echo "  Mutation tests must run against a sandbox copy." >&2
  echo "  Create one with: SPENT_DATA_DIR=\$(./scripts/qa-sandbox.sh)" >&2
  exit 1
fi

echo "QA sandbox confirmed: $SANDBOX_DIR"
