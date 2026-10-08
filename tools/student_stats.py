#!/usr/bin/env python3
"""Rank statistics for deckscore outputs ("idx winrate cost" per line). Standard library only."""
import math
import sys


def load(path):
    rows = []
    with open(path) as f:
        for line in f:
            p = line.split()
            if len(p) == 3:
                rows.append((int(p[0]), float(p[1]), float(p[2])))
    return rows


def ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return r


def pearson(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = math.sqrt(sum((x - ma) ** 2 for x in a))
    vb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return cov / (va * vb) if va and vb else float("nan")


def spearman(a, b):
    return pearson(ranks(a), ranks(b))


def main():
    if len(sys.argv) == 2:
        rows = load(sys.argv[1])
        wr = [r[1] for r in rows]
        cost = [r[2] for r in rows]
        print(f"decks {len(rows)}  winrate mean {sum(wr)/len(wr):.4f}  min {min(wr):.4f}  max {max(wr):.4f}")
        print(f"spearman(winrate, avg elixir cost) = {spearman(wr, cost):+.3f}")
    elif len(sys.argv) == 3:
        a = load(sys.argv[1])
        b = load(sys.argv[2])
        bm = {r[0]: r for r in b}
        pairs = [(r[1], bm[r[0]][1]) for r in a if r[0] in bm]
        x = [p[0] for p in pairs]
        y = [p[1] for p in pairs]
        print(f"decks in common {len(pairs)}  spearman(A winrate, B winrate) = {spearman(x, y):+.3f}  pearson = {pearson(x, y):+.3f}")
    else:
        print("usage: student_stats.py <deckscore.txt> | student_stats.py <deckscore_A.txt> <deckscore_B.txt>")


if __name__ == "__main__":
    main()
