#!/usr/bin/env bash
set -euo pipefail

# The authoritative gate exit code. Slots are consulted in order; the first
# explicit verdict wins (a FAIL never reaches the later slots because their
# attempt steps are gated on the earlier slot being non-verdict). Green requires
# a positive PASS — every other state exits non-zero (RED), including all-infra
# and a missing slot-1 secret. This is the fail-closed contract: an inability to
# run blocks the merge exactly like a found defect.

echo "slot outcomes: 1=${O1:-} 2=${O2:-} 3=${O3:-}"

for outcome in "${O1:-}" "${O2:-}" "${O3:-}"; do
  case "$outcome" in
    pass)
      echo "AI review PASS — mergeable."
      exit 0
      ;;
    fail)
      echo "AI review FAIL — blocking doctrine issues; merge blocked."
      exit 1
      ;;
  esac
done

echo "AI review could not obtain a verdict from any available token slot" \
     "(rate-limit / auth / network / timeout). Failing closed RED."
exit 1
