#include <chrono>
#include <unistd.h>
// Student player: a small MLP that imitates the lookahead teacher (policy TEACH), refined with DAgger.
// Included by real.cpp (uses its engine state, features(), placements(), searchChoose(), think()).
//
// Modes (argv[1]):
//   strength  <decks> <ndecks> <seeds> <p,p,...>           mirror round robin of policies
//   gen       <decks> <games> <teacher> <out.bin> <seed0>  teacher self-play data (resumable)
//   gennet    <net.bin> <decks> <games> <teacher> <out.bin> <seed0>  student self-play relabelled by teacher (DAgger)
//   train     <out.bin> <epochs> <lr> <init.bin|-> <data.bin>...
//   match     <specA> <specB> <decks> <npairs> <games> <mirror 0|1> <seed>
//   deckscore <spec> <decks> <nOpp> <games> <seed>
// spec: p<idx> (policy index) or n<file>[@eps] (student net file, optional random-action rate).

static int TEACH = 6;
#ifndef SH_HIDDEN
#define SH_HIDDEN 64
#endif
static const int SH = SH_HIDDEN, SSLOT = NSLOT, SPL = NPLACE, SOUT = NSLOT + 4 * NPLACE, NCARD = CARD_ID_COUNT;
static const int NINS = NIN + 16;
static const int OB1 = NINS * SH, OE = OB1 + SH, OW2 = OE + NCARD * SH, OB2 = OW2 + SH * SOUT, NPAR = OB2 + SOUT;

struct Dec { int slot = -1; float x = 0, y = 0; };
struct Sample { float f[NINS]; int hand[4]; int mask; int slot; int place; };
struct Seat { int kind = 0; int pol = 1; const float* th = nullptr; bool rec = false; float eps = 0; };  // kind: 0 rule, 1 lookahead teacher, 2 student

static Seat seatOf(int p) { Seat s; s.kind = POL[p].lookahead > 0 ? 1 : 0; s.pol = p; return s; }

static int maskOf(GameManager& g, int team) {
  const auto& hand = g.getHand(team); float el = g.getElixir(team); int m = 1 << (SSLOT - 1);
  for (int s = 0; s < (int)hand.size() && s < SSLOT - 1; s++) { int cid = hand[s]; const Prof& pr = PROF[cid]; if ((pr.ok || cid == GameManager::MIRROR_CARD_ID) && el >= pr.cost) m |= 1 << s; }
  return m;
}
static void handIds(GameManager& g, int team, int* hc) { const auto& hand = g.getHand(team); for (int s = 0; s < 4; s++) hc[s] = s < (int)hand.size() ? hand[s] : -1; }

static void fwd(const float* th, const float* in, const int* hc, float* h, float* o) {
  float a[SH];
  for (int j = 0; j < SH; j++) a[j] = th[OB1 + j];
  for (int i = 0; i < NINS; i++) { float x = in[i]; const float* w = th + i * SH; for (int j = 0; j < SH; j++) a[j] += x * w[j]; }
  for (int s = 0; s < 4; s++) if (hc[s] >= 0) { const float* e = th + OE + hc[s] * SH; for (int j = 0; j < SH; j++) a[j] += e[j]; }
  for (int j = 0; j < SH; j++) h[j] = tanhf(a[j]);
  for (int q = 0; q < SOUT; q++) o[q] = th[OB2 + q];
  for (int j = 0; j < SH; j++) { const float* w = th + OW2 + j * SOUT; float hj = h[j]; for (int q = 0; q < SOUT; q++) o[q] += hj * w[q]; }
}

static float TAU = 0.0f;
// base features plus, per lane and side, the most advanced troop's presence, depth and x offset and the troop count
static void sfeatures(GameManager& g, Player& P, float* f) {
  features(g, P, f);
  int team = P.team; const Board& bd = g.getBoard(); auto& ents = const_cast<Board&>(bd).getEntities();
  const float C = ArenaLayout::CENTER_X, lx[2] = {ArenaLayout::LEFT_LANE_X, ArenaLayout::RIGHT_LANE_X};
  float depth[2][2] = {{0, 0}, {0, 0}}; float dx[2][2] = {{0, 0}, {0, 0}}; int present[2][2] = {{0, 0}, {0, 0}}, cnt[2][2] = {{0, 0}, {0, 0}};
  for (auto& ep : ents) {
    const Entity* e = ep.get(); if (!e->isAlive() || e->isTower() || e->isBuilding() || !e->isTargetable() || !dynamic_cast<const Troop*>(e)) continue;
    int l = e->position.x < C ? 0 : 1, side = e->team == team ? 0 : 1; float oy = P.oy(e->position.y);
    cnt[l][side]++;
    bool better = !present[l][side] || (side == 0 ? oy > depth[l][side] : oy < depth[l][side]);
    if (better) { present[l][side] = 1; depth[l][side] = oy; dx[l][side] = (e->position.x - lx[l]) / 9.0f; }
  }
  int k = NIN;
  for (int l = 0; l < 2; l++) for (int side = 0; side < 2; side++) {
    f[k++] = (float)present[l][side]; f[k++] = present[l][side] ? depth[l][side] / 34.0f : 0.0f;
    f[k++] = present[l][side] ? dx[l][side] : 0.0f; f[k++] = min(1.0f, cnt[l][side] / 6.0f);
  }
}

static Dec netDecide(GameManager& g, Player& P, const float* th) {
  float in[NINS], h[SH], o[SOUT]; int hc[4]; sfeatures(g, P, in); handIds(g, P.team, hc); fwd(th, in, hc, h, o);
  int m = maskOf(g, P.team); int bs = SSLOT - 1; float bv = o[SSLOT - 1] + TAU;
  for (int s = 0; s < SSLOT - 1; s++) if (((m >> s) & 1) && o[s] > bv) { bv = o[s]; bs = s; }
  Dec d; if (bs == SSLOT - 1) return d;
  vector<pair<float, float>> pl; placements(g, P, bs, pl); int base = SSLOT + bs * SPL, bp = 0;
  for (int p = 1; p < SPL; p++) if (o[base + p] > o[base + bp]) bp = p;
  d.slot = bs; d.x = pl[bp].first; d.y = pl[bp].second; return d;
}

static Dec teacherDec(GameManager& g, Player& P) {
  Dec d; int s; float x, y;
  if (searchChoose(g, P, s, x, y)) { d.slot = s; d.x = x; d.y = y; }
  return d;
}

static Dec randomDec(GameManager& g, Player& P, Rng& er) {
  int m = maskOf(g, P.team); int opts[4], n = 0;
  for (int s = 0; s < SSLOT - 1; s++) if ((m >> s) & 1) opts[n++] = s;
  Dec d; if (n == 0) return d;
  int s = opts[er.below(n)]; vector<pair<float, float>> pl; placements(g, P, s, pl); int p = er.below(SPL);
  d.slot = s; d.x = pl[p].first; d.y = pl[p].second; return d;
}

static double MAP_ERR_SUM = 0, MAP_ERR_N = 0, MAP_ERR_FAR = 0;
static Sample makeSample(GameManager& g, Player& P, const Dec& d) {
  Sample s{}; sfeatures(g, P, s.f); handIds(g, P.team, s.hand); s.mask = maskOf(g, P.team);
  s.slot = d.slot < 0 ? SSLOT - 1 : d.slot; s.place = 0;
  if (d.slot >= 0) {
    vector<pair<float, float>> pl; placements(g, P, d.slot, pl); float best = 1e30f;
    for (int p = 0; p < SPL; p++) { float dx = pl[p].first - d.x, dy = pl[p].second - d.y, dd = dx * dx + dy * dy; if (dd < best) { best = dd; s.place = p; } }
    MAP_ERR_SUM += sqrt(best); MAP_ERR_N += 1; MAP_ERR_FAR += sqrt(best) > 2.0 ? 1 : 0;
  }
  return s;
}

static void playDec(GameManager& g, int t, const Dec& d) { if (d.slot >= 0) { int cid = g.getHand(t)[d.slot]; g.playCard(t, cid, d.x, d.y); } }

static const float* ROLL_NET = nullptr;  // when set, the lookahead's rollouts play with this net instead of the rule policy
static void rolloutAct(GameManager& c, Player& P) {
  if (ROLL_NET) playDec(c, P.team, netDecide(c, P, ROLL_NET));
  else think(c, P);
}

static Result resultOf(GameManager& g) {
  Result r{-1, 3 - towersAlive(g, 1), 3 - towersAlive(g, 0), g.currentTick};
  r.crowns0 = 2 - towersAlive(g, 1); r.crowns1 = 2 - towersAlive(g, 0);
  for (auto& ep : g.getBoard().getEntities()) if (ep->isTower() && ep->isAlive()) { float fr = ep->hp / (ep->name.find("King") != string::npos ? 4824.0f : 3052.0f); (ep->team == 0 ? r.hp0 : r.hp1) += min(1.0f, fr) / 3.0f; }
  if (g.isGameOver()) r.winner = g.getLoserTeam() < 0 ? -1 : 1 - g.getLoserTeam();
  return r;
}

static Result playSeats(const Deck& a, const Deck& b, const Seat& s0, const Seat& s1, uint64_t seed, vector<Sample>* out) {
  GameManager g(vector<int>(a.begin(), a.end()), vector<int>(b.begin(), b.end()));
  g.seed((unsigned)(seed * 2654435761ULL + 7)); g.reset();
  const Seat* seat[2] = {&s0, &s1};
  Player P[2] = {Player(0, POL[s0.pol], seed * 3 + 1), Player(1, POL[s1.pol], seed * 7 + 2)};
  int nextT[2] = {0, 0}; Rng er(seed ^ 0x9e3779b97f4a7c15ULL);
  const int MAXT = 3600;
  while (!g.isGameOver() && g.currentTick < MAXT) {
    g.step();
    for (int t = 0; t < 2; t++) {
      if (g.currentTick < nextT[t]) continue;
      useAbilities(g, t);
      const Seat& S = *seat[t]; Player& Pt = P[t];
      if (S.kind == 0) think(g, Pt);
      else if (S.kind == 1) { Dec d = teacherDec(g, Pt); if (S.rec && out) out->push_back(makeSample(g, Pt, d)); playDec(g, t, d); }
      else {
        Dec d = (S.eps > 0 && er.uni() < S.eps) ? randomDec(g, Pt, er) : netDecide(g, Pt, S.th);
        if (S.rec && out) { GameManager c = g.snapshot(); Player T(t, POL[TEACH], seed * 11 + t); Dec lab = teacherDec(c, T); out->push_back(makeSample(g, Pt, lab)); }
        playDec(g, t, d);
      }
      nextT[t] = g.currentTick + (S.kind == 0 ? 4 : 6) + Pt.rng.below(4);
    }
  }
  return resultOf(g);
}

// ---- learning

static float WPLAY = 1.0f;  // extra weight on samples where the teacher plays a card (its wait labels dominate ~89%)
static void sampleLoss(const float* th, const Sample& s, float* gr, double& ls, double& lp, bool& okS, bool& okP) {
  float in[NINS], h[SH], o[SOUT], go[SOUT]; int hc[4];
  for (int i = 0; i < NINS; i++) in[i] = s.f[i];
  for (int k = 0; k < 4; k++) hc[k] = s.hand[k];
  fwd(th, in, hc, h, o);
  for (int q = 0; q < SOUT; q++) go[q] = 0;
  float mx = -1e30f; int am = -1;
  for (int q = 0; q < SSLOT; q++) if ((s.mask >> q) & 1) { if (am < 0 || o[q] > o[am]) am = q; mx = max(mx, o[q]); }
  float p[SSLOT]; double z = 0;
  for (int q = 0; q < SSLOT; q++) { p[q] = ((s.mask >> q) & 1) ? expf(o[q] - mx) : 0.0f; z += p[q]; }
  const float wp = s.slot < SSLOT - 1 ? WPLAY : 1.0f;
  for (int q = 0; q < SSLOT; q++) { p[q] = (float)(p[q] / z); go[q] = wp * (p[q] - (q == s.slot ? 1.0f : 0.0f)); }
  ls = -log(max(1e-12, (double)p[s.slot])); okS = am == s.slot;
  lp = 0; okP = true;
  if (s.slot < SSLOT - 1) {
    int base = SSLOT + s.slot * SPL; float mx2 = o[base]; int bi = 0;
    for (int q = 1; q < SPL; q++) if (o[base + q] > mx2) { mx2 = o[base + q]; bi = q; }
    double z2 = 0; float q2[SPL];
    for (int q = 0; q < SPL; q++) { q2[q] = expf(o[base + q] - mx2); z2 += q2[q]; }
    for (int q = 0; q < SPL; q++) { q2[q] = (float)(q2[q] / z2); go[base + q] = q2[q] - (q == s.place ? 1.0f : 0.0f); }
    lp = -log(max(1e-12, (double)q2[s.place])); okP = bi == s.place;
  }
  if (!gr) return;
  float ga[SH];
  for (int j = 0; j < SH; j++) { float gh = 0; const float* w = th + OW2 + j * SOUT; for (int q = 0; q < SOUT; q++) gh += w[q] * go[q]; ga[j] = gh * (1 - h[j] * h[j]); }
  for (int q = 0; q < SOUT; q++) gr[OB2 + q] += go[q];
  for (int j = 0; j < SH; j++) { float hj = h[j]; float* g2 = gr + OW2 + j * SOUT; for (int q = 0; q < SOUT; q++) g2[q] += hj * go[q]; }
  for (int j = 0; j < SH; j++) gr[OB1 + j] += ga[j];
  for (int i = 0; i < NINS; i++) { float x = in[i]; float* g1 = gr + i * SH; for (int j = 0; j < SH; j++) g1[j] += x * ga[j]; }
  for (int k = 0; k < 4; k++) if (hc[k] >= 0) { float* ge = gr + OE + hc[k] * SH; for (int j = 0; j < SH; j++) ge[j] += ga[j]; }
}

static void trainNet(vector<float>& th, const vector<Sample>& D, int epochs, float lr, uint64_t seed) {
  Rng rng(seed); vector<uint32_t> idx(D.size());
  for (size_t i = 0; i < idx.size(); i++) idx[i] = (uint32_t)i;
  for (size_t i = idx.size() - 1; i > 0; i--) swap(idx[i], idx[rng.below((int)i + 1)]);
  size_t nVal = max<size_t>(1, idx.size() / 50);
  vector<uint32_t> order(idx.begin() + nVal, idx.end()), val(idx.begin(), idx.begin() + nVal);
  vector<float> gr(NPAR), m(NPAR, 0.0f), v(NPAR, 0.0f); long long step = 0; const size_t B = 128;
  for (int ep = 0; ep < epochs; ep++) {
    for (size_t i = order.size() - 1; i > 0; i--) swap(order[i], order[rng.below((int)i + 1)]);
    double sS = 0, sP = 0; size_t nP = 0;
    for (size_t b0 = 0; b0 < order.size(); b0 += B) {
      size_t b1 = min(order.size(), b0 + B);
      fill(gr.begin(), gr.end(), 0.0f);
      for (size_t t = b0; t < b1; t++) { double ls, lp; bool okS, okP; sampleLoss(th.data(), D[order[t]], gr.data(), ls, lp, okS, okP); sS += ls; sP += lp; nP++; }
      step++; float bc1 = 1 - powf(0.9f, (float)step), bc2 = 1 - powf(0.999f, (float)step), sc = 1.0f / (float)(b1 - b0);
      for (int k = 0; k < NPAR; k++) { float gk = gr[k] * sc; m[k] = 0.9f * m[k] + 0.1f * gk; v[k] = 0.999f * v[k] + 0.001f * gk * gk; th[k] -= lr * (m[k] / bc1) / (sqrtf(v[k] / bc2) + 1e-8f); }
    }
    double vS = 0, vP = 0; size_t cS = 0, cP = 0, nv = 0, nvp = 0;
    for (uint32_t k : val) { double ls, lp; bool okS, okP; sampleLoss(th.data(), D[k], nullptr, ls, lp, okS, okP); vS += ls; vP += lp; nv++; cS += okS; if (D[k].slot < SSLOT - 1) { nvp++; cP += okP; } }
    printf("epoch %d  train slot-ce %.4f place-ce %.4f | val slot-ce %.4f acc %.3f place-ce %.4f acc %.3f\n", ep + 1,
           sS / max<size_t>(1, order.size()), sP / max<size_t>(1, nP), vS / max<size_t>(1, nv), (double)cS / max<size_t>(1, nv), vP / max<size_t>(1, nvp), (double)cP / max<size_t>(1, nvp));
    fflush(stdout);
  }
}

static vector<Sample> loadSamples(const string& f) {
  FILE* fp = fopen(f.c_str(), "rb"); if (!fp) { fprintf(stderr, "cannot open %s\n", f.c_str()); exit(1); }
  fseek(fp, 0, SEEK_END); long long bytes = ftell(fp); fseek(fp, 0, SEEK_SET);
  vector<Sample> v(bytes / sizeof(Sample)); size_t got = fread(v.data(), sizeof(Sample), v.size(), fp); fclose(fp); v.resize(got); return v;
}
static void saveTheta(const vector<float>& th, const string& f) { FILE* fp = fopen(f.c_str(), "wb"); fwrite(th.data(), sizeof(float), th.size(), fp); fclose(fp); }
static vector<float> loadTheta(const string& f) {
  vector<float> th(NPAR); FILE* fp = fopen(f.c_str(), "rb"); if (!fp) { fprintf(stderr, "cannot open %s\n", f.c_str()); exit(1); }
  size_t got = fread(th.data(), sizeof(float), NPAR, fp); fclose(fp);
  if (got != (size_t)NPAR) { fprintf(stderr, "bad net file %s\n", f.c_str()); exit(1); }
  return th;
}
static vector<float> randomTheta(uint64_t seed) {
  Rng r(seed); vector<float> th(NPAR, 0.0f);
  auto fill = [&](int from, int to, float sc) { for (int k = from; k < to; k++) th[k] = sc * (2 * r.uni() - 1); };
  fill(0, OB1, sqrtf(6.0f / (NINS + SH))); fill(OE, OW2, 0.1f); fill(OW2, OB2, sqrtf(6.0f / (SH + SOUT)));
  return th;
}

// ---- resumable data generation: each chunk of games is appended once complete; progress file records bytes written
static void chunkedRun(const string& out, int games, int chunk, const function<void(int, vector<Sample>&)>& one) {
  long long done = 0, bytes = 0; { ifstream pf(out + ".progress"); if (pf) pf >> done >> bytes; }
  { FILE* f = fopen(out.c_str(), "ab"); if (f) fclose(f); }
  if (truncate(out.c_str(), bytes) != 0) { fprintf(stderr, "truncate failed for %s\n", out.c_str()); exit(1); }
  FILE* f = fopen(out.c_str(), "ab"); if (!f) { fprintf(stderr, "cannot open %s\n", out.c_str()); exit(1); }
  int nChunks = (games + chunk - 1) / chunk;
  for (int c = (int)done; c < nChunks; c++) {
    int cnt = min(chunk, games - c * chunk); vector<vector<Sample>> buf(cnt);
    parFor(cnt, [&](int k) { one(c * chunk + k, buf[k]); });
    size_t ns = 0;
    for (auto& b : buf) { if (!b.empty()) fwrite(b.data(), sizeof(Sample), b.size(), f); ns += b.size(); }
    fflush(f); bytes = ftell(f);
    { ofstream pf(out + ".progress", ios::trunc); pf << (c + 1) << " " << bytes; }
    printf("chunk %d/%d games %d samples %zu bytes %lld\n", c + 1, nChunks, cnt, ns, bytes); fflush(stdout);
  }
  fclose(f);
}

static vector<int> parseIntList(const string& s) { vector<int> v; stringstream ss(s); string t; while (getline(ss, t, ',')) v.push_back(atoi(t.c_str())); return v; }

static map<string, vector<float>> NETS;
static Seat parseSeat(const string& s) {
  Seat x; x.pol = TEACH;
  if (s[0] == 'p') { int p = atoi(s.c_str() + 1); x = seatOf(p); }
  else if (s[0] == 'n') {
    size_t at = s.find('@'); string file = s.substr(1, at == string::npos ? string::npos : at - 1);
    if (!NETS.count(file)) NETS[file] = loadTheta(file);
    x.kind = 2; x.th = NETS[file].data(); x.pol = TEACH; x.eps = at == string::npos ? 0.0f : (float)atof(s.c_str() + at + 1);
  } else { fprintf(stderr, "bad spec %s\n", s.c_str()); exit(1); }
  return x;
}

static double deckCost(const Deck& d) { double c = 0; for (int cid : d) c += CardRegistry::getInstance().getCard(cid)->cost; return c / 8.0; }

static bool studentMode(int argc, char** argv) {
  if (argc < 2) return false;
  string mode = argv[1];
  if (const char* e = getenv("CR_TEACH")) TEACH = atoi(e);
  if (const char* e = getenv("CR_TAU")) TAU = (float)atof(e);
  if (const char* e = getenv("CR_WPLAY")) WPLAY = (float)atof(e);
  if (const char* e = getenv("CR_ROLLNET")) { NETS[e] = loadTheta(e); ROLL_NET = NETS[e].data(); }

  if (mode == "strength" && argc >= 6) {
    vector<Deck> D = readDecks(argv[2]); int nd = atoi(argv[3]), seeds = atoi(argv[4]); vector<int> ps = parseIntList(argv[5]); int np = ps.size();
    struct Job { int a, b, d, q; }; vector<Job> jobs;
    for (int a = 0; a < np; a++) for (int b = a + 1; b < np; b++) for (int d = 0; d < nd; d++) for (int q = 0; q < seeds; q++) jobs.push_back({a, b, d, q});
    vector<double> sc(jobs.size());
    parFor((int)jobs.size(), [&](int k) {
      const Job& J = jobs[k]; const Deck& dk = D[(J.d * 7919) % D.size()]; bool sw = J.q & 1;
      Seat sa = seatOf(ps[J.a]), sb = seatOf(ps[J.b]); uint64_t seed = 1000 + k * 7ULL;
      Result r = sw ? playSeats(dk, dk, sb, sa, seed, nullptr) : playSeats(dk, dk, sa, sb, seed, nullptr);
      sc[k] = r.winner < 0 ? 0.5 : ((r.winner == 0) == !sw ? 1.0 : 0.0);
    });
    vector<vector<double>> W(np, vector<double>(np, 0.0)), N(np, vector<double>(np, 0.0));
    for (size_t k = 0; k < jobs.size(); k++) { int a = jobs[k].a, b = jobs[k].b; W[a][b] += sc[k]; N[a][b] += 1; W[b][a] += 1 - sc[k]; N[b][a] += 1; }
    printf("mirror round robin, %d decks x %d seeds x 2 seatings\n      ", nd, seeds);
    for (int b = 0; b < np; b++) printf("   p%-2d", ps[b]); printf("   mean\n");
    for (int a = 0; a < np; a++) {
      printf("p%-2d  ", ps[a]); double s = 0, n = 0;
      for (int b = 0; b < np; b++) { if (a == b) { printf("   -  "); continue; } printf("%5.1f ", 100 * W[a][b] / N[a][b]); s += W[a][b]; n += N[a][b]; }
      printf("  %5.1f\n", n > 0 ? 100 * s / n : 0.0);
    }
    return true;
  }

  if (mode == "gen" && argc >= 7) {
    vector<Deck> D = readDecks(argv[2]); int games = atoi(argv[3]); TEACH = atoi(argv[4]); string out = argv[5]; uint64_t seed0 = atoll(argv[6]);
    chunkedRun(out, games, 100, [&](int gi, vector<Sample>& buf) {
      Rng r(seed0 + gi * 7919ULL + 17); const Deck& a = D[r.below((int)D.size())]; const Deck& b = D[r.below((int)D.size())];
      uint64_t seed = seed0 * 31 + gi * 1000003ULL + 5;
      Seat t = seatOf(TEACH); t.rec = true;
      if (r.uni() < 0.6) playSeats(a, b, t, t, seed, &buf);
      else playSeats(a, b, t, seatOf(r.below(3)), seed, &buf);
    });
    printf("placement mapping error: mean %.2f tiles, over 2 tiles %.1f%% (n=%.0f)\n", MAP_ERR_SUM / max(1.0, MAP_ERR_N), 100 * MAP_ERR_FAR / max(1.0, MAP_ERR_N), MAP_ERR_N);
    return true;
  }

  if (mode == "gennet" && argc >= 8) {
    vector<Deck> D = readDecks(argv[3]); int games = atoi(argv[4]); TEACH = atoi(argv[5]); string out = argv[6]; uint64_t seed0 = atoll(argv[7]);
    vector<float> th = loadTheta(argv[2]); float eps = getenv("CR_EPS") ? (float)atof(getenv("CR_EPS")) : 0.0f;
    chunkedRun(out, games, 50, [&](int gi, vector<Sample>& buf) {
      Rng r(seed0 + gi * 7919ULL + 29); const Deck& a = D[r.below((int)D.size())]; const Deck& b = D[r.below((int)D.size())];
      uint64_t seed = seed0 * 37 + gi * 1000003ULL + 11;
      Seat s; s.kind = 2; s.th = th.data(); s.pol = TEACH; s.rec = true; s.eps = eps;
      playSeats(a, b, s, s, seed, &buf);
    });
    return true;
  }

  if (mode == "train" && argc >= 7) {
    int epochs = atoi(argv[3]); float lr = (float)atof(argv[4]); string init = argv[5];
    vector<Sample> D; for (int i = 6; i < argc; i++) { vector<Sample> part = loadSamples(argv[i]); D.insert(D.end(), part.begin(), part.end()); }
    printf("samples %zu\n", D.size()); fflush(stdout);
    vector<float> th = init == "-" ? randomTheta(7) : loadTheta(init);
    trainNet(th, D, epochs, lr, 12345);
    saveTheta(th, argv[2]); printf("saved %s\n", argv[2]);
    return true;
  }

  if (mode == "match" && argc >= 9) {
    Seat A = parseSeat(argv[2]), B = parseSeat(argv[3]); vector<Deck> D = readDecks(argv[4]);
    int npairs = atoi(argv[5]), games = atoi(argv[6]), mirror = atoi(argv[7]); uint64_t seed = atoll(argv[8]);
    int N = npairs * games; vector<double> sc(N), ms(N);
    parFor(N, [&](int k) {
      int pidx = k / games, q = k % games; Rng r(seed + pidx * 2654435761ULL);
      const Deck& da = D[r.below((int)D.size())]; const Deck& db = mirror ? da : D[r.below((int)D.size())];
      bool sw = q & 1; uint64_t sd = seed + k * 97ULL + 3;
      auto t0 = chrono::steady_clock::now();
      Result res = sw ? playSeats(db, da, B, A, sd, nullptr) : playSeats(da, db, A, B, sd, nullptr);
      ms[k] = chrono::duration<double, milli>(chrono::steady_clock::now() - t0).count();
      sc[k] = res.winner < 0 ? 0.5 : ((res.winner == 0) == !sw ? 1.0 : 0.0);
    });
    double m = 0, t = 0; for (int k = 0; k < N; k++) { m += sc[k]; t += ms[k]; } m /= N; t /= N;
    printf("A=%s B=%s  A win %.2f%%  se %.2f  games %d  ms/game %.1f\n", argv[2], argv[3], 100 * m, 100 * sqrt(m * (1 - m) / N), N, t);
    return true;
  }

  if (mode == "deckscore" && argc >= 7) {
    Seat A = parseSeat(argv[2]); vector<Deck> D = readDecks(argv[3]); int nOpp = atoi(argv[4]), games = atoi(argv[5]); uint64_t seed = atoll(argv[6]);
    int n = D.size(); vector<double> wr(n);
    parFor(n, [&](int i) {
      double w = 0, c = 0;
      for (int o = 0; o < nOpp; o++) { if (o == i) continue;
        for (int q = 0; q < games; q++) { bool sw = q & 1; uint64_t sd = seed + i * 100003ULL + o * 1009ULL + q;
          Result r = sw ? playSeats(D[o], D[i], A, A, sd, nullptr) : playSeats(D[i], D[o], A, A, sd, nullptr);
          w += r.winner < 0 ? 0.5 : ((r.winner == (sw ? 1 : 0)) ? 1.0 : 0.0); c += 1; } }
      wr[i] = c > 0 ? w / c : 0.5;
    });
    for (int i = 0; i < n; i++) printf("%d %.4f %.3f\n", i + 1, wr[i], deckCost(D[i]));
    return true;
  }
  return false;
}

// ---- widen: a net trained on the 70 base features gets zero weights for the 16 lane features (identical behaviour)
static vector<float> widenTheta(const vector<float>& old) {
  const int NOLD = NIN;
  const size_t oldN = (size_t)NOLD * SH + SH + NCARD * SH + SH * SOUT + SOUT;
  if (old.size() != oldN) { fprintf(stderr, "unexpected net size %zu, want %zu\n", old.size(), oldN); exit(1); }
  vector<float> th(NPAR, 0.0f); const float* o = old.data();
  for (int k = 0; k < NOLD * SH; k++) th[k] = o[k];
  const int ob1 = NOLD * SH, oE = ob1 + SH, oW2 = oE + NCARD * SH, oB2 = oW2 + SH * SOUT;
  for (int j = 0; j < SH; j++) th[OB1 + j] = o[ob1 + j];
  for (int k = 0; k < NCARD * SH; k++) th[OE + k] = o[oE + k];
  for (int k = 0; k < SH * SOUT; k++) th[OW2 + k] = o[oW2 + k];
  for (int q = 0; q < SOUT; q++) th[OB2 + q] = o[oB2 + q];
  return th;
}

// ---- evolution strategies: maximise the student's win rate against one policy directly
static double playWin(const float* th, const Deck& me, const Deck& op, bool meSeat0, int opp, uint64_t seed) {
  Seat cs; cs.kind = 2; cs.th = th; cs.pol = TEACH; Seat os = seatOf(opp);
  Result r = meSeat0 ? playSeats(me, op, cs, os, seed, nullptr) : playSeats(op, me, os, cs, seed, nullptr);
  if (r.winner < 0) return 0.5;
  return r.winner == (meSeat0 ? 0 : 1) ? 1.0 : 0.0;
}

static double evalWin(const float* th, int opp, const vector<Deck>& D, int n, uint64_t seed) {
  vector<double> w(n);
  parFor(n, [&](int q) {
    Rng r(seed + q * 7919ULL); const Deck& a = D[r.below((int)D.size())]; const Deck& b = D[r.below((int)D.size())];
    w[q] = playWin(th, a, b, (q & 1) == 0, opp, seed * 31 + q);
  });
  double s = 0; for (double x : w) s += x; return s / max(1, n);
}

static bool esMode(int argc, char** argv) {
  string mode = argv[1];
  if (mode == "widen" && argc >= 4) {
    FILE* fp = fopen(argv[2], "rb"); if (!fp) { fprintf(stderr, "cannot open %s\n", argv[2]); exit(1); }
    fseek(fp, 0, SEEK_END); long n = ftell(fp) / (long)sizeof(float); fseek(fp, 0, SEEK_SET);
    vector<float> old(n); size_t got = fread(old.data(), sizeof(float), n, fp); fclose(fp); (void)got;
    saveTheta(widenTheta(old), argv[3]); printf("widened %s (%ld floats) -> %s\n", argv[2], n, argv[3]); return true;
  }
  if (mode != "esfine" || argc < 9) return false;
  vector<float> th = loadTheta(argv[2]); string out = argv[3];
  int gens = atoi(argv[4]), pop = atoi(argv[5]), games = atoi(argv[6]); float sigma = (float)atof(argv[7]), lr = (float)atof(argv[8]);
  uint64_t seed = argc > 9 ? atoll(argv[9]) : 1;
  int opp = getenv("CR_OPP") ? atoi(getenv("CR_OPP")) : 4;
  vector<Deck> D = readDecks("results/random_decks_valid.txt");
  Rng rng(seed); const int H = pop / 2;
  for (int g = 0; g < gens; g++) {
    vector<vector<float>> eps(H);
    for (int i = 0; i < H; i++) eps[i] = gauss(rng, NPAR);
    vector<vector<float>> cand(pop, vector<float>(NPAR));
    for (int i = 0; i < H; i++) for (int k = 0; k < NPAR; k++) { cand[2 * i][k] = th[k] + sigma * eps[i][k]; cand[2 * i + 1][k] = th[k] - sigma * eps[i][k]; }
    vector<pair<int, int>> pairs(games / 2);
    for (auto& pr : pairs) pr = {rng.below((int)D.size()), rng.below((int)D.size())};
    const uint64_t gseed = seed * 1000003ULL + g * 7919ULL;
    vector<double> fit(pop, 0.0);
    parFor(pop, [&](int c) {
      double w = 0;
      for (int q = 0; q < games; q++) { const auto& pr = pairs[q / 2]; w += playWin(cand[c].data(), D[pr.first], D[pr.second], (q & 1) == 0, opp, gseed + q * 131ULL); }
      fit[c] = w / games;
    });
    vector<int> order(pop); for (int i = 0; i < pop; i++) order[i] = i;
    sort(order.begin(), order.end(), [&](int a, int b) { return fit[a] < fit[b]; });
    vector<double> u(pop); for (int r = 0; r < pop; r++) u[order[r]] = (double)r / (pop - 1) - 0.5;
    vector<float> grad(NPAR, 0.0f);
    for (int i = 0; i < H; i++) { float d = (float)(u[2 * i] - u[2 * i + 1]); for (int k = 0; k < NPAR; k++) grad[k] += d * eps[i][k]; }
    for (int k = 0; k < NPAR; k++) th[k] += lr * grad[k] / (H * sigma);
    double mean = 0, mx = 0; for (double f : fit) { mean += f; mx = max(mx, f); } mean /= pop;
    printf("gen %d  mean fitness %.3f  max %.3f\n", g + 1, mean, mx);
    if ((g + 1) % 5 == 0 || g + 1 == gens) printf("  theta vs p%d (200 games, held-out seeds): %.2f%%\n", opp, 100 * evalWin(th.data(), opp, D, 200, seed * 77 + g));
    saveTheta(th, out); fflush(stdout);
  }
  return true;
}
