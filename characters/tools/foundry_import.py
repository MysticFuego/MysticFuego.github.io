#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
foundry_import.py — turn a Foundry VTT dnd5e actor export into a character sheet.

    python3 foundry_import.py ACTOR.json OVERLAY.json -o ../sky_scarlet.html

The actor JSON supplies every number (abilities, skills, HP, AC, weapons,
spells, gear). The overlay JSON supplies the things a Foundry export cannot
know: the sheet's colour theme and the hand-written flavour — the "Don't
Forget" reminders, how actions are grouped, and the condensed feature
bullets. Keeping them apart means you can re-run this after a level-up
without losing any of the authored text.

The generated sheet links ../characters/sheet.css and sheet.js, so it picks
up the shared engine (dice roller, trackers, rests) automatically.
"""
import json, re, html, argparse, os, sys, urllib.parse

# ─────────────────────────────────────────────────────────── extraction ──

SKILLS = [
    ("acr", "Acrobatics", "dex"), ("ani", "Animal Handling", "wis"), ("arc", "Arcana", "int"),
    ("ath", "Athletics", "str"), ("dec", "Deception", "cha"), ("his", "History", "int"),
    ("ins", "Insight", "wis"), ("itm", "Intimidation", "cha"), ("inv", "Investigation", "int"),
    ("med", "Medicine", "wis"), ("nat", "Nature", "int"), ("prc", "Perception", "wis"),
    ("prf", "Performance", "cha"), ("per", "Persuasion", "cha"), ("rel", "Religion", "int"),
    ("slt", "Sleight of Hand", "dex"), ("ste", "Stealth", "dex"), ("sur", "Survival", "wis"),
]
ABILS = [("str", "Strength"), ("dex", "Dexterity"), ("con", "Constitution"),
         ("int", "Intelligence"), ("wis", "Wisdom"), ("cha", "Charisma")]
SCHOOLS = {"abj": "Abjuration", "con": "Conjuration", "div": "Divination", "enc": "Enchantment",
           "evo": "Evocation", "ill": "Illusion", "nec": "Necromancy", "trs": "Transmutation"}
TOOLNAMES = {"game": "Gaming Set", "music": "Musical Instrument", "art": "Artisan's Tools",
             "thief": "Thieves' Tools", "herb": "Herbalism Kit", "navg": "Navigator's Tools",
             "pois": "Poisoner's Kit", "disg": "Disguise Kit", "forg": "Forgery Kit",
             "smith": "Smith's Tools", "tinker": "Tinker's Tools", "cook": "Cook's Utensils",
             "alchemist": "Alchemist's Supplies"}
PROP = {"amm": "Ammunition", "fin": "Finesse", "hvy": "Heavy", "lgt": "Light", "lod": "Loading",
        "rch": "Reach", "ret": "Returning", "spc": "Special", "thr": "Thrown", "two": "Two-Handed",
        "ver": "Versatile", "fir": "Firearm", "rel": "Reload", "mgc": "Magical", "foc": "Focus"}
MASTERY = {"cleave": "Cleave", "graze": "Graze", "nick": "Nick", "push": "Push", "sap": "Sap",
           "slow": "Slow", "topple": "Topple", "vex": "Vex"}
TOOL_ABILITY = {"thieves' tools": "dex", "thief": "dex", "navigator's tools": "wis", "navg": "wis",
                "cook's utensils": "wis", "cook": "wis", "herbalism kit": "int", "herb": "int",
                "poisoner's kit": "int", "pois": "int", "disguise kit": "cha", "disg": "cha",
                "forgery kit": "dex", "forg": "dex", "gaming set": "wis", "game": "wis",
                "dice": "wis", "music": "cha", "flute": "cha", "lute": "cha", "viol": "cha",
                "lyre": "cha", "drum": "cha", "horn": "cha", "bagpipes": "cha", "shawm": "cha"}
ARMOR_PROF = {"lgt": "Light armour", "med": "Medium armour", "hvy": "Heavy armour", "shl": "Shields"}
WEAPON_PROF = {"sim": "Simple weapons", "mar": "Martial weapons"}
LANGS = {"common": "Common", "cant": "Thieves' Cant", "undercommon": "Undercommon", "elvish": "Elvish",
         "dwarvish": "Dwarvish", "gnoll": "Gnoll", "infernal": "Infernal", "sign": "Common Sign Language",
         "draconic": "Draconic", "sylvan": "Sylvan", "goblin": "Goblin", "orc": "Orc", "giant": "Giant",
         "halfling": "Halfling", "gnomish": "Gnomish", "abyssal": "Abyssal", "celestial": "Celestial",
         "deep": "Deep Speech", "primordial": "Primordial", "druidic": "Druidic"}
SIZES = {"tiny": "Tiny", "sm": "Small", "med": "Medium", "lg": "Large", "huge": "Huge", "grg": "Gargantuan"}

# These characters use the 2024 rules, so prefer the 2024 books when an entry
# exists in both, and fall back to the 2014-era sources otherwise.
SOURCE_PREF = ["XPHB", "XDMG", "PHB", "DMG", "MM", "XGE", "TCE", "SCAG", "VGM", "MPMM",
               "MTF", "SCC", "EGW", "GGR", "AAG", "SatO", "AI", "FTD", "BMT", "IDRotF"]
_INDEX = None


def load_index():
    """name -> sources, per 5e.tools page type. Built from the 5etools data set."""
    global _INDEX
    if _INDEX is None:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "5etools-index.json")
        try:
            _INDEX = json.load(open(p, encoding="utf-8"))
        except Exception:
            _INDEX = {}
    return _INDEX


def link_for(page, name):
    """A 5e.tools URL for an official entry, or None when it is homebrew."""
    have = load_index().get(page, {}).get((name or "").strip().lower())
    if not have:
        return None
    src = next((x for x in SOURCE_PREF if x in have), have[0])
    return "https://5e.tools/%s.html#%s_%s" % (
        page, urllib.parse.quote(name.strip().lower(), safe="'+/()"), src.lower())


def linked_name(page, name, extra=""):
    url = link_for(page, name)
    return ('<a href="%s">%s</a>%s' % (url, esc(name), extra)) if url else (esc(name) + extra)


MASTERY_TAIL = re.compile(r"\s*Mastery:\s*(?:%s)\b.*$" % "|".join(MASTERY.values()), re.I | re.S)


def flavour(text):
    """Homebrew item text, minus the standard mastery rules the card already shows."""
    t = MASTERY_TAIL.sub("", strip_html(text)).strip()
    t = re.sub(r"^(?:Primary|Bonus)\s+skill:\s*", "", t, flags=re.I)
    t = re.sub(r"\s*(?:Primary|Bonus)\s+skill:\s*", " ", t, flags=re.I)
    t = re.sub(r":\s*\u2022\s*", ": ", t)
    t = re.sub(r"\s*\u2022\s*", " ", t)
    return re.sub(r"\s+", " ", t).strip(" .") + ("." if t and not t.endswith(".") else "")


def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"&Reference\[[^\]]*\]", "", s)
    s = re.sub(r"@(?:variantrule|Compendium|UUID|spell|item|condition|action|feat|table)\[([^\]|]*)[^\]]*\]", r"\1", s)
    s = re.sub(r"\[\[/r ([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{@[a-zA-Z]+ ([^}|]*)[^}]*\}", r"\1", s)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"</(p|li|div|h[1-6])>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def mod(score):
    return (score - 10) // 2


def sgn(n):
    return ("+%d" % n) if n >= 0 else ("\u2212%d" % abs(n))


def esc(s):
    return html.escape(str(s), quote=True)


def extract(path):
    d = json.load(open(path, encoding="utf-8"))
    sysd, items = d["system"], d["items"]
    of = lambda t: [i for i in items if i["type"] == t]

    classes = of("class")
    level = sum(c["system"].get("levels") or 0 for c in classes)
    prof = 2 + (level - 1) // 4
    ab = {k: sysd["abilities"][k]["value"] for k, _ in ABILS}
    mods = {k: mod(v) for k, v in ab.items()}
    saves = {k: sysd["abilities"][k].get("proficient", 0) for k, _ in ABILS}

    cls = classes[0] if classes else None
    csys = cls["system"] if cls else {}
    hd_faces = int(str((csys.get("hd") or {}).get("denomination", "d8")).lstrip("d") or 8)
    hp_max = hd_faces + mods["con"] if level == 1 else sysd["attributes"]["hp"]["value"]

    race = (of("race") or [None])[0]
    bg = (of("background") or [None])[0]
    sub = (of("subclass") or [None])[0]

    ac, ac_note, shield = 10 + mods["dex"], "Unarmoured (10 + DEX)", 0
    for i in items:
        s = i["system"]
        if i["type"] != "equipment" or not s.get("equipped"):
            continue
        base = (s.get("armor") or {}).get("value")
        kind = (s.get("type") or {}).get("value")
        if kind == "shield":
            shield = base or 2
        elif base and kind in ("light", "medium", "heavy"):
            if kind == "light":
                ac, ac_note = base + mods["dex"], "%s %d + DEX %s" % (i["name"], base, sgn(mods["dex"]))
            elif kind == "medium":
                ac, ac_note = base + min(mods["dex"], 2), "%s %d + DEX (max 2)" % (i["name"], base)
            else:
                ac, ac_note = base, "%s %d" % (i["name"], base)
    if shield:
        ac += shield
        ac_note += " + shield %d" % shield

    sc = csys.get("spellcasting") or {}
    cast_ab = sc.get("ability") or None
    spell_dc = 8 + prof + mods[cast_ab] if cast_ab else None
    spell_atk = prof + mods[cast_ab] if cast_ab else None

    skills = []
    for key, name, dflt in SKILLS:
        row = sysd["skills"].get(key, {})
        a = row.get("ability") or dflt
        rank = row.get("value", 0)
        skills.append({"key": key, "name": name, "ability": a.upper(),
                       "bonus": mods[a] + prof * rank, "rank": rank})
    by = {s["key"]: s for s in skills}

    weapons = []
    seen_w = set()
    for i in of("weapon"):
        s = i["system"]
        base = (s.get("damage") or {}).get("base") or {}
        n, den = base.get("number"), base.get("denomination")
        acts = list((s.get("activities") or {}).values())
        atk = next((a for a in acts if a.get("type") == "attack"), None)
        kind = ((atk or {}).get("attack") or {}).get("type", {}) or {}
        ranged = kind.get("value") == "ranged"
        props_raw = s.get("properties") or []
        finesse = "fin" in props_raw
        use = "dex" if (ranged or (finesse and mods["dex"] >= mods["str"])) else "str"
        if kind.get("classification") == "spell" and cast_ab:
            use = cast_ab
        magic = int(s.get("magicalBonus") or 0)
        key = (i["name"], n, den)
        if key in seen_w:
            continue
        seen_w.add(key)
        weapons.append({
            "name": i["name"], "to_hit": mods[use] + prof + magic,
            "dmg_n": n, "dmg_faces": den, "dmg_mod": mods[use] + magic,
            "dmg_types": base.get("types") or [], "ability": use.upper(),
            "props": [PROP.get(p, p.title()) for p in props_raw],
            "ranged": ranged, "range": s.get("range") or {},
            "mastery": MASTERY.get(s.get("mastery") or "", ""),
            "equipped": bool(s.get("equipped")), "magic": magic,
            "desc": s.get("description", {}).get("value", ""),
        })

    spells, seen_s = [], set()
    for i in of("spell"):
        if i["name"] in seen_s:
            continue
        seen_s.add(i["name"])
        s = i["system"]
        props = s.get("properties") or []
        parts = []
        for a in (s.get("activities") or {}).values():
            for p in ((a.get("damage") or {}).get("parts") or []):
                if p.get("number") and p.get("denomination"):
                    parts.append(("%dd%d %s" % (p["number"], p["denomination"],
                                                " ".join(p.get("types") or []))).strip())
        act, dur, rng = s.get("activation") or {}, s.get("duration") or {}, s.get("range") or {}
        spells.append({
            "name": i["name"], "level": s.get("level", 0),
            "school": SCHOOLS.get(s.get("school", ""), ""),
            "ritual": "ritual" in props, "conc": "concentration" in props,
            "components": "".join(c for c, k in (("V", "vocal"), ("S", "somatic"), ("M", "material")) if k in props),
            "activation": ("%s %s" % (act.get("value") or "", act.get("type") or "")).strip().title() or "\u2014",
            "duration": ("%s %s" % (dur.get("value") or "", dur.get("units") or "")).strip() or "Instant",
            "range": ("%s %s" % (rng.get("value") or "", rng.get("units") or "")).strip() or "Self",
            "damage": " \u00b7 ".join(parts),
            "desc": strip_html(s.get("description", {}).get("value", "")),
        })
    spells.sort(key=lambda x: (x["level"], x["name"].lower()))

    feats, seen_f = [], set()
    for i in of("feat"):
        if i["name"] in seen_f:
            continue
        seen_f.add(i["name"])
        s = i["system"]
        feats.append({"name": i["name"], "kind": (s.get("type") or {}).get("value", ""),
                      "desc": strip_html(s.get("description", {}).get("value", ""))})

    gear = []
    for i in items:
        if i["type"] not in ("equipment", "consumable", "loot", "container", "tool"):
            continue
        s = i["system"]
        gear.append({"name": i["name"], "type": i["type"], "qty": s.get("quantity", 1),
                     "equipped": bool(s.get("equipped")),
                     "kind": (s.get("type") or {}).get("value", ""),
                     "desc": s.get("description", {}).get("value", "")})

    tools = []
    for k, v in (sysd.get("tools") or {}).items():
        # Foundry often stores a generic "int" here; prefer the kit's canonical ability
        a = TOOL_ABILITY.get(k) or v.get("ability") or "int"
        rank = v.get("value", 1)
        tools.append({"name": TOOLNAMES.get(k, k.title()), "ability": a.upper(),
                      "rank": rank, "bonus": mods[a] + prof * rank})
    for i in of("tool"):
        if any(t["name"] == i["name"] for t in tools):
            continue
        # tool items don't carry an ability; fall back to the usual one for that kit
        a = TOOL_ABILITY.get(i["name"].lower(), "int")
        tools.append({"name": i["name"], "ability": a.upper(), "rank": 1, "bonus": mods[a] + prof})

    tr = sysd["traits"]
    rsen = ((race or {}).get("system", {}).get("senses") or {}).get("ranges", {})
    asen = (sysd["attributes"].get("senses") or {}).get("ranges", {})
    senses = []
    for k, lbl in (("darkvision", "Darkvision"), ("blindsight", "Blindsight"),
                   ("tremorsense", "Tremorsense"), ("truesight", "Truesight")):
        v = rsen.get(k) or asen.get(k)
        if v:
            senses.append({"name": lbl, "value": "%d ft" % v})

    return {
        "name": d["name"], "img": d.get("img"), "level": level, "prof": prof,
        "class_name": cls["name"] if cls else "\u2014",
        "subclass": sub["name"] if sub else None,
        "race": race["name"] if race else "\u2014",
        "race_type": ((race or {}).get("system", {}).get("type") or {}).get("subtype", ""),
        "creature_type": ((race or {}).get("system", {}).get("type") or {}).get("value", ""),
        "background": bg["name"] if bg else "\u2014",
        "abilities": ab, "mods": mods, "saves": saves,
        "hp_max": hp_max, "hit_die": "d%d" % hd_faces,
        "ac": ac, "ac_note": ac_note,
        "speed": "%s ft" % (((race or {}).get("system", {}).get("movement") or {}).get("walk") or "30"),
        "init": mods["dex"], "spell_dc": spell_dc, "spell_atk": spell_atk,
        "cast_ability": (cast_ab or "").upper(),
        "slots": {k: v["value"] for k, v in sysd["spells"].items() if v.get("value")},
        "skills": skills,
        "passive_perc": 10 + by["prc"]["bonus"], "passive_ins": 10 + by["ins"]["bonus"],
        "passive_inv": 10 + by["inv"]["bonus"],
        "languages": [LANGS.get(l, l.title()) for l in tr["languages"]["value"]],
        "armor_prof": [ARMOR_PROF.get(a, a) for a in tr["armorProf"]["value"]],
        "weapon_prof": [WEAPON_PROF.get(w, w.title()) for w in tr["weaponProf"]["value"]],
        "weapon_prof_custom": tr["weaponProf"]["custom"],
        "mastery": [m.title() for m in (tr["weaponProf"].get("mastery") or {}).get("value", [])],
        "size": SIZES.get(tr.get("size", "med"), "Medium"),
        "senses": senses, "tools": tools, "weapons": weapons, "spells": spells,
        "feats": feats, "gear": gear, "currency": sysd["currency"],
    }


# ─────────────────────────────────────────────────────────── rendering ──

CSS_TEMPLATE = """<style>
/* {slug} \u2014 palette and character-specific styling only.
   Everything shared lives in sheet.css. */

:root {{
  --bg: #07090f;
  --bg2: #0d1117;
  --panel: #111827;
  --panel2: #1a2235;
  --panel3: #0f1825;
  --line: #1e2d42;
  --line2: #253347;
  --text: #e8edf5;
  --muted: #6b7e99;
  --muted2: #4a5c75;
  --link: #7eb8f7;
  --good: #4ade80;
  --good-dim: #14532d;
  --warn: #fbbf24;
  --danger: #f87171;
  --danger-dim: #3f1f26;
  /* {theme_name} */
  --c1: {c1};
  --c1b: {c1b};
  --c1d: {c1d};
  --c2: {c2};
  --c2b: {c2b};
  --sheet-accent: var(--c1b);
}}

/* \u2500\u2500 HERO \u2500\u2500 */
.hero {{
  position: relative;
  background: linear-gradient(135deg, {hero_a} 0%, {hero_b} 40%, {hero_a} 100%);
  border: 1px solid var(--line2); border-radius: 20px;
  padding: 28px 32px; margin-bottom: 20px; overflow: hidden;
  display: flex; gap: 24px; align-items: flex-start;
}}
.hero::before {{
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 80% 50%, {glow1} 0%, transparent 60%),
              radial-gradient(ellipse at 20% 80%, {glow2} 0%, transparent 50%);
  pointer-events: none;
}}
.hero-border-accent {{
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--c2) 0%, var(--c1b) 50%, var(--c2b) 100%);
  border-radius: 20px 20px 0 0;
}}
.hero-avatar {{
  width: 120px; height: 120px; border-radius: 18px; object-fit: cover;
  border: 2px solid var(--line2); background: var(--panel);
  box-shadow: 0 0 0 4px {glow1}, 0 8px 32px rgba(0,0,0,.6);
}}
.hero-class-icon {{
  position: absolute; bottom: -8px; right: -8px;
  width: 32px; height: 32px; background: var(--c1);
  border-radius: 10px; border: 2px solid var(--bg);
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}}
.hero-name {{ font-family: 'Cinzel', serif; font-size: 28px; font-weight: 700; color: {name_color}; letter-spacing: .02em; line-height: 1.1; }}
.stat-pill.sp-spell .sp-val {{ color: var(--c1b); }}
.stat-pill.sp-mastery .sp-val {{ color: var(--c2b); font-size: 13px; }}
#inspirationPill.on {{ background: {glow1}; border-color: var(--c1b); }}
#inspirationPill.on .sp-val {{ color: var(--c1b); }}
.ability-card .ab-score {{ font-size: 32px; font-weight: 800; line-height: 1; margin: 6px 0 4px; }}
.ability-card.prof-save::after {{ content: '\u2605'; position: absolute; top: 6px; right: 8px; font-size: 10px; color: var(--c1b); }}
.prof-dot.filled {{ background: var(--c1b); border-color: var(--c1b); }}
.prof-dot.expertise {{ background: var(--c2b); border-color: var(--c2b); box-shadow: 0 0 0 2px {glow2}; }}
.hp-input:focus {{ outline: none; border-color: var(--c1); }}
.temp-hp-input:focus {{ outline: none; border-color: var(--c1); }}
.dot.slot-used {{ background: {glow1}; color: var(--c1b); border-color: var(--c1); }}
.conc-toggle.active {{ border-color: var(--c2b); background: {glow2}; }}
.conc-dot {{ width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--muted2); transition: all .15s; }}
.conc-dot.on {{ background: var(--c2b); border-color: var(--c2b); }}
.conc-toggle.active .conc-label {{ color: var(--c2b); }}
.text-field:focus {{ outline: none; border-color: var(--c2b); }}
.btn.btn-rest {{ border-color: var(--c1); color: var(--c1b); }}
.btn.btn-rest:hover {{ background: var(--c1d); }}
.roll-btn:hover {{ background: {glow1}; border-color: var(--c1); color: var(--c1b); }}
.roll-entry-total.nat20 {{ color: var(--c1b); }}
.weapon-card.magic {{ border-color: {glow1}; background: {glow2}; }}
.weapon-magic {{ font-size: 11px; color: var(--c1b); }}
.action-card-title.atk {{ color: var(--danger); }}
.action-card-title.bon {{ color: var(--warn); }}
.action-card-title.rea {{ color: var(--c2b); }}
.action-card-title.mag {{ color: var(--c1b); }}
.action-card-title.oth {{ color: var(--muted); }}
.spell-search:focus {{ outline: none; border-color: var(--c1b); }}
.spell-card {{ background: var(--panel2); border: 1px solid var(--line); border-radius: 12px; padding: 14px; transition: border-color .15s; }}
.spell-card.conc-spell {{ border-left: 3px solid var(--c2b); }}
.spell-card.ritual-spell {{ border-left: 3px solid var(--c1b); }}
.prep-toggle:hover {{ border-color: var(--c1b); color: var(--c1b); }}
.prep-toggle.on {{ background: {glow1}; border-color: var(--c1b); color: var(--c1b); }}
.sbadge.conc {{ background: {glow2}; color: var(--c2b); border-color: {glow2}; }}
.sbadge.ritual {{ background: {glow1}; color: var(--c1b); border-color: {glow1}; }}
.sbadge.cantrip {{ background: rgba(148,163,184,.12); color: var(--muted); border-color: var(--line2); }}
.item-note {{ margin-top: 8px; font-size: 11px; line-height: 1.45; color: var(--muted);
  border-top: 1px solid var(--line); padding-top: 8px; }}
.item-note.inline {{ display: block; margin-top: 2px; border: 0; padding: 0; font-size: 11px; }}
.mastery-tag {{ display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; padding: 2px 7px; border-radius: 6px; margin-left: 6px;
  background: {glow2}; color: var(--c2b); border: 1px solid {glow2}; }}

/* \u2500\u2500 REMINDER \u2500\u2500 */
.reminder {{ background: var(--c1d); border: 1px solid {glow1}; border-radius: 14px; padding: 16px; }}
.reminder .reminder-item {{ display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid {glow2}; font-size: 13px; color: {reminder_text}; }}
.reminder .reminder-item::before {{ content: '{reminder_icon}'; flex-shrink: 0; }}
</style>"""


def dice_txt(w):
    """Damage string for a weapon, handling 2024 unarmed strikes."""
    if not w["dmg_n"] or not w["dmg_faces"]:
        return "%d bludgeoning" % max(1, 1 + w["dmg_mod"])
    m = ""
    if w["dmg_mod"] > 0:
        m = " + %d" % w["dmg_mod"]
    elif w["dmg_mod"] < 0:
        m = " \u2212 %d" % abs(w["dmg_mod"])
    return "%dd%d%s %s" % (w["dmg_n"], w["dmg_faces"], m, " ".join(w["dmg_types"]))


def chips(names):
    c = ('<span style="background:var(--panel2);border:1px solid var(--line);'
         'border-radius:8px;padding:4px 10px;font-size:12px;">%s</span>')
    return ('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">\n'
            + "".join("          " + (c % esc(n)) + "\n" for n in names) + "        </div>")


def render(m, ov):
    slug = ov["slug"]
    caster = bool(m["spell_dc"])
    acc = ov.get("adjust", {})
    init = m["init"] + acc.get("init_bonus", 0)
    ranged_bonus = acc.get("ranged_attack_bonus", 0)

    # ── hero ────────────────────────────────────────────────────────────
    def linked(url, label):
        """Homebrew entries have no 5e.tools page — render those as plain text."""
        return '<a href="%s">%s</a>' % (url, esc(label)) if url else esc(label)

    L = ov.get("links", {})

    def url_for(key, page, name):
        """Overlay wins when the key is present (null = homebrew, no link);
        otherwise fall back to looking the name up in the 5etools index."""
        return L[key] if key in L else link_for(page, name)

    sub_bits = [linked(url_for("class", "classes", m["class_name"]),
                       "%s %d" % (m["class_name"], m["level"]))]
    if m["subclass"]:
        sub_bits.append(linked(url_for("subclass", "subclasses", m["subclass"]), m["subclass"]))
    sub_bits.append(linked(url_for("race", "races", m["race"]), m["race"]))
    sub_bits.append(linked(url_for("background", "backgrounds", m["background"]), m["background"]))
    hero_sub = '\n      <span class="sep">\u2022</span>\n      '.join(sub_bits)

    bio = ov.get("bio", {})
    bio_fields = [("Age", bio.get("age", "\u2014")), ("Gender", bio.get("gender", "\u2014")),
                  ("Height", bio.get("height", "\u2014")), ("Eyes", bio.get("eyes", "\u2014")),
                  ("Hair", bio.get("hair", "\u2014")), ("Skin", bio.get("skin", "\u2014")),
                  ("Size", m["size"]), ("Type", (m["creature_type"] or "humanoid").title()),
                  ("Alignment", bio.get("alignment", "\u2014"))]
    bio_html = "\n".join('      %s: <span>%s</span>' % (k, esc(v)) for k, v in bio_fields)

    pills = [('sp-hp', 'HP', str(m["hp_max"]), 'hpPill'), ('sp-ac', 'AC', str(m["ac"]), None)]
    pills += [('', 'Initiative', sgn(init), None), ('', 'Speed', m["speed"], None),
              ('', 'Prof.', sgn(m["prof"]), None)]
    if caster:
        pills += [('sp-spell', 'Spell DC', str(m["spell_dc"]), None),
                  ('sp-spell', 'Spell Atk', sgn(m["spell_atk"]), None)]
    pills += [('', 'Passive Perc', str(m["passive_perc"]), None),
              ('', 'Passive Ins', str(m["passive_ins"]), None)]
    pill_html = []
    for cls, label, val, pid in pills:
        title = ' title="%s"' % esc(m["ac_note"]) if label == "AC" else ""
        idattr = ' id="%s"' % pid if pid else ""
        pill_html.append('      <div class="stat-pill %s"><span class="sp-label">%s</span>'
                         '<span class="sp-val"%s%s>%s</span></div>' % (cls, label, idattr, title, val))
    pill_html.append('      <div class="stat-pill" id="inspirationPill" title="Click to toggle Heroic Inspiration">\n'
                     '        <span class="sp-label">Inspiration</span>\n'
                     '        <span class="sp-val" id="inspirationVal">\u2014</span>\n      </div>')

    # ── tabs ────────────────────────────────────────────────────────────
    tabs = [("combat", "\u2694\ufe0f Combat")]
    if caster:
        tabs.append(("spells", "\u2728 Spells"))
    tabs += [("abilities", "\U0001f3b2 Abilities"), ("features", "\U0001f4dc Features"), ("gear", "\U0001f392 Gear")]
    tabs_html = "\n".join(
        '  <button class="tab-btn%s" data-tab="%s">%s</button>' % (" active" if i == 0 else "", k, l)
        for i, (k, l) in enumerate(tabs))

    # ── trackers ────────────────────────────────────────────────────────
    trackers = ['''          <div class="tracker-card">
            <h3>Hit Points</h3>
            <div class="hp-display">
              <input id="hpCurrent" class="hp-input" type="number" min="0" max="{hp}" value="{hp}">
              <span class="hp-max">/ {hp}</span>
            </div>
            <div class="temp-hp-row">Temp HP: <input id="hpTemp" class="temp-hp-input" type="number" min="0" value="0"></div>
            <div class="dmg-heal-row">
              <input id="hpAdjust" class="hp-adjust-input" type="number" min="1" placeholder="Amt">
              <button class="btn-dmg" id="dmgBtn">\U0001f5e1 Dmg</button>
              <button class="btn-heal" id="healBtn">\u271a Heal</button>
            </div>
          </div>'''.format(hp=m["hp_max"]),
                '''          <div class="tracker-card">
            <h3>Hit Dice ({hd})</h3>
            <div class="dots-row" id="hitDiceDots" data-key="hitDice" data-total="{lvl}" data-label="Hit die"></div>
          </div>'''.format(hd=m["hit_die"], lvl=m["level"])]
    for r in ov.get("resources", []):
        note = ('\n            <div style="font-size:11px;color:var(--muted);margin-top:8px;">%s</div>' % esc(r["note"])) if r.get("note") else ""
        trackers.append('''          <div class="tracker-card">
            <h3>{name}</h3>
            <div class="dots-row" id="{id}Dots" data-key="{id}" data-total="{total}" data-label="{name}"></div>{note}
          </div>'''.format(name=esc(r["name"]), id=r["id"], total=r["total"], note=note))

    slot_html = ""
    if m["slots"]:
        cards = []
        for k, v in sorted(m["slots"].items()):
            lvl = k.replace("spell", "")
            cards.append('''            <div class="tracker-card">
              <h3>Level {lvl} <span style="color:var(--c1b)">({v})</span></h3>
              <div class="dots-row" id="slot{lvl}Dots" data-key="spellSlots{lvl}" data-total="{v}" data-slot="true" data-label="Level {lvl} slot"></div>
            </div>'''.format(lvl=lvl, v=v))
        slot_html = ('\n        <div style="margin-top:14px;">\n'
                     '          <div class="panel-title" style="margin-bottom:10px;">\u2728 Spell Slots</div>\n'
                     '          <div class="slot-grid" style="grid-template-columns:repeat(%d,1fr);">\n%s\n          </div>\n        </div>'
                     % (max(1, len(m["slots"])), "\n".join(cards)))

    conc_html = ""
    if caster:
        conc_html = '''
      <!-- Concentration -->
      <div class="panel">
        <div class="panel-title">\U0001f52e Concentration</div>
        <div class="conc-toggle" id="concToggle">
          <div class="conc-dot" id="concDot"></div>
          <div class="conc-label" id="concLabel">Not Concentrating</div>
        </div>
        <div class="conc-body" id="concBody">
          <div class="field-label">Spell</div>
          <input id="concSpell" class="text-field" type="text" placeholder="Spell name\u2026">
          <div class="field-label" style="margin-top:10px;">Notes</div>
          <input id="concNotes" class="text-field" type="text" placeholder="Target, rounds remaining\u2026">
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn btn-danger" id="clearConcBtn" style="font-size:12px;">Clear Concentration</button>
          </div>
        </div>
      </div>'''

    # ── common rolls ────────────────────────────────────────────────────
    rolls = ['<button class="roll-btn" data-label="Initiative" data-bonus="%d">Initiative %s</button>' % (init, sgn(init))]
    for s in m["skills"]:
        if s["rank"]:
            rolls.append('<button class="roll-btn" data-label="%s" data-bonus="%d">%s %s</button>'
                         % (esc(s["name"]), s["bonus"], esc(s["name"]), sgn(s["bonus"])))
    if caster:
        rolls.append('<button class="roll-btn" data-label="Spell Attack" data-bonus="%d">Spell Atk %s</button>'
                     % (m["spell_atk"], sgn(m["spell_atk"])))
    for w in m["weapons"]:
        if w["name"] in ov.get("hide_weapons", []):
            continue
        th = w["to_hit"] + (ranged_bonus if w["ranged"] else 0)
        rolls.append('<button class="roll-btn" data-label="%s" data-bonus="%d">%s %s</button>'
                     % (esc(w["name"]), th, esc(w["name"]), sgn(th)))
    rolls_html = "\n          ".join(rolls)

    # ── weapons ─────────────────────────────────────────────────────────
    wcards = []
    for w in m["weapons"]:
        if w["name"] in ov.get("hide_weapons", []):
            continue
        th = w["to_hit"] + (ranged_bonus if w["ranged"] else 0)
        props = list(w["props"])
        rng = w["range"] or {}
        if rng.get("value"):
            props.append("Range %s/%s" % (rng.get("value"), rng.get("long") or rng.get("value")))
        elif rng.get("reach"):
            props.append("Reach %s ft" % rng["reach"])
        mast = ('<span class="mastery-tag">%s</span>' % esc(w["mastery"])) if w["mastery"] else ""
        magic = ' <span class="weapon-magic">\u2726 Magic</span>' if w["magic"] else ""
        page = "variantrules" if w["name"].lower() == "unarmed strike" else "items"
        url = link_for(page, w["name"])
        title = ('<a href="%s">%s</a>' % (url, esc(w["name"]))) if url else esc(w["name"])
        note = ""
        if not url:
            f = flavour(w.get("desc", ""))
            if f:
                note = '\n            <div class="item-note">%s</div>' % esc(f)
        wcards.append('''          <div class="weapon-card{mc}">
            <div class="weapon-name">{title}{magic}{mast}</div>
            <div><button class="roll-btn" data-label="{name}" data-bonus="{th}">{ths} to hit</button></div>
            <div class="weapon-dmg">{dmg}</div>
            <div class="weapon-props">{ab} \u00b7 {props}</div>{note}
          </div>'''.format(mc=" magic" if w["magic"] else "", title=title, name=esc(w["name"]),
                           magic=magic, mast=mast, th=th, ths=sgn(th), dmg=esc(dice_txt(w)),
                           ab=w["ability"], props=esc(" \u00b7 ".join(props)) if props else "\u2014",
                           note=note))

    # ── actions (authored) ──────────────────────────────────────────────
    ACT_CLS = {"attack": "atk", "bonus": "bon", "reaction": "rea", "magic": "mag", "other": "oth"}
    ACT_LBL = {"attack": "\u2694 Attack", "bonus": "\u2726 Bonus Action", "reaction": "\u21a9 Reaction",
               "magic": "\u2728 Magic", "other": "\u2026 Other"}
    acards = []
    for key in ("attack", "bonus", "reaction", "magic", "other"):
        entries = ov.get("actions", {}).get(key) or []
        if not entries:
            continue
        lis = "\n".join("              <li>%s</li>" % e for e in entries)
        acards.append('''          <div class="action-card">
            <div class="action-card-title {c}">{l}</div>
            <ul class="link-list">
{lis}
            </ul>
          </div>'''.format(c=ACT_CLS[key], l=ACT_LBL[key], lis=lis))

    reminders = "\n".join('          <div class="reminder-item">%s</div>' % r
                          for r in ov.get("reminders", []))

    # ── abilities tab ───────────────────────────────────────────────────
    abcards = []
    for k, name in ABILS:
        mv = m["mods"][k]
        cls = "neg" if mv < 0 else ("zero" if mv == 0 else "")
        abcards.append('        <div class="ability-card%s">\n'
                       '          <div class="ab-label">%s</div>\n'
                       '          <div class="ab-score">%d</div>\n'
                       '          <div class="ab-mod %s">%s</div>\n        </div>'
                       % (" prof-save" if m["saves"][k] else "", name[:3].upper(), m["abilities"][k], cls, sgn(mv)))
    saverows = []
    for k, name in ABILS:
        b = m["mods"][k] + (m["prof"] if m["saves"][k] else 0)
        saverows.append('          <div class="stat-row"><div class="prof-dot%s"></div>'
                        '<div class="stat-name">%s</div><div class="stat-bonus">%s</div></div>'
                        % (" filled" if m["saves"][k] else "", name, sgn(b)))
    skillrows = []
    for s in m["skills"]:
        dot = "prof-dot expertise" if s["rank"] == 2 else ("prof-dot filled" if s["rank"] else "prof-dot")
        skillrows.append('          <div class="stat-row"><div class="%s"></div>'
                         '<div class="stat-name">%s</div><div class="stat-ability">%s</div>'
                         '<div class="stat-bonus">%s</div></div>'
                         % (dot, esc(s["name"]), s["ability"], sgn(s["bonus"])))
    senserows = [('          <div class="stat-row"><div class="stat-name">%s</div>'
                  '<div class="stat-bonus" style="color:var(--muted);font-weight:400;">%s</div></div>'
                  % (esc(s["name"]), esc(s["value"]))) for s in m["senses"]]
    senserows.append('          <div class="stat-row"><div class="stat-name">Passive Perception</div>'
                     '<div class="stat-bonus" style="color:var(--muted);font-weight:400;">%d</div></div>' % m["passive_perc"])
    senserows.append('          <div class="stat-row"><div class="stat-name">Passive Insight</div>'
                     '<div class="stat-bonus" style="color:var(--muted);font-weight:400;">%d</div></div>' % m["passive_ins"])
    senserows.append('          <div class="stat-row"><div class="stat-name">Passive Investigation</div>'
                     '<div class="stat-bonus" style="color:var(--muted);font-weight:400;">%d</div></div>' % m["passive_inv"])

    if m["tools"]:
        toolrows = "".join(
            '\n          <div class="stat-row"><div class="%s"></div><div class="stat-name">%s</div>'
            '<div class="stat-bonus" style="color:var(--muted);font-weight:400;font-size:12px;">%s %s</div></div>'
            % ("prof-dot expertise" if t.get("rank", 1) == 2 else
               ("prof-dot filled" if t.get("rank", 1) else "prof-dot"),
               linked_name("items", t["name"]), t["ability"], sgn(t["bonus"])) for t in m["tools"])
    else:
        toolrows = ('\n          <div class="stat-row"><div class="stat-name" '
                    'style="color:var(--muted);font-style:italic;">None recorded</div></div>')
    langs = m["languages"] or ["\u2014 not recorded in the export"]

    # ── features tab ────────────────────────────────────────────────────
    fcards = []
    for card in ov.get("features", []):
        lis = "\n".join("          <li>%s</li>" % b for b in card["bullets"])
        fcards.append('      <div class="feature-card">\n'
                      '        <div class="feature-card-title">%s</div>\n'
                      '        <ul class="link-list">\n%s\n        </ul>\n      </div>' % (card["title"], lis))
    prof_bits = m["armor_prof"] + m["weapon_prof"]
    if m["weapon_prof_custom"]:
        prof_bits.append(m["weapon_prof_custom"].replace(";", ", "))
    prof_lis = "\n".join("          <li>%s</li>" % esc(p) for p in prof_bits if p)
    if m["mastery"]:
        prof_lis += "\n          <li><strong>Weapon Mastery:</strong> %s</li>" % esc(", ".join(m["mastery"]))
    fcards.append('      <div class="feature-card">\n'
                  '        <div class="feature-card-title">\U0001f6e1 Proficiencies</div>\n'
                  '        <ul class="link-list">\n%s\n        </ul>\n      </div>' % prof_lis)
    rest_lis = "\n".join("          <li>%s</li>" % r for r in ov.get("rest", []))
    fcards.append('      <div class="feature-card">\n'
                  '        <div class="feature-card-title">\U0001f4a4 Rest Recovery</div>\n'
                  '        <ul class="link-list">\n%s\n        </ul>\n      </div>' % rest_lis)

    # ── gear tab ────────────────────────────────────────────────────────
    groups = {"Worn & Equipped": [], "Weapons": [], "Consumables": [], "Carried": []}
    for w in m["weapons"]:
        if w["name"] in ov.get("hide_weapons", []):
            continue
        page = "variantrules" if w["name"].lower() == "unarmed strike" else "items"
        groups["Weapons"].append(linked_name(page, w["name"]))
    seen_gear = set()
    for g in m["gear"]:
        key = (g["name"], g["qty"])
        if key in seen_gear:
            continue
        seen_gear.add(key)
        q = " \u00d7%d" % g["qty"] if g["qty"] and g["qty"] > 1 else ""
        page = "items"
        url = link_for(page, g["name"])
        label = ('<a href="%s">%s</a>' % (url, esc(g["name"]))) if url else esc(g["name"])
        label += q
        if not url:
            f = flavour(g.get("desc", ""))
            if f:
                label += ' <span class="item-note inline">%s</span>' % esc(f)
        if g["equipped"]:
            groups["Worn & Equipped"].append(label)
        elif g["type"] == "consumable":
            groups["Consumables"].append(label)
        else:
            groups["Carried"].append(label)
    gcards = []
    for title, entries in groups.items():
        if not entries:
            continue
        lis = "\n".join("          <li>%s</li>" % e for e in entries)
        gcards.append('      <div class="equip-card">\n'
                      '        <div class="equip-card-title">%s</div>\n'
                      '        <ul class="link-list">\n%s\n        </ul>\n      </div>' % (title, lis))
    cur = m["currency"]
    coins = " \u00b7 ".join("%d %s" % (cur[k], k.upper()) for k in ("pp", "gp", "ep", "sp", "cp") if cur.get(k))
    if coins:
        gcards.append('      <div class="equip-card">\n'
                      '        <div class="equip-card-title">\U0001fa99 Coin</div>\n'
                      '        <ul class="link-list">\n          <li>%s</li>\n        </ul>\n      </div>' % coins)

    # ── spells tab ──────────────────────────────────────────────────────
    spell_pane = ""
    if caster:
        by_level = {}
        for s in m["spells"]:
            by_level.setdefault(s["level"], []).append(s)
        blocks = []
        for lvl in sorted(by_level):
            head = "Cantrips" if lvl == 0 else "Level %d" % lvl
            blocks.append('        <div class="spell-level-header">%s</div>' % head)
            for s in by_level[lvl]:
                badges = []
                if lvl == 0:
                    badges.append('<span class="sbadge cantrip">Cantrip</span>')
                if s["conc"]:
                    badges.append('<span class="sbadge conc">Conc</span>')
                if s["ritual"]:
                    badges.append('<span class="sbadge ritual">Ritual</span>')
                extra = " conc-spell" if s["conc"] else (" ritual-spell" if s["ritual"] else "")
                prep = ("" if lvl == 0 else
                        '<button class="prep-toggle" data-spell="%s" title="Add to prepared">\u2726</button>' % esc(s["name"].lower()))
                dmg = ('<div class="spell-dmg">%s</div>' % esc(s["damage"])) if s["damage"] else ""
                blocks.append('''        <div class="spell-card{extra}" data-name="{key}" data-level="{lvl}">
          <div class="spell-card-header">
            <div class="spell-card-name">{linked}</div>
            {prep}
          </div>
          <div class="spell-badges">{badges}</div>
          <div class="spell-meta">
            <div class="spell-meta-item">Cast <span>{act}</span></div>
            <div class="spell-meta-item">Range <span>{rng}</span></div>
            <div class="spell-meta-item">Duration <span>{dur}</span></div>
            <div class="spell-meta-item">Components <span>{comp}</span></div>
          </div>
          {dmg}
        </div>'''.format(extra=extra, key=esc(s["name"].lower()), lvl=lvl,
                         linked=linked_name("spells", s["name"]),
                         prep=prep, badges="".join(badges), act=esc(s["activation"]),
                         rng=esc(s["range"]), dur=esc(s["duration"]),
                         comp=esc(s["components"] or "\u2014"), dmg=dmg))
        spell_pane = '''
<!-- \u2550\u2550\u2550 TAB: SPELLS \u2550\u2550\u2550 -->
<div class="tab-pane" id="tab-spells">
  <div class="panel">
    <div class="panel-title">\u2728 Prepared</div>
    <div class="slot-info">Prepared spells count against your limit; cantrips are always known.
      <strong id="preparedCount" style="margin-left:8px;">0 / {maxprep}</strong></div>
    <div class="spells-grid" id="preparedList"></div>
    <div id="preparedEmpty" style="color:var(--muted);font-size:13px;padding:8px 0;">
      Nothing prepared yet \u2014 tap \u2726 on any spell below.</div>
  </div>

  <div class="panel">
    <div class="panel-title">\U0001f4d6 Full Spell List</div>
    <div class="spell-search-wrap">
      <input id="spellSearch" class="spell-search" type="search" placeholder="Filter spells\u2026">
    </div>
    <div class="spells-grid" id="spellGrid">
{blocks}
    </div>
  </div>
</div>'''.format(maxprep=ov.get("max_prepared", 2), blocks="\n".join(blocks))

    # ── SHEET config ────────────────────────────────────────────────────
    cfg = ["  prefix: '%s_v1_'," % slug, "  hpMax: %d," % m["hp_max"]]
    if caster:
        cfg.append("  maxPrepared: %d," % ov.get("max_prepared", 2))
    sr = ov.get("short_rest", {})
    cfg.append("  shortRest: { keys: [%s],\n               msg: '%s' }"
               % (", ".join("'%s'" % k for k in sr.get("keys", [])),
                  sr.get("msg", "Spend Hit Dice to recover HP.").replace("'", "\\'").replace("\n", "\\n")))

    css = CSS_TEMPLATE.format(slug=slug, **ov["theme"])

    return '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} \u2013 Character Sheet</title>
<link rel="stylesheet" href="sheet.css">
{css}
</head>
<body>
<div class="page">

<!-- \u2550\u2550\u2550 HERO \u2550\u2550\u2550 -->
<section class="hero">
  <div class="hero-border-accent"></div>
  <div class="hero-avatar-wrap">
    <img class="hero-avatar" src="{img}" alt="{name}">
    <div class="hero-class-icon">{icon}</div>
  </div>
  <div class="hero-info">
    <div class="hero-name">{name}</div>
    <div class="hero-sub">
      {hero_sub}
    </div>
    <div class="hero-bio">
{bio}
    </div>
    <div class="stat-bar">
{pills}
    </div>
  </div>
</section>

<!-- \u2550\u2550\u2550 TABS \u2550\u2550\u2550 -->
<div class="tabs-bar">
{tabs}
</div>

<!-- \u2550\u2550\u2550 TAB: COMBAT \u2550\u2550\u2550 -->
<div class="tab-pane active" id="tab-combat">
  <div class="two-col">
    <div class="stack">

      <!-- Trackers -->
      <div class="panel">
        <div class="panel-title">\u2764\ufe0f Trackers</div>
        <div class="tracker-grid">
{trackers}
        </div>{slots}
        <div class="death-panel" id="deathSavePanel">
          <h3>\u2620\ufe0f Death Saving Throws</h3>
          <div class="death-grid">
            <div class="death-success"><div class="death-label">Successes</div><div class="dots-row" id="deathSuccessDots" data-key="deathSuccess" data-total="3" data-success="true" data-label="Death save success"></div></div>
            <div class="death-fail"><div class="death-label">Failures</div><div class="dots-row" id="deathFailDots" data-key="deathFail" data-total="3" data-fail="true" data-label="Death save failure"></div></div>
          </div>
          <div class="btn-row" style="margin-top:10px;"><button class="btn btn-danger" id="clearDeathBtn" style="font-size:12px;">Clear Saves</button></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-rest" id="longRestBtn">\U0001f319 Long Rest</button>
          <button class="btn" id="shortRestBtn">\u23f3 Short Rest</button>
          <button class="btn btn-danger" id="clearSessionBtn">\U0001f5d1 Clear Data</button>
        </div>
      </div>
{conc}
      <!-- Common Rolls -->
      <div class="panel">
        <div class="panel-title">\u2684 Common Rolls</div>
        <div class="roll-buttons">
          {rolls}
        </div>
        <div class="roll-log" id="rollLog"><div class="roll-log-empty">No rolls yet this session</div></div>
      </div>

    </div><!-- /left -->

    <div class="stack">
      <!-- Weapons -->
      <div class="panel">
        <div class="panel-title">\u2694\ufe0f Weapons</div>
        <div class="weapon-grid">
{weapons}
        </div>
      </div>

      <!-- Actions -->
      <div class="panel">
        <div class="panel-title">\U0001f3af Actions</div>
        <div class="action-section">
{actions}
        </div>
      </div>

      <!-- Don't Forget -->
      <div class="panel">
        <div class="panel-title">{reminder_icon} Don't Forget</div>
        <div class="reminder">
{reminders}
        </div>
      </div>
    </div><!-- /right -->
  </div>
</div>
{spell_pane}
<!-- \u2550\u2550\u2550 TAB: ABILITIES \u2550\u2550\u2550 -->
<div class="tab-pane" id="tab-abilities">
  <div class="panel">
    <div class="panel-title">\U0001f4aa Ability Scores</div>
    <div class="abilities-grid">
{abcards}
    </div>
  </div>
  <div class="two-col">
    <div class="stack">
      <div class="panel">
        <div class="panel-title">\U0001f6e1 Saving Throws</div>
        <div class="stat-list">
{saverows}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">\U0001f3b2 Skills</div>
        <div class="stat-list">
{skillrows}
        </div>
      </div>
    </div>
    <div class="stack">
      <div class="panel">
        <div class="panel-title">\U0001f441 Senses &amp; Languages</div>
        <div class="stat-list" style="margin-bottom:14px;">
{senserows}
        </div>
        <div class="panel-title" style="margin-top:0;">\U0001f5e3 Languages</div>
        {langs}
        <div class="panel-title" style="margin-top:14px;">\U0001f527 Tools</div>
        <div class="stat-list">{toolrows}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- \u2550\u2550\u2550 TAB: FEATURES \u2550\u2550\u2550 -->
<div class="tab-pane" id="tab-features">
  <div class="panel">
    <div class="panel-title">\U0001f4dc Features &amp; Traits</div>
    <div class="feature-grid">
{fcards}
    </div>
  </div>
</div>

<!-- \u2550\u2550\u2550 TAB: GEAR \u2550\u2550\u2550 -->
<div class="tab-pane" id="tab-gear">
  <div class="panel">
    <div class="panel-title">\U0001f392 Equipment</div>
    <div class="equip-grid">
{gcards}
    </div>
  </div>
</div>

</div><!-- /page -->

<script>
/* {slug} \u2014 everything unique to this character. The engine is sheet.js. */
const SHEET = {{
{cfg}
}};
</script>
<script src="sheet.js"></script>
</body>
</html>
'''.format(name=esc(m["name"]), css=css, img=esc(m["img"] or ""), icon=ov["icon"],
           hero_sub=hero_sub, bio=bio_html, pills="\n".join(pill_html), tabs=tabs_html,
           trackers="\n".join(trackers), slots=slot_html, conc=conc_html,
           rolls=rolls_html, weapons="\n".join(wcards), actions="\n".join(acards),
           reminder_icon=ov["theme"]["reminder_icon"], reminders=reminders,
           spell_pane=spell_pane, abcards="\n".join(abcards), saverows="\n".join(saverows),
           skillrows="\n".join(skillrows), senserows="\n".join(senserows),
           langs=chips(langs), toolrows=toolrows, fcards="\n".join(fcards),
           gcards="\n".join(gcards), slug=slug, cfg="\n".join(cfg))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("actor", help="Foundry actor export (.json)")
    ap.add_argument("overlay", nargs="?", help="authored flavour + theme (.json); not needed with --dump-model")
    ap.add_argument("-o", "--out", help="output .html (default: <slug>.html beside the overlay)")
    ap.add_argument("--dump-model", action="store_true", help="print the extracted model and exit")
    a = ap.parse_args()

    m = extract(a.actor)
    if a.dump_model:
        json.dump(m, sys.stdout, indent=1, ensure_ascii=False)
        return
    if not a.overlay:
        ap.error("an overlay is required unless you pass --dump-model")
    ov = json.load(open(a.overlay, encoding="utf-8"))
    out = a.out or os.path.join(os.path.dirname(a.overlay) or ".", ov["slug"] + ".html")
    open(out, "w", encoding="utf-8", newline="").write(render(m, ov))
    print("%-16s L%d  HP %d  AC %d  %d weapons  %d spells  ->  %s"
          % (m["name"], m["level"], m["hp_max"], m["ac"], len(m["weapons"]), len(m["spells"]), out))


if __name__ == "__main__":
    main()
