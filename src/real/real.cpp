// Driver for the third-party engine itzik123/ClashRoyaleAi (MIT, vendored headers in vendor/clashroyaleenv/include).
// It has 132 cards incl. 41 Evolutions, Champions and Heroes, calibrated speeds and real timing. We only add:
//  - deck parsing (names incl. "evo:" prefix),
//  - card profiling (spawn once on a scratch board and read hp/dps/range/air-targeting),
//  - a heuristic player (defend / counter-push / spells) and a lookahead player (snapshot + rollouts),
//  - matchup evaluation over a policy family and a parallel driver.
#include <atomic>
#include <thread>
#include <iostream>
#include <fstream>
#include <sstream>
#include <map>
#include <set>
#include <cstring>
#include <algorithm>
#include <array>
#include <memory>
#include <random>
#include <unordered_map>
#include <functional>
#include <string>
#include <vector>
#include <cmath>
#include <deque>
#include <optional>
#include <typeinfo>
#include <stdexcept>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#define private public
#define protected public
#include "GameManager.h"
#include "CardRegistry.h"
#include "HeuristicOpponent.h"
#include "Troop.h"
#include "Building.h"
#include "BuildingTargeter.h"
#include "AreaSpell.h"
#include "Tower.h"
#undef private
#undef protected

using namespace std;
typedef array<int, 8> Deck;
static int NT = 4;

// ------------------------------------------------------------------ names / decks
static string norm(const string& s) { string r; for (char c : s) if (isalnum((unsigned char)c)) r += (char)tolower((unsigned char)c); return r; }
static map<string, vector<int>> NAME2IDS;
static void initNames() {
  if (!NAME2IDS.empty()) return;
  for (auto& kv : CardRegistry::getInstance().getAllCards()) NAME2IDS[norm(kv.second.name)].push_back(kv.first);
  for (auto& kv : NAME2IDS) sort(kv.second.begin(), kv.second.end());
}
static int cardByName(string tok) {
  initNames(); while (!tok.empty() && tok[0] == ' ') tok.erase(0, 1);
  bool evo = false; bool hero = false;
  if (tok.rfind("evo:", 0) == 0) { evo = true; tok = tok.substr(4); }
  if (tok.rfind("hero:", 0) == 0) { hero = true; tok = tok.substr(5); }
  if (!tok.empty() && isdigit((unsigned char)tok[0])) return atoi(tok.c_str());
  string key = norm(tok); if (hero) key = norm("Hero " + tok);
  auto it = NAME2IDS.find(key); if (it == NAME2IDS.end()) { fprintf(stderr, "unknown card '%s'\n", tok.c_str()); exit(1); }
  for (int id : it->second) { auto* d = CardRegistry::getInstance().getCard(id); if (evo ? d->isEvolution : !d->isEvolution) return id; }
  fprintf(stderr, "no %s variant of '%s'\n", evo ? "evolution" : "base", tok.c_str()); exit(1);
}
static Deck parseDeck(const string& s) {
  Deck d{}; stringstream ss(s); string k; int i = 0; while (getline(ss, k, ',') && i < 8) d[i++] = cardByName(k);
  if (i != 8) { fprintf(stderr, "deck needs 8 cards: %s\n", s.c_str()); exit(1); }
  string why = validateDeckSlots(vector<int>(d.begin(), d.end())); if (!why.empty()) { fprintf(stderr, "illegal deck (%s): %s\n", why.c_str(), s.c_str()); exit(1); }
  return d;
}
static string deckStr(const Deck& d) { string s; for (int i = 0; i < 8; i++) { auto* c = CardRegistry::getInstance().getCard(d[i]); if (i) s += ","; s += (c->isEvolution ? "evo:" : "") + c->name; } return s; }

// ------------------------------------------------------------------ card profiles
struct Prof {
  bool ok = false, spell = false, building = false, flying = false, air = false, bo = false, anywhere = false, champ = false;
  int n = 0; float hp = 0, dps = 0, range = 0, splash = 0, radius = 0, dmg = 0, cost = 0; int bodies = 1;
};
static vector<Prof> PROF;
static void initProfiles() {
  initNames(); PROF.assign(CARD_ID_COUNT, Prof());
  for (auto& kv : CardRegistry::getInstance().getAllCards()) {
    const CardDefinition& d = kv.second; Prof p; p.cost = d.cost; p.spell = d.isSpell; p.building = d.isBuilding; p.anywhere = d.deployAnywhere; p.champ = d.isChampion || d.isHero;
    if (d.id == GameManager::MIRROR_CARD_ID || d.id == GameManager::SPIRIT_EMPRESS_CARD_ID) { p.ok = false; PROF[d.id] = p; continue; }
    Board b; b.currentTick = 0;
    try { d.spawnEntity(9.0f, 8.0f, 0, b); b.commitPendingEntities(0); } catch (...) { PROF[d.id] = p; continue; }
    for (auto& e : b.getEntities()) {
      if (auto* sp = dynamic_cast<AreaSpell*>(e.get())) { p.radius = sp->radius; p.dmg = (float)sp->damage; p.ok = true; continue; }
      auto* ce = dynamic_cast<CombatEntity*>(e.get()); if (!ce) continue;
      p.ok = true; p.n++; p.hp += (float)ce->hp; p.range = max(p.range, ce->attackRange);
      if (ce->attackCooldown > 0) p.dps += (float)ce->getCurrentDamage() / (ce->attackCooldown / 10.0f);
      if (ce->isFlying) p.flying = true; if (ce->targetsAir) p.air = true; p.splash = max(p.splash, ce->splashRadius);
      if (dynamic_cast<BuildingTargeter*>(e.get())) p.bo = true;
    }
    p.ok = p.ok; PROF[d.id] = p;
  }
}

// ------------------------------------------------------------------ players
struct Policy { float react, attackElixir, spellAggro, supportElixir; int lookahead; bool cont = false; };
static vector<Policy> POL = {
    {0.9f, 9.0f, 0.4f, 5.0f, 0}, {0.8f, 6.0f, 0.7f, 4.0f, 0}, {1.2f, 4.0f, 1.0f, 3.0f, 0},
    {0.8f, 6.0f, 0.7f, 4.0f, 60}, {0.8f, 6.0f, 0.7f, 4.0f, 100},   // 3,4: lookahead players (rollout horizon in ticks)
    {0.8f, 6.0f, 0.7f, 4.0f, 100, true}, {0.8f, 6.0f, 0.7f, 4.0f, 160, true}, {0.8f, 6.0f, 0.7f, 4.0f, 240, true},  // 5,6,7: long horizon + own continuation
};
static void initPolicies() {
  if (POL.size() > 8) return;
  for (float react : {0.6f, 1.4f}) for (float att : {4.0f, 6.5f, 9.0f}) for (float sp : {0.3f, 1.0f}) for (float sup : {3.0f, 5.0f}) POL.push_back({react, att, sp, sup, 0});
}

struct Rng { uint64_t s; explicit Rng(uint64_t x = 1) : s(x * 2685821657736338717ULL + 1442695040888963407ULL) { for (int i = 0; i < 6; i++) next(); }
  uint64_t next() { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return s; } float uni() { return (next() >> 11) * (1.0f / 9007199254740992.0f); } int below(int n) { return (int)(next() % (uint64_t)n); } };

struct Player {
  int team; Policy pol; Rng rng; int nextThink = 0; int atkLane = 0; const vector<float>* net = nullptr;
  Player(int t, const Policy& p, uint64_t seed) : team(t), pol(p), rng(seed) { nextThink = 3 + rng.below(4); }
  float oy(float y) const { return team == 0 ? y : ArenaLayout::mirrorY(y); }  // own-frame y (own side is low y)
  float wy(float y) const { return team == 0 ? y : ArenaLayout::mirrorY(y); }
};

static float entVal(const Entity& e, const vector<shared_ptr<Entity>>& all) {
  auto* d = CardRegistry::getInstance().getCard(e.cardId); if (!d) return 0.4f;
  int cnt = 0; for (auto& o : all) if (o->isAlive() && o->team == e.team && o->cardId == e.cardId && fabsf(o->position.x - e.position.x) < 5 && fabsf(o->position.y - e.position.y) < 5) cnt++;
  return d->cost / (float)max(1, PROF[e.cardId].n > 0 ? PROF[e.cardId].n : cnt);
}

// one decision; returns true if a card was played
static bool think(GameManager& g, Player& P) {
  int team = P.team, en = 1 - team; const auto& hand = g.getHand(team); float el = g.getElixir(team);
  const Board& bd = g.getBoard(); auto& ents = const_cast<Board&>(bd).getEntities();
  const float riverStart = bd.getRiverStart(); const float maxOwnY = g.getOwnHalfMaxY();
  struct Th { const Entity* e; float ex, ey; float v; };
  vector<Th> th[2]; float lw[2] = {0, 0}, lwc[2] = {0, 0}; bool any = false;
  const Entity* enemyTower[3] = {nullptr, nullptr, nullptr}; int ntw = 0; float enemyTowerHp[3] = {0, 0, 0};
  for (auto& ep : ents) {
    const Entity* e = ep.get(); if (!e->isAlive()) continue;
    if (e->isTower()) { if (e->team == en && ntw < 3) { enemyTower[ntw] = e; enemyTowerHp[ntw] = (float)e->hp; ntw++; } continue; }
    if (e->team != en || !e->isTargetable() || e->isBuilding()) continue;
    if (!dynamic_cast<const Troop*>(e)) continue;
    float ey = P.oy(e->position.y), ex = e->position.x; int lane = ex < ArenaLayout::CENTER_X ? 0 : 1; float v = entVal(*e, ents) + 0.3f;
    if (ey <= riverStart + 0.5f) { th[lane].push_back({e, ex, ey, v}); lw[lane] += v; lwc[lane] += v; any = true; }
    else if (ey <= riverStart + 7.5f) { const Prof& pr = PROF[e->cardId >= 0 ? e->cardId : 0]; (void)pr; th[lane].push_back({e, ex, riverStart - 0.5f, v}); lw[lane] += 0.7f * v; }
  }
  (void)any; int lane = lw[0] >= lw[1] ? 0 : 1; bool crossed = lwc[lane] > 0; bool threat = lw[lane] >= P.pol.react && !th[lane].empty();
  // own push
  const Entity* lead = nullptr; float leadY = -1;
  for (auto& ep : ents) { const Entity* e = ep.get(); if (!e->isAlive() || e->team != team || e->isTower() || e->isBuilding() || !dynamic_cast<const Troop*>(e)) continue; float ey = P.oy(e->position.y); if (ey >= riverStart + 1.0f && ey > leadY) { leadY = ey; lead = e; } }

  struct Act { int slot; float x, y; float score; }; Act best{-1, 0, 0, 0};
  auto offer = [&](int slot, float x, float y, float sc) { if (sc > best.score) best = {slot, x, y, sc}; };
  float Thp = 0, Tdps = 0, Tval = 0; int Tn = 0; bool Tair = false, Tgnd = false, Tbo = false; float clx = ArenaLayout::CENTER_X, cly = 8;
  if (threat) { float minY = 99; for (auto& t : th[lane]) { const Prof& pr = PROF[t.e->cardId >= 0 ? t.e->cardId : 0]; Thp += (float)t.e->hp; auto* ce = dynamic_cast<const CombatEntity*>(t.e); if (ce && ce->attackCooldown > 0) Tdps += (float)ce->getCurrentDamage() / (ce->attackCooldown / 10.0f); Tval += t.v; Tn++; if (t.e->isFlying) Tair = true; else Tgnd = true; if (pr.bo) Tbo = true; if (t.ey < minY) { minY = t.ey; clx = t.ex; cly = t.ey; } } }

  for (int s = 0; s < (int)hand.size(); s++) {
    int cid = hand[s]; const Prof& pr = PROF[cid]; if (!pr.ok && cid != GameManager::MIRROR_CARD_ID) continue; if (el < pr.cost) continue;
    auto* def = CardRegistry::getInstance().getCard(cid);
    if (pr.spell) {
      if (pr.radius <= 0) continue;
      // offensive/defensive spell evaluation: best centre among enemy units and towers
      float bestV = 0, bx = 9, by = 20;
      vector<pair<float, float>> cen;
      for (auto& ep : ents) { const Entity* e = ep.get(); if (!e->isAlive() || e->team != en) continue; if (e->isTower()) { if (e->team == en) cen.push_back({e->position.x, e->position.y}); continue; } if (e->isTargetable()) cen.push_back({e->position.x, e->position.y}); }
      for (auto& c : cen) {
        float v = 0;
        for (auto& ep : ents) { const Entity* e = ep.get(); if (!e->isAlive() || e->team != en || !e->isTargetable()) continue; float dd = sqrtf((e->position.x - c.first) * (e->position.x - c.first) + (e->position.y - c.second) * (e->position.y - c.second));
          if (e->isTower()) { if (dd <= pr.radius + 1.3f) { float td = pr.dmg * 0.3f; v += td / 3000.0f * 3.0f + (e->hp <= td ? 6.0f : 0.0f); } continue; }
          if (dd > pr.radius) continue; float hp = (float)e->hp; float frac = pr.dmg >= hp ? 1.0f : 0.3f * pr.dmg / hp; v += entVal(*e, ents) * frac; }
        if (v > bestV) { bestV = v; bx = c.first; by = c.second; }
      }
      float need = pr.cost * (1.25f - 0.45f * P.pol.spellAggro);
      if (bestV >= need) offer(s, bx, by, 0.9f + (bestV - need) / max(1.0f, pr.cost));
      continue;
    }
    if (!threat) continue;
    float myHp = pr.hp, myDps = pr.dps * (pr.splash > 0 && Tn > 1 ? 1.0f + 0.5f * min(Tn - 1, 3) : 1.0f); float score;
    if (Tair && !Tgnd && !pr.air) continue;
    if (pr.building) {
      if (pr.dps <= 0) continue; myHp *= 0.65f; float tk = Thp / max(myDps, 1.0f), tm = myHp / max(Tdps, 1.0f);
      score = min(tm / max(tk, 0.5f), 2.5f) * min(2.0f, max(0.4f, Tval / pr.cost)); if (Tbo) score *= 3.0f; if (Tair && !pr.air) score *= 0.5f;
      if (score > 0.6f) offer(s, ArenaLayout::CENTER_X + (clx < ArenaLayout::CENTER_X ? -1.5f : 1.5f), P.wy(9.5f), score);
      continue;
    }
    if (pr.bo) score = (myHp > 1500 && crossed) ? 0.4f : 0.2f;
    else { float tk = Thp / max(myDps, 1.0f), tm = myHp / max(Tdps, 1.0f); score = min(tm / max(tk, 0.5f), 2.5f) * min(2.0f, max(0.4f, Tval / pr.cost)); if (pr.range > 2) score *= 1.15f; if (Tair && Tgnd && !pr.air) score *= 0.6f; if (!Tair && Tgnd && pr.range <= 0) score *= 1.0f; }
    float py = min(maxOwnY - 0.5f, max(4.0f, cly - (pr.range > 3.0f ? 5.0f : 2.5f)));
    if (score > (crossed ? 0.12f : 0.6f)) offer(s, clx, P.wy(py), score);
  }
  if (best.slot >= 0 && best.score >= (crossed ? 0.12f : 0.6f)) {
    int cid = hand[best.slot]; float x = best.x, y = best.y;
    // spells were recorded in world coordinates; troops/buildings in world x and already-world y
    return g.playCard(team, cid, x, y);
  }
  if (threat) return false;

  // offence
  float lowHp[2] = {1e9f, 1e9f};
  for (int i = 0; i < ntw; i++) { float x = enemyTower[i]->position.x; int l = x < ArenaLayout::CENTER_X ? 0 : 1; if (enemyTower[i]->name.find("King") == string::npos) lowHp[l] = min(lowHp[l], enemyTowerHp[i]); }
  int atk = lowHp[0] < lowHp[1] ? 0 : (lowHp[1] < lowHp[0] ? 1 : P.rng.below(2)); float laneX = atk == 0 ? ArenaLayout::LEFT_LANE_X : ArenaLayout::RIGHT_LANE_X;
  if (lead && el >= P.pol.supportElixir) {
    int bs = -1; float bsScore = 0;
    for (int s = 0; s < (int)hand.size(); s++) { int cid = hand[s]; const Prof& pr = PROF[cid]; if (!pr.ok || pr.spell || pr.building || el < pr.cost) continue; float sc = pr.hp * (pr.dps + 1) / 1e5f / pr.cost; if (pr.bo) sc *= 0.5f; sc += P.rng.uni() * 0.2f; if (sc > bsScore) { bsScore = sc; bs = s; } }
    if (bs >= 0) { float ly = P.oy(lead->position.y); return g.playCard(team, hand[bs], lead->position.x, P.wy(min(maxOwnY - 0.5f, max(2.0f, ly - 4.0f)))); }
  }
  if (el >= P.pol.attackElixir && !lead) {
    int bs = -1; float bsScore = -1;
    for (int s = 0; s < (int)hand.size(); s++) { int cid = hand[s]; const Prof& pr = PROF[cid]; if (!pr.ok || el < pr.cost) continue; auto* def = CardRegistry::getInstance().getCard(cid);
      if (pr.building && !pr.anywhere) continue;
      if (pr.spell) { if (pr.radius <= 0 && pr.dmg <= 0 && def->rollRange <= 0) {} if (def->name.find("Barrel") != string::npos && def->name.find("Goblin") != string::npos && el >= pr.cost + 1) { float sc = 3.0f + P.rng.uni(); if (sc > bsScore) { bsScore = sc; bs = s; } } else if (def->name == "Royal Delivery" && el >= pr.cost + 1) { float sc = 3.0f + P.rng.uni(); if (sc > bsScore) { bsScore = sc; bs = s; } } continue; }
      float sc = (pr.bo || pr.anywhere) ? 5.0f + pr.cost * 0.1f : pr.hp / 1000.0f; sc += P.rng.uni() * 0.5f; if (sc > bsScore) { bsScore = sc; bs = s; } }
    if (bs >= 0) { int cid = hand[bs]; const Prof& pr = PROF[cid]; auto* def = CardRegistry::getInstance().getCard(cid); float py;
      if (pr.spell) py = 27.0f; else if (pr.building || pr.anywhere) py = 22.5f; else if (pr.bo && pr.range <= 1.5f && pr.dps > 0 && !pr.flying && pr.hp < 2500) py = 13.8f; else if (pr.bo) py = 4.0f; else py = 8.0f;
      (void)def; return g.playCard(team, cid, laneX, P.wy(py)); }
  }
  if (el >= 9.6f) { int bs = -1; float bc = 99; for (int s = 0; s < (int)hand.size(); s++) { const Prof& pr = PROF[hand[s]]; if (!pr.ok || pr.spell || pr.building || el < pr.cost) continue; if (pr.cost < bc) { bc = pr.cost; bs = s; } } if (bs >= 0) return g.playCard(team, hand[bs], laneX, P.wy(7.0f)); }
  return false;
}


// ------------------------------------------------------------------ lookahead player
static double evalState(const GameManager& g, int team) {
  const Board& bd = g.getBoard(); auto& ents = const_cast<Board&>(bd).getEntities(); double v = 0;
  for (auto& ep : ents) {
    const Entity* e = ep.get(); if (!e->isAlive()) continue; double sgn = e->team == team ? 1.0 : -1.0;
    if (e->isTower()) { bool king = e->name.find("King") != string::npos; v += sgn * (double)e->hp / (king ? 500.0 : 350.0); continue; }
    if (e->cardId < 0 || e->cardId >= (int)PROF.size() || !PROF[e->cardId].ok) continue; const Prof& pr = PROF[e->cardId]; if (pr.spell) continue;
    if (!e->isTargetable() && !e->isBuilding()) continue;
    double maxhp = pr.n > 0 ? pr.hp / pr.n : max(1.0f, (float)e->hp); double frac = min(1.0, (double)e->hp / max(1.0, maxhp)); double val = pr.n > 0 ? pr.cost / pr.n : 0.4;
    v += sgn * val * (0.3 + 0.7 * frac);
  }
  int tw = 0; for (auto& ep : ents) if (ep->isTower() && ep->isAlive() && ep->team == team) tw++;  // towers alive mine
  int te = 0; for (auto& ep : ents) if (ep->isTower() && ep->isAlive() && ep->team != team) te++;
  v += (3 - te) * 8.0 - (3 - tw) * 8.0;  // crown value
  v += g.getElixir(team) - g.getElixir(1 - team);
  return v;
}

static bool searchThink(GameManager& g, Player& P) {
  int team = P.team, en = 1 - team; const auto& hand = g.getHand(team); float el = g.getElixir(team); int H = P.pol.lookahead;
  const Board& bd = g.getBoard(); auto& ents = const_cast<Board&>(bd).getEntities(); const float maxOwnY = g.getOwnHalfMaxY();
  struct Cand { int slot; float x, y; };
  vector<Cand> cands; float minCost = 99; for (int s = 0; s < (int)hand.size(); s++) minCost = min(minCost, PROF[hand[s]].cost);
  if (el < minCost) return false;
  // enemy geometry for candidate placement
  struct En { float x, y, v; }; vector<En> enemies; const Entity* lowTower[2] = {nullptr, nullptr};
  for (auto& ep : ents) { const Entity* e = ep.get(); if (!e->isAlive() || e->team != en) continue;
    if (e->isTower()) { if (e->name.find("King") == string::npos) { int l = e->position.x < ArenaLayout::CENTER_X ? 0 : 1; lowTower[l] = e; } continue; }
    if (e->isTargetable()) enemies.push_back({e->position.x, e->position.y, entVal(*e, ents)}); }
  sort(enemies.begin(), enemies.end(), [](const En& a, const En& b) { return a.v > b.v; });
  const float lx[2] = {ArenaLayout::LEFT_LANE_X, ArenaLayout::RIGHT_LANE_X};
  for (int s = 0; s < (int)hand.size(); s++) {
    int cid = hand[s]; const Prof& pr = PROF[cid]; if ((!pr.ok && cid != GameManager::MIRROR_CARD_ID) || el < pr.cost) continue;
    if (pr.spell) {
      int k = 0; for (auto& e : enemies) { if (k++ >= 3) break; cands.push_back({s, e.x, e.y}); }
      for (int l = 0; l < 2; l++) if (lowTower[l]) cands.push_back({s, lowTower[l]->position.x, lowTower[l]->position.y - (team == 0 ? 0.5f : -0.5f)});
      if (PROF[cid].anywhere || CardRegistry::getInstance().getCard(cid)->name.find("Barrel") != string::npos || CardRegistry::getInstance().getCard(cid)->name == "Royal Delivery")
        for (int l = 0; l < 2; l++) cands.push_back({s, lx[l], P.wy(24.5f)});
      continue;
    }
    if (pr.building) {
      if (pr.anywhere) { for (int l = 0; l < 2; l++) cands.push_back({s, lx[l], P.wy(22.5f)}); }
      else { cands.push_back({s, ArenaLayout::CENTER_X - 2.5f, P.wy(9.5f)}); cands.push_back({s, ArenaLayout::CENTER_X + 2.5f, P.wy(9.5f)}); cands.push_back({s, ArenaLayout::CENTER_X, P.wy(10.5f)}); }
      continue;
    }
    if (pr.anywhere) { for (int l = 0; l < 2; l++) cands.push_back({s, lx[l], P.wy(24.0f)}); continue; }
    for (int l = 0; l < 2; l++) {
      cands.push_back({s, lx[l], P.wy(min(maxOwnY - 0.5f, 13.5f))});   // bridge
      cands.push_back({s, lx[l], P.wy(8.0f)});                         // mid
      cands.push_back({s, lx[l], P.wy(3.5f)});                         // behind tower
    }
    // counter placement next to the deepest enemy troop
    float bestY = -99; const En* deep = nullptr; for (auto& e : enemies) { float ey = P.oy(e.y); if (ey < 15.5f && (ey > bestY || !deep)) { bestY = ey; deep = &e; } }
    if (deep) cands.push_back({s, deep->x, P.wy(min(maxOwnY - 0.5f, max(4.0f, bestY - 2.5f)))});
  }
  if (cands.empty()) return false;
  auto rollout = [&](int ci) -> double {
    GameManager c = g.snapshot();
    if (ci >= 0 && !c.playCard(team, hand[cands[ci].slot], cands[ci].x, cands[ci].y)) return -1e9;
    Player opp(en, POL[1], 77 + c.currentTick); Player me(team, POL[1], 91 + c.currentTick);
    for (int k = 0; k < H; k++) { c.step(); if (k % 6 == 5) { think(c, opp); } if (P.pol.cont && k % 6 == 2) think(c, me); }
    return evalState(c, team);
  };
  double base = rollout(-1); double bestV = base + 0.6; int bi = -1;
  for (int i = 0; i < (int)cands.size(); i++) { double v = rollout(i); if (v > bestV) { bestV = v; bi = i; } }
  if (bi < 0) return false;
  return g.playCard(team, hand[cands[bi].slot], cands[bi].x, cands[bi].y);
}


// ------------------------------------------------------------------ learned policy (small MLP, trained by evolution strategies)
static const int NIN = 70, NHID = 48, NSLOT = 5, NPLACE = 9, NOUT = NSLOT + NPLACE;
static const int NPARAM = NIN * NHID + NHID + NHID * NOUT + NOUT;

static void placements(GameManager& g, Player& P, int slot, vector<pair<float, float>>& out) {
  out.clear(); int team = P.team, en = 1 - team; int cid = g.getHand(team)[slot]; const Prof& pr = PROF[cid]; auto* def = CardRegistry::getInstance().getCard(cid);
  const Board& bd = g.getBoard(); auto& ents = const_cast<Board&>(bd).getEntities(); const float maxOwnY = g.getOwnHalfMaxY();
  const float lx[2] = {ArenaLayout::LEFT_LANE_X, ArenaLayout::RIGHT_LANE_X}; const float C = ArenaLayout::CENTER_X;
  struct En { float x, y, v; }; vector<En> enemies; const Entity* tow[2] = {nullptr, nullptr}; const Entity* lead = nullptr; float leadY = -1;
  for (auto& ep : ents) { const Entity* e = ep.get(); if (!e->isAlive()) continue;
    if (e->team == en) { if (e->isTower()) { if (e->name.find("King") == string::npos) tow[e->position.x < C ? 0 : 1] = e; continue; } if (e->isTargetable()) enemies.push_back({e->position.x, e->position.y, entVal(*e, ents)}); }
    else if (!e->isTower() && !e->isBuilding() && dynamic_cast<const Troop*>(e)) { float ey = P.oy(e->position.y); if (ey > leadY) { leadY = ey; lead = e; } } }
  sort(enemies.begin(), enemies.end(), [](const En& a, const En& b) { return a.v > b.v; });
  const En* deep = nullptr; float deepY = -99; for (auto& e : enemies) { float ey = P.oy(e.y); if (ey < 15.5f && (ey > deepY || !deep)) { deepY = ey; deep = &e; } }
  auto push = [&](float x, float y) { out.push_back({x, y}); };
  float bridgeY = min(maxOwnY - 0.5f, 13.5f);
  if (pr.spell) {
    for (int k = 0; k < 3; k++) { if (k < (int)enemies.size()) push(enemies[k].x, enemies[k].y); else push(C, P.wy(22.0f)); }
    for (int l = 0; l < 2; l++) { if (tow[l]) push(tow[l]->position.x, tow[l]->position.y); else push(lx[l], P.wy(25.0f)); }
    push(lx[0], P.wy(24.5f)); push(lx[1], P.wy(24.5f)); push(C, P.wy(27.0f)); if (deep) push(deep->x, deep->y); else push(C, P.wy(12.0f));
  } else if (pr.building && !pr.anywhere) {
    push(C - 2.5f, P.wy(9.5f)); push(C + 2.5f, P.wy(9.5f)); push(C, P.wy(10.5f)); push(lx[0], P.wy(12.0f)); push(lx[1], P.wy(12.0f)); push(C - 4.5f, P.wy(8.0f)); push(C + 4.5f, P.wy(8.0f)); push(C, P.wy(7.0f)); push(C, P.wy(12.5f));
  } else if (pr.anywhere || (def && def->deployAnywhere)) {
    push(lx[0], P.wy(22.5f)); push(lx[1], P.wy(22.5f)); push(lx[0], P.wy(24.0f)); push(lx[1], P.wy(24.0f)); push(lx[0], P.wy(20.5f)); push(lx[1], P.wy(20.5f)); push(C, P.wy(23.0f)); push(lx[0], P.wy(26.0f)); push(lx[1], P.wy(26.0f));
  } else {
    for (int l = 0; l < 2; l++) { push(lx[l], P.wy(3.5f)); push(lx[l], P.wy(8.0f)); push(lx[l], P.wy(bridgeY)); }
    if (deep) push(deep->x, P.wy(min(maxOwnY - 0.5f, max(4.0f, deepY - 2.5f)))); else push(lx[0], P.wy(6.0f));
    if (lead) push(lead->position.x, P.wy(min(maxOwnY - 0.5f, max(2.0f, P.oy(lead->position.y) - 4.0f)))); else push(lx[1], P.wy(6.0f));
    push(C, P.wy(8.0f));
  }
  while ((int)out.size() < NPLACE) out.push_back(out.back());
}

static void features(GameManager& g, Player& P, float* f) {
  int team = P.team, en = 1 - team; const auto& hand = g.getHand(team); const Board& bd = g.getBoard(); auto& ents = const_cast<Board&>(bd).getEntities(); int k = 0;
  f[k++] = g.getElixir(team) / 10.0f; f[k++] = g.getElixir(en) / 10.0f; f[k++] = min(1.0f, g.currentTick / 3600.0f); f[k++] = GameManager::elixirMultiplierAtTick(g.currentTick) / 3.0f;
  float th[2][3] = {{0, 0, 0}, {0, 0, 0}}; int cnt[2][2] = {{0, 0}, {0, 0}};
  for (auto& ep : ents) { const Entity* e = ep.get(); if (!e->isAlive() || !e->isTower()) continue; int side = e->team == team ? 0 : 1; int idx = e->name.find("King") != string::npos ? 2 : (cnt[side][0]++ == 0 ? 0 : 1); th[side][idx] = min(1.0f, e->hp / (idx == 2 ? 4824.0f : 3052.0f)); }
  for (int sd = 0; sd < 2; sd++) for (int i = 0; i < 3; i++) f[k++] = th[sd][i];
  for (int s = 0; s < 4; s++) { if (s < (int)hand.size()) { const Prof& pr = PROF[hand[s]]; f[k++] = pr.cost / 10.0f; f[k++] = g.getElixir(team) >= pr.cost ? 1.0f : 0.0f; f[k++] = pr.spell ? 1.0f : 0.0f; f[k++] = pr.building ? 1.0f : 0.0f; f[k++] = pr.bo ? 1.0f : 0.0f; f[k++] = pr.air ? 1.0f : 0.0f; f[k++] = min(1.0f, pr.hp / 3000.0f); f[k++] = min(1.0f, pr.dps / 500.0f); f[k++] = min(1.0f, pr.range / 7.0f); f[k++] = pr.flying ? 1.0f : 0.0f; } else for (int q = 0; q < 10; q++) f[k++] = 0; }
  // board: 2 lanes x 3 zones (own half / middle / enemy half in own frame) x (own value, enemy value) + enemy air per lane
  float own[2][3] = {{0, 0, 0}, {0, 0, 0}}, foe[2][3] = {{0, 0, 0}, {0, 0, 0}}, air[2] = {0, 0}; const float C = ArenaLayout::CENTER_X;
  for (auto& ep : ents) { const Entity* e = ep.get(); if (!e->isAlive() || e->isTower() || !e->isTargetable()) continue; int lane = e->position.x < C ? 0 : 1; float ey = P.oy(e->position.y); int z = ey < 12 ? 0 : (ey < 22 ? 1 : 2); float v = entVal(*e, ents);
    if (e->team == team) own[lane][z] += v; else { foe[lane][z] += v; if (e->isFlying) air[lane] += 1; } }
  for (int l = 0; l < 2; l++) { for (int z = 0; z < 3; z++) { f[k++] = min(1.0f, own[l][z] / 10.0f); f[k++] = min(1.0f, foe[l][z] / 10.0f); } f[k++] = min(1.0f, air[l] / 4.0f); }
  while (k < NIN) f[k++] = 0.0f;
}

static bool netThink(GameManager& g, Player& P) {
  const vector<float>& th = *P.net; int team = P.team; const auto& hand = g.getHand(team); float el = g.getElixir(team);
  float in[NIN]; features(g, P, in); float h[NHID]; const float* W1 = th.data(); const float* b1 = W1 + NIN * NHID; const float* W2 = b1 + NHID; const float* b2 = W2 + NHID * NOUT;
  for (int j = 0; j < NHID; j++) { float a = b1[j]; for (int i = 0; i < NIN; i++) a += in[i] * W1[i * NHID + j]; h[j] = tanhf(a); }
  float o[NOUT]; for (int q = 0; q < NOUT; q++) { float a = b2[q]; for (int j = 0; j < NHID; j++) a += h[j] * W2[j * NOUT + q]; o[q] = a; }
  int bs = -1; float bv = o[NSLOT - 1] + 0.0f;  // slot 4 = wait
  for (int s = 0; s < (int)hand.size() && s < 4; s++) { const Prof& pr = PROF[hand[s]]; if ((!pr.ok && hand[s] != GameManager::MIRROR_CARD_ID) || el < pr.cost) continue; if (o[s] > bv) { bv = o[s]; bs = s; } }
  if (bs < 0) return false;
  vector<pair<float, float>> pl; placements(g, P, bs, pl); int bp = 0; float pv = -1e9f; for (int p = 0; p < NPLACE; p++) if (o[NSLOT + p] > pv) { pv = o[NSLOT + p]; bp = p; }
  return g.playCard(team, hand[bs], pl[bp].first, pl[bp].second);
}

// champion / hero abilities: use when ready and enemies are close to own units or towers
static void useAbilities(GameManager& g, int team) {
  for (int slot = 1; slot <= 2; slot++) { if (g.isChampionAbilityReady(team, slot)) { int cnt = 0; for (auto& ep : g.getBoard().getEntities()) if (ep->isAlive() && ep->team != team && !ep->isTower() && ep->isTargetable()) cnt++; if (cnt >= 2) g.activateChampionAbility(team, slot); } }
}

struct Result { int winner; int crowns0, crowns1; int ticks; float hp0 = 0, hp1 = 0; };
static int towersAlive(const GameManager& g, int team) { int n = 0; for (auto& ep : g.getBoard().getEntities()) if (ep->isAlive() && ep->isTower() && ep->team == team && ep->name.find("King") == string::npos) n++; return n; }

static Result playMatch(const Deck& a, const Deck& b, int pa, int pb, uint64_t seed, const vector<float>* net0 = nullptr, const vector<float>* net1 = nullptr) {
  GameManager g(vector<int>(a.begin(), a.end()), vector<int>(b.begin(), b.end()));
  Player P0(0, POL[pa], seed * 3 + 1), P1(1, POL[pb], seed * 7 + 2); P0.net = net0; P1.net = net1;
  const int MAXT = 3600;  // regular 1800 + overtime; MatchRules ends the match itself
  while (!g.isGameOver() && g.currentTick < MAXT) {
    g.step();
    if (g.currentTick >= P0.nextThink) { useAbilities(g, 0); if (P0.net) netThink(g, P0); else if (P0.pol.lookahead) searchThink(g, P0); else think(g, P0); P0.nextThink = g.currentTick + (P0.pol.lookahead ? 6 : 4) + P0.rng.below(4); }
    if (g.currentTick >= P1.nextThink) { useAbilities(g, 1); if (P1.net) netThink(g, P1); else if (P1.pol.lookahead) searchThink(g, P1); else think(g, P1); P1.nextThink = g.currentTick + (P1.pol.lookahead ? 6 : 4) + P1.rng.below(4); }
  }
  Result r{-1, 3 - towersAlive(g, 1) - 0, 3 - towersAlive(g, 0), g.currentTick};
  r.crowns0 = 2 - towersAlive(g, 1); r.crowns1 = 2 - towersAlive(g, 0);
  for (auto& ep : g.getBoard().getEntities()) if (ep->isTower() && ep->isAlive()) { float fr = ep->hp / (ep->name.find("King") != string::npos ? 4824.0f : 3052.0f); (ep->team == 0 ? r.hp0 : r.hp1) += min(1.0f, fr) / 3.0f; }
  if (g.isGameOver()) r.winner = g.getLoserTeam() < 0 ? -1 : 1 - g.getLoserTeam();
  return r;
}

// ------------------------------------------------------------------ game value
static float solveValue(const vector<vector<float>>& m) {
  int R = m.size(), C = m[0].size(); vector<double> rc(R, 0), cc(C, 0), rs(R, 0), cs(C, 0), rp(R), cp(C);
  for (int it = 0; it < 3000; it++) {
    double sr = 0, sc = 0; for (int i = 0; i < R; i++) { rp[i] = max(0.0, rc[i]); sr += rp[i]; } for (int j = 0; j < C; j++) { cp[j] = max(0.0, cc[j]); sc += cp[j]; }
    for (int i = 0; i < R; i++) { rp[i] = sr > 0 ? rp[i] / sr : 1.0 / R; rs[i] += rp[i]; } for (int j = 0; j < C; j++) { cp[j] = sc > 0 ? cp[j] / sc : 1.0 / C; cs[j] += cp[j]; }
    double ev = 0; vector<double> ur(R, 0), uc(C, 0);
    for (int i = 0; i < R; i++) for (int j = 0; j < C; j++) { ur[i] += cp[j] * m[i][j]; uc[j] += rp[i] * (1 - m[i][j]); ev += rp[i] * cp[j] * m[i][j]; }
    for (int i = 0; i < R; i++) rc[i] += ur[i] - ev; for (int j = 0; j < C; j++) cc[j] += uc[j] - (1 - ev);
  }
  double sr = 0, sc = 0; for (double x : rs) sr += x; for (double x : cs) sc += x; vector<double> ar(R), ac(C); for (int i = 0; i < R; i++) ar[i] = rs[i] / sr; for (int j = 0; j < C; j++) ac[j] = cs[j] / sc;
  double worst = 1e9, best = -1e9; for (int j = 0; j < C; j++) { double u = 0; for (int i = 0; i < R; i++) u += ar[i] * m[i][j]; worst = min(worst, u); }
  for (int i = 0; i < R; i++) { double u = 0; for (int j = 0; j < C; j++) u += ac[j] * m[i][j]; best = max(best, u); }
  return (float)(0.5 * (worst + best));
}
static int NPOL = 3; static vector<int> POLSET;
static float matchupValue(const Deck& a, const Deck& b, int g, uint64_t seed) {
  initPolicies(); vector<int> ps = POLSET; if (ps.empty()) for (int i = 0; i < min<int>(NPOL, POL.size()); i++) ps.push_back(i); int np = ps.size(); vector<vector<float>> m(np, vector<float>(np, 0.5f));
  for (int ia = 0; ia < np; ia++) for (int ib = 0; ib < np; ib++) { int pa = ps[ia], pb = ps[ib]; double sum = 0;
    for (int k = 0; k < g; k++) { bool sw = k & 1; uint64_t sd = seed * 1000003ULL + pa * 131 + pb * 17 + k * 7919; Result r = sw ? playMatch(b, a, pb, pa, sd) : playMatch(a, b, pa, pb, sd);
      double v = r.winner < 0 ? 0.5 : ((r.winner == 0) == !sw ? 1.0 : 0.0); sum += v; }
    m[ia][ib] = (float)(sum / g); }
  return solveValue(m);
}


// ------------------------------------------------------------------ evolution strategies trainer
static vector<float> gauss(Rng& r, int n) { vector<float> v(n); for (int i = 0; i < n; i += 2) { float u1 = max(1e-7f, r.uni()), u2 = r.uni(); float m = sqrtf(-2.0f * logf(u1)); v[i] = m * cosf(6.2831853f * u2); if (i + 1 < n) v[i + 1] = m * sinf(6.2831853f * u2); } return v; }
// score of net playing `mine` vs `opp` (opponent uses rule/search policy index); alternates sides
static double netScore(const vector<float>& th, const Deck& mine, const Deck& opp, int oppPol, int games, uint64_t seed, double* winOut = nullptr) {
  double sc = 0, w = 0;
  for (int k = 0; k < games; k++) { bool sw = k & 1; uint64_t sd = seed * 7919 + k * 104729;
    Result r = sw ? playMatch(opp, mine, oppPol, 0, sd, nullptr, &th) : playMatch(mine, opp, 0, oppPol, sd, &th, nullptr);
    double win = r.winner < 0 ? 0.5 : ((r.winner == 0) == !sw ? 1.0 : 0.0); float myhp = sw ? r.hp1 : r.hp0, ophp = sw ? r.hp0 : r.hp1;
    sc += win + 0.15 * (myhp - ophp); w += win; }
  if (winOut) *winOut = w / games; return sc / games;
}
static void saveNet(const vector<float>& th, const string& f) { ofstream o(f, ios::binary); o.write((const char*)th.data(), th.size() * sizeof(float)); }
static bool loadNet(vector<float>& th, const string& f) { ifstream in(f, ios::binary); if (!in) return false; th.resize(NPARAM); in.read((char*)th.data(), NPARAM * sizeof(float)); return (bool)in; }

static void parFor(int n, const function<void(int)>& fn) { atomic<int> nx(0); vector<thread> th; for (int t = 0; t < NT; t++) th.emplace_back([&] { for (;;) { int i = nx++; if (i >= n) break; fn(i); } }); for (auto& x : th) x.join(); }
static vector<Deck> readDecks(const string& f) { vector<Deck> v; ifstream in(f); string l; while (getline(in, l)) { if (l.empty() || l[0] == '#') continue; size_t p = l.find('|'); if (p != string::npos) l = l.substr(p + 1); v.push_back(parseDeck(l)); } return v; }

int main(int argc, char** argv) {
  initPolicies(); initProfiles(); if (const char* e = getenv("CR_THREADS")) NT = atoi(e); if (const char* e = getenv("CR_NPOL")) NPOL = atoi(e); if (const char* e = getenv("CR_POLS")) { stringstream ss(e); string t; while (getline(ss, t, ',')) POLSET.push_back(atoi(t.c_str())); }
  string mode = argc > 1 ? argv[1] : "help";
  if (mode == "profile") {  // profile <name...>: show what the AI learns about a card
    for (int i = 2; i < argc; i++) { int id = cardByName(argv[i]); const Prof& p = PROF[id]; auto* d = CardRegistry::getInstance().getCard(id);
      printf("%3d %-18s cost %.0f %s%s%s ok=%d n=%d hp=%.0f dps=%.0f range=%.1f splash=%.1f air=%d flying=%d bo=%d radius=%.1f dmg=%.0f\n", id, d->name.c_str(), p.cost, p.spell ? "spell " : "", p.building ? "building " : "", d->isEvolution ? "evo " : "", p.ok, p.n, p.hp, p.dps, p.range, p.splash, p.air, p.flying, p.bo, p.radius, p.dmg); }
  } else if (mode == "game" && argc >= 4) {
    Deck a = parseDeck(argv[2]), b = parseDeck(argv[3]); int pa = argc > 5 ? atoi(argv[5]) : 1, pb = argc > 6 ? atoi(argv[6]) : 1; uint64_t seed = argc > 4 ? atoll(argv[4]) : 1;
    Result r = playMatch(a, b, pa, pb, seed); printf("winner=%d crowns %d-%d ticks=%d\n", r.winner, r.crowns0, r.crowns1, r.ticks);
  } else if (mode == "bench") {
    Deck a = parseDeck(argv[2]), b = parseDeck(argv[3]); int n = atoi(argv[4]); int w = 0, d = 0; double t3 = 0, tt = 0; for (int i = 0; i < n; i++) { Result r = playMatch(a, b, 1, 1, i + 1); if (r.winner == 0) w++; else if (r.winner < 0) d++; if (r.crowns0 == 2 || r.crowns1 == 2) t3++; tt += r.ticks; }
    printf("games %d  A wins %d  draws %d  3-crown-ish %.0f%%  avg ticks %.0f\n", n, w, d, 100.0 * t3 / n, tt / n);
  } else if (mode == "meta") {  // meta <decksfile> <g>
    vector<Deck> P = readDecks(argv[2]); int g = argc > 3 ? atoi(argv[3]) : 6; int n = P.size(); vector<vector<float>> M(n, vector<float>(n, 0.5f)); vector<pair<int, int>> jobs; for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) jobs.push_back({i, j});
    parFor((int)jobs.size(), [&](int k) { int i = jobs[k].first, j = jobs[k].second; float v = matchupValue(P[i], P[j], g, 700 + k); M[i][j] = v; M[j][i] = 1 - v; });
    printf("meta round robin, %d decks, NPOL=%d, g=%d\n     ", n, NPOL, g); for (int j = 0; j < n; j++) printf("%3d ", j + 1); printf("  mean\n");
    for (int i = 0; i < n; i++) { printf("%2d:  ", i + 1); double s = 0; for (int j = 0; j < n; j++) { printf("%3d ", (int)lround(100 * M[i][j])); if (j != i) s += M[i][j]; } printf("  %.2f  %s\n", s / (n - 1), deckStr(P[i]).c_str()); }
  } else if (mode == "es") {  // es <deckfile> <index(1-based)> <gens> <out> [pairs games sigma lr]
    vector<Deck> P = readDecks(argv[2]); int di = atoi(argv[3]) - 1; int gens = atoi(argv[4]); string out = argv[5];
    int pairs = argc > 6 ? atoi(argv[6]) : 24, games = argc > 7 ? atoi(argv[7]) : 6; float sigma = argc > 8 ? atof(argv[8]) : 0.15f, lr = argc > 9 ? atof(argv[9]) : 0.08f;
    Deck mine = P[di]; vector<Deck> opps; for (int i = 0; i < (int)P.size(); i++) if (i != di) opps.push_back(P[i]);
    Rng rng(12345); vector<float> th = gauss(rng, NPARAM); for (auto& x : th) x *= 0.1f; { float* b2 = th.data() + NIN * NHID + NHID + NHID * NOUT; b2[NSLOT - 1] = 0.5f; }
    if (const char* ini = getenv("CR_INIT")) loadNet(th, ini);
    for (int gen = 0; gen < gens; gen++) {
      vector<vector<float>> eps(pairs); for (int i = 0; i < pairs; i++) eps[i] = gauss(rng, NPARAM);
      vector<double> fp(pairs), fm(pairs); uint64_t gseed = 1000 + gen * 31;
      parFor(pairs * 2, [&](int idx) { int i = idx / 2; bool minus = idx & 1; vector<float> t(NPARAM); for (int q = 0; q < NPARAM; q++) t[q] = th[q] + (minus ? -sigma : sigma) * eps[i][q];
        double tot = 0; for (int o = 0; o < (int)opps.size(); o++) { int pol = (o % 3 == 0) ? 0 : (o % 3 == 1 ? 1 : 2); tot += netScore(t, mine, opps[o], pol, games, gseed + o * 13 + i * 0); } (minus ? fm : fp)[i] = tot / opps.size(); });
      // rank-based shaping over all 2*pairs fitnesses
      vector<pair<double, int>> all; for (int i = 0; i < pairs; i++) { all.push_back({fp[i], 2 * i}); all.push_back({fm[i], 2 * i + 1}); } sort(all.begin(), all.end());
      vector<double> rk(2 * pairs); for (int r = 0; r < (int)all.size(); r++) rk[all[r].second] = (double)r / (all.size() - 1) - 0.5;
      vector<double> grad(NPARAM, 0.0); for (int i = 0; i < pairs; i++) { double w = rk[2 * i] - rk[2 * i + 1]; for (int q = 0; q < NPARAM; q++) grad[q] += w * eps[i][q]; }
      for (int q = 0; q < NPARAM; q++) th[q] += (float)(lr / (pairs * sigma) * grad[q]);
      double mean = 0; for (int i = 0; i < pairs; i++) mean += fp[i] + fm[i]; mean /= 2 * pairs;
      if (gen % 5 == 0 || gen == gens - 1) { double win = 0; vector<double> ws(opps.size()); parFor((int)opps.size(), [&](int o) { double w; netScore(th, mine, opps[o], 1, 8, 555 + o, &w); ws[o] = w; }); for (double x : ws) win += x; printf("gen %3d  pop mean score %.3f  current-net winrate vs pool (rule policy 1) %.3f\n", gen, mean, win / opps.size()); fflush(stdout); saveNet(th, out); }
    }
  } else if (mode == "estest") {  // estest <deckfile> <index> <netfile> <games>   (env CR_OPPPOL = opponent policy index, default 1)
    vector<Deck> P = readDecks(argv[2]); int di = atoi(argv[3]) - 1; vector<float> th; if (!loadNet(th, argv[4])) { fprintf(stderr, "cannot load net\n"); return 1; } int games = atoi(argv[5]);
    int opp = getenv("CR_OPPPOL") ? atoi(getenv("CR_OPPPOL")) : 1;
    Deck mine = P[di]; printf("deck: %s\n%-4s %-9s %-9s %-9s   (win rate of OUR deck, %d games per cell, opponent plays policy %d)\n", deckStr(mine).c_str(), "opp", "learned", "rule1", "search5", games, opp);
    double tl = 0, tr = 0, ts = 0; int n = 0; vector<array<double, 3>> res(P.size());
    parFor((int)P.size(), [&](int o) { if (o == di) return; double w1; double sr = 0, ss = 0, sl = 0;
      for (int k = 0; k < games; k++) { bool sw = k & 1; uint64_t sd = (9000 + o) * 7919 + k * 104729;
        Result l = sw ? playMatch(P[o], mine, opp, 0, sd, nullptr, &th) : playMatch(mine, P[o], 0, opp, sd, &th, nullptr); sl += l.winner < 0 ? 0.5 : ((l.winner == 0) == !sw ? 1.0 : 0.0);
        Result r = sw ? playMatch(P[o], mine, opp, 1, sd) : playMatch(mine, P[o], 1, opp, sd); sr += r.winner < 0 ? 0.5 : ((r.winner == 0) == !sw ? 1.0 : 0.0);
        Result q = sw ? playMatch(P[o], mine, opp, 5, sd) : playMatch(mine, P[o], 5, opp, sd); ss += q.winner < 0 ? 0.5 : ((q.winner == 0) == !sw ? 1.0 : 0.0); }
      (void)w1; res[o] = {sl / games, sr / games, ss / games}; });
    for (int o = 0; o < (int)P.size(); o++) { if (o == di) continue; printf("%2d   %.2f      %.2f      %.2f\n", o + 1, res[o][0], res[o][1], res[o][2]); tl += res[o][0]; tr += res[o][1]; ts += res[o][2]; n++; }
    printf("mean %.3f      %.3f      %.3f\n", tl / n, tr / n, ts / n);
  } else printf("modes: profile <cards..> | game A B [seed pa pb] | bench A B n | meta <file> <g>\n");
  return 0;
}
