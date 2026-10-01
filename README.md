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

## Search result (run 2, current data, competitive opponent pool) — supersedes run 1
Changes vs run 1: 2026 balance overlay from voonhous/crforge (67 field changes), 12-policy family for the game value,
opponent pool restricted to screened, competitive decks (36 decks; a disjoint 54-deck holdout pool for confirmation).

Deck most consistent across both pools:
`giant, witch, valkyrie, giant-skeleton, minion-horde, sparky, firecracker, bomb-tower`
- search pool: RMS 0.133, mean 0.515, worst 0.238, best 0.806
- holdout pool: RMS 0.136, mean 0.512, worst 0.243, best 0.800
Other holdout leader: `giant, musketeer, mini-pekka, minion-horde, sparky, magic-archer, mortar, poison` (RMS 0.136, 0.22-0.78).
Files: `results/final_run2_holdout.txt`, `results/candidates_run2.txt`, pools in `results/pool_*.txt`.

Interpretation: within this simulator this deck has no matchup outside ~24-80%, versus 0-100% for typical archetypes.
Still not a true zero-counter deck, and not validated against live-game matchup outcomes.
Known conflict: crforge treats raw speed 60 as 1 tile/s, the video-based TopSerg data as 1.2 tiles/s; this sim uses 1.2.

## Search result (run 3, after Arrows fix) — latest
User instruction: proceed from memory/available knowledge (no live matchup data can be provided).
Holdout pool (53 decks, 27 games per matchup, 12-policy family), top deck:
`minions, golem, sparky, zappies, cannon, mortar, inferno-tower, poison` — RMS 0.127, mean 0.532, range 0.22–0.86.
Most balanced range: `giant, baby-dragon, sparky, battle-ram, zappies, bomb-tower, furnace, giant-snowball` — RMS 0.131, range 0.23–0.78.
Files: `results/final_run3_holdout.txt`, `results/search_run3.log`, `results/candidates_run3.txt`.

**Red flag:** Sparky appears in nearly all top decks. In the real game Sparky is not that dominant, so this is probably a
simulator/AI artifact (splash + AoE timing, AI not exploiting Sparky's weaknesses). Treat run-3 results as provisional.
Run 2's deck (`giant, witch, valkyrie, giant-skeleton, minion-horde, sparky, firecracker, bomb-tower`) also contains Sparky.

## Real-meta decks (user-supplied lists) — `results/meta_pool.txt`
User supplied images for 2.6 Hog ("순호"), Miner-Rocket ("광켓") and a Goblin Drill deck ("눈드릴"). Evolutions/heroes are NOT modelled,
so they are replaced by the base card (Cannon, Skeletons, Tesla, Musketeer, Dark Prince).
- 2.6 Hog: `cannon, musketeer, skeletons, hog-rider, fireball, ice-golem, ice-spirit, the-log`
- 광켓: `skeletons, dark-prince, tesla, the-log, rocket, royal-delivery, electro-spirit, miner`
- 눈드릴 (PROVISIONAL, card list unreadable in the image): `goblin-drill, cannon, goblin-gang, dart-goblin, skeletons, electro-spirit, giant-snowball, the-log`
Added simplified Tesla (always up), Goblin Drill (spawner building) and Royal Delivery.
Meta round robin (`crsearch meta`): 2.6 Hog mean 0.42, 광켓 0.51, other meta decks 0.46–0.71. The drill deck (0.00) and log-bait (0.12) are
clearly wrong in this simulator (drill offence too weak; evo drill/cannon missing) and are excluded from the opponent pool (`meta_pool_ok.txt`).

## Real engine integration (latest, supersedes the home-made engine for deck evaluation)
The user supplied the project https://github.com/itzik123/ClashRoyaleAi (MIT; headers vendored in `vendor/clashroyaleenv/`).
Unlike the home-made engine it has 132 cards, 41 Evolutions, Champions/Heroes, calibrated speeds and real timing. It builds with
plain g++ on Linux:

    g++ -O2 -std=c++17 -pthread -Ivendor/clashroyaleenv/include/core -Ivendor/clashroyaleenv/include/entities \
        -Ivendor/clashroyaleenv/include/rendering src/real/real.cpp -o build/real

`src/real/real.cpp`: deck parsing (`evo:Cannon`, `hero:Musketeer`), card profiling by spawning each card on a scratch board,
a rule-based player (policies 0-2) and a snapshot-lookahead player (policies 3-4), game value over a policy set, meta round robin.
Modes: `profile`, `game`, `bench`, `meta <decks> <g>`; env `CR_POLS=0,1,2,3,4` selects the policy set.
`results/real_meta.txt` lists 15 meta decks (2.6 Hog, Miner-Rocket and a provisional Goblin-Drill deck use real Evo/Hero cards).

Findings (honest): the engine is fine; the *players* are the limit.
- Rule-based players over-favour heavy decks (Pekka bridge-spam 86%, Giant-Prince 85%) and under-rate cycle decks (2.6 Hog 23%).
- Lookahead players (6-10 s horizon) flip the bias: cycle/chip decks do well (Goblin-Drill 77%), Golem collapses to 5%.
- Mixing both families does not remove the bias. No "neutral deck" is reported from this engine yet.
Hero Dark Prince is not in the engine (Dark Prince base card is used in the Miner-Rocket list).

### Long-horizon lookahead (policies 5-7: 10/16/24 s rollouts, own continuation) — `results/real_meta_long.txt`
Golem rose 5% -> 19% and games became close (1-2, 2-1), but the polarisation remains (Pekka bridge-spam 85%, Log-bait 84%,
Mega Knight 4%). Longer horizon alone does not remove the bias. PyTorch cannot be installed here (pip cannot reach PyPI, no GPU),
so the repo's PPO stack cannot run as-is; a pure-C++ evolution-strategy learner is the feasible substitute.

### Evolution-strategies learner (pure C++, `real es` / `real estest`) — 2.6 Hog only, `results/es_hog26*.txt`
MLP policy (70 inputs, 48 hidden, 5+9 outputs, 4.1k parameters), 300 generations of antithetic ES (~35 min on 4 cores) trained
against 14 meta decks played by rule-based policies 0-2.
- vs rule-policy opponents: learned 56.6% | rule 27.0% | lookahead(policy 5) 92.5%.
- vs lookahead opponents: learned 0.0% | rule 0.0% | lookahead 34.4%.
So the learner overfits the opponents it trained against and does not generalise; the lookahead player remains the strongest.
Training against lookahead opponents is ~100x slower (about 0.5 s per game), i.e. hours per deck.
