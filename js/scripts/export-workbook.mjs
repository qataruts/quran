/**
 * مشكاة — one Excel workbook of the project's COMPUTED datasets, for researchers
 * to download and verify. A sheet per layer: roots + the two lexica, computed
 * synonyms & semantic fields, فروق التنزيل, الأمثال, and the morphology census.
 *
 * Static output (committed + deployed) so the app needs no xlsx in its bundle
 * and the Vercel install stays untouched. Regenerate after a data change with:
 *   (cd js/apps/studio && npm i --ignore-scripts https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz)
 *   node js/scripts/export-workbook.mjs
 * Output: js/apps/studio/public/mishkat-dataset.xlsx
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "../apps/studio/public");
const OUT = path.join(PUB, "mishkat-dataset.xlsx");
const XLSX = await import(path.resolve(PUB, "../node_modules/xlsx/xlsx.mjs"));
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8"));

const wb = XLSX.utils.book_new();
const addSheet = (name, aoa, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, name);
  console.log(`  ${name}: ${aoa.length - 1} rows`);
};

// ── cover ──
addSheet("عن البيانات", [
  ["مشكاة — بياناتٌ محوسبة"],
  [],
  ["كلُّ ما في هذا الملف محسوبٌ من نصّ القرآن ومعانيه، ومعجمَي الراغب وابن فارس، والوسم الصرفيّ (QAC) — لا تفسير ولا زيادة."],
  ["الموقع: mishkat.qa"],
  [],
  ["الأوراق:"],
  ["الجذور", "١٦٥١ جذرًا مع نصّ المفردات (الراغب) ومقاييس اللغة (ابن فارس)"],
  ["المترادفات", "أقرب الكلمات في المعنى لكلّ جذر — محسوبةٌ بمتّجهات معنى تعريفه"],
  ["الحقول الدلالية", "عناقيد المترادفات المتبادلة"],
  ["فروق التنزيل", "المتشابهات اللفظية من الآيات وما اختُلف بينه"],
  ["الأمثال", "أمثال القرآن وتشبيهاته — من نصّه وحده"],
  ["الصرف بالأرقام", "إحصاءٌ صرفيٌّ للقرآن كلِّه"],
], [26, 70]);

// ── الجذور (roots + both lexica) ──
const db = new DatabaseSync(path.join(PUB, "quran-app.db"), { readOnly: true });
// sense excerpts only (the FULL lexica text lives in the app's معجم page —
// keeping it here would balloon the file with source we didn't compute)
const excerpt = (s, n = 320) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);
const rootRows = [["الجذر", "التكرار", "عدد الصيغ", "المفردات — الراغب (مقتطف)", "مقاييس اللغة (مقتطف)"]];
for (const { root, occurrences, data } of db.prepare("SELECT root, occurrences, data FROM roots ORDER BY occurrences DESC").all()) {
  const r = JSON.parse(data);
  const maq = r.meanings?.find((m) => m.key === "maqayis")?.text ?? "";
  const raq = r.meanings?.find((m) => m.key === "mufradat")?.text ?? "";
  rootRows.push([root, occurrences, r.lemmas?.length ?? 0, excerpt(raq), excerpt(maq)]);
}
addSheet("الجذور", rootRows, [10, 8, 8, 54, 54]);

// ── المترادفات + الحقول (lexnet) ──
const lex = readJson("lexnet.json");
const synRows = [["الجذر", "الكلمة القريبة", "الترتيب", "التقارب"]];
for (const [root, info] of Object.entries(lex.roots)) {
  (info.near ?? []).forEach((n, i) => synRows.push([root, n.r, i + 1, n.s]));
}
addSheet("المترادفات", synRows, [10, 12, 8, 10]);
addSheet("الحقول الدلالية",
  [["الحقل", "الكلمات"], ...lex.fields.map((f) => [f.label, f.roots.join("، ")])],
  [10, 70]);

// ── فروق التنزيل ──
const fr = readJson("furuq.json");
const catLabel = (c) => (c === "زيادة/نقص" ? "زيادة وإيجاز" : c); // إيجاز, not «نقص» (see furuq.ts)
const frRows = [["الآية الأولى", "الآية الثانية", "المستوى", "التصنيف", "نصّ الأولى", "نصّ الثانية"]];
for (const d of fr.furuq) {
  const a = d.ops.map((o) => (typeof o === "string" ? o : o[0] === "-" ? o[1] : "")).filter(Boolean).join(" ");
  const b = d.ops.map((o) => (typeof o === "string" ? o : o[0] === "+" ? o[1] : "")).filter(Boolean).join(" ");
  frRows.push([d.a, d.b, d.tier, catLabel(d.cat), a, b]);
}
addSheet("فروق التنزيل", frRows, [12, 12, 10, 14, 44, 44]);

// ── الأمثال ──
const am = readJson("amthal.json");
addSheet("الأمثال", [
  ["الموضع", "النوع"],
  ...am.parables.map((l) => [l, "مثلٌ مضروب"]),
  ...am.similes.map((l) => [l, "تشبيه"]),
], [12, 14]);

// ── الصرف بالأرقام ──
const ms = readJson("morph-stats.json");
const msRows = [["الباب", "البند", "العدد"]];
const push = (title, rows, lbl = (r) => r.ar) => rows.forEach((r) => msRows.push([title, lbl(r), r.n]));
push("أقسام الكلمة", ms.classes);
push("زمن الفعل", ms.tense);
push("بناء الفعل", ms.voice);
push("جهة المضارع", ms.mood);
push("الإعراب", ms.case);
push("المعرفة والنكرة", ms.definite);
push("الأوزان", ms.verbForms, (r) => `${r.k} · ${r.ar}`);
push("الأدوات والوظائف", ms.functionWords);
push("تكرار الحروف", ms.letters, (r) => r.k);
addSheet("الصرف بالأرقام", msRows, [18, 20, 10]);

const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
fs.writeFileSync(OUT, buf);
db.close();
console.log(`\nwrote ${path.relative(process.cwd(), OUT)} — ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
