/**
 * الاشتقاق v3 (الخطوة ٢ب): وسم كلية/جامعة/تفصيل من الشبكة الموحدة والمحاور
 * المنبثقة. المعايير المعلنة لكل قاعدة مؤهلة بوابيًّا:
 *   m = عدد مفصلاتها الموجهة · T = عدد المحاور المنبثقة التي تغطيها مفصلاتها
 *   (كل مفصِّل يُنسب لمحور أغلبية القواعد التي يفصّلها، بكسر تعادل حتمي) ·
 *   mu = شركاؤها في التوكيد المتبادل.
 *   كلية: m≥M1 و T≥T1 (أبواب تلتقي عندها) · جامعة: m≥M2 (أو ترقية مثانٍ mu≥P)
 *   · تفصيل: ما سوى ذلك. العتبات تُعاير على نصف الضبط فقط (١٥ قاعدة + أضداد
 *   الضبط من الملحق المجمد 6c8bb83) — والمصون لا يُمس حتى إذن المالك.
 *
 * Writes: findings/unified/ranks-v1.json + TUNE-REPORT.md
 * Usage: node scripts/derive-ranks.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PUB = path.join(ROOT, "js/apps/studio/public");
const ev = JSON.parse(fs.readFileSync(path.join(PUB, "v3-evidence.json"), "utf-8"));
const axes = JSON.parse(fs.readFileSync(path.join(ROOT, "findings/unified/axes-v1.json"), "utf-8"));
const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, "findings/deepening/frozen-supplement.json"), "utf-8"));

// قاعدة -> محورها
const axisOf = new Map();
for (const a of axes.axes) for (const r of a.rules) axisOf.set(r, a.id);
// مفصل -> قواعده (لنسبة المفصل لمحور الأغلبية)
const byElab = new Map();
const ruleElabs = new Map();
for (const [loc, units] of Object.entries(ev.verses)) {
  for (const u of units) {
    const id = `${loc}/${u.u}`;
    const s = new Set();
    for (const arr of Object.values(u.links ?? {})) for (const c of arr) s.add(c);
    ruleElabs.set(id, s);
    for (const c of s) (byElab.get(c) ?? byElab.set(c, []).get(c)).push(id);
  }
}
const elabAxis = new Map();
for (const [e, rules] of byElab) {
  const cnt = new Map();
  for (const r of rules) { const ax = axisOf.get(r); if (ax) cnt.set(ax, (cnt.get(ax) ?? 0) + 1); }
  if (!cnt.size) continue;
  const best = [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  elabAxis.set(e, best);
}
// مقاييس كل قاعدة
const metrics = new Map();
for (const [loc, units] of Object.entries(ev.verses)) {
  for (const u of units) {
    const id = `${loc}/${u.u}`;
    const elabs = ruleElabs.get(id) ?? new Set();
    const axSet = new Set();
    for (const e of elabs) { const ax = elabAxis.get(e); if (ax) axSet.add(ax); }
    const mu = (ev.mutual?.[loc] ?? []).length;
    metrics.set(id, { loc, m: elabs.size, T: axSet.size, mu, gated: (u.g ?? []).length > 0 });
  }
}
// آية -> أفضل وحدة (الآية ترث أعلى وحداتها)
const verseBest = new Map();
for (const [id, x] of metrics) {
  const prev = verseBest.get(x.loc);
  if (!prev || x.m > prev.m || (x.m === prev.m && x.T > prev.T)) verseBest.set(x.loc, { ...x, id });
}

const tuneRules = frozen.sample.filter((x) => x.kind === "rule" && x.half === "tune").map((x) => x.id);
const tuneCounters = frozen.sample.filter((x) => x.kind === "counter" && x.half === "tune").map((x) => x.id);
const rank = (x, M1, T1, M2, P) => {
  if (!x || !x.gated) return "غير مؤهلة";
  if (x.m >= M1 && x.T >= T1) return "كلية";
  if (x.m >= M2 || x.mu >= P) return "جامعة";
  return "تفصيل";
};
// معايرة شبكية على نصف الضبط
let best = null;
for (let M1 = 6; M1 <= 20; M1++) for (let T1 = 3; T1 <= 9; T1++) for (let M2 = 3; M2 <= Math.min(M1 - 1, 9); M2++) for (const P of [2, 3]) {
  let rec = 0;
  for (const id of tuneRules) { const r = rank(verseBest.get(id), M1, T1, M2, P); if (r === "كلية" || r === "جامعة") rec++; }
  let rej = 0;
  for (const id of tuneCounters) { const r = rank(verseBest.get(id), M1, T1, M2, P); if (r !== "كلية" && r !== "جامعة") rej++; }
  if (tuneCounters.length && rej < tuneCounters.length) continue; // شرط صارم: كل أضداد الضبط ترفض
  let kul = 0;
  for (const x of verseBest.values()) if (rank(x, M1, T1, M2, P) === "كلية") kul++;
  const score = rec * 1000 - Math.abs(kul - 60);
  if (!best || score > best.score) best = { M1, T1, M2, P, rec, rej, kul, score };
}
const { M1, T1, M2, P } = best;
// التطبيق الكامل
const counts = { "كلية": 0, "جامعة": 0, "تفصيل": 0, "غير مؤهلة": 0 };
const ranks = {};
for (const [loc, x] of verseBest) {
  const r = rank(x, M1, T1, M2, P);
  counts[r]++;
  if (r === "كلية" || r === "جامعة") ranks[loc] = { r, m: x.m, T: x.T, mu: x.mu };
}
fs.writeFileSync(path.join(ROOT, "findings/unified/ranks-v1.json"), JSON.stringify({
  meta: { date: "2026-07-19", thresholds: { M1, T1, M2, P }, tunedOn: "النصف الضبطي من الملحق المجمد 6c8bb83 فقط — المصون لم يُمس", counts },
  ranks,
}, null, 1));
const kulList = Object.entries(ranks).filter(([, v]) => v.r === "كلية").sort((a, b) => b[1].T - a[1].T || b[1].m - a[1].m);
const report = `# تقرير معايرة الاشتقاق v3 (نصف الضبط فقط — 2026-07-19)

العتبات المختارة: m≥${M1} وT≥${T1} للكلية · m≥${M2} أو مثانٍ≥${P} للجامعة.
- استعادة نصف الضبط: **${best.rec}/${tuneRules.length}** (الشرط الصارم: كل أضداد الضبط مرفوضة ✓ ${best.rej}/${tuneCounters.length})
- التوزيع الكامل: كلية ${counts["كلية"]} · جامعة ${counts["جامعة"]} · تفصيل ${counts["تفصيل"]} · غير مؤهلة ${counts["غير مؤهلة"]}

أعلى ١٥ كلية (بالاتساع ثم العدد):
${kulList.slice(0, 15).map(([loc, v]) => `- ${loc} (م=${v.m}، ت=${v.T}، مثانٍ=${v.mu})`).join("\n")}

**المصون لم يُفتح** — فتحه مرة واحدة بإذن المالك، بعتباته المجمدة منذ 2026-07-16:
استعادة ≥٨٠٪ · رفض ≥٩٠٪.
`;
fs.writeFileSync(path.join(ROOT, "findings/unified/TUNE-REPORT.md"), report);
console.log(report);
