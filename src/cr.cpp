#include "cr.hpp"

Data D;
float UDef::SPEED_DIV = 50.0f;
vector<Policy> POLICIES = {
    {0.9f, 9.0f, 0.4f, 5.0f},  // 0: turtle / counter-push
    {0.8f, 6.0f, 0.7f, 4.0f},  // 1: balanced
    {1.2f, 4.0f, 1.0f, 3.0f},  // 2: aggressive
};
void initPolicies() {  // extend to a 24-policy family (first three stay the hand-picked ones)
  if (POLICIES.size() > 3) return;
  for (float react : {0.6f, 1.4f}) for (float att : {4.0f, 6.5f, 9.0f}) for (float sp : {0.3f, 1.0f}) for (float sup : {3.0f, 5.0f}) POLICIES.push_back({react, att, sp, sup});
}

// ---------------------------------------------------------------- loader
static vector<string> splitWs(const string& s) {
  vector<string> r; string cur; for (char ch : s) { if (ch == ' ') { if (!cur.empty()) { r.push_back(cur); cur.clear(); } } else cur += ch; }
  if (!cur.empty()) r.push_back(cur); return r;
}
typedef unordered_map<string, string> KV;
static KV parseKV(const vector<string>& tok, size_t from) {
  KV kv; for (size_t i = from; i < tok.size(); i++) { auto p = tok[i].find('='); if (p == string::npos) continue; kv[tok[i].substr(0, p)] = tok[i].substr(p + 1); } return kv;
}
static float F(const KV& kv, const char* k, float def = 0) { auto it = kv.find(k); if (it == kv.end() || it->second == "-" || it->second == "None") return def; return strtof(it->second.c_str(), nullptr); }
static string S(const KV& kv, const char* k) { auto it = kv.find(k); return it == kv.end() ? "-" : it->second; }

static const set<string> EXCL_CARDS = {
    // (goblin-drill / royal-delivery / tesla are modelled in simplified form)
    // champions / abilities / heavy special mechanics that are not modelled
    "skeleton-king", "golden-knight", "archer-queen", "monk", "mighty-miner", "little-prince", "boss-bandit",
    "santa-hog-rider", "terry", "raging-prince", "phoenix", "fisherman", "ram-rider", "royal-ghost", "elixir-golem",
    "battle-healer", "mother-witch", "heal-spirit", "mirror", "party-rocket",
    "clone", "tornado", "earthquake", "graveyard", "party-hut", "goblin-cage", "cannon-cart", "lumberjack", "bandit",
    "goblin-giant", "rage", "freeze", "electro-dragon", "electro-giant", "super-witch", "super-lava-hound",
    "super-magic-archer", "super-ice-golem", "super-archers", "super-mini-pekka", "mega-knight", "electro-spirit",
    "skeleton-dragons", "bowler", "sparky", "executioner", "wall-breakers", "ice-golem", "royal-recruits", "guards",
    "dark-prince", "prince", "giant-skeleton", "balloon", "lava-hound", "three-musketeers"};

// Cards temporarily excluded ONLY if their mechanic is not implemented is handled in this table; the remaining
// entries above marked "modelled" are re-enabled below.
static const set<string> REENABLE = {"mega-knight", "balloon", "lava-hound", "giant-skeleton", "prince", "dark-prince", "guards",
                                       "three-musketeers", "royal-recruits", "bowler", "sparky", "executioner", "wall-breakers",
                                       "electro-dragon", "skeleton-dragons", "ice-golem", "electro-spirit"};

void Data::load(const string& path) {
  ifstream f(path); if (!f) { fprintf(stderr, "cannot open %s\n", path.c_str()); exit(1); }
  string line; vector<pair<string, KV>> ulines, klines;
  while (getline(f, line)) {
    if (line.empty() || line[0] == '#') continue;
    auto tok = splitWs(line); if (tok.size() < 2) continue;
    if (tok[0] == "U") ulines.push_back({tok[1], parseKV(tok, 2)});
    else if (tok[0] == "K") klines.push_back({tok[1], parseKV(tok, 2)});
    else if (tok[0] == "B") { auto kv = parseKV(tok, 2); BuffDef b; b.name = tok[1]; b.hsm = F(kv, "hsm"); b.spm = F(kv, "spm"); b.dps = F(kv, "dps"); b.freq = F(kv, "freq") / 1000; b.ctp = F(kv, "ctp"); buffs[b.name] = b; }
  }
  for (auto& ul : ulines) {
    const KV& k = ul.second; UDef d; d.name = ul.first; d.building = S(k, "kind") == "building";
    d.hp = F(k, "hp"); d.dmg = F(k, "dmg"); d.dmgs = F(k, "dmgs"); d.hit = F(k, "hit") / 1000; d.load = F(k, "load") / 1000;
    d.rng = F(k, "rng") / 1000; d.minrng = F(k, "minrng") / 1000; d.spd = F(k, "spd"); d.sight = F(k, "sight") / 1000;
    d.deploy = F(k, "deploy") / 1000; d.rad = F(k, "rad") / 1000; d.mass = F(k, "mass", 1);
    d.fly = F(k, "fly") > 0; d.air = F(k, "air") > 0; d.gnd = F(k, "gnd") > 0; d.bo = F(k, "bo") > 0; d.kami = F(k, "kami") > 0;
    d.life = F(k, "life") / 1000; d.aoe = F(k, "aoe") / 1000; d.ctp = F(k, "ctp"); d.mp = (int)F(k, "mp"); d.mt = (int)F(k, "mt");
    d.chg = F(k, "chg") / 1000; d.chgm = F(k, "chgm"); d.shield = F(k, "shield");
    d.spName = S(k, "sp_char"); d.spNum = (int)F(k, "sp_num"); d.spPause = F(k, "sp_pause") / 1000; d.spStart = F(k, "sp_start") / 1000;
    d.dsName = S(k, "ds_char"); d.dsNum = (int)F(k, "ds_num"); d.dd = F(k, "dd"); d.ddr = F(k, "ddr") / 1000;
    d.vd2 = F(k, "vd2"); d.vdt1 = F(k, "vdt1") / 1000; d.vd3 = F(k, "vd3"); d.vdt2 = F(k, "vdt2") / 1000; d.mana = F(k, "mana") / 1000;
    d.bod = S(k, "bod"); d.bodt = F(k, "bodt") / 1000; d.ability = F(k, "ability") > 0; d.hidden = F(k, "hidden") > 0;
    d.selfaoe = F(k, "selfaoe") > 0; d.jumpriver = F(k, "jumpriver") > 0;
    d.dashdmg = F(k, "dashdmg"); d.dashrad = F(k, "dashrad") / 1000; d.dashmin = F(k, "dashmin") / 1000; d.dashmax = F(k, "dashmax") / 1000; d.dashcd = F(k, "dashcd") / 1000;
    unitIdx[d.name] = (int)units.size(); units.push_back(d);
  }
  for (auto& d : units) {
    if (d.spName != "-" && unitIdx.count(d.spName)) d.spIdx = unitIdx[d.spName]; else d.spNum = 0;
    if (d.dsName != "-" && unitIdx.count(d.dsName)) d.dsIdx = unitIdx[d.dsName]; else d.dsNum = 0;
  }
  princess = unitIdx["PrincessTower"]; king = unitIdx["KingTower"];
  // Tower troops at tournament standard (level 11). The RoyaleAPI snapshot scales tower levels with a flat +10%/level,
  // which does not match the game (+8%/level up to L9, then +10%); use the values published for L11 instead
  // (Liquipedia via TopSerg/cr_coach_bundle tournament11_profile.json: princess 3052 hp / 109 dmg; king 4824 hp / 109 dmg).
  units[princess].hp = 3052; units[princess].dmg = 109; units[king].hp = 4824; units[king].dmg = 109;
  for (auto& kl : klines) {
    const KV& k = kl.second; CardDef c; c.key = kl.first; string ty = S(k, "type");
    c.type = ty == "Troop" ? C_TROOP : ty == "Building" ? C_BUILDING : C_SPELL; c.elixir = (int)F(k, "elixir");
    string ch = S(k, "char"), bl = S(k, "bld"), sc = S(k, "sc");
    if (ch != "-" && unitIdx.count(ch)) { c.unit = unitIdx[ch]; c.num = max(1, (int)F(k, "num", 1)); c.srad = F(k, "srad") / 1000; }
    else if (bl != "-" && unitIdx.count(bl)) { c.unit = unitIdx[bl]; c.num = 1; }
    if (S(k, "proj") != "-") {
      c.dmg = F(k, "p_dmg"); c.rad = F(k, "p_rad") / 1000; c.ctp = F(k, "p_ctp"); c.spd = max(1.0f, F(k, "p_spd") / 60.0f);
      c.air = F(k, "p_air") > 0; c.gnd = F(k, "p_gnd") > 0; c.buff = S(k, "p_buff"); c.buffT = F(k, "p_bufft") / 1000;
      c.rangeP = F(k, "p_rangep") / 1000; c.pwidth = F(k, "p_pwidth") / 1000;
      string sch = S(k, "p_sch");
      if (sch != "-" && unitIdx.count(sch)) { c.sk = SP_BARREL; c.barrelUnit = unitIdx[sch]; c.barrelNum = (int)F(k, "p_scn"); c.anywhere = true; }
      else if (c.key == "the-log" || c.key == "barbarian-barrel") { c.sk = SP_LOG; c.gnd = true; c.air = false; }
      else c.sk = SP_PROJ;
    } else if (S(k, "area") != "-") {
      c.life = F(k, "life") / 1000; c.rad = F(k, "arad") / 1000; c.dmg = F(k, "adamg"); c.ctp = F(k, "actp"); c.adps = F(k, "adps");
      c.buff = S(k, "abuff"); c.buffT = F(k, "abufft") / 1000; c.freq = F(k, "freq") / 1000; c.own = F(k, "own") > 0; c.enemy = F(k, "enemy") > 0;
      c.sk = c.key == "lightning" ? SP_LIGHTNING : SP_AREA; c.spd = 100;
      if (c.key == "lightning") { c.rad = 3.5f; c.dmg = 0; }
    }
    if (c.key == "miner" || c.key == "goblin-drill") c.anywhere = true;
    // support decision
    c.supported = true;
    if (EXCL_CARDS.count(c.key) && !REENABLE.count(c.key)) { c.supported = false; c.why = "mechanic not modelled"; }
    if (S(k, "unsupported") != "-" && c.key != "royal-delivery") { c.supported = false; c.why = "no data"; }
    if (c.type != C_SPELL && c.unit < 0) { c.supported = false; c.why = "no unit data"; }
    if (c.type != C_SPELL && c.unit >= 0) { const UDef& u = units[c.unit]; if ((u.ability || u.hidden) && u.name != "Tesla") { c.supported = false; c.why = "ability/hidden"; } if (u.hp <= 0) { c.supported = false; c.why = "ability/hidden"; } }
    if (c.key == "royal-delivery" && unitIdx.count("DeliveryRecruit")) {  // area hit after ~2s + Royal Recruit; L11 area damage 261 (memory), crown tower -70%
      c.type = C_SPELL; c.sk = SP_DELIVERY; c.rad = 3.0f; c.dmg = 261; c.ctp = -70; c.spd = 100; c.unit = unitIdx["DeliveryRecruit"]; c.gnd = true; c.air = false; c.supported = true; c.why = ""; c.anywhere = true;
    }
    if (c.type == C_SPELL && c.sk == SP_NONE) { c.supported = false; c.why = "spell not modelled"; }
    if (c.key == "lightning") {
      // damage from projectile table (LighningSpell): L11 = 1537? use spell area damage from projectile if provided
      c.dmg = 0;
    }
    cardIdx[c.key] = (int)cards.size(); cards.push_back(c);
  }
  // Lightning damage: LighningSpell projectile, L11 array index len-9 for Epic (14 entries) = idx 5 -> 1056
  if (cardIdx.count("lightning")) { cards[cardIdx["lightning"]].dmg = 1056; cards[cardIdx["lightning"]].ctp = -70; cards[cardIdx["lightning"]].buff = "ZapFreeze"; cards[cardIdx["lightning"]].buffT = 0.5f; }
  // Arrows: RoyaleAPI's per-volley number (122) is not the total. Fandom wiki: L11 Arrows one-shot Princess (1 level up),
  // Minion (2 up), Goblin (3 up), Spear Goblin (8 up) => total damage in [287,296). Use 290. Crown tower share 25% (June 2026 change).
  if (cardIdx.count("arrows")) { cards[cardIdx["arrows"]].dmg = 290; cards[cardIdx["arrows"]].ctp = -75; }
  for (int i = 0; i < (int)cards.size(); i++) if (cards[i].supported) supported.push_back(i);
}

// ---------------------------------------------------------------- game core
static const float RIVER0 = 15.0f, RIVER1 = 17.0f, BX[2] = {3.5f, 14.5f};
static int sideOf(float y) { return y < RIVER0 ? 0 : (y > RIVER1 ? 2 : 1); }
static inline float dist(float ax, float ay, float bx, float by) { return sqrtf((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }

Game::Game(const array<int, 8>& a, const array<int, 8>& b, int pa, int pb, uint64_t seed) : rng(seed) {
  deck[0] = a; deck[1] = b; pol[0] = POLICIES[pa]; pol[1] = POLICIES[pb];
  for (int p = 0; p < 2; p++) {
    vector<int> order = {0, 1, 2, 3, 4, 5, 6, 7};
    for (int i = 7; i > 0; i--) swap(order[i], order[rng.below(i + 1)]);
    for (int i = 0; i < 4; i++) hand[p][i] = order[i];
    for (int i = 4; i < 8; i++) queue[p].push_back(order[i]);
    elixir[p] = 5; thinkT[p] = 0.3f + 0.4f * rng.uni();
    const UDef& pr = D.units[D.princess]; const UDef& kg = D.units[D.king];
    for (int j = 0; j < 2; j++) tw[p][j] = {BX[j], p == 0 ? 6.5f : 25.5f, pr.hp, pr.hp, 0.3f, 0, true, true, D.princess};
    tw[p][0].active = tw[p][1].active = true;
    tw[p][2] = {9.0f, p == 0 ? 3.0f : 29.0f, kg.hp, kg.hp, 0.5f, 0, false, true, D.king};
  }
}

Unit* Game::spawnUnit(int def, int team, float x, float y, float deployDelay, float val) {
  const UDef& d = D.units[def];
  Unit u{}; u.def = def; u.team = team; u.uid = nextUid++; u.x = x; u.y = y; u.hp = u.maxhp = d.hp; u.shield = d.shield; u.cd = 0;
  u.deployT = deployDelay; u.slowM = 1; u.life = d.life; u.val = val; u.lastTgt = 0; u.spawnT = d.spStart > 0 ? d.spStart : d.spPause; u.manaT = d.mana;
  u.x = min(max(u.x, 0.3f), W - 0.3f); u.y = min(max(u.y, 0.3f), H - 0.3f);
  units.push_back(u); return &units.back();
}

void Game::spawnCard(int ci, int team, float x, float y) {  // world coordinates
  const CardDef& c = D.cards[ci]; const UDef& d = D.units[c.unit];
  int n = c.num; float val = (float)c.elixir / n;
  if (n == 1) { spawnUnit(c.unit, team, x, y, d.deploy, val); return; }
  float R = c.srad > 0.3f ? c.srad : (n <= 3 ? 0.7f : 0.45f * sqrtf((float)n) + 0.4f);
  for (int i = 0; i < n; i++) {
    float ang = 6.2831853f * i / n + 0.3f; float rr = (n > 6 && (i % 2)) ? R * 0.55f : R;
    spawnUnit(c.unit, team, x + cosf(ang) * rr, y + sinf(ang) * rr, d.deploy, val);
  }
}

bool Game::canPlay(int team, int hi) const {
  const CardDef& c = D.cards[deck[team][hand[team][hi]]]; return elixir[team] >= c.elixir;
}

bool Game::play(int team, int hi, float px, float py) {
  int di = hand[team][hi]; int ci = deck[team][di]; const CardDef& c = D.cards[ci];
  if (elixir[team] < c.elixir) return false;
  px = min(max(px, 0.5f), W - 0.5f);
  if (c.type != C_SPELL && !c.anywhere) {
    float maxy = 14.4f;  // own half (+ pocket after an enemy princess falls)
    int enemy = 1 - team; float wxp = mx(team, px); int lane = wxp < 9 ? 0 : 1;
    if (!tw[enemy][lane].alive) maxy = 19.0f;
    py = min(max(py, 0.5f), maxy);
  } else py = min(max(py, 0.5f), H - 0.5f);
  float wx = mx(team, px), wy = my(team, py);
  elixir[team] -= c.elixir;
  hand[team][hi] = queue[team].front(); queue[team].pop_front(); queue[team].push_back(di);
  lastPlayed[team] = ci; plays[team]++;
  if (getenv("CR_TRACE")) printf("  t=%6.1f P%d plays %-16s at (%.1f,%.1f) elixir left %.1f\n", t, team, c.key.c_str(), px, py, elixir[team]);
  if (c.type == C_TROOP || c.type == C_BUILDING) {
    if (c.type == C_BUILDING) { spawnUnit(c.unit, team, wx, wy, D.units[c.unit].deploy, (float)c.elixir); }
    else spawnCard(ci, team, wx, wy);
    return true;
  }
  // spells: travel time from own king tower
  float kx = tw[team][2].x, ky = tw[team][2].y; float travel = dist(kx, ky, wx, wy) / c.spd;
  Pending p{}; p.card = ci; p.team = team; p.x = wx; p.y = wy;
  switch (c.sk) {
    case SP_PROJ: p.kind = 0; p.t = travel + 0.15f; break;
    case SP_AREA: if (c.life > 2.0f) { p.kind = 1; p.t = 0.4f; p.dur = c.life; p.pulse = c.freq > 0 ? c.freq : 1; } else { p.kind = 0; p.t = 0.4f; } break;
    case SP_LOG: p.kind = 2; p.t = 0.5f; p.front = 0; break;
    case SP_BARREL: p.kind = 3; p.t = travel + 0.4f; break;
    case SP_LIGHTNING: p.kind = 4; p.t = 0.7f; break;
    case SP_DELIVERY: p.kind = 5; p.t = 2.0f; break;
    default: break;
  }
  pend.push_back(p); return true;
}

void Game::hurt(Unit& u, float dmg) {
  if (dmg <= 0) return;
  if (u.shield > 0) { float a = min(u.shield, dmg); u.shield -= a; dmg -= a; }
  u.hp -= dmg;
}

static void towerDamage(Game& g, int team, int j, float dmg) {
  Tower& tw = g.tw[team][j]; if (!tw.alive) return; tw.hp -= dmg; if (j == 2) tw.active = true;
  if (tw.hp <= 0) {
    tw.hp = 0; tw.alive = false; g.crowns[1 - team] += (j == 2) ? 3 : 1; if (g.firstCrown < 0) g.firstCrown = g.t;
    if (j != 2) g.tw[team][2].active = true;
    if (j == 2) { g.crowns[1 - team] = max(g.crowns[1 - team], 3); }
  }
}

static void applyBuff(Game& g, Unit& u, const string& buff, float t) {
  if (buff == "-" || t <= 0) return;
  auto it = D.buffs.find(buff); if (it == D.buffs.end()) return;
  const BuffDef& b = it->second;
  if (b.spm <= -100) u.stunT = max(u.stunT, t);
  else if (b.spm < 0) { u.slowT = max(u.slowT, t); u.slowM = min(u.slowM, 1 + b.spm / 100.0f); }
  else if (b.spm > 0) u.rageT = max(u.rageT, t);
}

void Game::strikeArea(int team, float cx, float cy, float rad, float dmg, float ctp, bool air, bool gnd, const string& buff, float bufft, int skipUid) {
  int en = 1 - team;
  for (auto& u : units) {
    if (u.team != en || u.hp <= 0 || u.uid == skipUid) continue; const UDef& d = D.units[u.def];
    if (d.fly ? !air : !gnd) continue;
    if (dist(cx, cy, u.x, u.y) - d.rad * 0.5f <= rad) { hurt(u, dmg); applyBuff(*this, u, buff, bufft); }
  }
  for (int j = 0; j < 3; j++) {
    Tower& tw = this->tw[en][j]; if (!tw.alive || !gnd) continue;
    if (dist(cx, cy, tw.x, tw.y) - D.units[tw.def].rad <= rad) {
      towerDamage(*this, en, j, dmg * (1 + ctp / 100.0f));
      if (buff != "-" && bufft > 0) { auto it = D.buffs.find(buff); if (it != D.buffs.end() && it->second.spm <= -100) tw.stunT = max(tw.stunT, bufft); }
    }
  }
}

float Game::minTowerFrac(int team) const {
  float m = 1; for (int j = 0; j < 3; j++) if (tw[team][j].alive) m = min(m, tw[team][j].hp / tw[team][j].maxhp); else m = 0; return m;
}

// ---------------------------------------------------------------- unit update
struct Tgt { int type = 0; int idx = -1; float x = 0, y = 0, r = 0; int id = 0; };  // type 1 unit, 2 tower

static bool inRange(const UDef& d, float ux, float uy, const Tgt& t) {
  float dd = dist(ux, uy, t.x, t.y); return dd - t.r <= d.rng + 0.05f && dd >= d.minrng;
}

void Game::step() {
  t += DT;
  float mult = t < 120 ? 1.0f : (t < 240 ? 2.0f : 3.0f);
  for (int p = 0; p < 2; p++) { float ne = elixir[p] + DT * mult / 2.8f; if (ne > 10.0f) wasted[p] += ne - 10.0f; elixir[p] = min(10.0f, ne); }
  for (int p = 0; p < 2; p++) if (t >= thinkT[p]) { think(p); thinkT[p] = t + 0.45f + 0.25f * rng.uni(); }

  // pending spells
  for (size_t i = 0; i < pend.size();) {
    Pending& p = pend[i]; const CardDef& c = D.cards[p.card]; p.t -= DT; bool done = false;
    if (p.t <= 0) {
      switch (p.kind) {
        case 0: strikeArea(p.team, p.x, p.y, c.rad, c.dmg, c.ctp, c.air, c.gnd, c.buff, c.buffT); done = true; break;
        case 1: {
          p.dur -= DT; p.pulse -= DT;
          if (p.pulse <= 0) { p.pulse += max(0.1f, c.freq); float per = c.adps * max(0.1f, c.freq); strikeArea(p.team, p.x, p.y, c.rad, per, c.ctp == 0 ? -70 : c.ctp, true, true, c.buff, c.buffT); }
          if (p.dur <= 0) done = true; break; }
        case 2: {  // rolling log: front travels along +y direction of caster
          float dir = p.team == 0 ? 1.0f : -1.0f; float prev = p.front; p.front += c.spd * DT; float y0 = p.y + dir * prev, y1 = p.y + dir * p.front;
          float lo = min(y0, y1), hi = max(y0, y1);
          for (auto& u : units) {
            if (u.team == p.team || u.hp <= 0 || D.units[u.def].fly) continue;
            if (fabsf(u.x - p.x) <= c.rad * 1.0f && u.y >= lo - 0.6f && u.y <= hi + 0.6f && !(u.hp <= 0)) {
              hurt(u, c.dmg); u.y += dir * 0.7f * 0.5f; }
          }
          for (int j = 0; j < 3; j++) { Tower& tw2 = this->tw[1 - p.team][j]; if (tw2.alive && fabsf(tw2.x - p.x) <= c.rad && tw2.y >= lo && tw2.y <= hi) { towerDamage(*this, 1 - p.team, j, c.dmg * (1 + c.ctp / 100.0f)); } }
          if (p.front >= (c.rangeP > 0 ? c.rangeP : 10.1f)) done = true; break; }
        case 3: {
          for (int k = 0; k < c.barrelNum; k++) { float a = 6.28f * k / max(1, c.barrelNum); spawnUnit(c.barrelUnit, p.team, p.x + cosf(a) * 0.8f, p.y + sinf(a) * 0.8f, 0.1f, (float)c.elixir / max(1, c.barrelNum)); }
          done = true; break; }
        case 5: {
          strikeArea(p.team, p.x, p.y, c.rad, c.dmg, c.ctp, false, true, "-", 0);
          spawnUnit(c.unit, p.team, p.x, p.y, 0.3f, (float)c.elixir * 0.6f); done = true; break; }
        case 4: {
          vector<pair<float, int>> cand;
          for (size_t k = 0; k < units.size(); k++) { Unit& u = units[k]; if (u.team == p.team || u.hp <= 0) continue; if (dist(p.x, p.y, u.x, u.y) <= c.rad) cand.push_back({-(u.hp + u.shield), (int)k}); }
          sort(cand.begin(), cand.end());
          for (size_t k = 0; k < cand.size() && k < 3; k++) { Unit& u = units[cand[k].second]; hurt(u, c.dmg); applyBuff(*this, u, c.buff, c.buffT); }
          for (int j = 0; j < 3; j++) { Tower& tw2 = this->tw[1 - p.team][j]; if (tw2.alive && dist(p.x, p.y, tw2.x, tw2.y) <= c.rad + 1.0f && cand.size() < 3) towerDamage(*this, 1 - p.team, j, c.dmg * (1 + c.ctp / 100.0f)); }
          done = true; break; }
      }
    }
    if (done) { pend[i] = pend.back(); pend.pop_back(); } else i++;
  }

  // units
  vector<Unit> born;
  size_t n0 = units.size();
  for (size_t i = 0; i < n0; i++) {
    Unit& u = units[i]; if (u.hp <= 0) continue; const UDef& d = D.units[u.def]; int en = 1 - u.team;
    if (u.stunT > 0) u.stunT -= DT; if (u.slowT > 0) { u.slowT -= DT; if (u.slowT <= 0) u.slowM = 1; } if (u.rageT > 0) u.rageT -= DT;
    if (u.deployT > 0) { u.deployT -= DT; continue; }
    // buildings: lifetime decay, elixir, spawns
    if (d.building) {
      if (d.hp <= 0) { u.life -= DT; if (u.life <= 0) u.hp = 0; continue; }  // timed bomb
      if (d.life > 0) { u.life -= DT; u.hp -= u.maxhp / d.life * DT; if (u.life <= 0) u.hp = 0; }
      if (d.mana > 0 && u.stunT <= 0) { u.manaT -= DT; if (u.manaT <= 0) { elixir[u.team] = min(10.0f, elixir[u.team] + 1); u.manaT = d.mana; } }
    }
    if (u.stunT > 0) continue;
    float spm = (u.slowT > 0 ? u.slowM : 1.0f) * (u.rageT > 0 ? 1.35f : 1.0f);
    if (d.spNum > 0 && d.spPause > 0) {
      u.spawnT -= DT * spm;
      if (u.spawnT <= 0) { u.spawnT = d.spPause; for (int k = 0; k < d.spNum; k++) { float a = 6.28f * k / d.spNum; born.push_back(Unit{}); Unit& b = born.back(); b = Unit{}; b.def = d.spIdx; b.team = u.team; b.uid = nextUid++; b.x = u.x + cosf(a) * 0.9f; b.y = u.y + sinf(a) * 0.9f; const UDef& sd = D.units[d.spIdx]; b.hp = b.maxhp = sd.hp; b.shield = sd.shield; b.cd = 0; b.deployT = d.building ? 0.15f : 0.5f; b.slowM = 1; b.life = sd.life; b.val = 0.5f; b.manaT = sd.mana; } }
    }
    if (d.dmg <= 0 && d.dmgs <= 0 && d.dashdmg <= 0) {
      if (d.spd <= 0) continue;
    }
    // ---- target acquisition
    Tgt best; float bd = 1e9f;
    auto consider = [&](const Tgt& t, float score) { if (score < bd) { bd = score; best = t; } };
    bool canAir = d.air, canGnd = d.gnd;
    int mySide = sideOf(u.y);
    bool grounded = !d.fly && !d.jumpriver;
    if (!d.bo) {
      for (size_t k = 0; k < units.size(); k++) {
        Unit& e = units[k]; if (e.team != en || e.hp <= 0) continue; const UDef& ed = D.units[e.def];
        if (ed.fly ? !canAir : !canGnd) continue;
        float dd = dist(u.x, u.y, e.x, e.y); float lim = max(d.sight, d.rng + 1.0f);
        if (dd > lim) continue;
        if (grounded && !ed.building) { int es = sideOf(e.y); if (mySide != es && mySide != 1 && es != 1 && dd - ed.rad > d.rng) continue; }
        else if (grounded && ed.building) { int es = sideOf(e.y); if (mySide != es && mySide != 1 && es != 1 && dd - ed.rad > d.rng) continue; }
        consider(Tgt{1, (int)k, e.x, e.y, ed.rad, e.uid}, dd);
      }
    } else {
      for (size_t k = 0; k < units.size(); k++) {
        Unit& e = units[k]; if (e.team != en || e.hp <= 0) continue; const UDef& ed = D.units[e.def];
        if (!ed.building || ed.hp <= 0) continue; if (ed.fly ? !canAir : !canGnd) continue;
        consider(Tgt{1, (int)k, e.x, e.y, ed.rad, e.uid}, dist(u.x, u.y, e.x, e.y));
      }
    }
    // towers (always considered for bo; for others only as fallback or when close)
    Tgt tbest; float tbd = 1e9f;
    for (int j = 0; j < 3; j++) {
      Tower& tw2 = tw[en][j]; if (!tw2.alive || !canGnd) continue;
      float dd = dist(u.x, u.y, tw2.x, tw2.y); if (j == 2 && tw[en][0].alive && tw[en][1].alive && dd > d.rng + 3.0f) continue;  // king shielded by princess towers
      if (dd < tbd) { tbd = dd; tbest = Tgt{2, j, tw2.x, tw2.y, D.units[tw2.def].rad, -(j + 1)}; }
    }
    if (best.type == 0 || (d.bo && tbd < bd) || (best.type == 1 && tbest.type == 2 && !d.bo && tbd - tbest.r <= d.rng && bd > tbd)) { if (tbest.type) best = tbest; }
    bool hasTgt = best.type != 0;
    // ---- ramp
    if (best.id == u.lastTgt && hasTgt) u.rampT += DT; else u.rampT = 0;
    u.lastTgt = hasTgt ? best.id : 0;
    // ---- attack or move
    bool attacking = false;
    if (hasTgt && (d.dmg > 0 || d.dmgs > 0) && inRange(d, u.x, u.y, best)) attacking = true;
    if (attacking && !u.wasAtk) u.cd = max(u.cd, d.hit - d.load);
    u.wasAtk = attacking;
    u.cd -= DT * spm; if (u.cd < 0) u.cd = 0;
    if (attacking) {
      if (u.cd <= 0) {
        float dmg = d.dmg; if (u.charging && d.dmgs > 0) dmg = d.dmgs;
        if (d.vd2 > 0) { if (u.rampT >= d.vdt1 + d.vdt2) dmg = d.vd3; else if (u.rampT >= d.vdt1) dmg = d.vd2; }
        if (d.mp > 1 && d.aoe <= 0) dmg *= d.mp;
        // collect targets
        vector<Tgt> tl; tl.push_back(best);
        if (d.mt > 1) {
          vector<pair<float, int>> cand;
          for (size_t k = 0; k < units.size(); k++) { Unit& e = units[k]; if (e.team != en || e.hp <= 0 || (int)k == best.idx) continue; const UDef& ed = D.units[e.def]; if (ed.fly ? !canAir : !canGnd) continue; float dd = dist(u.x, u.y, e.x, e.y); if (dd - ed.rad <= d.rng) cand.push_back({dd, (int)k}); }
          sort(cand.begin(), cand.end()); for (size_t k = 0; k + 1 < (size_t)d.mt && k < cand.size(); k++) { Unit& e = units[cand[k].second]; tl.push_back(Tgt{1, cand[k].second, e.x, e.y, D.units[e.def].rad, e.uid}); }
        }
        for (auto& tg : tl) {
          if (tg.type == 2) { towerDamage(*this, en, tg.idx, dmg * (1 + d.ctp / 100.0f)); if (d.aoe > 0) {} }
          else {
            Unit& e = units[tg.idx];
            if (d.aoe > 0) {
              float cx = d.selfaoe ? u.x : e.x, cy = d.selfaoe ? u.y : e.y;
              for (auto& o : units) { if (o.team != en || o.hp <= 0) continue; const UDef& od = D.units[o.def]; if (od.fly ? !canAir : !canGnd) continue; if (dist(cx, cy, o.x, o.y) - od.rad * 0.5f <= d.aoe) { hurt(o, dmg); if (d.bod != "-") applyBuff(*this, o, d.bod, d.bodt); } }
              for (int j = 0; j < 3; j++) { Tower& t2 = tw[en][j]; if (t2.alive && canGnd && tg.type == 1 && dist(cx, cy, t2.x, t2.y) - D.units[t2.def].rad <= d.aoe) towerDamage(*this, en, j, dmg * (1 + d.ctp / 100.0f)); }
            } else { hurt(e, dmg); if (d.bod != "-") applyBuff(*this, e, d.bod, d.bodt); }
          }
        }
        if (best.type == 2 && d.aoe > 0) {  // aoe attack whose primary target is a tower: also hit nearby units
          float cx = d.selfaoe ? u.x : best.x, cy = d.selfaoe ? u.y : best.y;
          for (auto& o : units) { if (o.team != en || o.hp <= 0) continue; const UDef& od = D.units[o.def]; if (od.fly ? !canAir : !canGnd) continue; if (dist(cx, cy, o.x, o.y) - od.rad * 0.5f <= d.aoe) hurt(o, dmg); }
        }
        u.cd = d.hit / max(0.2f, (u.rageT > 0 ? 1.35f : 1.0f)); u.charging = false; u.chgDist = 0;
        if (d.kami) u.hp = 0;
      }
    } else if (d.spd > 0 && hasTgt) {
      // move toward best (or default lane tower)
      float sp = d.speedTps() * spm; if (u.charging && d.chgm > 0) sp *= d.chgm / 100.0f;
      float gx = best.x, gy = best.y;
      float step = sp * DT; float px = u.x, py = u.y;
      if (grounded) {
        int su = sideOf(u.y), sd = sideOf(gy);
        if (su != sd || su == 1) {
          float bx = BX[0]; float bestc = 1e9f; for (int b2 = 0; b2 < 2; b2++) { float c = fabsf(u.x - BX[b2]) + fabsf(gx - BX[b2]); if (c < bestc) { bestc = c; bx = BX[b2]; } }
          if (su == 1) { gx = bx; gy = (gy > u.y) ? 17.6f : 14.4f; }
          else { float entryY = su == 0 ? 14.6f : 17.4f; if (fabsf(u.x - bx) > 0.7f && fabsf(u.y - entryY) > 0.5f) { gx = bx; gy = entryY; } else { gx = bx; gy = su == 0 ? 17.6f : 14.4f; } }
        }
      }
      float dx = gx - u.x, dy = gy - u.y; float dl = sqrtf(dx * dx + dy * dy);
      if (dl > 1e-4f) { float s2 = min(step, dl); u.x += dx / dl * s2; u.y += dy / dl * s2; }
      if (grounded && sideOf(u.y) == 1) { float bxn = fabsf(u.x - BX[0]) < fabsf(u.x - BX[1]) ? BX[0] : BX[1]; u.x = min(max(u.x, bxn - 0.9f), bxn + 0.9f); }
      float moved = dist(px, py, u.x, u.y);
      if (d.chg > 0) { u.chgDist += moved; if (u.chgDist >= d.chg) u.charging = true; }
    }
  }
  for (auto& b : born) units.push_back(b);

  // collisions (ground vs ground, air vs air)
  for (size_t i = 0; i < units.size(); i++) {
    Unit& a = units[i]; if (a.hp <= 0 || a.deployT > 0) continue; const UDef& ad = D.units[a.def]; if (ad.building) continue;
    for (size_t j = i + 1; j < units.size(); j++) {
      Unit& b = units[j]; if (b.hp <= 0 || b.deployT > 0) continue; const UDef& bd2 = D.units[b.def]; if (bd2.building || bd2.fly != ad.fly) continue;
      float dx = b.x - a.x, dy = b.y - a.y; float dl = sqrtf(dx * dx + dy * dy); float mn = (ad.rad + bd2.rad) * 0.8f;
      if (dl < mn && dl > 1e-4f) {
        float ov = mn - dl; float ma = ad.mass, mb = bd2.mass; float sa = mb / (ma + mb), sb = ma / (ma + mb);
        if (a.team == b.team) { sa *= 0.5f; sb *= 0.5f; }
        a.x -= dx / dl * ov * sa; a.y -= dy / dl * ov * sa; b.x += dx / dl * ov * sb; b.y += dy / dl * ov * sb;
      }
    }
    // push out of buildings
    for (int tm = 0; tm < 2 && !ad.fly; tm++) for (int j = 0; j < 3; j++) {
      const Tower& tw2 = tw[tm][j]; if (!tw2.alive) continue; float dl = dist(a.x, a.y, tw2.x, tw2.y); float mn = D.units[tw2.def].rad + ad.rad * 0.8f;
      if (dl < mn && dl > 1e-4f) { a.x += (a.x - tw2.x) / dl * (mn - dl); a.y += (a.y - tw2.y) / dl * (mn - dl); }
    }
    a.x = min(max(a.x, 0.3f), W - 0.3f); a.y = min(max(a.y, 0.3f), H - 0.3f);
  }

  // towers
  for (int tm = 0; tm < 2; tm++) for (int j = 0; j < 3; j++) {
    Tower& tw2 = tw[tm][j]; if (!tw2.alive) continue; const UDef& td = D.units[tw2.def];
    if (tw2.stunT > 0) { tw2.stunT -= DT; continue; }
    tw2.cd -= DT; if (!tw2.active) continue;
    Unit* tg = nullptr; float bd = 1e9f;
    for (auto& e : units) { if (e.team == tm || e.hp <= 0 || e.deployT > 0) continue; const UDef& ed = D.units[e.def]; float dd = dist(tw2.x, tw2.y, e.x, e.y); if (dd - ed.rad <= td.rng && dd < bd) { bd = dd; tg = &e; } }
    if (!tg) { tw2.cd = min(tw2.cd, td.load); continue; }
    if (tw2.cd <= 0) { hurt(*tg, td.dmg); tw2.cd = td.hit; }
  }

  // deaths (loop until stable: death damage can kill more units)
  for (bool again = true; again;) {
    again = false;
    for (size_t i = 0; i < units.size(); i++) {
      if (units[i].hp > 0 || units[i].dying) continue;
      units[i].dying = true; again = true;
      Unit u = units[i]; const UDef d = D.units[u.def];
      if (d.dd > 0 && d.ddr > 0) strikeArea(u.team, u.x, u.y, d.ddr, d.dd, 0, true, true, "-", 0);
      if (d.dsNum > 0 && d.dsIdx >= 0) {
        const UDef sd = D.units[d.dsIdx];
        for (int k = 0; k < d.dsNum; k++) {
          float a = 6.28f * k / d.dsNum + 0.5f; float xx = u.x + cosf(a) * 0.7f, yy = u.y + sinf(a) * 0.7f;
          Unit* nu = spawnUnit(d.dsIdx, u.team, xx, yy, sd.building && sd.hp <= 0 ? 0 : 0.4f, u.val * 0.4f);
          if (sd.building && sd.hp <= 0) { nu->hp = nu->maxhp = 1; nu->life = sd.deploy; nu->deployT = 0; }
        }
      }
    }
  }
  {
    vector<Unit> alive; alive.reserve(units.size());
    for (auto& u : units) if (u.hp > 0) alive.push_back(u);
    units.swap(alive);
  }

  // end conditions
  if (crowns[0] >= 3 || crowns[1] >= 3) { over = true; winner = crowns[0] > crowns[1] ? 0 : 1; return; }
  if (t >= 180 && crowns[0] != crowns[1]) { over = true; winner = crowns[0] > crowns[1] ? 0 : 1; return; }
  if (t >= 300) {
    over = true; if (crowns[0] != crowns[1]) winner = crowns[0] > crowns[1] ? 0 : 1;
    else { float a = minTowerFrac(0), b = minTowerFrac(1); winner = fabsf(a - b) < 1e-6f ? -1 : (a > b ? 0 : 1); }
  }
}

// ---------------------------------------------------------------- AI
float Game::threatValueNear(int team) const { (void)team; return 0; }

void Game::think(int team) {
  const Policy& P = pol[team]; float el = elixir[team]; int en = 1 - team;
  // --- collect enemy threats on my half
  struct Th { int k; float ex, ey; };
  vector<Th> th[2]; float lw[2] = {0, 0}, lwc[2] = {0, 0}; bool laneAir[2] = {false, false};
  for (size_t k = 0; k < units.size(); k++) {
    const Unit& u = units[k]; if (u.team != en || u.hp <= 0) continue; const UDef& d = D.units[u.def]; if (d.building || (d.dmg <= 0 && d.dmgs <= 0 && !d.kami)) continue;
    float ex = mx(team, u.x), ey = my(team, u.y); int lane = ex < 9 ? 0 : 1;
    if (ey <= 16.2f) { th[lane].push_back({(int)k, ex, ey}); lw[lane] += u.val + 0.3f; lwc[lane] += u.val + 0.3f; if (d.fly) laneAir[lane] = true; }
    else if (ey <= 24.0f && d.spd > 0) {  // approaching: will cross the bridge soon
      float eta = (ey - 16.0f) / max(0.5f, d.speedTps()); if (eta <= 3.4f + 0.02f * P.react) { th[lane].push_back({(int)k, ex, 15.5f}); lw[lane] += 0.8f * (u.val + 0.3f); if (d.fly) laneAir[lane] = true; }
    }
  }
  int lane = lw[0] >= lw[1] ? 0 : 1; bool crossed = lwc[lane] > 0; bool threat = lw[lane] >= P.react && !th[lane].empty();
  // own push
  const Unit* lead = nullptr; float leadY = -1;
  for (auto& u : units) { if (u.team != team || u.hp <= 0) continue; const UDef& d = D.units[u.def]; if (d.building) continue; float ey = my(team, u.y); if (ey >= 15.5f && ey > leadY) { leadY = ey; lead = &u; } }

  struct Act { int slot; float px, py; float score; };
  Act bestA{-1, 0, 0, 0};
  auto offer = [&](int slot, float px, float py, float score) { if (score > bestA.score) bestA = {slot, px, py, score}; };

  // enemy threat aggregates (for chosen lane)
  float Thp = 0, Tdps = 0, Tval = 0; int Tn = 0; bool Tair = false, Tgnd = false, Tbo = false, Tswarm = false; float clx = 9, cly = 8;
  if (threat) {
    float minY = 99;
    for (auto& e : th[lane]) { const Unit& u = units[e.k]; const UDef& d = D.units[u.def]; Thp += u.hp + u.shield; Tdps += d.dpsOne() * (d.aoe > 0 ? 1.4f : 1.0f); Tval += u.val; Tn++; if (d.fly) Tair = true; else Tgnd = true; if (d.bo) Tbo = true; if (e.ey < minY) { minY = e.ey; clx = e.ex; cly = e.ey; } }
    Tswarm = Tn >= 3 && Thp / Tn < 500;
  }

  for (int s = 0; s < 4; s++) {
    int ci = deck[team][hand[team][s]]; const CardDef& c = D.cards[ci]; if (el < c.elixir) continue;
    if (c.type == C_SPELL) {
      if (c.sk == SP_BARREL) continue;  // offensive only, handled below
      // evaluate best target
      float bestV = 0, bx = 9, by = 20;
      vector<pair<float, float>> centers;
      for (auto& u : units) if (u.team == en && u.hp > 0) centers.push_back({mx(team, u.x), my(team, u.y)});
      for (int j = 0; j < 2; j++) if (tw[en][j].alive) centers.push_back({mx(team, tw[en][j].x), my(team, tw[en][j].y) - 0.5f});
      if (tw[en][2].alive && (!tw[en][0].alive || !tw[en][1].alive)) centers.push_back({mx(team, tw[en][2].x), my(team, tw[en][2].y) - 1.0f});
      float dmgEff = c.sk == SP_AREA && c.life > 2.0f ? c.adps * c.life * 0.75f : c.dmg;
      for (auto& cc : centers) {
        float wx = mx(team, cc.first), wy = my(team, cc.second); float v = 0; int cnt = 0;
        vector<float> vals;
        for (auto& u : units) {
          if (u.team != en || u.hp <= 0) continue; const UDef& d = D.units[u.def]; if (d.fly ? !c.air : !c.gnd) continue;
          if (dist(wx, wy, u.x, u.y) - d.rad * 0.5f > c.rad) continue;
          float hp = u.hp + u.shield; float frac = dmgEff >= hp ? 1.0f : 0.3f * dmgEff / hp; if (d.building) frac *= 0.6f;
          vals.push_back(u.val * frac); cnt++;
        }
        if (c.sk == SP_LIGHTNING) { sort(vals.rbegin(), vals.rend()); for (size_t i = 0; i < vals.size() && i < 3; i++) v += vals[i]; } else for (float x : vals) v += x;
        for (int j = 0; j < 3; j++) { const Tower& t2 = tw[en][j]; if (!t2.alive || !c.gnd) continue; if (dist(wx, wy, t2.x, t2.y) - D.units[t2.def].rad <= c.rad) { float td = c.dmg * (1 + c.ctp / 100.0f); if (c.sk == SP_AREA && c.life > 2.0f) td = c.adps * c.life * (1 + c.ctp / 100.0f); if (j == 2 && !(tw[en][0].alive && tw[en][1].alive)) {} v += td / t2.maxhp * 3.0f + (t2.hp <= td ? (j == 2 ? 30.0f : 5.0f) : 0); } }
        if (v > bestV) { bestV = v; bx = cc.first; by = cc.second; }
      }
      float need = c.elixir * (1.25f - 0.45f * P.spellAggro);
      if (bestV >= need) offer(s, bx, by, 0.9f + (bestV - need) / max(1.0f, (float)c.elixir));
      continue;
    }
    const UDef& u = D.units[c.unit];
    if (!threat) continue;
    // defensive value
    float myHp = (u.hp + u.shield) * c.num; float myDps = u.dpsOne() * c.num; if (u.aoe > 0 && Tn > 1) myDps *= 1 + 0.5f * min(Tn - 1, 3);
    float score = 0;
    bool canHitAir = u.air, canHitGnd = u.gnd;
    if (Tair && !Tgnd && !canHitAir) continue;
    if (c.type == C_BUILDING) {
      if (u.dmg <= 0) continue;
      if (Tair && !canHitAir && !Tgnd) continue;
      myHp *= 0.65f; float tk = Thp / max(myDps, 1.0f); float tm = myHp / max(Tdps, 1.0f); float ratio = tm / max(tk, 0.5f);
      score = min(ratio, 2.5f) * min(2.0f, max(0.4f, Tval / c.elixir)); if (Tbo) score *= 3.0f; if (Tair && !canHitAir) score *= 0.5f;
      float px = 9.0f + (clx < 9 ? -1.5f : 1.5f), py = 9.5f;
      if (score > 0.6f) offer(s, px, py, score);
      continue;
    }
    if (u.bo) { score = (myHp > 1500 && crossed) ? 0.4f : 0.2f; }
    else {
      float tk = Thp / max(myDps, 1.0f); float tm = myHp / max(Tdps, 1.0f); float ratio = tm / max(tk, 0.5f);
      if (u.rng > 2.0f && Tdps > 0) ratio *= 1.15f;
      score = min(ratio, 2.5f) * min(2.0f, max(0.4f, Tval / c.elixir));
      if (Tair && Tgnd && !canHitAir) score *= 0.6f; if (!Tair && Tgnd && !canHitGnd) score = 0; if (Tswarm && u.aoe > 0) score *= 1.25f;
    }
    float py = min(13.5f, max(4.0f, cly - (u.rng > 3.0f ? 5.0f : 2.5f))); float px = clx;
    if (score > (crossed ? 0.12f : 0.6f)) offer(s, px, py, score);
  }
  if (bestA.slot >= 0 && (bestA.score >= (crossed ? 0.12f : 0.6f))) { play(team, bestA.slot, bestA.px, bestA.py); return; }
  if (threat && lw[lane] > 0) {
    // could not counter: do nothing, keep elixir
  }
  if (threat) return;

  // ---- offense
  float bestHpFrac[2];
  for (int l = 0; l < 2; l++) { float wxp = mx(team, l == 0 ? 3.5f : 14.5f); int tl = wxp < 9 ? 0 : 1; const Tower& tt = tw[en][tl]; bestHpFrac[l] = tt.alive ? tt.hp / tt.maxhp : 2.0f; }
  int atkLane = bestHpFrac[0] < bestHpFrac[1] ? 0 : (bestHpFrac[1] < bestHpFrac[0] ? 1 : rng.below(2)); float laneX = atkLane == 0 ? 3.5f : 14.5f;
  if (lead && el >= P.supportElixir) {
    // support the push
    int bs = -1; float bsScore = 0;
    for (int s = 0; s < 4; s++) {
      int ci = deck[team][hand[team][s]]; const CardDef& c = D.cards[ci]; if (el < c.elixir) continue; if (c.type != C_TROOP) continue;
      const UDef& u = D.units[c.unit]; float sc = (u.hp * c.num) * (u.dpsOne() * c.num + 1) / 1e5f / c.elixir; if (u.bo) sc *= 0.5f; sc += rng.uni() * 0.2f;
      if (sc > bsScore) { bsScore = sc; bs = s; }
    }
    if (bs >= 0) { float ly = my(team, lead->y); float lx = mx(team, lead->x); play(team, bs, lx, min(14.0f, max(2.0f, ly - 4.0f))); return; }
  }
  if (el >= P.attackElixir && !lead) {
    int bs = -1; float bsScore = -1;
    for (int s = 0; s < 4; s++) {
      int ci = deck[team][hand[team][s]]; const CardDef& c = D.cards[ci]; if (el < c.elixir) continue;
      if (c.type == C_BUILDING && !c.anywhere) continue;
      if (c.type == C_SPELL) { if ((c.sk == SP_BARREL || c.sk == SP_DELIVERY) && el >= c.elixir + 1) { float sc = 3.0f + rng.uni(); if (sc > bsScore) { bsScore = sc; bs = s; } } continue; }
      const UDef& u = D.units[c.unit]; float sc = (u.bo || c.anywhere) ? 5.0f + c.elixir * 0.1f : (u.hp * c.num) / 1000.0f; sc += rng.uni() * 0.5f;
      if (sc > bsScore) { bsScore = sc; bs = s; }
    }
    if (bs >= 0) {
      const CardDef& c = D.cards[deck[team][hand[team][bs]]];
      if (c.type == C_SPELL) { play(team, bs, laneX, c.sk == SP_DELIVERY ? 24.5f : 27.0f); return; }
      if (c.type == C_BUILDING) { play(team, bs, laneX, 22.5f); return; }
      const UDef& u = D.units[c.unit]; float py;
      if (c.anywhere) py = 24.5f; else if (u.bo && u.spd >= 100) py = 13.8f; else if (u.bo) py = (u.spd <= 45 ? 3.5f : 6.0f); else py = 8.0f;
      play(team, bs, laneX, py); return;
    }
  }
  if (el >= 9.6f) {  // avoid wasting elixir
    int bs = -1; int bc = 99;
    for (int s = 0; s < 4; s++) { const CardDef& c = D.cards[deck[team][hand[team][s]]]; if (c.type != C_TROOP || el < c.elixir) continue; if (c.elixir < bc) { bc = c.elixir; bs = s; } }
    if (bs >= 0) play(team, bs, laneX, 7.0f);
  }
}

// ---------------------------------------------------------------- matchup helpers
float solveValue(const vector<vector<float>>& m) {
  int R = (int)m.size(), C = (int)m[0].size(); vector<double> rc(R, 0), cc(C, 0), rs(R, 0), cs(C, 0); vector<double> rp(R), cp(C);
  const int IT = 3000;
  for (int it = 0; it < IT; it++) {
    double sr = 0, sc = 0; for (int i = 0; i < R; i++) { rp[i] = max(0.0, rc[i]); sr += rp[i]; } for (int j = 0; j < C; j++) { cp[j] = max(0.0, cc[j]); sc += cp[j]; }
    for (int i = 0; i < R; i++) { rp[i] = sr > 0 ? rp[i] / sr : 1.0 / R; rs[i] += rp[i]; } for (int j = 0; j < C; j++) { cp[j] = sc > 0 ? cp[j] / sc : 1.0 / C; cs[j] += cp[j]; }
    double ev = 0; vector<double> ur(R, 0), uc(C, 0);
    for (int i = 0; i < R; i++) for (int j = 0; j < C; j++) { ur[i] += cp[j] * m[i][j]; uc[j] += rp[i] * (1 - m[i][j]); ev += rp[i] * cp[j] * m[i][j]; }
    for (int i = 0; i < R; i++) rc[i] += ur[i] - ev; for (int j = 0; j < C; j++) cc[j] += uc[j] - (1 - ev);
  }
  double sr = 0, sc = 0; for (double x : rs) sr += x; for (double x : cs) sc += x; vector<double> ar(R), ac(C); for (int i = 0; i < R; i++) ar[i] = rs[i] / sr; for (int j = 0; j < C; j++) ac[j] = cs[j] / sc;
  double worst = 1e9, best = -1e9; for (int j = 0; j < C; j++) { double u = 0; for (int i = 0; i < R; i++) u += ar[i] * m[i][j]; worst = min(worst, u); }
  for (int i = 0; i < R; i++) { double u = 0; for (int j = 0; j < C; j++) u += ac[j] * m[i][j]; best = max(best, u); }
  return (float)(0.5 * (worst + best));  // average of the two exploitability bounds
}

float matchupValue(const array<int, 8>& a, const array<int, 8>& b, int g, uint64_t seed, int npol, vector<vector<float>>* mat) {
  initPolicies(); npol = min<int>(npol, POLICIES.size()); vector<vector<float>> m(npol, vector<float>(npol, 0.5f));
  for (int pa = 0; pa < npol; pa++) for (int pb = 0; pb < npol; pb++) {
    double sum = 0;
    for (int k = 0; k < g; k++) {
      bool swap_ = k & 1; uint64_t sd = seed * 1000003ULL + pa * 131 + pb * 17 + k * 7919;
      Game gm = swap_ ? Game(b, a, pb, pa, sd) : Game(a, b, pa, pb, sd);
      gm.run(); int w = gm.winner; double r = w < 0 ? 0.5 : ((w == 0) == !swap_ ? 1.0 : 0.0); sum += r;
    }
    m[pa][pb] = (float)(sum / g);
  }
  if (mat) *mat = m;
  return solveValue(m);
}
