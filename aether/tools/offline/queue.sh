#!/usr/bin/env bash
# Sequential offline queue: tiers given as arguments, both cars. Skips runs that are already finished. Usage: tools/offline/queue.sh LITE LOW MID
cd "$(dirname "$0")/../.." || exit 1
for tier in "$@"; do for car in bmw agera; do
  f="data/reference/runs/${car}_${tier}.json"
  if [ -f "$f" ] && grep -q '"done": true' "$f"; then echo "skip $car $tier"; continue; fi
  echo "== $(date -u +%FT%TZ) start $car $tier"; node tools/offline/fine-run.mjs "$car" "$tier" 14 50 || echo "run failed: $car $tier"
done; done; echo "== $(date -u +%FT%TZ) queue finished: $*"
