# -*- coding: utf-8 -*-
"""
دمج إسنادات سرب ب١ المعتمدة في الطبقات المهيكلة (حتمي، يعاد تشغيله بأمان)

الاستعمال:
    python3 apply_b1.py <مجلد structured> <مسار results.jsonl>

يقرأ أحكام السرب المعتمدة (بعد اجتياز المصونة) ويحدّث مداخل الطبقات:
- lexical/continuation بجذور قرآنية موثقة → تُكتب في anchor.root
  (بوسم provenance: b1-swarm أو gold-manual).
- grammatical/structural/defective → يُصحح kind المدخل ويوسم.
- الجذور غير القرآنية تُحفظ في anchor.roots_nonquranic (معرفة سالبة نافعة).
يُشغَّل بعد structure_books.py في كل إعادة توليد.
"""
import json
import sys


def main():
    sdir, results = sys.argv[1], sys.argv[2]
    ann = {}
    for line in open(results, encoding="utf-8"):
        r = json.loads(line)
        ann[r["id"]] = r
    layers = sorted({r["layer"] for r in ann.values()})
    for layer in layers:
        path = "%s/%s.jsonl" % (sdir, layer)
        rows = [json.loads(l) for l in open(path, encoding="utf-8")]
        touched = 0
        for row in rows:
            a = ann.get(row["id"])
            if not a:
                continue
            touched += 1
            row["kind_b1"] = a["kind"]
            if a["kind"] in ("grammatical", "structural", "defective"):
                row["kind"] = {"grammatical": "adawat", "structural": "structural",
                               "defective": "defective"}[a["kind"]]
            if a.get("roots_quranic"):
                row["anchor"]["root"] = a["roots_quranic"]
            if a.get("roots_nonquranic"):
                row["anchor"]["roots_nonquranic"] = a["roots_nonquranic"]
            if a.get("terms") and not row["anchor"].get("term"):
                row["anchor"]["term"] = " / ".join(a["terms"])[:60]
            row["b1_judge"] = a["judge"]
        with open(path, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(layer, "حُدّث:", touched)


if __name__ == "__main__":
    main()
