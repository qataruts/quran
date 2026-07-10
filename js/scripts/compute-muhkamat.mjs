/**
 * المحكمات الجامعة + الشبكة الموحّدة — the third layer above محكم→تفصيل.
 *
 * (A) Clusters the 1,032 جوامع by their semantic vectors (k-means over the
 *     Gemini embeddings) into ~K «محكمات» — thematic super-groups. Each cluster's
 *     «أمّ» is its most-elaborated جامعة (highest surviving تفصيل-degree).
 * (B) Computes the unified-network stats over the whole surviving link graph:
 *     connected components, giant-component share, average hop distance.
 *
 * Reads quran-kg.db (embeddings) + jawami.json (the reviewed network).
 * Writes findings/muhkamat-clusters.json (+ prints a summary). Deterministic
 * seed so re-runs are stable. Usage: node scripts/compute-muhkamat.mjs [K]
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DB = path.join(ROOT, "quran-kg.db");
const JAWAMI = path.join(ROOT, "js/apps/studio/public/jawami.json");
const OUT = path.join(ROOT, "findings/muhkamat-clusters.json");
const K = Number(process.argv[2] ?? 40);

// deterministic PRNG (mulberry32) — no Math.random, stable clusters
let _s = 0x9e3779b9;
const rand = () => {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const db = new DatabaseSync(DB, { readOnly: true });
const loc = new Map(db.prepare("SELECT ayah_id, location FROM ayah").all().map((r) => [r.ayah_id, r.location]));
const textOf = new Map(db.prepare("SELECT location, text_clean FROM ayah").all().map((r) => [r.location, r.text_clean]));
const jw = JSON.parse(fs.readFileSync(JAWAMI, "utf-8"));

// --- (A) load جوامع embeddings, normalized -------------------------------------
const rows = db.prepare(`
  SELECT ap.ayah_id, e.dim, e.vector
  FROM ayah_principle ap JOIN ayah_embedding e ON e.ayah_id=ap.ayah_id
  WHERE ap.p=2 ORDER BY ap.ayah_id`).all();
const items = [];
for (const r of rows) {
  const l = loc.get(r.ayah_id);
  if (!l) continue;
  const buf = r.vector; // Uint8Array
  const v = new Float32Array(buf.buffer, buf.byteOffset, r.dim);
  // L2-normalize (cosine k-means = euclidean on unit sphere)
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const u = new Float32Array(v.length); for (let i = 0; i < v.length; i++) u[i] = v[i] / n;
  items.push({ loc: l, vec: u });
}
const D = items[0].vec.length;
console.log(`جوامع with embeddings: ${items.length} · dim ${D} · K=${K}`);

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// k-means++ init
const centroids = [];
centroids.push(items[Math.floor(rand() * items.length)].vec.slice());
while (centroids.length < K) {
  const d2 = items.map((it) => {
    let best = -1; for (const c of centroids) best = Math.max(best, dot(it.vec, c));
    return 1 - best; // cosine distance
  });
  const sum = d2.reduce((a, b) => a + b, 0);
  let x = rand() * sum, idx = 0;
  for (; idx < d2.length; idx++) { x -= d2[idx]; if (x <= 0) break; }
  centroids.push(items[Math.min(idx, items.length - 1)].vec.slice());
}

// Lloyd iterations
let assign = new Array(items.length).fill(0);
for (let iter = 0; iter < 40; iter++) {
  let moved = 0;
  for (let i = 0; i < items.length; i++) {
    let best = 0, bestSim = -2;
    for (let c = 0; c < K; c++) { const s = dot(items[i].vec, centroids[c]); if (s > bestSim) { bestSim = s; best = c; } }
    if (assign[i] !== best) moved++;
    assign[i] = best;
  }
  for (let c = 0; c < K; c++) {
    const mem = []; for (let i = 0; i < items.length; i++) if (assign[i] === c) mem.push(items[i].vec);
    if (!mem.length) continue;
    const nc = new Float32Array(D);
    for (const v of mem) for (let d = 0; d < D; d++) nc[d] += v[d];
    let n = 0; for (let d = 0; d < D; d++) n += nc[d] * nc[d]; n = Math.sqrt(n) || 1;
    for (let d = 0; d < D; d++) nc[d] /= n;
    centroids[c] = nc;
  }
  if (moved === 0) break;
}

// degree (surviving تفصيل out-degree) per جامعة, for the «أمّ»
const outDeg = (l) => (jw.tafsil[l] ?? []).length;
const vecOf = new Map(items.map((it) => [it.loc, it.vec]));
const clusters = [];
for (let c = 0; c < K; c++) {
  const mem = items.map((it, i) => (assign[i] === c ? it.loc : null)).filter(Boolean);
  if (!mem.length) continue;
  mem.sort((a, b) => outDeg(b) - outDeg(a)); // most-elaborated first
  // cohesion = mean cosine of members to the cluster centroid (1 = tight)
  const coh = mem.reduce((s, l) => s + dot(vecOf.get(l), centroids[c]), 0) / mem.length;
  clusters.push({ id: c, size: mem.length, umm: mem[0], cohesion: +coh.toFixed(3), members: mem });
}
clusters.sort((a, b) => b.size - a.size);
console.log(`\nتماسك العناقيد (avg cosine to centroid): ` +
  `أضعف ${clusters.map((c) => c.cohesion).sort((a, b) => a - b).slice(0, 5).join(", ")} · ` +
  `أقوى ${clusters.map((c) => c.cohesion).sort((a, b) => b - a).slice(0, 3).join(", ")}`);
console.log(`\nمحكمات (clusters): ${clusters.length}`);
for (const cl of clusters.slice(0, 12)) {
  const t = (textOf.get(cl.umm) ?? "").slice(0, 42);
  console.log(`  #${String(cl.size).padStart(3)}  أمّ ${cl.umm.padEnd(7)} ${t}`);
}

// --- (B) unified-network stats over ALL surviving links ------------------------
const idx = new Map(); const nodes = [];
const nid = (l) => { if (!idx.has(l)) { idx.set(l, nodes.length); nodes.push(l); } return idx.get(l); };
const adj = [];
const addEdge = (a, b) => { const x = nid(a), y = nid(b); (adj[x] ??= new Set()).add(y); (adj[y] ??= new Set()).add(x); };
for (const [hub, links] of Object.entries(jw.tafsil)) for (const [t] of links) if (hub !== t) addEdge(hub, t);
const N = nodes.length;
// components (union-find)
const par = Array.from({ length: N }, (_, i) => i);
const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
for (let x = 0; x < N; x++) for (const y of (adj[x] ?? [])) { const a = find(x), b = find(y); if (a !== b) par[a] = b; }
const compSize = new Map();
for (let x = 0; x < N; x++) { const r = find(x); compSize.set(r, (compSize.get(r) ?? 0) + 1); }
const sizes = [...compSize.values()].sort((a, b) => b - a);
const giant = sizes[0] ?? 0;
// average hop distance: BFS from a deterministic sample within the giant component
const giantRoot = [...compSize.entries()].sort((a, b) => b[1] - a[1])[0][0];
const inGiant = []; for (let x = 0; x < N; x++) if (find(x) === giantRoot) inGiant.push(x);
let sumD = 0, cntD = 0, maxD = 0;
const sample = inGiant.filter((_, i) => i % Math.ceil(inGiant.length / 120) === 0); // ~120 sources
for (const src of sample) {
  const dist = new Int32Array(N).fill(-1); dist[src] = 0; const q = [src];
  for (let h = 0; h < q.length; h++) { const x = q[h]; for (const y of (adj[x] ?? [])) if (dist[y] < 0) { dist[y] = dist[x] + 1; q.push(y); } }
  for (const x of inGiant) if (dist[x] > 0) { sumD += dist[x]; cntD++; maxD = Math.max(maxD, dist[x]); }
}
const avgHops = cntD ? sumD / cntD : 0;
console.log(`\nالشبكة الموحّدة: ${N} آية · ${sizes.length} مكوّن · أكبر مكوّن ${giant} (${((giant / N) * 100).toFixed(2)}%) · متوسط المسافة ${avgHops.toFixed(2)} خطوة (أقصى ${maxD})`);

// --- export --------------------------------------------------------------------
const payload = {
  meta: {
    principles: items.length, K, clusters: clusters.length,
    network: { nodes: N, components: sizes.length, giant, giantPct: +((giant / N) * 100).toFixed(2), avgHops: +avgHops.toFixed(2), maxHops: maxD },
  },
  muhkamat: clusters.map((cl) => ({
    size: cl.size, umm: cl.umm, ummText: textOf.get(cl.umm) ?? "", cohesion: cl.cohesion,
    members: cl.members.map((l) => ({ loc: l, text: (textOf.get(l) ?? "").slice(0, 72) })),
  })),
};
fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
db.close();
console.log(`\n→ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB) — ${clusters.length} محكمات, needs naming`);
