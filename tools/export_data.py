#!/usr/bin/env python3
"""Export Clash Royale unit/card data (level 11, tournament standard) from the
RoyaleAPI/cr-api-data JSON snapshot into a flat text file the C++ simulator loads.

Level resolution: per-level arrays end at level 19 for every rarity, so
level 11 is index len(arr) - 9.
"""
import json, sys, os

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/royaleapi/cr-api-data/docs/json"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data", "cr_data.txt")

d = json.load(open(os.path.join(SRC, "cards_stats.json")))
cards = json.load(open(os.path.join(SRC, "cards.json")))
chars = {c["name"]: c for c in d["characters"] if c.get("name")}
blds = {c["name"]: c for c in d["building"] if c.get("name")}
pj = {c["name"]: c for c in d["projectile"] if c.get("name")}
buffs = {c["name"]: c for c in d["character_buff"] if c.get("name")}
troopcards = {c["name"]: c for c in d["troop"] if c.get("name")}
spellcards = {c["name"]: c for c in d["spell"] if c.get("name")}


def lv(arr, base=None):
    if not arr:
        return base
    i = len(arr) - 9
    return arr[max(0, min(i, len(arr) - 1))]


def growth(rarity_len):
    return None


def ratio(arr, base):
    """L11 / base ratio for scaling fields that have no own per-level array."""
    v = lv(arr)
    if v is None or not base:
        return 1.0
    return v / base


def buff_info(name):
    b = buffs.get(name)
    if not b:
        return None
    return b


def unit_record(c, kind):
    r = {}
    hp = lv(c.get("hitpoints_per_level"), c.get("hitpoints") or 0)
    hpr = ratio(c.get("hitpoints_per_level"), c.get("hitpoints"))
    dmg = lv(c.get("damage_per_level"), c.get("damage") or 0)
    dmgr = ratio(c.get("damage_per_level"), c.get("damage"))
    p = pj.get(c.get("projectile")) if c.get("projectile") else None
    aoe = (c.get("area_damage_radius") or 0)
    ctp = c.get("crown_tower_damage_percent") or 0
    ptb = None
    if p:
        pdmg = lv(p.get("damage_per_level"), p.get("damage") or 0)
        if not dmg and pdmg:
            dmg = pdmg
            dmgr = ratio(p.get("damage_per_level"), p.get("damage"))
        if p.get("radius"):
            aoe = max(aoe, p["radius"])
        if p.get("crown_tower_damage_percent"):
            ctp = p["crown_tower_damage_percent"]
        if p.get("target_buff"):
            ptb = (p["target_buff"], p.get("buff_time") or 0)
    r["hp"] = hp
    r["dmg"] = dmg or 0
    r["dmgs"] = round((c.get("damage_special") or 0) * dmgr) if c.get("damage_special") else 0
    r["hit"] = c.get("hit_speed") or 0
    r["load"] = c.get("load_time") or 0
    r["rng"] = c.get("range") or 0
    r["minrng"] = c.get("minimum_range") or 0
    r["spd"] = c.get("speed") or 0
    r["sight"] = c.get("sight_range") or 0
    r["deploy"] = c.get("deploy_time") or 0
    r["rad"] = c.get("collision_radius") or 500
    r["mass"] = c.get("mass") or 1
    r["fly"] = 1 if (c.get("flying_height") or 0) > 0 else 0
    r["air"] = 1 if c.get("attacks_air") else 0
    r["gnd"] = 1 if c.get("attacks_ground") else 0
    r["bo"] = 1 if c.get("target_only_buildings") else 0
    r["life"] = c.get("life_time") or 0
    r["kami"] = 1 if c.get("kamikaze") else 0
    r["aoe"] = aoe
    r["ctp"] = ctp
    r["mp"] = c.get("multiple_projectiles") or 0
    r["mt"] = c.get("multiple_targets") or 0
    r["chg"] = c.get("charge_range") or 0
    r["chgm"] = c.get("charge_speed_multiplier") or 0
    r["shield"] = round((c.get("shield_hitpoints") or 0) * hpr) if c.get("shield_hitpoints") else 0
    r["sp_char"] = c.get("spawn_character") or "-"
    r["sp_num"] = c.get("spawn_number") or 0
    r["sp_pause"] = c.get("spawn_pause_time") or 0
    r["sp_start"] = c.get("spawn_start_time") or 0
    r["sp_int"] = c.get("spawn_interval") or 0
    r["sp_limit"] = c.get("spawn_limit") or 0
    r["ds_char"] = c.get("death_spawn_character") or "-"
    r["ds_num"] = c.get("death_spawn_count") or 0
    r["dd"] = round((c.get("death_damage") or 0) * dmgr) if c.get("death_damage") else 0
    r["ddr"] = c.get("death_damage_radius") or 0
    r["vd2"] = round((c.get("variable_damage2") or 0) * dmgr)
    r["vdt1"] = c.get("variable_damage_time1") or 0
    r["vd3"] = round((c.get("variable_damage3") or 0) * dmgr)
    r["selfaoe"] = 1 if c.get("self_as_aoe_center") else 0
    r["jumpriver"] = 1 if (c.get("jump_enabled") and c.get("target_only_buildings")) else 0
    r["dashdmg"] = round((c.get("dash_damage") or 0) * dmgr) if c.get("dash_damage") else 0
    r["dashrad"] = c.get("dash_radius") or 0
    r["dashmin"] = c.get("dash_min_range") or 0
    r["dashmax"] = c.get("dash_max_range") or 0
    r["dashcd"] = c.get("dash_cooldown") or 0
    r["vdt2"] = c.get("variable_damage_time2") or 0
    r["mana"] = c.get("mana_generate_time_ms") or 0
    r["dash"] = c.get("dash_count") or 0
    r["jump"] = 1 if c.get("dash_damage") else 0
    r["ability"] = 1 if c.get("ability") else 0
    r["hidden"] = 1 if (c.get("hides_when_not_attacking") or c.get("hide_time_ms")) else 0
    bod = c.get("buff_on_damage")
    r["bod"] = bod or "-"
    r["bodt"] = c.get("buff_on_damage_time") or 0
    if ptb:
        r["bod"], r["bodt"] = ptb
    r["rarity"] = c.get("rarity") or "-"
    r["kind"] = kind
    r["pushb"] = 0
    if p and p.get("pushback"):
        r["pushb"] = p["pushback"]
    r["ignb"] = 0
    return r


records = {}
for n, c in chars.items():
    records[n] = unit_record(c, "troop")
for n, c in blds.items():
    if n in records:
        continue
    records[n] = unit_record(c, "building")

# ---- buffs actually referenced ----
used_buffs = set()
for r in records.values():
    if r["bod"] != "-":
        used_buffs.add(r["bod"])

# ---- cards ----
# projectile-only spells (no stat entry): manual mapping to projectiles
PROJ_SPELLS = {
    "Fireball": dict(pj="FireballSpell"),
    "Arrows": dict(pj="ArrowsSpell"),
    "Rocket": dict(pj="RocketSpell"),
    "Snowball": dict(pj="SnowballSpell"),
    "Log": dict(pj="LogProjectileRolling"),
    "BarbLog": dict(pj="BarbLogProjectileRolling"),
    "GoblinBarrel": dict(pj="GoblinBarrelSpell"),
}

out = []
out.append("# generated by tools/export_data.py from RoyaleAPI/cr-api-data (level 11)")
for n, r in sorted(records.items()):
    out.append("U " + n + " " + " ".join(f"{k}={v}" for k, v in r.items()))

for n in sorted(used_buffs | {"Freeze", "ZapFreeze", "Rage", "IceWizardSlowDown", "Poison", "Tornado"}):
    b = buffs.get(n)
    if b:
        out.append(f"B {n} hsm={b.get('hit_speed_multiplier') or 0} spm={b.get('speed_multiplier') or 0} dps={b.get('damage_per_second') or 0} freq={b.get('hit_frequency') or 0} ctp={b.get('crown_tower_damage_percent') or 0}")

def proj_rec(pname):
    p = pj[pname]
    dm = lv(p.get("damage_per_level"), p.get("damage") or 0)
    tb = p.get("target_buff") or "-"
    return dict(dmg=dm or 0, rad=p.get("radius") or p.get("projectile_radius") or 0, ctp=p.get("crown_tower_damage_percent") or 0,
                push=p.get("pushback") or 0, air=1 if p.get("aoe_to_air") else 0, gnd=1 if p.get("aoe_to_ground") else 0,
                buff=tb, bufft=p.get("buff_time") or 0, spd=p.get("speed") or 0,
                sch=p.get("spawn_character") or "-", scn=p.get("spawn_character_count") or 0,
                sdt=p.get("spawn_character_deploy_time") or 0, rangep=p.get("projectile_range") or 0,
                pwidth=p.get("projectile_radius") or 0)

for c in cards:
    key = c["key"]; sc = c["sc_key"]; typ = c["type"]; el = c["elixir"]
    line = f"K {key} type={typ} elixir={el} sc={sc.replace(' ', '')}"
    if sc in troopcards:
        t = troopcards[sc]
        line += f" char={t.get('summon_character') or '-'} num={t.get('summon_number') or 1} srad={t.get('summon_radius') or 0} sdel={t.get('summon_deploy_delay') or 0} rarity={c['rarity']}"
    elif sc.replace(" ", "") in blds:
        line += f" bld={sc.replace(' ', '')} rarity={c['rarity']}"
    elif sc in spellcards:
        s = spellcards[sc]
        line += f" area={sc} rarity={c['rarity']}"
        line += f" life={s.get('life_duration') or 0} arad={s.get('radius') or 0} adamg={lv(s.get('damage_per_level'), s.get('damage') or 0)} actp={s.get('crown_tower_damage_percent') or 0}"
        bd = buffs.get(s.get('buff')) or {}
        st = {"Common": 1, "Rare": 3, "Epic": 6, "Legendary": 9, "Champion": 11}.get(c["rarity"], 1)
        line += f" adps={round((bd.get('damage_per_second') or 0) * 1.1 ** (11 - st))}"
        line += f" abuff={s.get('buff') or '-'} abufft={s.get('buff_time') or 0} freq={s.get('hit_speed') or 0} own={1 if s.get('only_own_troops') else 0} enemy={1 if s.get('only_enemies') else 0}"
        line += f" sumchar={s.get('summon_character') or '-'} spawnchar={s.get('spawn_character') or '-'}"
    else:
        m = None
        for k2, v in PROJ_SPELLS.items():
            if sc.replace(" ", "") == k2 or (k2 == "Snowball" and sc == "Snowball"):
                m = v
        if m:
            pr = proj_rec(m["pj"])
            line += " proj=" + m["pj"] + " rarity=" + c["rarity"] + " " + " ".join(f"p_{k}={v}" for k, v in pr.items())
        else:
            line += " unsupported=1"
    out.append(line)

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
open(OUT, "w").write("\n".join(out) + "\n")
print("wrote", OUT, len(out), "lines;", len(records), "units;", len(cards), "cards")
