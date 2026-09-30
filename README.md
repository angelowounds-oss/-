# Clash Royale approximate simulator + "no-counter deck" search

**Status: experimental. This is NOT a perfect reproduction of Clash Royale.** Results are relative to this
simulator's rules and its built-in players, not to the live game.

## Layout
- `tools/export_data.py` – flattens the RoyaleAPI/cr-api-data JSON snapshot (Oct 2023) into `data/cr_data.txt` (level 11 stats).
- `src/cr.cpp`, `src/cr.hpp` – engine (20 Hz→10 Hz ticks, 18x32 arena, bridges, towers, targeting, splash, spells,
  spawners, death spawns, elixir rules, hand cycle) and the heuristic players (3 policies).
- `src/main.cpp` – validation tests (`cr test`), replay of a video-measured Hog/Cannon scenario (`cr hogtest`), single games.
- `src/search.cpp` – round robin, diagnostics, per-card scan, genetic deck search, heavy final evaluation.
- `results/` – logs and result tables.

Build: `g++ -O2 -std=c++17 -pthread -o build/crsearch src/cr.cpp src/search.cpp` and `g++ -O2 -std=c++17 -o build/cr src/cr.cpp src/main.cpp`.

## What was verified against outside sources
| Item | Source | Result |
|---|---|---|
| Elixir 1/2.8s, x2 at 2:00, x3 at 4:00 | web search (Fandom wiki summary) | matches |
| Level 11 = tournament standard; card stats | RoyaleAPI/cr-api-data (2023 snapshot) | loaded from data |
| Arena 18x32, bridges at x=3.5/14.5, princess towers (3.5/14.5, 6.5), river y 15..17 | TopSerg/cr_coach_bundle (video-verified patches) | matches |
| Troop speed: raw 45/60/90/120 = 0.9/1.2/1.8/2.4 tiles/s | same repo (solo-Hog 7/7 hit video test) | adopted (speed/50) |
| First hit = hit_speed − load_time; Hog 1.6 s interval | same repo | matches; `cr hogtest` reproduces hits at 4.5/6.1/7.7 s vs video 4.3/5.9/7.5 s |
| Tower L11 stats 3052 hp / 109 dmg (princess), 4824 hp (king) | same repo (Liquipedia) | used; RoyaleAPI tower arrays are wrong for towers |
| Spell one-shot thresholds (Zap/Goblins, Fireball/Wizard, Log/Goblins …) | community knowledge | `cr test` passes |

## Known gaps (why "perfect" is not achieved)
- Data snapshot is Oct 2023; balance changes since then (2024–2026) are not applied. The TopSerg repo notes newer
  Liquipedia numbers for a few cards only.
- Not modelled: champions/heroes, evolutions, most abilities, tornado, clone, graveyard, mirror, goblin drill,
  rage, freeze, fisherman, ram rider, mighty miner, etc. (see `cr cards`).
- Players are hand-written heuristics, so "optimal play" is approximated by the value of a 3x3 zero-sum game between
  three policies (turtle / balanced / aggressive). This is far from true optimal play.
- Diagnostics (`crsearch diag`) show the simulator is still more lopsided than the real game.

## Search result (run 1)
GA over 8-card decks (80 supported cards), fitness = RMS distance of matchup value from 50% against a pool of 19 archetypes +
40 random decks, then re-evaluated on a different pool (19 archetypes + 60 random, 108 games/matchup). See `results/final_run1.txt`.

Best deck found *inside this simulator*: `three-musketeers, ice-spirit, miner, battle-ram, elixir-collector, x-bow, rocket, giant-snowball`
RMS deviation 0.202, mean 0.508, worst matchup 0.083, best 1.000 (reference archetypes: RMS 0.23–0.47).
This is **not** a near-zero-counter deck: it still has extreme matchups. Treat it as "least polarised deck this
simulator produced", not as a claim about the live game.
