#!/bin/bash
# Pipeline 4: GA against (real-meta list + competitive pool); evaluate finalists on the meta list alone and on the holdout pool.
cd "$(dirname "$0")/.."
R=results; B=build/crsearch
CR_POOL=$R/pool4_search.txt $B search 64 50 4 0 31 $R/candidates_run4.txt 2>&1 | grep -v skip > $R/search_run4.log
CR_POOL=$R/meta_pool_ok.txt CR_NPOL=12 $B final $R/candidates_run4.txt 8 0 2>&1 | grep -v skip > $R/final_run4_meta.txt
CR_POOL=$R/pool3_holdout.txt CR_NPOL=12 $B final $R/candidates_run4.txt 3 0 2>&1 | grep -v skip > $R/final_run4_holdout.txt
echo PIPELINE4_DONE
