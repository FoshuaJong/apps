#!/usr/bin/env python3
"""Build ama.json (Armory Deck: Malice) from the official decklist + fab-cube card data.

Usage: python3 build_armory.py <fab-cards-repo> tools/ama-decklist.txt ama.json [--images-out tools/images-ama.txt]

Collector numbers: AMA001-AMA014 partly confirmed by fab-cube; the rest follow the published set list
(Cards Realm) and the usual LSS numbering. Image names follow LSS's pattern: arena cards are rainbow
foil (AMA003-RF.webp), deck cards standard (AMA011.webp). Rarity comes from fab-cube where the printing
exists, else from the same card's Usurp the Shadow Throne printing, else "U" (unlisted).
"""
import json, re, sys, subprocess

S3 = "https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/large/"
NUMBERS = {  # (name, pitch) -> collector number
    ("Malice, Domina of the Dead", ""): 1, ("Vox Necropolis", ""): 2, ("Corrupted Crown", ""): 3,
    ("Drop Dead Bodice", ""): 4, ("Undead Grasp", ""): 5, ("Mage Master Boots", ""): 6,
    ("Ominous Toll", "1"): 7, ("Sink Below", "1"): 8, ("Commit to Corruption", "1"): 9, ("Darkest Hour", "1"): 10,
    ("Dig for Souls", "1"): 11, ("Shadowrealm Strength", "1"): 12, ("Skeletal Puppetry", "1"): 13,
    ("Restless Commander", "1"): 14, ("Restless Looter", "1"): 15, ("Restless Magister", "1"): 16,
    ("Restless Outlaw", "1"): 17, ("Restless Quartermaster", "1"): 18, ("Restless Steed", "1"): 19,
    ("Countdown to Extinction", "3"): 20, ("Clambering Corpses", "3"): 21, ("Otherworldly Ossuary", "3"): 22,
    ("Pull from Beyond", "3"): 23, ("Rites of Nightfall", "3"): 24, ("Shadowrealm Solace", "3"): 25,
    ("Shadowrealm Strength", "3"): 26, ("Skeletal Puppetry", "3"): 27, ("Mark of Ushering", "3"): 28,
    ("Corrupted Corpse", ""): 29, ("Gate to i'Arathael", ""): 30,
}
PITCH = {"red": "1", "yellow": "2", "blue": "3"}

def die(m): print("BUILD FAILED:", m, file=sys.stderr); sys.exit(1)

def parse(path):
    zone, out, meta = None, [], {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line: continue
        m = re.match(r"^(Name|Hero|Format):\s*(.+)$", line)
        if m: meta[m.group(1).lower()] = m.group(2); continue
        if line.lower() in ("arena cards", "deck cards", "tokens"): zone = line.split()[0].lower(); continue
        m = re.match(r"^(\d+)x\s+(.+?)(?:\s+\((red|yellow|blue)\))?$", line)
        if not m: die(f"can't read decklist line: {line!r}")
        if zone is None: die("card listed before a section header")
        out.append({"qty": int(m.group(1)), "name": m.group(2), "pitch": PITCH.get(m.group(3) or "", ""), "zone": zone})
    if "hero" not in meta: die("decklist has no Hero line")
    out.insert(0, {"qty": 1, "name": meta["hero"], "pitch": "", "zone": "hero"})
    return meta, out

def main(repo, deck_path, out, images_out=None):
    commit = subprocess.check_output(["git", "-C", repo, "rev-parse", "HEAD"], text=True).strip()
    meta, lines = parse(deck_path)
    deck_total = sum(l["qty"] for l in lines if l["zone"] == "deck")
    if deck_total != 60: die(f"deck has {deck_total} cards, expected 60")
    db = json.load(open(f"{repo}/json/english/card.json"))
    by_name, by_plain = {}, {}
    for c in db: by_name.setdefault((c["name"], c["pitch"]), c); by_plain.setdefault(c["name"], c)
    cards, contents, images, warnings = [], [], [], []
    for l in lines:
        key = (l["name"], l["pitch"])
        if key not in NUMBERS: die(f"no collector number for {key}")
        num = f"AMA{NUMBERS[key]:03d}"
        c = by_name.get(key)
        sibling = c or by_plain.get(l["name"])  # another pitch of the same card: same type line and rules text
        foil = "R" if l["zone"] in ("hero", "arena") else "S"
        pr = next((p for p in (c or {}).get("printings", []) if p["id"] == num), None)
        iar = next((p for p in (c or {}).get("printings", []) if p["set_id"] == "IAR" and p["foiling"] in ("S", "")), None)
        older = [p["rarity"] for p in (sibling or {}).get("printings", []) if p["rarity"] in "CRMLFB"]
        rarity = (pr["rarity"] if pr else iar["rarity"] if iar else "T" if l["zone"] == "tokens"
                  else max(set(older), key=older.count) if older else "U")
        if rarity == "U": warnings.append(f"{num} {l['name']}: rarity not in the data yet")
        if not sibling: warnings.append(f"{num} {l['name']}: card not in fab-cube yet (no type line or rules text)")
        img_url = (pr or {}).get("image_url") or S3 + num + ("-RF" if foil == "R" else "") + ".webp"
        images.append(img_url)
        rec = {"k": f"{num}-{rarity}{foil}", "id": num, "n": l["name"], "p": l["pitch"],
               "t": (sibling or {}).get("type_text", ""), "r": rarity, "f": foil,
               "c": (sibling or {}).get("cost", ""), "pw": (c or {}).get("power", ""), "d": (c or {}).get("defense", ""),
               "hp": (c or {}).get("health", ""), "ft": (sibling or {}).get("functional_text_plain", "") or "",
               "ar": ", ".join((pr or {}).get("artists") or []), "img": "img/" + img_url.rsplit("/", 1)[1], "tcg": ""}
        if pr and pr.get("art_variations"): rec["a"] = pr["art_variations"]
        cards.append(rec)
        contents.append({"card": len(cards) - 1, "qty": l["qty"], "zone": l["zone"]})
    json.dump({"code": "AMA", "name": meta.get("name", "Armory Deck"), "format": meta.get("format", ""),
               "sourceCommit": commit, "cards": cards, "contents": contents, "warnings": warnings},
              open(out, "w"), separators=(",", ":"))
    if images_out: open(images_out, "w").write("\n".join(sorted(set(images))) + "\n")
    for w in warnings: print("WARNING:", w, file=sys.stderr)
    print(f"{meta.get('name')}: {len(cards)} printings, {sum(x['qty'] for x in contents)} cards "
          f"({deck_total} in the deck)")

if __name__ == "__main__":
    a = sys.argv[1:]; io = None
    if "--images-out" in a: i = a.index("--images-out"); io = a[i + 1]; del a[i:i + 2]
    if len(a) != 3: die(__doc__)
    main(*a, images_out=io)
