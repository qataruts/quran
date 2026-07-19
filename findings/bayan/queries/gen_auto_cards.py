# -*- coding: utf-8 -*-
"""
توليد البطاقات الآلية — لكل مدخل «فروق» طرفاه (فأكثر) قرآنيان:
خريطة استعمال محسوبة حتميًّا لكل جذر (المواضع بوحداتها، مكي/مدني، الصور،
المصاحبات، بصمة الافتراق) + نص العسكري قراءةً منقولة منسوبة.
لا تحرير بشريًّا ولا تعليل آليًّا — توسيمها في العرض: «بطاقة آلية التوليد».

usage: python3 gen_auto_cards.py <quran-kg.db المحلية> <siyaq-units.json> <bayan-furuq.jsonl> <public/bayan-auto.json>
"""
import json
import sqlite3
import sys
from collections import Counter

FUNCTION_POS = {"P","DET","CONJ","SUB","ACC","AMD","ANS","ATT","AVR","CAUS","CERT","CIRC","COM","COND","EQ","EXH","EXL","EXP","FUT","INC","INT","INTG","NEG","PREV","PRO","REM","RES","RET","RSLT","SUP","SUR","VOC","INL","EMPH","IMPV_LAM","PRP","DIST","ADDR","PRON","DEM","REL","T","LOC"}
OCC_CAP = 40


def main():
    db, units_path, furuq_path, out_path = sys.argv[1:5]
    cx = sqlite3.connect(db)
    cx.row_factory = sqlite3.Row
    units = json.load(open(units_path, encoding="utf-8"))["units"]

    def unit_of(s, a):
        for su, a1, a2, name in units:
            if su == s and a1 <= a <= a2:
                return name
        return ""

    # قسم الكلام الغالب لكل لمّة (لاستبعاد الأدوات من المصاحبات)
    pos_of, best = {}, {}
    for lem, pos, n in cx.execute(
        "SELECT l.lemma_ar, s.pos, COUNT(*) FROM segment s JOIN lemma l ON l.lemma_id=s.lemma_id WHERE s.role='stem' GROUP BY l.lemma_ar, s.pos"):
        if n > best.get(lem, 0):
            best[lem] = n
            pos_of[lem] = pos

    root_ids = {r["root_ar"]: r["root_id"] for r in cx.execute("SELECT root_id, root_ar FROM root")}

    def side_of(root_ar):
        rid = root_ids.get(root_ar)
        if rid is None:
            return None
        occs = cx.execute(
            """SELECT w.location loc, w.surah_no s, w.ayah_no a, w.text_uthmani form,
                      su.revelation rev, ay.ayah_id aid
               FROM word w JOIN segment sg ON sg.word_id=w.word_id AND sg.role='stem' AND sg.root_id=?
               JOIN surah su ON su.surah_no=w.surah_no JOIN ayah ay ON ay.ayah_id=w.ayah_id
               ORDER BY w.word_id""", (rid,)).fetchall()
        if not occs:
            return None
        aids = sorted({o["aid"] for o in occs})
        coll = Counter()
        qm = "SELECT l.lemma_ar FROM segment s JOIN lemma l ON l.lemma_id=s.lemma_id WHERE s.role='stem' AND s.ayah_id IN (%s)" % ",".join("?"*len(aids))
        for (lem,) in cx.execute(qm, aids):
            if pos_of.get(lem) not in FUNCTION_POS:
                coll[lem] += 1
        # استبعاد لمّات الجذر نفسه من مصاحباته
        own = {l for (l,) in cx.execute("SELECT lemma_ar FROM lemma WHERE root_id=?", (rid,))}
        for l in own:
            coll.pop(l, None)
        makki = sum(1 for o in occs if o["rev"] == "Meccan")
        return {
            "root": root_ar, "total": len(occs), "makki": makki, "madani": len(occs) - makki,
            "colloc": coll.most_common(6),
            "occ": [{"loc": "%d:%d" % (o["s"], o["a"]), "form": o["form"],
                     "unit": unit_of(o["s"], o["a"])} for o in occs[:OCC_CAP]],
            "capped": len(occs) > OCC_CAP,
            "_coll_full": coll,
        }

    curated_pairs = set()  # المحررة تبقى وحدها — لا ازدواج بطاقات على الزوج نفسه
    for cid in ["ata-jaa","khawf-khashya","qasit-muqsit","aam-sana","matar-ghayth","bukhl-shuhh","rafa-rahma","ahd-mithaq","istafa-ijtaba","zann-hasiba-zaama","badan-jasad","halafa-aqsama","khushu-khudu"]:
        curated_pairs.add(cid)

    cards = []
    for line in open(furuq_path, encoding="utf-8"):
        e = json.loads(line)
        if e.get("kind") in ("front-matter", "defective"):
            continue
        roots = (e.get("anchor") or {}).get("root") or []
        if len(roots) < 2:
            continue
        sides = []
        for r in roots[:3]:
            s = side_of(r)
            if s:
                sides.append(s)
        if len(sides) < 2:
            continue
        a, b = sides[0], sides[1]
        only_a = [(l, n) for l, n in a["_coll_full"].most_common() if n >= 2 and l not in b["_coll_full"]][:6]
        only_b = [(l, n) for l, n in b["_coll_full"].most_common() if n >= 2 and l not in a["_coll_full"]][:6]
        for s in sides:
            s.pop("_coll_full")
        head = (e["anchor"].get("term") or "").replace("$", " ").strip()
        cards.append({
            "id": "auto-" + e["id"], "head": head, "roots": roots[:3], "sides": sides,
            "contrast": {a["root"]: only_a, b["root"]: only_b},
            "reading": {"src": "الفروق اللغوية — أبو هلال العسكري",
                        "quote": " ".join(e["text"].split())},
        })
    json.dump({"note": "بطاقات آلية التوليد: حسابها حتمي ونصها منقول منسوب — بلا تحرير بشري ولا تعليل آلي", "cards": cards},
              open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    import os
    print("بطاقات آلية:", len(cards), "· الحجم:", round(os.path.getsize(out_path) / 1048576, 2), "م.ب")


if __name__ == "__main__":
    main()
