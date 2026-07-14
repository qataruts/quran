/**
 * أمثال القرآن — computed purely from the text + morphology (no tafsīr):
 *   • «مضروبة»: an ayah where God «ضرب … مثلاً» (roots ض-ر-ب AND م-ث-ل together).
 *   • «تشبيهات»: an ayah with a similitude marker — «كمثل», OR كاف التشبيه (a word
 *     whose first segment is a «كَ» prefix tagged preposition, e.g. كصيّب/كظلمات),
 *     OR «كأنّ/كأنّما».
 * Writes js/apps/studio/public/amthal.json. Run: node scripts/export-amthal.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DB = path.join(ROOT, "quran-app.db");
const OUT = path.join(ROOT, "js/apps/studio/public/amthal.json");

const db = new DatabaseSync(DB, { readOnly: true });
const key = (loc) => loc.split(":").map(Number);
const sortLoc = (a, b) => {
  const [s1, a1] = key(a), [s2, a2] = key(b);
  return s1 - s2 || a1 - a2;
};

const norm = (s) => (s || "").replace(/[ًٌٍَُِّْٰ]/g, "");
const darb = new Set(db.prepare("SELECT DISTINCT surahNo||':'||ayahNo loc FROM words WHERE root=?").all("ضرب").map((r) => r.loc));
const mithlAyahs = db.prepare("SELECT DISTINCT surahNo||':'||ayahNo loc FROM words WHERE root=?").all("مثل").map((r) => r.loc);
const kamithl = new Set(db.prepare("SELECT DISTINCT surahNo||':'||ayahNo loc FROM words WHERE textClean LIKE 'كمثل%'").all().map((r) => r.loc));
const kaanna = new Set(db.prepare("SELECT DISTINCT surahNo||':'||ayahNo loc FROM words WHERE textClean LIKE 'كأن%'").all().map((r) => r.loc));
// كاف التشبيه: a word whose FIRST segment is a «كَ» prefix tagged preposition (P) —
// مستبعِدًا «كذلك/كذلكم» (كافُ الإشارة الاستئنافية) و«كما» (كافُ المصدرية القياسية):
// ٥٣٪ من السلة القديمة كانت منهما وليست تشبيهًا محسوسًا (مراجعة 2026-07-14).
// الاستبعاد قطعي بساق الكلمة: الكاف يليها اسمُ إشارةٍ «ذا» أو «ما» المصدرية.
const kaf = new Set();
for (const r of db.prepare("SELECT surahNo||':'||ayahNo loc, segments FROM words").all()) {
  try {
    const segs = JSON.parse(r.segments || "[]");
    const s0 = segs[0], s1 = segs[1];
    if (!(s0 && s0.role === "prefix" && s0.pos === "P" && norm(s0.text) === "ك")) continue;
    if (s1 && (s1.pos === "DEM" || (s1.pos === "SUB" || norm(s1.text) === "ما"))) continue; // كذلك/كما
    kaf.add(r.loc);
  } catch {
    /* skip */
  }
}
db.close();

// أمثالٌ كامنة بلا «ضرب» ولا كاف — قائمةٌ منشورةٌ منسوبة (تصريح الآية بلفظ «مثل»
// افتتاحًا وصفيًّا): تُوسَّع بمرجعٍ كلاسيكيٍّ مسمًّى عند كل إضافة.
const KAMINA = ["13:35" /* «مثل الجنة التي وعد المتقون» — توأم 47:15 */];

const parables = [...new Set([...mithlAyahs.filter((loc) => darb.has(loc)), ...KAMINA])].sort(sortLoc);
const pSet = new Set(parables);
const similes = [...new Set([...kamithl, ...kaf, ...kaanna])].filter((loc) => !pSet.has(loc)).sort(sortLoc);

const out = {
  meta: { parables: parables.length, similes: similes.length, total: parables.length + similes.length },
  parables, // «ضرب … مثلاً» + الكامنة المنشورة
  similes, // «كمثل» · كاف التشبيه (دون كذلك/كما) · «كأنّ»
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`amthal.json: ${out.meta.total} verses (${parables.length} مضروبة + ${similes.length} تشبيهات)`);
