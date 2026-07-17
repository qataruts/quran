# -*- coding: utf-8 -*-
"""
خريطة الاستعمال المحسوبة — سكربت الاستخلاص الحتمي لبطاقات «باب البيان»

الاستعمال:
    python3 usage_map.py <مسار quran-kg.db> <مسار siyaq-units.json> <مفتاح البطاقة> <مجلد الإخراج>

⚠ قاعدة تشغيلية ثابتة: لا يُشغَّل SQLite على /Volumes/data (ينهار على القراءة
العشوائية). تُنسخ القاعدة أولًا إلى القرص الداخلي ثم يُشغَّل السكربت عليها:
    cp /Volumes/data/new-projects/quran/quran-kg.db /tmp/…/quran-kg.db

ما يحسبه (حتميًّا بنسبة ١٠٠٪ من QAC + نص المصحف + وحدات السياق المعتمدة v1.1):
  ١. كل المواضع: الموضع، السورة، مكي/مدني، نص الآية، الصورة الرسمية للكلمة،
     الخصائص الصرفية (الزمن/الصيغة/الشخص/الجنس/العدد/البناء للمجهول/الاشتقاق)،
     ولاحقة ضمير النصب على الفعل (مفعول متصل)، وتعدية «بـ» في الكلمة التالية،
     ووحدة السياق المعتمدة التي يقع فيها الموضع.
  ٢. مجاميع: حسب الزمن الصرفي، حسب الشخص، حسب مكي/مدني، حسب صيغة الاشتقاق.
  ٣. المصاحبات اللفظية: اللمّات المتكررة في آيات الورود (نافذة الآية)، مع
     استبعاد أدوات المعنى الوظيفي (حروف، ضمائر، إشارات، موصولات).
  ٤. للثنائيات: بصمة الافتراق — لمّات تصاحب هذا الطرف مرتين فأكثر ولا تصاحب
     الطرف الآخر أبدًا.

كل رقم في البطاقات يُعاد إنتاجه بإعادة تشغيل هذا السكربت على القاعدة نفسها.
"""
import json
import sqlite3
import sys
from collections import Counter, OrderedDict

# ---------------------------------------------------------------------------
# مواصفات البطاقات: كل طرف = قائمة لمّات (بهجاء جدول lemma في القاعدة)
# «أتى/جاء»: لمّة أَتَى الثلاثية فقط — آتَى (الرباعي بمعنى الإعطاء) طرف مستقل
# يُحسب أيضًا شاهدًا على افتراق الصيغتين تحت الجذر الواحد.
# ---------------------------------------------------------------------------
CARDS = {
    "ata-jaa": {
        "title": "أتى / جاء",
        "sides": OrderedDict([
            ("أتى", ["أَتَى"]),
            ("جاء", ["جاءَ"]),
        ]),
        "extra_sides": OrderedDict([
            ("آتى (الرباعي — للفصل لا للمقارنة)", ["آتَى"]),
        ]),
    },
    "khawf-khashya": {
        "title": "خوف / خشية",
        "sides": OrderedDict([
            ("خوف", ["خافَ", "خَوْف", "خِيفَة", "خائِف", "تَخَوُّف", "تَخْوِيف", "يُخَوِّفُ"]),
            ("خشية", ["خَشِيَ", "خَشْيَة"]),
        ]),
    },
    "istataa": {
        "title": "اسطاعوا / استطاعوا",
        "sides": OrderedDict([
            ("استطاع (كل المواضع)", ["اسْتَطاعَ"]),
        ]),
    },
    "qasit-muqsit": {
        "title": "القاسطون / المقسطون",
        "sides": OrderedDict([
            ("قاسط", ["قاسِط"]),
            ("مقسط", ["مُقْسِط", "أَقْسَط", "تُقْسِطُ"]),
            ("قسط (الاسم)", ["قِسْط"]),
        ]),
    },
    "basair": {
        "title": "بصائر",
        "sides": OrderedDict([
            ("بصيرة/بصائر", ["بَصِيرَة"]),
        ]),
    },
}

# أدوات وظيفية تُستبعد من المصاحبات (أقسام كلام لا لمّات بعينها)
FUNCTION_POS = {
    "P", "DET", "CONJ", "SUB", "ACC", "AMD", "ANS", "ATT", "AVR", "CAUS",
    "CERT", "CIRC", "COM", "COND", "EQ", "EXH", "EXL", "EXP", "FUT", "INC",
    "INT", "INTG", "NEG", "PREV", "PRO", "REM", "RES", "RET", "RSLT", "SUP",
    "SUR", "VOC", "INL", "EMPH", "IMPV_LAM", "PRP", "DIST", "ADDR",
    "PRON", "DEM", "REL", "T", "LOC",
}

ASPECT_AR = {"PERF": "ماضٍ", "IMPF": "مضارع", "IMPV": "أمر", None: "—"}
PERSON_AR = {1: "متكلم", 2: "مخاطب", 3: "غائب", None: "—"}
VOICE_AR = {"ACT": "معلوم", "PASS": "مجهول", None: "—"}


DIACRITICS = "ًٌٍَُِّْـٰٓۡۖۗۘۚۛۜ"


def skeleton(s):
    """تجريد اللمّة من التشكيل — القاعدة تخزن الشدّة قبل الحركة وأسماؤنا قد
    تعكس الترتيب، فالمطابقة النصية الحرفية تُسقط مواضع صامتةً (وقعت فعلًا:
    يُخَوِّفُ وتَخَوُّف). المطابقة بالهيكل المجرد داخل البطاقة مأمونة."""
    return "".join(ch for ch in s if ch not in DIACRITICS)


def resolve_lemma_ids(cx, names):
    """تُرجِع lemma_id لكل اسم مضبوط في المواصفة، بمطابقة الهيكل المجرد.
    تفشل بصوت عالٍ إن طابق الاسمُ صفرًا أو أكثر من لمّة واحدة."""
    all_rows = cx.execute("SELECT lemma_id, lemma_ar FROM lemma").fetchall()
    by_skel = {}
    for lid, lar in all_rows:
        by_skel.setdefault(skeleton(lar), []).append((lid, lar))
    ids = []
    for name in names:
        hits = by_skel.get(skeleton(name), [])
        if len(hits) != 1:
            raise SystemExit("لمّة غير محسومة: %s → %s" % (name, hits))
        ids.append(hits[0][0])
    return ids


def load_units(path):
    data = json.load(open(path, encoding="utf-8"))
    return data["units"]  # [surah, start, end, name]


def unit_of(units, surah, ayah):
    for i, (s, a1, a2, name) in enumerate(units):
        if s == surah and a1 <= ayah <= a2:
            return (i, name)
    return (None, "—")


def occurrences(cx, lemma_ids):
    """كل مواضع مجموعة لمّات: صف لكل كلمة (مقطع الجذع) بخصائصه الصرفية."""
    q = """
    SELECT w.word_id, w.location, w.surah_no, w.ayah_no, w.text_uthmani,
           su.name_ar, su.revelation, a.text_clean,
           l.lemma_ar, s.pos, s.aspect, s.mood, s.voice, s.verb_form,
           s.person, s.gender, s.number, s.derivation, s.case_mark, s.state
    FROM word w
    JOIN segment s ON s.word_id = w.word_id AND s.role = 'stem'
    JOIN lemma l   ON l.lemma_id = s.lemma_id
    JOIN ayah a    ON a.ayah_id = w.ayah_id
    JOIN surah su  ON su.surah_no = w.surah_no
    WHERE l.lemma_id IN (%s)
    ORDER BY w.word_id
    """ % ",".join("?" * len(lemma_ids))
    return [dict(r) for r in cx.execute(q, lemma_ids).fetchall()]


def object_pronoun(cx, word_id):
    """أللكلمة لاحقة ضمير (مفعول متصل على الفعل)؟"""
    r = cx.execute(
        "SELECT COUNT(*) FROM segment WHERE word_id=? AND role='suffix' AND pos='PRON'",
        (word_id,),
    ).fetchone()[0]
    return r > 0


def next_word_bi(cx, word_id):
    """أتبدأ الكلمة التالية في الآية نفسها بحرف الجر «بِ»؟ (تعدية بالباء)"""
    r = cx.execute(
        """SELECT s.text FROM word w2
           JOIN word w1 ON w1.word_id=? AND w2.ayah_id=w1.ayah_id AND w2.word_no=w1.word_no+1
           JOIN segment s ON s.word_id=w2.word_id AND s.seg_no=1
           WHERE s.pos='P'""",
        (word_id,),
    ).fetchone()
    return bool(r) and r[0].startswith("بِ")


def collocations(cx, ayah_ids, exclude_lemmas):
    """لمّات المحتوى المصاحبة في آيات الورود (مقاطع الجذع، بلا أدوات وظيفية)."""
    if not ayah_ids:
        return Counter()
    q = """
    SELECT l.lemma_ar FROM segment s
    JOIN lemma l ON l.lemma_id = s.lemma_id
    WHERE s.role='stem' AND s.ayah_id IN (%s)
    """ % ",".join("?" * len(ayah_ids))
    c = Counter()
    for (lem,) in cx.execute(q, list(ayah_ids)):
        c[lem] += 1
    # استبعاد الأدوات الوظيفية بقسم الكلام الغالب على اللمّة
    q2 = """
    SELECT l.lemma_ar, s.pos, COUNT(*) FROM segment s
    JOIN lemma l ON l.lemma_id=s.lemma_id WHERE s.role='stem'
    GROUP BY l.lemma_ar, s.pos
    """
    pos_of = {}
    best = {}
    for lem, pos, n in cx.execute(q2):
        if n > best.get(lem, 0):
            best[lem] = n
            pos_of[lem] = pos
    excl_skel = set(skeleton(x) for x in exclude_lemmas)
    out = Counter()
    for lem, n in c.items():
        if skeleton(lem) in excl_skel:
            continue
        if pos_of.get(lem) in FUNCTION_POS:
            continue
        out[lem] = n
    return out


def side_map(cx, units, lemmas):
    occs = occurrences(cx, resolve_lemma_ids(cx, lemmas))
    rows = []
    ayah_ids = set()
    for o in occs:
        ui, uname = unit_of(units, o["surah_no"], o["ayah_no"])
        rows.append({
            "loc": o["location"],
            "surah": o["name_ar"],
            "revelation": "مكية" if o["revelation"] == "Meccan" else "مدنية",
            "form": o["text_uthmani"],
            "lemma": o["lemma_ar"],
            "pos": o["pos"],
            "aspect": ASPECT_AR.get(o["aspect"], o["aspect"]),
            "person": PERSON_AR.get(o["person"], o["person"]),
            "gender": o["gender"] or "—",
            "number": o["number"] or "—",
            "voice": VOICE_AR.get(o["voice"], o["voice"]),
            "verb_form": o["verb_form"],
            "derivation": o["derivation"] or "—",
            "obj_pron": None,
            "bi_next": None,
            "unit": uname,
            "ayah": o["text_clean"],
        })
        ayah_ids.add((o["location"].split(":")[0], o["location"].split(":")[1]))
    # المفعول المتصل وتعدية الباء (للأفعال فقط)
    for r_, o in zip(rows, occs):
        if r_["pos"] == "V":
            r_["obj_pron"] = object_pronoun(cx, o["word_id"])
            r_["bi_next"] = next_word_bi(cx, o["word_id"])
    # مجاميع
    agg = {
        "total": len(rows),
        "by_aspect": dict(Counter(r["aspect"] for r in rows if r["pos"] == "V")),
        "by_person": dict(Counter(r["person"] for r in rows if r["pos"] == "V")),
        "by_voice": dict(Counter(r["voice"] for r in rows if r["pos"] == "V")),
        "by_revelation": dict(Counter(r["revelation"] for r in rows)),
        "by_derivation": dict(Counter(r["derivation"] for r in rows if r["derivation"] != "—")),
        "obj_pron_count": sum(1 for r in rows if r["obj_pron"]),
        "bi_next_count": sum(1 for r in rows if r["bi_next"]),
        "verbs": sum(1 for r in rows if r["pos"] == "V"),
    }
    aids = set()
    q = "SELECT ayah_id FROM ayah WHERE surah_no=? AND ayah_no=?"
    for s, a in ayah_ids:
        aids.add(cx.execute(q, (int(s), int(a))).fetchone()[0])
    return rows, agg, aids


def main():
    db_path, units_path, card_key, out_dir = sys.argv[1:5]
    card = CARDS[card_key]
    cx = sqlite3.connect(db_path)
    cx.row_factory = sqlite3.Row
    units = load_units(units_path)

    result = {"card": card_key, "title": card["title"], "sides": {}}
    side_ayahs = {}
    all_sides = OrderedDict(card["sides"])
    all_sides.update(card.get("extra_sides", {}))
    for name, lemmas in all_sides.items():
        rows, agg, aids = side_map(cx, units, lemmas)
        exclude = set()
        for ls in all_sides.values():
            exclude.update(ls)
        coll = collocations(cx, aids, exclude)
        result["sides"][name] = {
            "lemmas": lemmas,
            "aggregates": agg,
            "collocations_top": coll.most_common(20),
            "occurrences": rows,
        }
        side_ayahs[name] = aids

    # بصمة الافتراق للثنائيات (الطرفان الأولان في sides)
    keys = list(card["sides"].keys())
    if len(keys) >= 2:
        a, b = keys[0], keys[1]
        ca = Counter(dict(result["sides"][a]["collocations_top"]))
        # نعيد حساب المصاحبات كاملة (لا top فقط) للافتراق
        exclude = set()
        for ls in all_sides.values():
            exclude.update(ls)
        full_a = collocations(cx, side_ayahs[a], exclude)
        full_b = collocations(cx, side_ayahs[b], exclude)
        only_a = [(l, n) for l, n in full_a.most_common() if n >= 2 and l not in full_b]
        only_b = [(l, n) for l, n in full_b.most_common() if n >= 2 and l not in full_a]
        result["contrast"] = {
            "only_" + a: only_a[:25],
            "only_" + b: only_b[:25],
        }

    out = "%s/%s.json" % (out_dir, card_key)
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("كتب:", out)
    for name in all_sides:
        agg = result["sides"][name]["aggregates"]
        print(" ", name, "→", agg["total"], "موضعًا |", agg["by_revelation"])


if __name__ == "__main__":
    main()
