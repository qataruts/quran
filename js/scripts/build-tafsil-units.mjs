/**
 * التفصيل الموضوعي — تطبيع بيانات المالك (archive/research/topics) إلى طبقة مشكاة:
 * ١٢٨١ مقطعًا متصلًا يطبّق المصحف كله + ٧ موضوعات ملوّنة (ألوان المصحف المطبوع).
 *
 * التطبيع الحتمي: ترتيبُ المدَيات داخل كل سورة، قصُّ المتجاوز عن عدّ الآي الكوفي،
 * إزالةُ التداخل (السابق يُقدَّم)، وسدُّ الفجوات بمدّ المقطع السابق — مع عدّ كل
 * إصلاحٍ والتقرير عنه. النص لا يُحمل من الملف: نأخذه من quran-kg.db (نصّنا القياسي).
 *
 * Writes:
 *   js/data/tafsil/units.json                    (القانوني: meta + units)
 *   js/apps/studio/public/tafsil-units.json      (حمولة التطبيق النحيلة)
 *   تقرير توافق الحدود مع أيسر والركوعات (stdout)
 * Usage: node scripts/build-tafsil-units.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SRC = path.join(ROOT, "archive/research/topics");
const OUT_CANON = path.join(ROOT, "js/data/tafsil/units.json");
const OUT_APP = path.join(ROOT, "js/apps/studio/public/tafsil-units.json");

// —— عدّ الآي الكوفي من قاعدتنا ——
const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const AC = new Map(db.prepare("SELECT surah_no n, ayah_count c FROM surah").all().map((r) => [r.n, r.c]));
const rukuOf = new Map(db.prepare("SELECT surah_no s, ayah_no a, ruku r FROM ayah").all().map((r) => [`${r.s}:${r.a}`, r.r]));
db.close();

// —— الموضوعات السبعة ——
const topicsCsv = fs.readFileSync(path.join(SRC, "topics.csv"), "utf-8").split("\n").filter((x) => x.trim());
const topics = topicsCsv.slice(1).map((line) => {
  const m = /^(\d+),([^,]*),([^,]*),(.*),([^,]*),(\d+),(\d+),(\d+)$/.exec(line);
  if (!m) throw new Error("topic parse: " + line.slice(0, 60));
  return { id: +m[1], name: m[3], desc: m[4].replace(/^"|"$/g, ""), short: m[5], rgb: [+m[6], +m[7], +m[8]] };
});

// —— المقاطع ——
const rows = fs.readFileSync(path.join(SRC, "data.csv"), "utf-8").split("\n").filter((x) => x.trim());
const raw = [];
for (let i = 1; i < rows.length; i++) {
  const m = /^(\d+):(\d+)-(\d+),(\d+),(\d+),/.exec(rows[i]);
  if (!m) { console.log("سطر غير مقروء:", rows[i].slice(0, 50)); continue; }
  raw.push({ s: +m[1], a1: +m[2], a2: +m[3], t: +m[5] });
}

// —— التطبيع داخل كل سورة ——
let fixes = { clamp: 0, overlap: 0, gapFill: 0, dropped: 0, swap: 0 };
const units = [];
for (let s = 1; s <= 114; s++) {
  const max = AC.get(s);
  const list = raw.filter((u) => u.s === s).map((u) => ({ ...u }));
  for (const u of list) {
    if (u.a2 < u.a1) { [u.a1, u.a2] = [u.a2, u.a1]; fixes.swap++; }
    if (u.a2 > max) { u.a2 = max; fixes.clamp++; }
    if (u.a1 > max) u.drop = true;
  }
  const clean = list.filter((u) => !u.drop);
  fixes.dropped += list.length - clean.length;
  clean.sort((x, y) => x.a1 - y.a1 || x.a2 - y.a2);
  const out = [];
  for (const u of clean) {
    const prev = out[out.length - 1];
    if (prev && u.a1 <= prev.a2) { u.a1 = prev.a2 + 1; fixes.overlap++; if (u.a1 > u.a2) { fixes.dropped++; continue; } }
    if (prev && u.a1 > prev.a2 + 1) { prev.a2 = u.a1 - 1; fixes.gapFill++; } // سدّ الفجوة بمدّ السابق
    if (!prev && u.a1 > 1) { u.a1 = 1; fixes.gapFill++; }
    out.push(u);
  }
  if (out.length && out[out.length - 1].a2 < max) { out[out.length - 1].a2 = max; fixes.gapFill++; }
  for (const u of out) units.push({ s, a1: u.a1, a2: u.a2, t: u.t });
}

// —— تحقق الإطباق ——
let covered = 0;
for (const u of units) covered += u.a2 - u.a1 + 1;
const total = [...AC.values()].reduce((a, b) => a + b, 0);
console.log(`مقاطع: ${units.length} · تغطية: ${covered}/${total} · إصلاحات: ${JSON.stringify(fixes)}`);
if (covered !== total) throw new Error("الإطباق غير تام");

// —— توافق الحدود مع أيسر والركوعات (وصفيًّا) ——
const aysar = JSON.parse(fs.readFileSync(path.join(ROOT, "js/apps/studio/public/rag-aysar.json"), "utf-8"));
const aysarStarts = new Set(aysar.map((e) => e.ref));
const tafsilStarts = units.map((u) => `${u.s}:${u.a1}`);
const inAysar = tafsilStarts.filter((r) => aysarStarts.has(r)).length;
const rukuStarts = new Set();
{
  let prev = null;
  for (const [ref, r] of rukuOf) { const s = ref.split(":")[0]; const key = s + "/" + r; if (key !== prev) { rukuStarts.add(ref); prev = key; } }
}
const inRuku = tafsilStarts.filter((r) => rukuStarts.has(r)).length;
console.log(`بدايات التفصيل الموافقة لأيسر: ${inAysar}/${units.length} (${Math.round((inAysar / units.length) * 100)}٪) · للركوعات: ${inRuku}/${units.length} (${Math.round((inRuku / units.length) * 100)}٪)`);

// —— أحجام ——
const sizes = units.map((u) => u.a2 - u.a1 + 1).sort((a, b) => a - b);
const q = (p) => sizes[Math.floor(p * (sizes.length - 1))];
console.log(`حجم المقطع: وسيط ${q(0.5)} · p90 ${q(0.9)} · أقصى ${sizes[sizes.length - 1]}`);

// —— الكتابة ——
fs.mkdirSync(path.dirname(OUT_CANON), { recursive: true });
fs.writeFileSync(OUT_CANON, JSON.stringify({
  meta: {
    source: "التفصيل الموضوعي — بيانات المالك (archive/research/topics)، طُبّعت على العدّ الكوفي",
    date: "2026-07-14",
    units: units.length,
    coverage: covered,
    fixes,
    agreement: { aysarStarts: inAysar, rukuStarts: inRuku },
  },
  topics,
  units,
}, null, 1));
fs.writeFileSync(OUT_APP, JSON.stringify({
  meta: { units: units.length, source: "التفصيل الموضوعي" },
  topics: topics.map((t) => ({ id: t.id, name: t.name, short: t.short, rgb: t.rgb })),
  units: units.map((u) => [u.s, u.a1, u.a2, u.t]),
}));
console.log(`→ ${OUT_CANON}`);
console.log(`→ ${OUT_APP} (${(fs.statSync(OUT_APP).size / 1024).toFixed(1)} KB)`);
