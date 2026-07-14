/**
 * collect-mufradat.mjs — المفردات في غريب القرآن (الراغب الأصفهاني، تحقيق الداوودي)
 * from Quranpedia's book-353 contents dump → root-keyed JSONL for نِبراس (lexicon).
 *
 * The book is ROOT-organized: chapters = «كتاب الألف/الباء…» whose children are the
 * headwords (أبا، بتك، حمد…); `contents[]` hold each entry's body, linked by chapter_id,
 * some with related_ayahs. We emit one record per headword:
 *   {"root":"حمد","letter":"كتاب الحاء","text":"…","ayahs":["1:2", …]}
 *
 *   curl -s https://api.quranpedia.net/books-contents/book-353.json -o mufradat353.json
 *   node scripts/collect-mufradat.mjs mufradat353.json
 */
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error("usage: collect-mufradat.mjs <book-353.json>"); process.exit(1); }
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT_DIR = path.join(REPO, "data", "lexicon");
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "mufradat.jsonl");

const { chapters, contents } = JSON.parse(fs.readFileSync(SRC, "utf8"));

// flatten chapter tree → id → {name, parent_id}
const byId = new Map();
(function walk(list) { for (const c of list) { byId.set(c.id, { name: c.name, parent_id: c.parent_id }); if (c.children) walk(c.children); } })(chapters);

// top-level book («كتاب الـ…») name for a chapter, by climbing parents
function bookOf(id) {
  let cur = byId.get(id), name = null;
  const seen = new Set();
  while (cur && !seen.has(cur)) { seen.add(cur); if (cur.parent_id == null) { name = cur.name; break; } name = byId.get(cur.parent_id)?.name ?? name; cur = byId.get(cur.parent_id); }
  return name;
}

const clean = (html) => String(html || "")
  .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,72,135,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
const CUM = [0]; for (let i = 0; i < 114; i++) CUM.push(CUM[i] + AYAH_COUNTS[i]);
// quranpedia uses a continuous āyah index; map back to "s:a"
function toRef(n) { n = Number(n); if (!n) return null; for (let s = 1; s <= 114; s++) if (n <= CUM[s]) return `${s}:${n - CUM[s - 1]}`; return null; }
function refsOf(c) {
  const out = new Set();
  const add = (v) => { const r = toRef(v); if (r) out.add(r); };
  if (c.related_ayahs) for (const v of String(c.related_ayahs).split(/[,\s]+/)) add(v);
  if (c.ayah_from) add(c.ayah_from);
  if (c.ayah_to) add(c.ayah_to);
  return [...out];
}

// group content bodies by chapter (headword)
const perChapter = new Map(); // chapter_id → {texts:[], refs:Set}
for (const c of contents) {
  const book = bookOf(c.chapter_id);
  if (!book || !book.startsWith("كتاب ")) continue; // skip مقدمات/فهارس
  const g = perChapter.get(c.chapter_id) || { texts: [], refs: new Set() };
  const t = clean(c.text); if (t) g.texts.push(t);
  for (const r of refsOf(c)) g.refs.add(r);
  perChapter.set(c.chapter_id, g);
}

const rows = [];
for (const [chId, g] of perChapter) {
  const head = byId.get(chId);
  const text = g.texts.join(" ").trim();
  if (!text) continue;
  rows.push({ root: head?.name ?? String(chId), letter: bookOf(chId), text, ayahs: [...g.refs] });
}
fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n"));

const bytes = rows.reduce((n, r) => n + Buffer.byteLength(r.text), 0);
const linked = rows.filter((r) => r.ayahs.length).length;
const totalRefs = rows.reduce((n, r) => n + r.ayahs.length, 0);
console.log(`المفردات: ${rows.length} مادّة (جذر/رأس) · ${(bytes / 1e6).toFixed(2)} MB · ${linked} مادّة مربوطة بآيات · ${totalRefs} رابط آية`);
console.log(`sample:`, JSON.stringify(rows.find((r) => r.ayahs.length > 2) || rows[10]).slice(0, 200));
console.log(`→ ${OUT}`);
