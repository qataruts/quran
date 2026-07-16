/**
 * تسمية وحدات السياق المعتمدة حتميًّا (لا وكلاء): أعلامُ الوحدة أولًا (وسم PN
 * الصرفي من QAC)، ثم أميزُ جذورها (تكرار الجذر في الوحدة × ندرته في المصحف)،
 * والاسم المعروض هو الصورةُ السطحية الأكثر ورودًا للجذر داخل الوحدة.
 * سربُ تسميةٍ جمالي لاحقًا خيارٌ للمالك — هذه أسماءُ عملٍ قابلة لإعادة الإنتاج.
 *
 * Writes: js/apps/studio/public/siyaq-units.json (الحمولة النهائية للتطبيق)
 * Usage: node scripts/name-siyaq-units.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const { meta, units } = JSON.parse(fs.readFileSync(path.join(ROOT, "findings/siyaq-swarm/units-computed.json"), "utf-8"));
const OUT = path.join(ROOT, "js/apps/studio/public/siyaq-units.json");

const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const words = db.prepare(`
  SELECT w.surah_no s, w.ayah_no a, w.text_clean t, w.root_id r, w.stem_pos pos
  FROM word w ORDER BY w.surah_no, w.ayah_no, w.word_no`).all();
const rootDF = new Map();
for (const x of db.prepare("SELECT root_id, COUNT(DISTINCT ayah_id) c FROM word WHERE root_id IS NOT NULL GROUP BY root_id").iterate()) rootDF.set(x.root_id, x.c);
db.close();

// فهرس كلمات كل وحدة
const byLoc = new Map();
for (const w of words) {
  const k = `${w.s}:${w.a}`;
  let arr = byLoc.get(k);
  if (!arr) byLoc.set(k, (arr = []));
  arr.push(w);
}

const DIVINE = new Set(["الله", "لله", "بالله", "والله", "الرحمن", "رب", "ربك", "ربكم", "ربنا", "ربهم"]);
const named = units.map((u) => {
  const ws = [];
  for (let a = u.a1; a <= u.a2; a++) ws.push(...(byLoc.get(`${u.s}:${a}`) ?? []));
  // ١) الأعلام (PN) الأكثر ورودًا — تُستثنى ألفاظ الجلالة الغالبة على المصحف كله
  const pn = new Map();
  for (const w of ws) if (w.pos === "PN" && !DIVINE.has(w.t)) pn.set(w.t, (pn.get(w.t) ?? 0) + 1);
  const pns = [...pn.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t);
  // ٢) أميز الجذور: تكرار داخلي × ندرة خارجية
  const rc = new Map();
  for (const w of ws) if (w.r != null) rc.set(w.r, (rc.get(w.r) ?? 0) + 1);
  const scored = [...rc.entries()]
    .map(([r, c]) => ({ r, score: c * Math.log(6236 / (rootDF.get(r) ?? 6236)) }))
    .sort((x, y) => y.score - x.score);
  const surfaceOf = (rootId) => {
    const f = new Map();
    for (const w of ws) if (w.r === rootId) f.set(w.t, (f.get(w.t) ?? 0) + 1);
    return [...f.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  };
  const parts = [];
  for (const p of pns.slice(0, 2)) parts.push(p);
  for (const s of scored) {
    if (parts.length >= 2) break;
    const t = surfaceOf(s.r);
    if (t && !parts.includes(t)) parts.push(t);
  }
  return { ...u, name: parts.join(" · ") || "—" };
});

fs.writeFileSync(OUT, JSON.stringify({
  meta: { ...meta, source: "وحدات السياق المحسوبة — طبقة مشكاة المعتمدة (المحجوب: ٨٩.٥٪/١٠٠٪)", naming: "deterministic PN+root-distinctiveness" },
  units: named.map((u) => [u.s, u.a1, u.a2, u.name]),
}));
console.log(`siyaq-units.json: ${named.length} وحدة (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
console.log("عينات:", named.filter((u) => [2, 18, 26].includes(u.s)).slice(0, 4).concat(named.filter((u) => u.s === 18 && u.a1 <= 65 && 65 <= u.a2)).map((u) => `${u.s}:${u.a1}-${u.a2} «${u.name}»`).join(" · "));
