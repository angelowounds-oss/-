// Deck search: evaluates decks against a reference pool with the simulator and searches (GA) for the deck whose
// matchup values against the pool are closest to 50% ("no-counter" deck).
#include "cr.hpp"
#include <atomic>
#include <thread>
#include <mutex>

typedef array<int, 8> Deck;
static int NT = 4; static int NPOL = 3;

static const vector<string> WINCONS = {"hog-rider", "giant", "golem", "lava-hound", "balloon", "royal-giant", "battle-ram", "miner", "x-bow", "mortar",
                                        "goblin-barrel", "pekka", "mega-knight", "royal-hogs", "sparky", "three-musketeers", "elite-barbarians", "prince",
                                        "skeleton-barrel", "wall-breakers", "giant-skeleton", "bowler", "executioner", "flying-machine", "graveyard"};

static void parFor(int n, const function<void(int)>& fn) {
  atomic<int> next(0); vector<thread> th;
  for (int t = 0; t < NT; t++) th.emplace_back([&] { for (;;) { int i = next++; if (i >= n) break; fn(i); } });
  for (auto& x : th) x.join();
}

static bool validDeck(const Deck& d) {
  set<int> s(d.begin(), d.end()); if (s.size() != 8) return false;
  int spells = 0, cost = 0; for (int c : d) { if (!D.cards[c].supported) return false; if (D.cards[c].type == C_SPELL) spells++; cost += D.cards[c].elixir; }
  float avg = cost / 8.0f; return spells <= 3 && avg >= 2.4f && avg <= 4.8f;
}
static Deck randomDeck(Rng& r) {
  for (;;) {
    Deck d; set<int> used; int n = 0;
    vector<int> wc; for (auto& k : WINCONS) { auto it = D.cardIdx.find(k); if (it != D.cardIdx.end() && D.cards[it->second].supported) wc.push_back(it->second); }
    int w = wc[r.below(wc.size())]; d[n++] = w; used.insert(w);
    while (n < 8) { int c = D.supported[r.below(D.supported.size())]; if (used.count(c)) continue; used.insert(c); d[n++] = c; }
    if (validDeck(d)) { sort(d.begin(), d.end()); return d; }
  }
}
static Deck mutate(Deck d, Rng& r) {
  for (;;) {
    Deck e = d; int k = 1 + (r.uni() < 0.35f); set<int> used(e.begin(), e.end());
    for (int i = 0; i < k; i++) { int pos = r.below(8); for (int tries = 0; tries < 50; tries++) { int c = D.supported[r.below(D.supported.size())]; if (used.count(c)) continue; used.erase(e[pos]); e[pos] = c; used.insert(c); break; } }
    if (validDeck(e)) { sort(e.begin(), e.end()); return e; }
  }
}
static string deckStr(const Deck& d) { string s; for (int i = 0; i < 8; i++) { if (i) s += ","; s += D.cards[d[i]].key; } return s; }
static Deck parseDeck(const string& s) { Deck d{}; stringstream ss(s); string k; int i = 0; while (getline(ss, k, ',') && i < 8) d[i++] = D.card(k); if (i != 8) { fprintf(stderr, "bad deck %s\n", s.c_str()); exit(1); } return d; }

struct Ev { vector<float> v; float rms = 0, linf = 0, mean = 0, mn = 1, mx = 0; };
static Ev evalDeck(const Deck& d, const vector<Deck>& pool, int g, uint64_t seed, bool par = false) {
  Ev e; e.v.assign(pool.size(), 0.5f);
  auto one = [&](int j) { e.v[j] = (pool[j] == d) ? 0.5f : matchupValue(d, pool[j], g, seed * 7919 + j, NPOL); };
  if (par) parFor((int)pool.size(), one); else for (size_t j = 0; j < pool.size(); j++) one((int)j);
  double s2 = 0, sm = 0; for (float v : e.v) { s2 += (v - 0.5) * (v - 0.5); sm += v; e.linf = max(e.linf, fabsf(v - 0.5f)); e.mn = min(e.mn, v); e.mx = max(e.mx, v); }
  e.rms = sqrt(s2 / pool.size()); e.mean = sm / pool.size(); return e;
}

static vector<pair<string, Deck>> archetypes() {
  vector<pair<string, string>> a = {
      {"hog-cycle", "hog-rider,musketeer,ice-spirit,skeletons,cannon,fireball,the-log,knight"},
      {"golem-beatdown", "golem,night-witch,baby-dragon,electro-wizard,poison,zap,minions,bats"},
      {"lavaloon", "lava-hound,balloon,minions,tesla,fireball,arrows,skeletons,bats"},
      {"pekka-bridgespam", "pekka,battle-ram,electro-wizard,mini-pekka,zap,fire-spirit,the-log,dark-prince"},
      {"royal-giant", "royal-giant,bomber,spear-goblins,goblins,zap,fireball,tombstone,skeletons"},
      {"mega-knight-pump", "mega-knight,bats,ice-spirit,skeletons,minions,inferno-dragon,zap,elixir-collector"},
      {"giant-prince", "giant,prince,wizard,musketeer,zap,arrows,mini-pekka,skeletons"},
      {"giant-sparky", "giant,sparky,valkyrie,goblin-gang,zap,fireball,ice-spirit,mini-pekka"},
      {"log-bait", "goblin-gang,princess,skeleton-army,bats,goblin-barrel,knight,rocket,the-log"},
      {"balloon-bowler", "balloon,bowler,musketeer,valkyrie,tesla,zap,arrows,skeletons"},
      {"xbow-cycle", "x-bow,tesla,archers,knight,skeletons,ice-spirit,fireball,the-log"},
      {"mortar-cycle", "mortar,knight,archers,skeleton-army,bats,ice-spirit,fireball,the-log"},
      {"barb-valk", "barbarians,valkyrie,wizard,archers,cannon,arrows,fireball,zap"},
      {"miner-poison", "miner,poison,valkyrie,mega-minion,skeletons,ice-spirit,bomb-tower,the-log"},
      {"three-musk", "three-musketeers,battle-ram,ice-golem,ice-spirit,elixir-collector,zap,rocket,cannon"},
      {"witch-giant", "witch,giant,prince,musketeer,arrows,zap,skeletons,ice-spirit"},
      {"rocket-cycle", "hog-rider,princess,ice-spirit,skeletons,rocket,the-log,cannon,knight"},
      {"inferno-control", "inferno-tower,knight,musketeer,valkyrie,zap,fireball,ice-spirit,skeletons"},
      {"skeleton-barrel-bait", "skeleton-barrel,goblin-barrel,princess,goblin-gang,skeleton-army,inferno-tower,rocket,the-log"},
      {"royal-hogs-split", "royal-hogs,royal-giant,flying-machine,zap,fireball,ice-spirit,skeletons,barbarian-hut"},
      {"elite-barb-rush", "elite-barbarians,battle-ram,mini-pekka,zappies,zap,the-log,fire-spirit,ice-spirit"},
      {"executioner-tank", "giant,executioner,tornado-substitute,zap,skeletons,ice-spirit,arrows,valkyrie"},
      {"double-dragon-air", "baby-dragon,inferno-dragon,mega-minion,minion-horde,tesla,arrows,zap,ice-golem"},
      {"cannon-hog-2.6", "hog-rider,musketeer,ice-golem,ice-spirit,skeletons,cannon,fireball,the-log"},
  };
  vector<pair<string, Deck>> out;
  for (auto& p : a) {
    string s = p.second; bool ok = true; stringstream ss(s); string k; while (getline(ss, k, ',')) { auto it = D.cardIdx.find(k); if (it == D.cardIdx.end() || !D.cards[it->second].supported) { ok = false; break; } }
    if (!ok) { fprintf(stderr, "skip archetype %s (unsupported card %s)\n", p.first.c_str(), k.c_str()); continue; }
    Deck d = parseDeck(s); set<int> u(d.begin(), d.end()); if (u.size() != 8) { fprintf(stderr, "skip archetype %s (dup)\n", p.first.c_str()); continue; }
    out.push_back({p.first, d});
  }
  return out;
}

static vector<Deck> buildPool(int nRandom, uint64_t seed, vector<pair<string, Deck>>* arch = nullptr) {
  auto a = archetypes(); vector<Deck> pool; for (auto& p : a) pool.push_back(p.second);
  if (const char* pf = getenv("CR_POOL")) {  // pre-screened competitive pool
    pool.clear(); ifstream in(pf); string l; while (getline(in, l)) if (!l.empty()) { Deck d = parseDeck(l); if (find(pool.begin(), pool.end(), d) == pool.end()) pool.push_back(d); }
    if (arch) arch->clear(); return pool;
  }
  if (arch) *arch = a; Rng r(seed); while ((int)pool.size() < (int)a.size() + nRandom) pool.push_back(randomDeck(r));
  return pool;
}

int main(int argc, char** argv) {
  D.load("data/cr_data.txt"); string mode = argc > 1 ? argv[1] : "help";
  if (const char* e = getenv("CR_THREADS")) NT = atoi(e); if (const char* e = getenv("CR_NPOL")) NPOL = atoi(e); initPolicies();
  if (mode == "meta") {  // meta <g>: round robin among the decks in $CR_POOL (real-meta list)
    int g = argc > 2 ? atoi(argv[2]) : 20; vector<Deck> P; { ifstream in(getenv("CR_POOL")); string l; while (getline(in, l)) if (!l.empty()) P.push_back(parseDeck(l)); }
    int n = P.size(); vector<vector<float>> M(n, vector<float>(n, 0.5f)); vector<pair<int, int>> jobs; for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) jobs.push_back({i, j});
    parFor((int)jobs.size(), [&](int k) { int i = jobs[k].first, j = jobs[k].second; float v = matchupValue(P[i], P[j], g, 700 + k, NPOL); M[i][j] = v; M[j][i] = 1 - v; });
    printf("meta round robin, %d decks, NPOL=%d, g=%d\n     ", n, NPOL, g); for (int j = 0; j < n; j++) printf("%3d ", j + 1); printf("  mean\n");
    for (int i = 0; i < n; i++) { printf("%2d:  ", i + 1); double s = 0; for (int j = 0; j < n; j++) { printf("%3d ", (int)lround(100 * M[i][j])); if (j != i) s += M[i][j]; } printf("  %.2f\n", s / (n - 1)); }
  } else if (mode == "roundrobin") {  // archetype round robin with heavy sampling
    int g = argc > 2 ? atoi(argv[2]) : 20; vector<pair<string, Deck>> a = archetypes(); int n = a.size();
    vector<vector<float>> M(n, vector<float>(n, 0.5f)); vector<pair<int, int>> jobs; for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) jobs.push_back({i, j});
    parFor((int)jobs.size(), [&](int k) { int i = jobs[k].first, j = jobs[k].second; float v = matchupValue(a[i].second, a[j].second, g, 1000 + k, NPOL); M[i][j] = v; M[j][i] = 1 - v; });
    printf("archetype round robin (g=%d per policy pair => %d games/pair)\n", g, g * 9);
    for (int i = 0; i < n; i++) { double s = 0, s2 = 0, mn = 1, mx = 0; for (int j = 0; j < n; j++) if (j != i) { s += M[i][j]; s2 += (M[i][j] - 0.5) * (M[i][j] - 0.5); mn = min<double>(mn, M[i][j]); mx = max<double>(mx, M[i][j]); }
      printf("%-22s mean %.3f  rms-dev %.3f  min %.3f  max %.3f\n", a[i].first.c_str(), s / (n - 1), sqrt(s2 / (n - 1)), mn, mx); }
  } else if (mode == "search") {
    int pop = argc > 2 ? atoi(argv[2]) : 48, gens = argc > 3 ? atoi(argv[3]) : 30, g = argc > 4 ? atoi(argv[4]) : 2, nrand = argc > 5 ? atoi(argv[5]) : 40; uint64_t seed = argc > 6 ? atoll(argv[6]) : 1;
    vector<Deck> pool = buildPool(nrand, 12345); Rng r(seed);
    vector<Deck> P; auto arch = archetypes(); for (auto& a : arch) P.push_back(a.second); while ((int)P.size() < pop) P.push_back(randomDeck(r));
    vector<Ev> E(P.size()); map<Deck, Ev> hall;
    for (int gen = 0; gen < gens; gen++) {
      parFor((int)P.size(), [&](int i) { E[i] = evalDeck(P[i], pool, g, seed * 100003 + gen * 977 + i); });
      vector<int> idx(P.size()); iota(idx.begin(), idx.end(), 0); sort(idx.begin(), idx.end(), [&](int a, int b) { return E[a].rms < E[b].rms; });
      for (int i : idx) hall[P[i]] = E[i];
      printf("gen %2d best rms %.4f (linf %.3f mean %.3f)  median rms %.4f  | %s\n", gen, E[idx[0]].rms, E[idx[0]].linf, E[idx[0]].mean, E[idx[P.size() / 2]].rms, deckStr(P[idx[0]]).c_str()); fflush(stdout);
      vector<Deck> N; int elite = pop / 6; for (int i = 0; i < elite; i++) N.push_back(P[idx[i]]);
      while ((int)N.size() < pop) { int a = idx[r.below(pop / 2)]; if (r.uni() < 0.1f) N.push_back(randomDeck(r)); else N.push_back(mutate(P[a], r)); }
      P = N;
    }
    vector<pair<float, Deck>> all; for (auto& h : hall) all.push_back({h.second.rms, h.first}); sort(all.begin(), all.end());
    FILE* f = fopen(argc > 7 ? argv[7] : "results/candidates.txt", "w"); for (size_t i = 0; i < all.size() && i < 60; i++) fprintf(f, "%s\n", deckStr(all[i].second).c_str()); fclose(f);
    printf("wrote top candidates\n");
  } else if (mode == "final") {  // heavy re-evaluation: final <candidates-file> <g> <nrand>
    string file = argv[2]; int g = atoi(argv[3]), nrand = atoi(argv[4]); vector<pair<string, Deck>> arch; vector<Deck> pool = buildPool(nrand, 777, &arch);
    vector<Deck> cands; { ifstream in(file); string l; while (getline(in, l)) if (!l.empty()) cands.push_back(parseDeck(l)); }
    vector<Ev> E(cands.size());
    for (size_t i = 0; i < cands.size(); i++) E[i] = evalDeck(cands[i], pool, g, 424242 + i, true);
    vector<int> idx(cands.size()); iota(idx.begin(), idx.end(), 0); sort(idx.begin(), idx.end(), [&](int a, int b) { return E[a].rms < E[b].rms; });
    printf("pool: %zu decks (%zu archetypes + %d random), g=%d per policy pair (%d games per matchup)\n", pool.size(), arch.size(), nrand, g, g * 9);
    for (int rank = 0; rank < (int)idx.size() && rank < 15; rank++) { int i = idx[rank]; printf("#%d rms %.4f linf %.3f mean %.3f min %.3f max %.3f  %s\n", rank + 1, E[i].rms, E[i].linf, E[i].mean, E[i].mn, E[i].mx, deckStr(cands[i]).c_str()); }
    // also evaluate archetypes for reference
    printf("\nreference archetypes on same pool:\n"); for (auto& a : archetypes()) { Ev e = evalDeck(a.second, pool, g, 99, true); printf("%-22s rms %.4f linf %.3f mean %.3f min %.3f max %.3f\n", a.first.c_str(), e.rms, e.linf, e.mean, e.mn, e.mx); }
    int b = idx[0]; printf("\nbest deck detail (vs pool):\n"); for (size_t j = 0; j < pool.size(); j++) printf("  vs %s  %.3f\n", deckStr(pool[j]).c_str(), E[b].v[j]);
  } else if (mode == "eval") {  // eval <deck> <g> <nrand>
    Deck d = parseDeck(argv[2]); int g = atoi(argv[3]), nrand = atoi(argv[4]); vector<pair<string, Deck>> arch; vector<Deck> pool = buildPool(nrand, 777, &arch);
    Ev e = evalDeck(d, pool, g, 31337, true); printf("rms %.4f linf %.3f mean %.3f min %.3f max %.3f\n", e.rms, e.linf, e.mean, e.mn, e.mx);
    if (arch.empty()) { vector<pair<float, size_t>> o; for (size_t j = 0; j < pool.size(); j++) o.push_back({e.v[j], j}); sort(o.begin(), o.end()); for (auto& q : o) printf("  %.3f vs %s\n", q.first, deckStr(pool[q.second]).c_str()); }
    else for (size_t j = 0; j < arch.size(); j++) printf("  vs %-22s %.3f\n", arch[j].first.c_str(), e.v[j]);
  } else if (mode == "buildpool") {  // buildpool <nCandidates> <keep> <out> : keep random decks that are competitive vs the archetypes
    int nc = atoi(argv[2]), keep = atoi(argv[3]); vector<pair<string, Deck>> arch = archetypes(); vector<Deck> ref; for (auto& a : arch) ref.push_back(a.second);
    Rng r(getenv("CR_POOLSEED") ? atoll(getenv("CR_POOLSEED")) : 2024); vector<Deck> cand; for (int i = 0; i < nc; i++) cand.push_back(randomDeck(r)); vector<Ev> E(nc);
    parFor(nc, [&](int i) { E[i] = evalDeck(cand[i], ref, 2, 900 + i); });
    vector<int> idx; for (int i = 0; i < nc; i++) if (E[i].mean >= 0.45 && E[i].mean <= 0.75 && E[i].mn > 0.03) idx.push_back(i);
    sort(idx.begin(), idx.end(), [&](int a, int b) { return fabsf(E[a].mean - 0.55f) < fabsf(E[b].mean - 0.55f); });
    vector<Deck> all2 = ref; for (int i : idx) all2.push_back(cand[i]); int na = ref.size();
    vector<vector<float>> M(all2.size(), vector<float>(all2.size(), 0.5f)); vector<pair<int, int>> jobs; for (size_t i = 0; i < all2.size(); i++) for (size_t j = i + 1; j < all2.size(); j++) jobs.push_back({(int)i, (int)j});
    parFor((int)jobs.size(), [&](int k) { int i = jobs[k].first, j = jobs[k].second; float v = matchupValue(all2[i], all2[j], 4, 3000 + k, 3); M[i][j] = v; M[j][i] = 1 - v; });
    FILE* f = fopen(argv[4], "w"); int kept = 0; for (size_t i = 0; i < all2.size(); i++) { double m = 0; for (size_t j = 0; j < all2.size(); j++) if (j != i) m += M[i][j]; m /= (all2.size() - 1); if (m < 0.33 || m > 0.72) { if ((int)i < na) fprintf(stderr, "drop %s (mean %.2f)\n", arch[i].first.c_str(), m); continue; } fprintf(f, "%s\n", deckStr(all2[i]).c_str()); kept++; } fclose(f); (void)keep;
    printf("pool kept %d of %zu\n", kept, all2.size());
    printf("candidates %d, competitive %zu, kept %d\n", nc, idx.size(), min<int>(keep, idx.size()));
  } else if (mode == "cardscan") {  // cardscan <g>: each supported card added to a fixed 7-card base deck vs the archetype pool
    int g = argc > 2 ? atoi(argv[2]) : 2; vector<pair<string, Deck>> arch; vector<Deck> pool = buildPool(0, 1, &arch);
    vector<string> base = {"knight", "musketeer", "valkyrie", "fireball", "zap", "hog-rider", "ice-spirit"}; vector<int> cards = D.supported; vector<pair<float, string>> res(cards.size());
    parFor((int)cards.size(), [&](int i) {
      Deck d; int n = 0; set<int> u; d[n++] = cards[i]; u.insert(cards[i]);
      for (auto& b : base) { int c = D.card(b); if (u.count(c)) continue; if (n < 8) { d[n++] = c; u.insert(c); } }
      vector<string> extra = {"skeletons", "the-log", "archers", "cannon"}; for (auto& e : extra) { if (n >= 8) break; int c = D.card(e); if (!u.count(c)) { d[n++] = c; u.insert(c); } }
      double s = 0; int m = 0; for (size_t j = 0; j < pool.size(); j++) { if (pool[j] == d) continue; s += matchupValue(d, pool[j], g, 5 + i * 131 + j, NPOL); m++; }
      res[i] = {(float)(s / m), D.cards[cards[i]].key}; });
    sort(res.begin(), res.end()); for (auto& r : res) printf("%-20s %.3f\n", r.second.c_str(), r.first);
  } else if (mode == "findfast") {
    Rng r(9); int found = 0; for (int i = 0; i < 4000 && found < 3; i++) { Deck a = randomDeck(r), b = randomDeck(r); Game g(a, b, 1, 1, i); g.run();
      if (g.firstCrown >= 0 && g.firstCrown < 30) { found++; printf("%s %s %d   (first crown %.1fs, crowns %d-%d)\n", deckStr(a).c_str(), deckStr(b).c_str(), i, g.firstCrown, g.crowns[0], g.crowns[1]); } }
  } else if (mode == "diag") {  // diag <nDecks> <gamesPerPair> : realism diagnostics on random decks, balanced policy mirror
    int nd = argc > 2 ? atoi(argv[2]) : 60, gp = argc > 3 ? atoi(argv[3]) : 4; Rng r(5); vector<Deck> decks; for (int i = 0; i < nd; i++) decks.push_back(randomDeck(r));
    vector<pair<int, int>> jobs; for (int i = 0; i < nd; i++) for (int j = i + 1; j < nd; j++) jobs.push_back({i, j});
    struct St { double w = 0; int n = 0; };
    vector<array<double, 12>> acc(jobs.size()); static double fc[10] = {0};
    parFor((int)jobs.size(), [&](int k) {
      array<double, 12> a{}; for (int q = 0; q < gp; q++) { bool sw = q & 1; Game g = sw ? Game(decks[jobs[k].second], decks[jobs[k].first], 1, 1, 991 + k * 31 + q) : Game(decks[jobs[k].first], decks[jobs[k].second], 1, 1, 991 + k * 31 + q); g.run();
        int wa = g.winner < 0 ? -1 : ((g.winner == 0) == !sw ? 1 : 0); a[0] += wa < 0 ? 0.5 : wa; a[1] += 1;
        int cw = max(g.crowns[0], g.crowns[1]), cl = min(g.crowns[0], g.crowns[1]); if (cw > 3) cw = 3; if (g.winner < 0) a[2]++;
        else { if (cw >= 3) a[3]++; else if (cl == 0 && cw >= 1) a[4]++; else if (cw > cl) a[5]++; else a[6]++; }  // 3-crown, n-0, n-m, tiebreak
        a[7] += g.t; a[8] += (g.crowns[0] + g.crowns[1] > 0); a[9] += g.wasted[0] + g.wasted[1]; if (g.firstCrown >= 0) { a[11] += 1; fc[(int)min(9.0f, g.firstCrown / 30)]++; } a[10] += g.plays[0] + g.plays[1]; }
      acc[k] = a; });
    double wsum = 0, psum = 0, n = 0, dr = 0, c3 = 0, c1 = 0, cx = 0, tb = 0, tt = 0, anyc = 0; vector<double> pw; for (auto& a : acc) { n += a[1]; dr += a[2]; c3 += a[3]; c1 += a[4]; cx += a[5]; tb += a[6]; tt += a[7]; anyc += a[8]; pw.push_back(a[0] / a[1]); wsum += a[9]; psum += a[10]; }
    double m = 0; for (double x : pw) m += x; m /= pw.size(); double sd = 0; for (double x : pw) sd += (x - m) * (x - m); sd = sqrt(sd / pw.size());
    printf("games=%.0f  draw=%.1f%%  3-crown=%.1f%%  n-0 (1-2 crowns to 0)=%.1f%%  n-m=%.1f%%  decided by tower-hp tiebreak=%.1f%%  any crown scored=%.1f%%  avg length=%.0fs\n", n, 100 * dr / n, 100 * c3 / n, 100 * c1 / n, 100 * cx / n, 100 * tb / n, 100 * anyc / n, tt / n);
    printf("deck-pair win rate: mean %.3f  sd across pairs %.3f  (sd from pure sampling noise alone at %d games: %.3f)\n", m, sd, gp, sqrt(0.25 / gp));
    printf("first crown time histogram (30s bins):"); for (int b = 0; b < 10; b++) printf(" %d-%ds:%.1f%%", b * 30, b * 30 + 30, 100 * fc[b] / n); printf("\n");
    printf("wasted elixir per player per game: %.1f   cards played per player per game: %.1f\n", wsum / n / 2, psum / n / 2);
    int ex = 0; for (double x : pw) if (x <= 0.001 || x >= 0.999) ex++; printf("pairs with 0%% or 100%%: %.1f%%\n", 100.0 * ex / pw.size());
  } else printf("modes: roundrobin g | search pop gens g nrand seed out | final file g nrand | eval deck g nrand\n");
  return 0;
}
