#!/bin/bash
# Stage 5: probe the student for exploitable weaknesses and check that deck rankings agree with the teacher.
# usage: stage5_bias.sh <student_net> <earlier_net> <tau>
set -e
cd /home/user/-
NET=$1; OLD=$2; TAU=$3
S=results/student
export CR_THREADS=4 CR_TAU=$TAU
D=results/random_decks_valid.txt
OUT=$S/stage5_family.txt
: > $OUT
for opp in p0 p1 p2 p3 p4 p6 p8 p11; do
  ./build/real_student match "n$NET" "$opp" $D 100 4 0 501 >> $OUT
done
./build/real_student match "n$NET" "n$OLD" $D 100 4 0 502 >> $OUT
./build/real_student deckscore "n$NET" $S/decks100.txt 20 2 9001 > $S/stage5_deckscore_student.txt
./build/real_student deckscore p4 $S/decks100.txt 20 2 9001 > $S/stage5_deckscore_teacher.txt
echo "stage5 done"
