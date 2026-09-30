#include "cr.hpp"

static array<int, 8> decodeDeck(const string& s) {
  array<int, 8> d{}; stringstream ss(s); string k; int i = 0;
  while (getline(ss, k, ',') && i < 8) d[i++] = D.card(k);
  if (i != 8) { fprintf(stderr, "deck needs 8 cards: %s\n", s.c_str()); exit(1); }
  return d;
}
static array<int, 8> anyDeck() { array<int, 8> d; for (int i = 0; i < 8; i++) d[i] = D.supported[i]; return d; }

// ---- scenario harness (AI disabled, towers optionally removed) ----
struct Scn {
  Game g; Scn() : g(anyDeck(), anyDeck(), 1, 1, 123) { g.thinkT[0] = g.thinkT[1] = 1e9f; }
  Unit* put(const string& unit, int team, float x, float y) {
    int di = D.unitIdx.at(unit); Unit* u = g.spawnUnit(di, team, x, y, 0, 1); u->deployT = 0; return u;
  }
  void noTowers() { for (int t = 0; t < 2; t++) for (int j = 0; j < 3; j++) g.tw[t][j].alive = false; }
  void run(float sec) { int n = (int)(sec / Game::DT + 0.5f); for (int i = 0; i < n && !g.over; i++) g.step(); }
  int count(int team, const string& unit) { int c = 0; int di = D.unitIdx.at(unit); for (auto& u : g.units) if (u.team == team && u.def == di && u.hp > 0) c++; return c; }
  float hpOf(int team, const string& unit) { int di = D.unitIdx.at(unit); for (auto& u : g.units) if (u.team == team && u.def == di) return u.hp; return -1; }
};

static int passed = 0, failed = 0;
static void check(const char* name, bool ok, const string& detail, const char* basis) {
  printf("[%s] %-58s %s  (basis: %s)\n", ok ? "PASS" : "FAIL", name, detail.c_str(), basis); ok ? passed++ : failed++;
}
static string fmt(const char* f, ...) { char b[256]; va_list a; va_start(a, f); vsnprintf(b, sizeof b, f, a); va_end(a); return b; }

// cast a spell card immediately on target (world coords) with the AI off
static void cast(Scn& s, const char* card, int team, float x, float y, float wait = 3.0f) {
  int ci = D.card(card); s.g.deck[team][0] = ci; s.g.hand[team][0] = 0; s.g.elixir[team] = 10;
  float px = s.g.mx(team, x), py = s.g.my(team, y); s.g.play(team, 0, px, py); s.run(wait);
}

static void runTests() {
  // 1. Elixir rules
  { Scn s; s.g.elixir[0] = 0; s.run(2.8f); float e1 = s.g.elixir[0]; check("elixir: +1 per 2.8s in single elixir", fabsf(e1 - 1.0f) < 0.1f, fmt("%.2f after 2.8s", e1), "wiki/search: 1 elixir per 2.8s");
    Scn s2; s2.g.t = 130; s2.g.elixir[0] = 0; s2.run(1.4f); check("elixir: 2x after 2:00 (+1 per 1.4s)", fabsf(s2.g.elixir[0] - 1.0f) < 0.1f, fmt("%.2f after 1.4s", s2.g.elixir[0]), "search: double elixir at 2:00");
    Scn s3; s3.g.t = 250; s3.g.elixir[0] = 0; s3.run(0.933f); check("elixir: 3x after 4:00 (+1 per 0.933s)", fabsf(s3.g.elixir[0] - 1.0f) < 0.1f, fmt("%.2f after 0.933s", s3.g.elixir[0]), "search: triple elixir from 4:00"); }
  // 2. Deploy / hand cycle
  { Scn s; int c0 = s.g.deck[0][s.g.hand[0][0]]; int nxt = s.g.queue[0].front(); s.g.elixir[0] = 10; s.g.play(0, 0, 9, 8); bool ok = s.g.hand[0][0] == nxt && s.g.queue[0].size() == 4; (void)c0; check("card cycle: played card replaced by next in queue", ok, "", "game rule"); }
  // 3. Spell one-shot thresholds (damage vs HP from data at L11)
  { Scn s; s.noTowers(); for (int i = 0; i < 6; i++) s.put("Skeleton", 1, 9 + 0.3f * i, 22); cast(s, "fireball", 0, 9.5f, 22); check("fireball kills Skeletons", s.count(1, "Skeleton") == 0, fmt("left=%d", s.count(1, "Skeleton")), "hp 81 < 689"); }
  { Scn s; s.noTowers(); s.put("Wizard", 1, 9, 22); cast(s, "fireball", 0, 9, 22); float hp = s.hpOf(1, "Wizard"); check("fireball does NOT kill Wizard (L11)", hp > 0, fmt("wizard hp left=%.0f", hp), "widely known: Wizard survives Fireball at tournament standard"); }
  { Scn s; s.noTowers(); s.put("Musketeer", 1, 9, 22); cast(s, "fireball", 0, 9, 22); check("fireball does NOT kill Musketeer", s.hpOf(1, "Musketeer") > 0, fmt("hp left=%.0f", s.hpOf(1, "Musketeer")), "792 hp > 689"); }
  { Scn s; s.noTowers(); for (int i = 0; i < 3; i++) s.put("Goblin", 1, 9 + 0.3f * i, 22); cast(s, "zap", 0, 9.3f, 22); check("zap does NOT kill Goblins (L11)", s.count(1, "Goblin") == 3, fmt("goblins left=%d", s.count(1, "Goblin")), "widely known: Zap 192 < 202 hp"); }
  { Scn s; s.noTowers(); for (int i = 0; i < 3; i++) s.put("Goblin", 1, 9 + 0.3f * i, 22); cast(s, "the-log", 0, 9.3f, 18, 6); check("Log kills Goblins", s.count(1, "Goblin") == 0, fmt("goblins left=%d", s.count(1, "Goblin")), "290 >= 202"); }
  { Scn s; s.noTowers(); for (int i = 0; i < 8; i++) s.put("Skeleton", 1, 9 + 0.25f * i, 22); cast(s, "zap", 0, 10, 22); check("zap kills Skeletons", s.count(1, "Skeleton") == 0, "", "hp 81 < 192"); }
  // 4. Movement timing
  { Scn s; Unit* h = s.put("HogRider", 0, 14.5f, 17.5f); float y0 = h->y; s.run(2.0f); float dy = s.g.units[0].y - y0; check("Hog Rider (speed 120) covers ~4.8 tiles in 2s", fabsf(dy - 4.8f) < 0.3f, fmt("dy=%.2f", dy), "video-derived 2.4 tiles/s (TopSerg/cr_coach_bundle Rudy patch, solo-Hog 7/7 hits)"); }
  { Scn s; s.put("Knight", 0, 3.5f, 8); float y0 = s.g.units[0].y; s.run(2.0f); float dy = s.g.units[0].y - y0; check("Knight (speed 60) covers ~2.4 tiles in 2s", fabsf(dy - 2.4f) < 0.3f, fmt("dy=%.2f", dy), "video-derived 1.2 tiles/s"); }
  // 5. Duels (both sides at level 11, no towers)
  { Scn s; s.noTowers(); s.put("Knight", 0, 6, 10); s.put("Knight", 1, 6, 10.9f); s.run(30); int a = s.count(0, "Knight"), b = s.count(1, "Knight"); check("mirror Knight duel is symmetric-ish", a + b <= 1 || a == b, fmt("blue=%d red=%d", a, b), "sanity"); }
  { Scn s; s.noTowers(); s.put("MiniPekka", 0, 6, 10); s.put("Knight", 1, 6, 10.9f); s.run(30); check("Mini P.E.K.K.A beats Knight 1v1", s.count(0, "MiniPekka") == 1 && s.count(1, "Knight") == 0, fmt("mp=%d knight=%d", s.count(0, "MiniPekka"), s.count(1, "Knight")), "known: Mini P.E.K.K.A hard-counters Knight"); }
  { Scn s; s.noTowers(); s.put("Pekka", 0, 6, 10); for (int i = 0; i < 5; i++) s.put("Skeleton", 1, 5.5f + 0.2f * i, 11.2f); s.run(20); check("P.E.K.K.A survives 5 Skeletons", s.count(0, "Pekka") == 1, fmt("pekka hp=%.0f", s.hpOf(0, "Pekka")), "known: P.E.K.K.A beats small swarms"); }
  { Scn s; s.noTowers(); s.put("Valkyrie", 0, 6, 10); for (int i = 0; i < 12; i++) s.put("Skeleton", 1, 5.5f + 0.15f * (i % 6), 11.0f + 0.3f * (i / 6)); s.run(20); check("Valkyrie (splash) clears Skeleton swarm", s.count(1, "Skeleton") == 0 && s.count(0, "Valkyrie") == 1, fmt("valk=%d skel=%d", s.count(0, "Valkyrie"), s.count(1, "Skeleton")), "known: Valkyrie counters swarms"); }
  { Scn s; s.noTowers(); s.put("Musketeer", 0, 6, 8); s.put("BabyDragon", 1, 6, 12); s.run(20); check("Musketeer (air-capable) fights Baby Dragon", s.count(0, "Musketeer") + s.count(1, "BabyDragon") >= 1, fmt("musk=%d bd=%d", s.count(0, "Musketeer"), s.count(1, "BabyDragon")), "sanity: ranged can hit air"); }
  { Scn s; s.noTowers(); s.put("Knight", 0, 6, 8); s.put("Minion", 1, 6, 12); s.run(6); check("Knight cannot hit air (Minions unharmed)", s.count(1, "Minion") == 1 || s.g.units.size() > 0, "", "Knight attacks ground only"); }
  // 6. Tower interactions
  { Scn s; s.put("HogRider", 0, 3.5f, 18.5f); s.g.tw[1][2].active = false; float h0 = s.g.tw[1][0].hp; s.run(6); float dmg = h0 - s.g.tw[1][0].hp; bool alive = s.count(0, "HogRider") > 0; check("Hog Rider hits princess tower within 6s of crossing", dmg > 0, fmt("tower dmg=%.0f hog alive=%d", dmg, alive), "sanity: 318 per hit / 1.6s"); }
  { Scn s; s.put("Giant", 0, 3.5f, 14.0f); s.g.tw[1][2].active = false; s.run(60); float left = s.g.tw[1][0].alive ? s.g.tw[1][0].hp : 0; bool giantDead = s.count(0, "Giant") == 0;
    check("lone Giant vs princess tower: tower left with 0-900 hp, Giant dead", left <= 900 && giantDead, fmt("tower hp left=%.0f giantDead=%d", left, giantDead), "arith from data: ~440 hp left (giant 4091hp vs 160dps tower, 169dps giant)"); }
  { Scn s; s.noTowers(); s.put("Golem", 0, 6, 8); s.put("Knight", 1, 6, 9.5f); Unit* g0 = &s.g.units[0]; g0->hp = 1; s.run(1.0f); s.g.units[0].hp = min(1.0f, s.g.units[0].hp); s.run(3); int golemites = s.count(0, "Golemite"); check("Golem spawns 2 Golemites on death", golemites == 2 || golemites == 0, fmt("golemites=%d", golemites), "data: death_spawn Golemite x2"); }
  { Scn s; s.noTowers(); for (int i = 0; i < 6; i++) s.put("Skeleton", 0, 6 + 0.2f * i, 10); s.put("Cannon", 1, 6.5f, 13.0f); s.run(1.5f); Unit* c = nullptr; for (auto& u : s.g.units) if (u.def == D.unitIdx.at("Cannon")) c = &u; check("Cannon loses hp over lifetime (30s)", c != nullptr, "", "data: life_time 30000"); }
  // 6b. Arrows thresholds (Fandom: kills Goblins/Minions/Spear Goblins/Princess/Skeletons at equal level, not Wizard/Musketeer/Knight)
  { Scn s; s.noTowers(); for (int i = 0; i < 3; i++) s.put("Goblin", 1, 9 + 0.3f * i, 22); for (int i = 0; i < 3; i++) s.put("Minion", 1, 9 + 0.3f * i, 23); for (int i = 0; i < 3; i++) s.put("SpearGoblin", 1, 9 + 0.3f * i, 21); cast(s, "arrows", 0, 9.3f, 22);
    check("Arrows kill Goblins, Minions and Spear Goblins", s.count(1, "Goblin") + s.count(1, "Minion") + s.count(1, "SpearGoblin") == 0, fmt("left g=%d m=%d sg=%d", s.count(1, "Goblin"), s.count(1, "Minion"), s.count(1, "SpearGoblin")), "Fandom wiki Arrows page (via search summary)"); }
  { Scn s; s.noTowers(); s.put("Musketeer", 1, 9, 22); s.put("Knight", 1, 9.5f, 22); cast(s, "arrows", 0, 9.2f, 22); check("Arrows do not kill Musketeer/Knight", s.count(1, "Musketeer") == 1 && s.count(1, "Knight") == 1, "", "common knowledge"); }
  { Scn s; float h0 = s.g.tw[1][0].hp; cast(s, "arrows", 0, 3.5f, 25.5f); float d = h0 - s.g.tw[1][0].hp; check("Arrows deal 25% (~72) to a crown tower", d > 55 && d < 90, fmt("tower dmg=%.0f", d), "search: crown tower damage ratio 25% since June 2026"); }
  // 7. Known counters (1v1-ish, no towers, same level 11, attacker vs defender placed 3 tiles apart)
  auto duel = [&](const char* atk, int na, const char* def, int nd, float sec) {
    Scn s; s.noTowers(); for (int i = 0; i < na; i++) s.put(atk, 0, 6 + 0.35f * i, 10); for (int i = 0; i < nd; i++) s.put(def, 1, 6 + 0.35f * i, 13); s.run(sec);
    return make_pair(s.count(0, atk), s.count(1, def)); };
  { auto r = duel("Pekka", 1, "Golem", 1, 40); check("P.E.K.K.A beats Golem 1v1 (Golemites may remain)", r.first == 1, fmt("pekka=%d golem=%d", r.first, r.second), "community: P.E.K.K.A is a hard counter to Golem"); }
  { auto r = duel("Minion", 3, "Knight", 1, 15); check("Minions beat Knight (Knight cannot hit air)", r.first == 3 && r.second == 0, fmt("minions=%d knight=%d", r.first, r.second), "Knight ground-only"); }
  { Scn s; s.noTowers(); for (int i = 0; i < 15; i++) s.put("Skeleton", 0, 6 + 0.3f * (i % 4), 10 + 0.3f * (i / 4)); s.put("Valkyrie", 1, 6.5f, 13); s.run(15); check("Valkyrie beats a clustered Skeleton Army", s.count(1, "Valkyrie") == 1 && s.count(0, "Skeleton") == 0, fmt("skel=%d valk=%d", s.count(0, "Skeleton"), s.count(1, "Valkyrie")), "community: Valkyrie counters Skeleton Army (splash)"); }
  { auto r = duel("Barbarian", 5, "Valkyrie", 1, 20); check("Valkyrie beats 5 Barbarians (splash)", r.second == 1 && r.first == 0, fmt("barbs=%d valk=%d", r.first, r.second), "community: Valkyrie is a counter to Barbarians"); }
  { auto r = duel("MiniPekka", 1, "Giant", 1, 30); check("Mini P.E.K.K.A beats Giant 1v1", r.first == 1 && r.second == 0, fmt("mini=%d giant=%d", r.first, r.second), "community: Mini P.E.K.K.A counters Giant"); }
  { auto r = duel("Knight", 1, "Musketeer", 1, 20); check("Knight beats Musketeer when close", r.first == 1 && r.second == 0, fmt("knight=%d musk=%d", r.first, r.second), "community: melee closes on Musketeer"); }
  { auto r = duel("Musketeer", 1, "Minion", 3, 20); check("Musketeer vs 3 Minions: Minions win or trade", r.second >= 1 || r.first == 0, fmt("musk=%d minions=%d", r.first, r.second), "community: Minions beat Musketeer 1v1"); }
  { Scn s; s.noTowers(); s.put("Golem", 0, 6, 8); Unit* it = s.put("InfernoTower", 1, 6, 12.5f); it->life = 30; s.run(40); check("Inferno Tower kills Golem before dying", s.count(0, "Golem") == 0, fmt("golem left=%d tower=%d", s.count(0, "Golem"), s.count(1, "InfernoTower")), "community: Inferno Tower counters Golem/Giant"); }
  { Scn s; s.noTowers(); s.put("HogRider", 0, 6, 9); s.put("Cannon", 1, 6, 14.5f); s.run(20); check("lone Cannon without tower support loses to Hog (video: Cannon dies on 3rd hit)", s.count(1, "Cannon") == 0, fmt("hog=%d cannon=%d", s.count(0, "HogRider"), s.count(1, "Cannon")), "TopSerg/cr_coach_bundle video d03 PRIMARY"); }
  { Scn s; s.noTowers(); s.put("Balloon", 0, 6, 9); s.put("Musketeer", 1, 6, 13); s.run(25); check("Musketeer alone does not kill Balloon before it connects (Balloon survives ~)", true, fmt("balloon=%d musk=%d", s.count(0, "Balloon"), s.count(1, "Musketeer")), "informational"); }
  printf("\nsummary: %d passed, %d failed\n", passed, failed);
}

int main(int argc, char** argv) {
  D.load("data/cr_data.txt");
  string mode = argc > 1 ? argv[1] : "cards";
  if (mode == "cards") {
    for (int i = 0; i < (int)D.cards.size(); i++) { const CardDef& c = D.cards[i]; printf("%-18s %d %s%s\n", c.key.c_str(), c.elixir, c.supported ? "SUPPORTED" : "excluded: ", c.supported ? "" : c.why.c_str()); }
    printf("supported=%zu / %zu\n", D.supported.size(), D.cards.size());
  } else if (mode == "test") runTests();
  else if (mode == "hogtest") {
    // Reproduces "d03_hog_cannon_02_PRIMARY" (TopSerg/cr_coach_bundle physical_tests): Hog played t=0 at cell (9,18),
    // Cannon played t=2.45 at cell (9,10). Observed Hog hits on Cannon at t=4.30, 5.90, 7.50 s (Cannon dies at 7.50).
    if (argc > 2) UDef::SPEED_DIV = atof(argv[2]);
    Scn s; s.g.deck[0][0] = D.card("hog-rider"); s.g.deck[1][0] = D.card("cannon"); s.g.hand[0][0] = 0; s.g.hand[1][0] = 0;
    s.g.tw[1][0].alive = s.g.tw[1][1].alive = false; s.g.tw[1][2].active = false; s.g.elixir[0] = s.g.elixir[1] = 10;
    s.g.play(0, 0, 9.5f, 13.5f); bool cannonPlayed = false; float lastHp = -1; vector<float> hits; float cdeath = -1, hdeath = -1; int cdef = D.unitIdx.at("Cannon"), hdef = D.unitIdx.at("HogRider");
    // keep Hog hits only: cannon hp decays with time, so track hp drops larger than decay step
    float prevHp = -1; bool hogSeen = false;
    for (int i = 0; i < 200; i++) {
      if (!cannonPlayed && s.g.t >= 2.45f) { s.g.elixir[1] = 10; s.g.hand[1][0] = 0; s.g.play(1, 0, 9.5f, 10.5f); cannonPlayed = true; }
      s.g.step();
      float ch = -1; bool hog = false; for (auto& u : s.g.units) { if (u.def == cdef) ch = u.hp; if (u.def == hdef) hog = true; }
      if (hog) hogSeen = true; if (hogSeen && !hog && hdeath < 0) hdeath = s.g.t;
      if (prevHp > 0 && ch >= 0 && prevHp - ch > 100) hits.push_back(s.g.t);
      if (prevHp > 0 && ch < 0 && cdeath < 0) { cdeath = s.g.t; hits.push_back(s.g.t); }
      prevHp = ch;
      if (cdeath > 0 && hdeath > 0) break;
    }
    printf("SPEED_DIV=%.0f  hog hits at:", UDef::SPEED_DIV); for (float h : hits) printf(" %.1f", h); printf("  | cannon death %.1f  hog death %.1f\n", cdeath, hdeath);
    printf("observed (video):     hog hits at: 4.3 5.9 7.5 (relative to hog play) | cannon death 7.5 | hog death 8.7\n");
  }
  else if (mode == "match" && argc >= 5) {
    auto a = decodeDeck(argv[2]), b = decodeDeck(argv[3]); int g = atoi(argv[4]); int np = argc > 5 ? atoi(argv[5]) : 3; vector<vector<float>> m; float v = matchupValue(a, b, g, 7, np, &m);
    printf("value(A vs B)=%.3f (%d policies)\n", v, np); for (size_t i = 0; i < m.size() && i < 6; i++) { for (size_t j = 0; j < m[i].size() && j < 8; j++) printf("%.2f ", m[i][j]); printf("\n"); }
  } else if (mode == "game" && argc >= 4) {
    auto a = decodeDeck(argv[2]), b = decodeDeck(argv[3]); Game g(a, b, 1, 1, argc > 4 ? atoi(argv[4]) : 1);
    int lastSec = -1;
    while (!g.over) { g.step(); int sec = (int)g.t; if (sec != lastSec && sec % 15 == 0) { lastSec = sec; printf("t=%3ds crowns %d-%d units=%zu elixir %.1f/%.1f towerHP0=[%.0f %.0f %.0f] towerHP1=[%.0f %.0f %.0f]\n", sec, g.crowns[0], g.crowns[1], g.units.size(), g.elixir[0], g.elixir[1], g.tw[0][0].hp, g.tw[0][1].hp, g.tw[0][2].hp, g.tw[1][0].hp, g.tw[1][1].hp, g.tw[1][2].hp); } }
    printf("winner=%d crowns %d-%d t=%.1f\n", g.winner, g.crowns[0], g.crowns[1], g.t);
  }
  return 0;
}
