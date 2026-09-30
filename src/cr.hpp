// Data-driven Clash Royale simulator (approximate). All unit/card numbers are
// loaded from data/cr_data.txt (level 11, exported from RoyaleAPI/cr-api-data).
#pragma once
#include <bits/stdc++.h>
using namespace std;

struct Rng {
  uint64_t s;
  explicit Rng(uint64_t seed = 1) : s(seed * 2685821657736338717ULL + 1442695040888963407ULL) { for (int i = 0; i < 6; i++) next(); }
  uint64_t next() { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return s; }
  float uni() { return (next() >> 11) * (1.0f / 9007199254740992.0f); }
  int below(int n) { return (int)(next() % (uint64_t)n); }
};

struct UDef {
  string name; bool building = false;
  float hp = 0, dmg = 0, dmgs = 0, hit = 1, load = 0.5f, rng = 1, minrng = 0, spd = 0, sight = 5.5f, deploy = 1, rad = 0.5f, mass = 1;
  bool fly = false, air = false, gnd = true, bo = false, kami = false, selfaoe = false, jumpriver = false;
  float life = 0, aoe = 0, ctp = 0; int mp = 0, mt = 0;
  float chg = 0, chgm = 0, shield = 0;
  string spName, dsName; int spIdx = -1, dsIdx = -1, spNum = 0, dsNum = 0; float spPause = 0, spStart = 0;
  float dd = 0, ddr = 0, vd2 = 0, vdt1 = 0, vd3 = 0, vdt2 = 0, mana = 0;
  string bod; float bodt = 0; bool ability = false, hidden = false;
  float dashdmg = 0, dashrad = 0, dashmin = 0, dashmax = 0, dashcd = 0;
  float speedTps() const { return spd / 60.0f; }
  float dpsOne() const { return hit > 0 ? dmg / hit : 0; }
};

enum CardType { C_TROOP, C_BUILDING, C_SPELL };
enum SpellKind { SP_NONE, SP_PROJ, SP_LOG, SP_BARREL, SP_AREA, SP_LIGHTNING };
struct BuffDef { string name; float hsm = 0, spm = 0, dps = 0, freq = 0, ctp = 0; };

struct CardDef {
  string key; CardType type = C_TROOP; int elixir = 0; int unit = -1, num = 1; float srad = 0;
  bool supported = false; string why; bool anywhere = false;
  SpellKind sk = SP_NONE; float dmg = 0, rad = 0, ctp = 0, spd = 10, buffT = 0, life = 0, freq = 0, adps = 0, rangeP = 0, pwidth = 0;
  string buff; bool own = false, enemy = true, air = true, gnd = true; int barrelUnit = -1, barrelNum = 0;
  float summonRad() const { return srad; }
};

struct Data {
  vector<UDef> units; vector<CardDef> cards; unordered_map<string, int> unitIdx, cardIdx; unordered_map<string, BuffDef> buffs;
  int princess = -1, king = -1;
  vector<int> supported;  // card indices usable in decks
  void load(const string& path);
  int card(const string& k) const { auto it = cardIdx.find(k); if (it == cardIdx.end()) { fprintf(stderr, "unknown card %s\n", k.c_str()); exit(1); } return it->second; }
};
extern Data D;

struct Policy { float react, attackElixir, spellAggro, supportElixir; };
extern Policy POLICIES[3];

struct Unit {
  int def, team, uid; float x, y, hp, maxhp, shield, cd, deployT, stunT, slowT, slowM, rageT, chgDist, rampT, spawnT, life, val, dashT, dashCd, manaT; bool charging, dying; int lastTgt;
};
struct Tower { float x, y, hp, maxhp, cd, stunT; bool active, alive; int def; };
struct Pending {
  int kind; int card, team; float x, y, t, dur, pulse; float front; // kind 0 proj-area, 1 area over time, 2 log, 3 barrel spawn, 4 lightning
};

struct Game {
  static constexpr float DT = 0.1f, W = 18, H = 32;
  vector<Unit> units; vector<Pending> pend; Tower tw[2][3];
  float t = 0; int crowns[2] = {0, 0}; int nextUid = 1; bool over = false; int winner = -1;
  array<int, 8> deck[2]; int hand[2][4]; deque<int> queue[2]; float elixir[2]; Policy pol[2]; float thinkT[2]; Rng rng; int lastPlayed[2] = {-1, -1};
  float manaBonus[2] = {0, 0};

  Game(const array<int, 8>& a, const array<int, 8>& b, int pa, int pb, uint64_t seed);
  float mx(int team, float x) const { return team == 0 ? x : W - x; }
  float my(int team, float y) const { return team == 0 ? y : H - y; }
  Unit* spawnUnit(int def, int team, float x, float y, float deployDelay, float val);
  void spawnCard(int cardIdx, int team, float x, float y);
  bool play(int team, int handIdx, float px, float py);  // px,py in own coordinates
  bool canPlay(int team, int handIdx) const;
  void step();
  void think(int team);
  void run() { while (!over) step(); }
  float minTowerFrac(int team) const;
  // helpers
  void hurt(Unit& u, float dmg);
  void applyStun(Unit& u, float s) { u.stunT = max(u.stunT, s); }
  void strikeArea(int team, float cx, float cy, float rad, float dmg, float ctp, bool air, bool gnd, const string& buff, float bufft, int skipUid = -1);
  void killSpawns(Unit& u);
  float threatValueNear(int team) const;
};

float solveValue(const float m[3][3]);
float matchupValue(const array<int, 8>& a, const array<int, 8>& b, int g, uint64_t seed, float mat[3][3] = nullptr);
