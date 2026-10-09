#!/bin/bash
# One DAgger round: collect student-state data relabelled by the teacher, retrain on all data, evaluate.
# usage: dagger_round.sh <round> <prev_net> <tau> <games>
set -e
cd /home/user/-
R=$1; PREV=$2; TAU=$3; GAMES=$4
S=results/student; D=$S/data
export CR_THREADS=4
CR_TAU=$TAU ./build/real_student gennet "$PREV" results/random_decks_valid.txt "$GAMES" 4 "$D/dagger_r$R.bin" $((100000 * R)) > "$S/stage4_gen$R.log" 2>&1
DATA=("$D/gen_p4_s1.bin")
for f in "$D"/dagger_r*.bin; do DATA+=("$f"); done
./build/real_student train "$S/net_r$R.bin" 2 0.0005 "$PREV" "${DATA[@]}" > "$S/stage4_train$R.log" 2>&1
CR_TAU=$TAU ./build/real_student match "n$S/net_r$R.bin" p4 results/random_decks_valid.txt 100 4 1 302 > "$S/stage4_eval$R.txt" 2>&1
echo "round $R done: $(cat $S/stage4_eval$R.txt)"
