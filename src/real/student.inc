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
static const int SH = 64, SSLOT = NSLOT, SPL = NPLACE, SOUT = NSLOT + 4 * NPLACE, NCARD = CARD_ID_COUNT;
static const int OB1 = NIN * SH, OE = OB1 + SH, OW2 = OE + NCARD * SH, OB2 = OW2 + SH * SOUT, NPAR = OB2 + SOUT;

struct Dec { int slot = -1; float x = 0, y = 0; };
struct Sample { float f[NIN]; int hand[4]; int mask; int slot; int place; };
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
  for (int i = 0; i < NIN; i++) { float x = in[i]; const float* w = th + i * SH; for (int j = 0; j < SH; j++) a[j] += x * w[j]; }
  for (int s = 0; s < 4; s++) if (hc[s] >= 0) { const float* e = th + OE + hc[s] * SH; for (int j = 0; j < SH; j++) a[j] += e[j]; }
  for (int j = 0; j < SH; j++) h[j] = tanhf(a[j]);
  for (int q = 0; q < SOUT; q++) o[q] = th[OB2 + q];
  for (int j = 0; j < SH; j++) { const float* w = th + OW2 + j * SOUT; float hj = h[j]; for (int q = 0; q < SOUT; q++) o[q] += hj * w[q]; }
}

static float TAU = 0.0f;
static Dec netDecide(GameManager& g, Player& P, const float* th) {
  float in[NIN], h[SH], o[SOUT]; int hc[4]; features(g, P, in); handIds(g, P.team, hc); fwd(th, in, hc, h, o);
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

static Sample makeSample(GameManager& g, Player& P, const Dec& d) {
  Sample s{}; features(g, P, s.f); handIds(g, P.team, s.hand); s.mask = maskOf(g, P.team);
  s.slot = d.slot < 0 ? SSLOT - 1 : d.slot; s.place = 0;
  if (d.slot >= 0) {
    vector<pair<float, float>> pl; placements(g, P, d.slot, pl); float best = 1e30f;
    for (int p = 0; p < SPL; p++) { float dx = pl[p].first - d.x, dy = pl[p].second - d.y, dd = dx * dx + dy * dy; if (dd < best) { best = dd; s.place = p; } }
  }
  return s;
}

static void playDec(GameManager& g, int t, const Dec& d) { if (d.slot >= 0) { int cid = g.getHand(t)[d.slot]; g.playCard(t, cid, d.x, d.y); } }

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

static void sampleLoss(const float* th, const Sample& s, float* gr, double& ls, double& lp, bool& okS, bool& okP) {
  float in[NIN], h[SH], o[SOUT], go[SOUT]; int hc[4];
  for (int i = 0; i < NIN; i++) in[i] = s.f[i];
  for (int k = 0; k < 4; k++) hc[k] = s.hand[k];
  fwd(th, in, hc, h, o);
  for (int q = 0; q < SOUT; q++) go[q] = 0;
  float mx = -1e30f; int am = -1;
  for (int q = 0; q < SSLOT; q++) if ((s.mask >> q) & 1) { if (am < 0 || o[q] > o[am]) am = q; mx = max(mx, o[q]); }
  float p[SSLOT]; double z = 0;
  for (int q = 0; q < SSLOT; q++) { p[q] = ((s.mask >> q) & 1) ? expf(o[q] - mx) : 0.0f; z += p[q]; }
  for (int q = 0; q < SSLOT; q++) { p[q] = (float)(p[q] / z); go[q] = p[q] - (q == s.slot ? 1.0f : 0.0f); }
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
  for (int i = 0; i < NIN; i++) { float x = in[i]; float* g1 = gr + i * SH; for (int j = 0; j < SH; j++) g1[j] += x * ga[j]; }
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
  fill(0, OB1, sqrtf(6.0f / (NIN + SH))); fill(OE, OW2, 0.1f); fill(OW2, OB2, sqrtf(6.0f / (SH + SOUT)));
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
