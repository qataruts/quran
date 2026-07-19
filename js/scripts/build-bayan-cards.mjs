/**
 * بطاقات البيان إلى العرض — يجمع public/bayan.json من:
 *   data/bayan-cards.json          (الوصف اليدوي: العنوان، سطر الكشف، القراءات المنسوبة)
 *   ../findings/bayan/maps/<id>.json (الخرائط المحسوبة الحتمية — usage_map.py)
 * فكل بطاقة تصل القارئ بطبقتيها: محسوبٌ يوصف، ومنقولٌ يُنسب — «نحسب ونعرض».
 *
 * usage: node js/scripts/build-bayan-cards.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const META = JSON.parse(fs.readFileSync(path.join(ROOT, "data/bayan-cards.json"), "utf-8"));
const MAPS = path.resolve(ROOT, "../findings/bayan/maps");
const PUB = path.join(ROOT, "apps/studio/public");

const out = { types: META.types, cards: [] };
for (const c of META.cards) {
  const m = JSON.parse(fs.readFileSync(path.join(MAPS, `${c.id}.json`), "utf-8"));
  const sides = [];
  for (const [name, s] of Object.entries(m.sides)) {
    const a = s.aggregates;
    sides.push({
      name,
      total: a.total,
      makki: a.by_revelation["مكية"] ?? 0,
      madani: a.by_revelation["مدنية"] ?? 0,
      aspects: a.by_aspect ?? {},
      colloc: (s.collocations_top ?? []).slice(0, 8),
      occ: s.occurrences.map((o) => ({
        loc: o.loc.split(":").slice(0, 2).join(":"),
        form: o.form,
        unit: o.unit,
        txt: o.ayah.length > 92 ? o.ayah.slice(0, 92) + "…" : o.ayah,
      })),
    });
  }
  const contrast = m.contrast
    ? Object.fromEntries(Object.entries(m.contrast).map(([k, v]) => [k.replace(/^only_/, ""), v.slice(0, 8)]))
    : null;
  out.cards.push({ id: c.id, title: c.title, type: c.type, kashf: c.kashf, readings: c.readings, sides, contrast });
}

const dest = path.join(PUB, "bayan.json");
fs.writeFileSync(dest, JSON.stringify(out), "utf-8");
console.log(`✓ bayan.json: ${out.cards.length} بطاقة · ${(fs.statSync(dest).size / 1024).toFixed(0)} ك.ب`);

// ——— مكتبة البيان: كل الكتب المدخلية المهيكلة المجذّرة — ملفٌ لكل كتاب (يُجلب عند طلبه)
const LIB_BOOKS = [
  { id: "furuqaskari", file: "bayan-furuq", label: "الفروق اللغوية — أبو هلال العسكري" },
  { id: "basair", file: "bayan-basair", label: "بصائر ذوي التمييز — الفيروزآبادي" },
  { id: "wujuhaskari", file: "bayan-wujuh-askari", label: "الوجوه والنظائر — أبو هلال العسكري" },
  { id: "nuzha", file: "bayan-nuzha", label: "نزهة الأعين النواظر — ابن الجوزي" },
  { id: "damghani", file: "bayan-damghani", label: "قاموس القرآن — الدامغاني" },
];
const libIndex = [];
for (const b of LIB_BOOKS) {
  const src = path.resolve(ROOT, `data/bayan-sources/structured/${b.file}.jsonl`);
  const entries = [];
  for (const line of fs.readFileSync(src, "utf-8").split("\n").filter(Boolean)) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (["front-matter", "defective", "sura-basira"].includes(e.kind)) continue;
    const head = (e.anchor?.term ?? "").replace(/[$#*]+/g, " ").replace(/\s+/g, " ").trim();
    if (!head) continue;
    entries.push({ id: e.id, head, roots: e.anchor?.root ?? [], text: e.text.replace(/\s+/g, " ").trim() });
  }
  const dest = path.join(PUB, `bayan-lib-${b.id}.json`);
  fs.writeFileSync(dest, JSON.stringify({ id: b.id, label: b.label, entries }), "utf-8");
  libIndex.push({ id: b.id, label: b.label, count: entries.length });
  console.log(`✓ bayan-lib-${b.id}.json: ${entries.length} مدخلًا · ${(fs.statSync(dest).size / 1024).toFixed(0)} ك.ب`);
}
fs.writeFileSync(path.join(PUB, "bayan-lib.json"), JSON.stringify({ books: libIndex }), "utf-8");
console.log(`✓ bayan-lib.json (الفهرس): ${libIndex.length} كتب`);
