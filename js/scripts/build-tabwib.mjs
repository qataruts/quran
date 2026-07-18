/**
 * تبويب مشكاة الموضوعي المحسوب v1 (الخطوة ٢ج): وحدات السياق × المحاور المنبثقة.
 * لكل وحدة سياق (v1.1): آياتُها تصوّت لمحاورها — الآية قاعدةٌ في محور (صوتان)
 * أو مفصِّلة منسوبة لمحور بالأغلبية (صوت). وحدة بلا شاهد شبكي تُسند بالتقارب
 * المتجهي لمركز المحور (cos≥0.55) وتوسم «تقريبي»؛ ودون ذلك «خارج المحاور».
 * تعدد الانتماء مسموح (حتى محورين إذا نال الثاني ≥٦٠٪ من أصوات الأول).
 *
 * Writes: js/apps/studio/public/tabwib-v1.json + public/axes-v1.json
 *         findings/unified/TABWIB-V1.md
 * Usage: node scripts/build-tabwib.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PUB = path.join(ROOT, "js/apps/studio/public");
const ev = JSON.parse(fs.readFileSync(path.join(PUB, "v3-evidence.json"), "utf-8"));
const axes = JSON.parse(fs.readFileSync(path.join(ROOT, "findings/unified/axes-v1.json"), "utf-8"));
const units = JSON.parse(fs.readFileSync(path.join(PUB, "siyaq-units.json"), "utf-8")).units;

// —— متجهات (آيات + وحدات) ——
const loadBin = (p) => {
  const buf = fs.readFileSync(p);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const hlen = new DataView(ab).getUint32(0, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hlen)));
  const sOff = 4 + hlen;
  const scales = new Float32Array(ab.slice(sOff, sOff + hdr.count * 4));
  const data = new Int8Array(ab, sOff + hdr.count * 4, hdr.count * hdr.dim);
  return { hdr, scales, data };
};
const A = loadBin(path.join(PUB, "quran-embeddings.bin"));
const U = loadBin(path.join(PUB, "siyaq-embeddings.bin"));
const C = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
const base = {}; { let acc = 0; for (let s = 1; s <= 114; s++) { base[s] = acc; acc += C[s - 1]; } }
const vec = (bin, row) => {
  const { hdr, scales, data } = bin;
  const v = new Float32Array(hdr.dim);
  const off = row * hdr.dim;
  for (let k = 0; k < hdr.dim; k++) v[k] = data[off + k] * scales[row];
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  for (let k = 0; k < hdr.dim; k++) v[k] /= n;
  return v;
};
const ayaVec = (loc) => { const [s, a] = loc.split(":").map(Number); return vec(A, base[s] + a - 1); };
const cos = (x, y) => { let d = 0; for (let k = 0; k < x.length; k++) d += x[k] * y[k]; return d; };

// —— انتماء الآيات للمحاور (قاعدة/مفصلة بالأغلبية) ——
const ruleAxis = new Map();
for (const a of axes.axes) for (const r of a.rules) ruleAxis.set(r, a.id);
const verseRuleAxes = new Map(); // loc -> Set(axis) كقاعدة
const byElab = new Map();
for (const [loc, unitsArr] of Object.entries(ev.verses)) {
  for (const u of unitsArr) {
    const id = `${loc}/${u.u}`;
    const ax = ruleAxis.get(id);
    if (ax) (verseRuleAxes.get(loc) ?? verseRuleAxes.set(loc, new Set()).get(loc)).add(ax);
    for (const arr of Object.values(u.links ?? {})) for (const c of arr) (byElab.get(c) ?? byElab.set(c, []).get(c)).push(id);
  }
}
const elabAxis = new Map();
for (const [e, rules] of byElab) {
  const cnt = new Map();
  for (const r of rules) { const ax = ruleAxis.get(r); if (ax) cnt.set(ax, (cnt.get(ax) ?? 0) + 1); }
  if (!cnt.size) continue;
  elabAxis.set(e, [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
}
// —— مراكز المحاور (متوسط متجهات آيات قواعدها) ——
const centroids = new Map();
for (const a of axes.axes) {
  const v = new Float32Array(A.hdr.dim);
  for (const loc of a.topLocs.concat(a.rules.map((r) => r.split("/")[0])).slice(0, 60)) {
    const av = ayaVec(loc);
    for (let k = 0; k < v.length; k++) v[k] += av[k];
  }
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  for (let k = 0; k < v.length; k++) v[k] /= n;
  centroids.set(a.id, v);
}

// —— تصويت الوحدات ——
const out = [];
let evd = 0, approx = 0, outside = 0;
units.forEach((u, ui) => {
  const [us, ua1, ua2] = u;
  const votes = new Map();
  for (let a = ua1; a <= ua2; a++) {
    const loc = `${us}:${a}`;
    for (const ax of verseRuleAxes.get(loc) ?? []) votes.set(ax, (votes.get(ax) ?? 0) + 2);
    const ea = elabAxis.get(loc);
    if (ea) votes.set(ea, (votes.get(ea) ?? 0) + 1);
  }
  let entry;
  if (votes.size) {
    const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const list = [sorted[0][0]];
    if (sorted[1] && sorted[1][1] >= 0.6 * sorted[0][1]) list.push(sorted[1][0]);
    entry = { ax: list, mode: "evidence" };
    evd++;
  } else {
    const uv = vec(U, ui);
    let bestAx = 0, bestC = -1;
    for (const [id, cv] of centroids) { const c = cos(uv, cv); if (c > bestC) { bestC = c; bestAx = id; } }
    if (bestC >= 0.55) { entry = { ax: [bestAx], mode: "approx", cos: +bestC.toFixed(3) }; approx++; }
    else { entry = { ax: [], mode: "outside" }; outside++; }
  }
  out.push(entry);
});

// —— أصول النشر ——
const axesPub = axes.axes.map((a) => ({ id: a.id, size: a.size, topLocs: a.topLocs.slice(0, 3) }));
fs.writeFileSync(path.join(PUB, "axes-v1.json"), JSON.stringify({ meta: { ...axes.meta, note: "محاور منبثقة من الشبكة الموحدة — أسماء جمالية لاحقًا؛ تُحدَّث بعد موجات التعميق" }, axes: axesPub }));
fs.writeFileSync(path.join(PUB, "tabwib-v1.json"), JSON.stringify({ meta: { date: "2026-07-19", evidence: evd, approx, outside, note: "تبويب محسوب: وحدات السياق × المحاور المنبثقة" }, units: out }));
const doc = `# التبويب الموضوعي المحسوب v1 (2026-07-19)

- وحدات بإسناد شبكي: **${evd}** · بإسناد تقريبي (متجهي ≥0.55): **${approx}** · خارج المحاور: **${outside}** (من ${units.length})
- التعدد: وحدة قد تنتمي لمحورين إذا نال الثاني ≥٦٠٪ من أصوات الأول.
- المحاور: ${axesPub.length} منبثقة (ثبات ٩٩٫٦٪) — أسماؤها الجمالية بسرب تسمية صغير بإذن المالك.
`;
fs.writeFileSync(path.join(ROOT, "findings/unified/TABWIB-V1.md"), doc);
console.log(doc);
