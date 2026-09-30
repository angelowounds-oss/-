#!/bin/bash
# Full pipeline: competitive pool -> holdout pool -> GA search -> holdout re-evaluation
cd "$(dirname "$0")/.."
R=results; B=build/crsearch
$B buildpool 2500 70 $R/pool3_search.txt 2>&1 | grep -v -E "skip|drop"
CR_POOLSEED=555 $B buildpool 2500 70 $R/pool3_holdout.txt 2>&1 | grep -v -E "skip|drop"
CR_POOL=$R/pool3_search.txt $B search 64 60 4 0 21 $R/candidates_run3.txt 2>&1 | grep -v skip > $R/search_run3.log
CR_POOL=$R/pool3_holdout.txt CR_NPOL=12 $B final $R/candidates_run3.txt 3 0 2>&1 | grep -v skip > $R/final_run3_holdout.txt
echo PIPELINE_DONE
