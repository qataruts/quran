/**
 * كتب البيان إلى المكتبة — «كل كتابٍ مستخدمٍ في مشكاة يجب أن يكون في المكتبة».
 * يحوّل data/bayan-sources/structured/bayan-<id>.jsonl (تقطيع جلسة البيان)
 * إلى public/rag-<id>.json بصيغة [{ref,text}] حيث ref عنوانُ المدخل (فرق/وجه/
 * بصيرة/نوع/موضع) لا آية — فهذه كتبٌ مصطلحيّة لا سُوَريّة. تُسقَط مداخلُ
 * مقدّمات النسخ (kind=front-matter) وملف b1-pending المعلّق.
 *
 * usage: node js/scripts/build-bayan-books.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(ROOT, "data/bayan-sources/structured");
const PUB = path.join(ROOT, "apps/studio/public");

/** id المكتبة ← ملف البيان (الهوية من حقل source داخل الملفات نفسها) */
const BOOKS = [
  { id: "furuqaskari", file: "bayan-furuq" },      // الفروق اللغوية — أبو هلال العسكري
  { id: "basair", file: "bayan-basair" },          // بصائر ذوي التمييز — الفيروزآبادي
  { id: "wujuhaskari", file: "bayan-wujuh-askari" }, // الوجوه والنظائر — أبو هلال العسكري
  { id: "damghani", file: "bayan-damghani" },      // قاموس القرآن — الدامغاني
  { id: "nuzha", file: "bayan-nuzha" },            // نزهة الأعين النواظر — ابن الجوزي
  { id: "durra", file: "bayan-durra" },            // درة التنزيل — الخطيب الإسكافي
  { id: "malak", file: "bayan-malak" },            // ملاك التأويل — ابن الزبير الغرناطي
  { id: "burhan", file: "bayan-burhan" },          // البرهان في علوم القرآن — الزركشي
  { id: "itqan", file: "bayan-itqan" },            // الإتقان في علوم القرآن — السيوطي
];

/** أول سطرٍ عنوانًا: يُنظَّف من أرقام العدّ وعلامات الطبعة ويُقصَر */
function heading(first) {
  let h = first.replace(/^[\s\d\-–—.:()،]+/, "").replace(/[$#*]+/g, " ").replace(/\s+/g, " ").trim();
  if (h.length > 90) h = h.slice(0, 90).replace(/\s\S*$/, "") + "…";
  return h;
}

/** ضابط سياق نبراس (BOOKS-PIPELINE): لا مقطع يتجاوز ~٤٠٠ كلمة — الطويل يُقسَّم
 *  على حدود الجمل إلى قطعٍ ~٣٣٠ كلمة، ويحمل مرجعُ كلٍّ رقمَ قطعته */
const MAX_WORDS = 400, TARGET = 330;
function chunk(ref, text) {
  const words = text.split(/\s+/);
  if (words.length <= MAX_WORDS) return [{ ref, text }];
  const sentences = text.split(/(?<=[.؟!:])\s+/);
  const parts = [];
  let cur = [];
  let n = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).length;
    if (n + w > TARGET && cur.length) { parts.push(cur.join(" ")); cur = []; n = 0; }
    cur.push(s); n += w;
  }
  if (cur.length) parts.push(cur.join(" "));
  return parts.map((t, i) => ({ ref: `${ref} — ${i + 1}/${parts.length}`, text: t }));
}

for (const { id, file } of BOOKS) {
  const lines = fs.readFileSync(path.join(SRC, `${file}.jsonl`), "utf-8").split("\n").filter(Boolean);
  const out = [];
  let skipped = 0;
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.kind === "front-matter" || e.kind === "defective") { skipped++; continue; }
    const text = (e.text ?? "").trim();
    if (!text) continue;
    const nl = text.indexOf("\n");
    const first = nl > 0 ? text.slice(0, nl) : text;
    const rest = nl > 0 ? text.slice(nl + 1).replace(/\s+/g, " ").trim() : "";
    const ref = heading(first);
    // إن كان العنوان فارغًا بعد التنظيف أو لا بقية بعده نُبقي النص كاملًا — ثم يقسَّم الطويل
    const rec = ref && rest ? { ref, text: rest } : { ref: ref || "—", text: text.replace(/\s+/g, " ").trim() };
    out.push(...chunk(rec.ref, rec.text));
  }
  const dest = path.join(PUB, `rag-${id}.json`);
  fs.writeFileSync(dest, JSON.stringify(out), "utf-8");
  const mb = (fs.statSync(dest).size / 1048576).toFixed(1);
  console.log(`${id.padEnd(12)} ${String(out.length).padStart(5)} مدخلًا · ${mb} م.ب${skipped ? ` · أُسقطت ${skipped} مقدّمة نسخة` : ""}`);
}
console.log("✓ كتب البيان التسعة في public/ — سجّلها build-manifest.mjs");
