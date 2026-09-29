#!/usr/bin/env python3
"""Extract one FaB set from the-fab-cube/flesh-and-blood-cards into compact pool JSON.

Usage: python3 build_set.py <repo_dir> <SET_ID> <out.json> [--images-out images.txt]

Normalises known data gaps (blank foiling, split double-faced records) and fails
loudly on anything else: schema drift, unknown codes, duplicate printings, empty
pools, or pool sizes that disagree with the published composition beyond the gaps
listed in KNOWN_GAPS.
"""
import json, subprocess, sys, collections, os

# Published composition: distinct card numbers per rarity.
EXPECTED = {
    "OMN": {"C": 134, "R": 60, "M": 37, "L": 5, "F": 1, "B": 14},
    # Miniature Market / MinMax listing: 2 F, 27 Marvel, 5 L, 40 M (20 core / 20 expansion), 66 R, 133 C, 16 B
    "IAR": {"C": 133, "R": 66, "M": 40, "L": 5, "F": 2, "B": 16, "X": 20},
}
# Differences we have looked at and accept until the upstream data branch is finished.
KNOWN_GAPS = {
    "IAR": {
        "C": "data has 130 distinct commons; published says 133",
        "B": "data has 15 distinct basics; published says 16 (IAR158 holds two tokens under one number)",
    },
}
EXCLUDED_RARITIES = {"S", "P", "T"}  # never drawn from boosters in current sets
KNOWN_RARITY = set("CRSMLFTBVP")
KNOWN_FOIL = set("SRCG")
REQ_CARD = {"name", "pitch", "types", "type_text", "cost", "power", "defense", "printings"}
REQ_PRINT = {"unique_id", "id", "set_id", "edition", "foiling", "rarity", "expansion_slot", "art_variations", "image_url"}

warnings = []
def die(msg):
    print("BUILD FAILED:", msg, file=sys.stderr); sys.exit(1)
def warn(msg):
    warnings.append(msg); print("WARNING:", msg, file=sys.stderr)

def pool_key(r, f, x):
    if r == "V": return "V"                       # Marvel
    if f == "S": return "X" if x else r            # standard finish
    return ("RF_" if f == "R" else "CF_") + r      # rainbow / cold (gold cold counts as cold)

def img_name(url):
    return os.path.basename(url) if url else ""

def main(repo, set_id, out, images_out=None):
    commit = subprocess.check_output(["git", "-C", repo, "rev-parse", "HEAD"], text=True).strip()
    cards = json.load(open(f"{repo}/json/english/card.json"))
    raw, seen = [], set()
    for c in cards:
        missing = REQ_CARD - c.keys()
        if missing: die(f"card {c.get('name')} missing fields {missing} (schema changed?)")
        for p in c["printings"]:
            if p["set_id"] != set_id: continue
            missing = REQ_PRINT - p.keys()
            if missing: die(f"printing {p.get('id')} missing fields {missing}")
            if p["unique_id"] in seen: die(f"duplicate printing unique_id {p['unique_id']}")
            seen.add(p["unique_id"])
            f = p["foiling"]
            if f == "":
                warn(f"{p['id']} {c['name']}: blank foiling, treated as Standard"); f = "S"
            if p["rarity"] not in KNOWN_RARITY: die(f"unknown rarity {p['rarity']} on {p['id']}")
            if f not in KNOWN_FOIL: die(f"unknown foiling {f} on {p['id']}")
            raw.append({"u": p["unique_id"], "id": p["id"], "n": c["name"], "p": c["pitch"],
                        "t": c["type_text"], "r": p["rarity"], "f": f, "x": bool(p["expansion_slot"]),
                        "a": p["art_variations"], "c": c["cost"], "pw": c["power"], "d": c["defense"],
                        "hp": c.get("health", ""), "img": p["image_url"] or ""})
    if not raw: die(f"no printings for set {set_id}")

    # Merge double-faced cards: records sharing number, rarity, finish and art where one is the back.
    groups = collections.defaultdict(list)
    for r in raw: groups[(r["id"], r["r"], r["f"], tuple(r["a"]))].append(r)
    recs = []
    for key, g in groups.items():
        backs = [r for r in g if r["img"].endswith("_BACK.webp")]
        fronts = [r for r in g if not r["img"].endswith("_BACK.webp")]
        if len(g) == 2 and not g[0]["img"] and not g[1]["img"]:
            backs, fronts = [g[1]], [g[0]]  # double-faced token with no images yet
        if len(backs) > 1 or (backs and len(fronts) != 1):
            die(f"can't pair faces for {key}: {[r['n'] for r in g]}")
        if backs:
            front, back = fronts[0], backs[0]
            front["back"] = {"n": back["n"], "t": back["t"], "img": back["img"]}
            recs.append(front)
        else:
            recs.extend(g)

    per_rarity_ids = collections.defaultdict(set)
    for r in recs:
        if r["r"] in EXCLUDED_RARITIES:
            warn(f"{r['id']} {r['n']}: rarity {r['r']} is not drawn from boosters; left out of every pool")
            r["pool"] = None; continue
        r["pool"] = pool_key(r["r"], r["f"], r["x"])
        if r["r"] != "V": per_rarity_ids[r["r"]].add(r["id"])
        if r["x"]: per_rarity_ids["X"].add(r["id"])
        if not r["img"]: warn(f"{r['id']} {r['n']} ({r['f']}): no image URL, will use text render")

    exp, gaps = EXPECTED.get(set_id), KNOWN_GAPS.get(set_id, {})
    if exp:
        for rar, n in exp.items():
            got = len(per_rarity_ids[rar])
            if got != n:
                if rar in gaps: warn(f"rarity {rar}: {got} vs published {n} (known gap: {gaps[rar]})")
                else: die(f"rarity {rar}: {got} distinct cards, published composition says {n}")
    else:
        warn(f"no published composition for {set_id}; size check skipped")

    recs.sort(key=lambda r: (r["id"], r["f"], r["r"]))
    pools = collections.defaultdict(list)
    for i, r in enumerate(recs):
        if r["pool"]: pools[r["pool"]].append(i)
    images = sorted({u for r in recs for u in [r["img"], r.get("back", {}).get("img", "")] if u})
    for r in recs:  # point at local copies
        r["img"] = "img/" + img_name(r["img"]) if r["img"] else ""
        if "back" in r and r["back"]["img"]: r["back"]["img"] = "img/" + img_name(r["back"]["img"])
        del r["x"], r["u"]
        if not r["a"]: del r["a"]
    names = collections.Counter(img_name(u) for u in images)
    if any(v > 1 for v in names.values()): die("two image URLs share a file name")
    json.dump({"set": set_id, "sourceCommit": commit, "cards": recs, "pools": dict(sorted(pools.items())),
               "warnings": warnings}, open(out, "w"), separators=(",", ":"))
    if images_out: open(images_out, "w").write("\n".join(images) + "\n")
    print(f"{set_id}@{commit[:10]}: {len(recs)} printings, {len(images)} images; pools:",
          {k: len(v) for k, v in sorted(pools.items())})

if __name__ == "__main__":
    args = sys.argv[1:]
    images_out = None
    if "--images-out" in args:
        i = args.index("--images-out"); images_out = args[i + 1]; del args[i:i + 2]
    if len(args) != 3: die(__doc__)
    main(*args, images_out=images_out)
