/**
 * المحاور المنبثقة v1 — عناقيد شبكة القواعد الموحدة (الخطوة ٢أ من الثلاثية):
 * العقد = وحدات القواعد ذات الصلات؛ الحواف = اشتراك المفصِّلات (وزن ١ لكل
 * مفصِّل مشترك) + توكيد متبادل بين قاعدتين (وزن ٣) + قاعدة تفصّل قاعدة (وزن ٢).
 * الكشف: Louvain حتمي (ترتيب عقد ثابت، بلا عشوائية في النسخة المنشورة) +
 * تحليل ثبات بخمسة ترتيبات مخلوطة (بذور مسجلة) يُنشر متوسط اتفاقها الزوجي.
 *
 * Writes: findings/unified/axes-v1.json + AXES-V1.md
 * Usage: node scripts/build-axes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PUB = path.join(ROOT, "js/apps/studio/public");
const ev = JSON.parse(fs.readFileSync(path.join(PUB, "v3-evidence.json"), "utf-8"));

// —— القراءة: قواعد بصلاتها ——
const ruleLinks = new Map(); // id -> Set(elaborator locs)
const ruleLoc = new Map(); // id -> verse loc
for (const [loc, units] of Object.entries(ev.verses)) {
  for (const u of units) {
    const id = `${loc}/${u.u}`;
    ruleLoc.set(id, loc);
    const s = new Set();
    for (const arr of Object.values(u.links ?? {})) for (const c of arr) s.add(c);
    if (s.size) ruleLinks.set(id, s);
  }
}
const ruleVerseIds = new Map(); // verse loc -> [rule ids]
for (const id of ruleLinks.keys()) {
  const loc = ruleLoc.get(id);
  (ruleVerseIds.get(loc) ?? ruleVerseIds.set(loc, []).get(loc)).push(id);
}

// —— بناء الحواف ——
const W = new Map(); // "a|b" sorted -> weight
const addW = (a, b, w) => {
  if (a === b) return;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  W.set(k, (W.get(k) ?? 0) + w);
};
// اشتراك المفصلات: عكسي مفصل -> قواعده
const byElab = new Map();
for (const [id, s] of ruleLinks) for (const c of s) (byElab.get(c) ?? byElab.set(c, []).get(c)).push(id);
for (const rules of byElab.values()) {
  if (rules.length < 2 || rules.length > 40) continue; // مفصل عام جدا لا يميز
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) addW(rules[i], rules[j], 1);
}
// توكيد متبادل بين آيتي قاعدتين
for (const [a, partners] of Object.entries(ev.mutual ?? {})) {
  const ra = ruleVerseIds.get(a);
  if (!ra) continue;
  for (const b of partners) {
    const rb = ruleVerseIds.get(b);
    if (!rb) continue;
    for (const x of ra) for (const y of rb) addW(x, y, 3);
  }
}
// قاعدة تفصل قاعدة
for (const [id, s] of ruleLinks) for (const c of s) {
  const rb = ruleVerseIds.get(c);
  if (rb) for (const y of rb) addW(id, y, 2);
}

// —— Louvain حتمي مبسط (تمريرات محلية حتى الاستقرار ثم تجميع، مستوىان) ——
const nodes = [...ruleLinks.keys()].sort();
const nbrs = new Map(nodes.map((n) => [n, new Map()]));
let totW = 0;
for (const [k, w] of W) {
  const [a, b] = k.split("|");
  if (!nbrs.has(a) || !nbrs.has(b)) continue;
  nbrs.get(a).set(b, w);
  nbrs.get(b).set(a, w);
  totW += w;
}
function louvain(order) {
  const comm = new Map(order.map((n) => [n, n]));
  const deg = new Map(order.map((n) => [n, [...nbrs.get(n).values()].reduce((t, w) => t + w, 0)]));
  const commDeg = new Map(order.map((n) => [n, deg.get(n)]));
  let moved = true, rounds = 0;
  while (moved && rounds < 30) {
    moved = false; rounds++;
    for (const n of order) {
      const cn = comm.get(n);
      const links = new Map();
      for (const [m, w] of nbrs.get(n)) {
        const cm = comm.get(m);
        links.set(cm, (links.get(cm) ?? 0) + w);
      }
      commDeg.set(cn, commDeg.get(cn) - deg.get(n));
      let best = cn, bestGain = 0;
      const cands = [...links.keys()].sort();
      for (const c of cands) {
        const gain = (links.get(c) ?? 0) - (commDeg.get(c) * deg.get(n)) / (2 * totW);
        const base = (links.get(cn) ?? 0) - (commDeg.get(cn) * deg.get(n)) / (2 * totW);
        if (gain > base + 1e-9 && gain > bestGain + 1e-9) { best = c; bestGain = gain; }
      }
      commDeg.set(best, (commDeg.get(best) ?? 0) + deg.get(n));
      if (best !== cn) { comm.set(n, best); moved = true; }
    }
  }
  return comm;
}
const comm = louvain(nodes);
// —— تحليل الثبات: ٥ ترتيبات مخلوطة ——
const seeds = [11, 22, 33, 44, 55];
const runs = seeds.map((seed) => {
  let s = 20260719 + seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const o = [...nodes];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return louvain(o);
});
// اتفاق زوجي على عينة أزواج حتمية
let agree = 0, tot = 0;
for (let i = 0; i < nodes.length; i += 7) for (let j = i + 3; j < nodes.length; j += 97) {
  const a = nodes[i], b = nodes[j];
  const together = comm.get(a) === comm.get(b);
  for (const r of runs) { tot++; if ((r.get(a) === r.get(b)) === together) agree++; }
}
const stability = agree / tot;

// —— تجميع المحاور ——
const groups = new Map();
for (const [n, c] of comm) (groups.get(c) ?? groups.set(c, []).get(c)).push(n);
const axes = [...groups.values()].filter((g) => g.length >= 3).sort((a, b) => b.length - a.length);
const misc = [...groups.values()].filter((g) => g.length < 3).flat();
// اسم مبدئي حتمي: أعلى قاعدتين درجةً
const hubsMeta = new Map();
for (const [loc, units] of Object.entries(ev.verses)) for (const u of units) hubsMeta.set(`${loc}/${u.u}`, loc);
const degOf = (n) => [...(nbrs.get(n) ?? new Map()).values()].reduce((t, w) => t + w, 0);
const out = axes.map((g, i) => {
  const top = [...g].sort((a, b) => degOf(b) - degOf(a)).slice(0, 5);
  return { id: i + 1, size: g.length, rules: g, top, topLocs: top.map((t) => hubsMeta.get(t)) };
});
fs.mkdirSync(path.join(ROOT, "findings/unified"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "findings/unified/axes-v1.json"), JSON.stringify({
  meta: { date: "2026-07-19", algorithm: "louvain-deterministic (ترتيب عقد ثابت أبجدي، مستوى واحد حتى الاستقرار)", stabilitySeeds: seeds, stability: +stability.toFixed(4), nodes: nodes.length, edges: W.size, misc: misc.length },
  axes: out,
}, null, 1));
console.log(`عقد: ${nodes.length} · حواف: ${W.size} · محاور (≥٣ قواعد): ${out.length} · متفرقات: ${misc.length}`);
console.log(`الثبات (٥ ترتيبات مخلوطة): ${(stability * 100).toFixed(1)}٪`);
console.log("أكبر ١٠ محاور:", out.slice(0, 10).map((a) => `#${a.id}(${a.size}) ${a.topLocs[0]}`).join(" · "));
