/**
 * Top level of the مصحف الموضوعي — group the ~262 verified topics into a small
 * number of أقسام كبرى (sections) so a human can browse: قسم → موضوعات → آيات.
 * K-means over topic centroids (partitions globally — no single-linkage chaining).
 *
 * Reads findings/mawdui-topics.json + quran-kg.db (embeddings). Writes
 * findings/mawdui-sections.json (sections → topic indices). A small swarm names
 * the sections next. Usage: node scripts/compute-mawdui-sections.mjs [K]
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const TOPICS = path.join(ROOT, "findings/mawdui-topics.json");
const OUT = path.join(ROOT, "findings/mawdui-sections.json");
const K = Number(process.argv[2] ?? 15);

let _s = 0x51ed270b;
const rand = () => { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const loc = new Map(db.prepare("SELECT ayah_id, location FROM ayah").all().map((r) => [r.ayah_id, r.location]));
const vec = new Map();
for (const r of db.prepare("SELECT ayah_id, dim, vector FROM ayah_embedding").iterate()) {
  const l = loc.get(r.ayah_id); if (!l) continue;
  const v = new Float32Array(r.vector.buffer, r.vector.byteOffset, r.dim);
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1;
  const u = new Float32Array(v.length); for (let i = 0; i < v.length; i++) u[i] = v[i] / n; vec.set(l, u);
}
db.close();
const topics = JSON.parse(fs.readFileSync(TOPICS, "utf-8")).topics;
const D = [...vec.values()][0].length;
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const centroid = (locs) => { const c = new Float32Array(D); for (const l of locs) { const v = vec.get(l); if (v) for (let i = 0; i < D; i++) c[i] += v[i]; } let n = 0; for (let i = 0; i < D; i++) n += c[i] * c[i]; n = Math.sqrt(n) || 1; for (let i = 0; i < D; i++) c[i] /= n; return c; };

const cen = topics.map((t) => centroid(t.members));
// k-means++ over topic centroids
const K2 = Math.min(K, cen.length);
const cs = [cen[Math.floor(rand() * cen.length)].slice()];
while (cs.length < K2) {
  const d2 = cen.map((c) => { let b = -1; for (const k of cs) b = Math.max(b, dot(c, k)); return 1 - b; });
  const sum = d2.reduce((a, b) => a + b, 0); let x = rand() * sum, idx = 0; for (; idx < d2.length; idx++) { x -= d2[idx]; if (x <= 0) break; }
  cs.push(cen[Math.min(idx, cen.length - 1)].slice());
}
let asg = new Array(cen.length).fill(0);
for (let it = 0; it < 60; it++) {
  let moved = 0;
  for (let i = 0; i < cen.length; i++) { let b = 0, bs = -2; for (let c = 0; c < K2; c++) { const s = dot(cen[i], cs[c]); if (s > bs) { bs = s; b = c; } } if (asg[i] !== b) moved++; asg[i] = b; }
  for (let c = 0; c < K2; c++) { const m = []; for (let i = 0; i < cen.length; i++) if (asg[i] === c) m.push(cen[i]); if (!m.length) continue; const nc = new Float32Array(D); for (const v of m) for (let d = 0; d < D; d++) nc[d] += v[d]; let n = 0; for (let d = 0; d < D; d++) n += nc[d] * nc[d]; n = Math.sqrt(n) || 1; for (let d = 0; d < D; d++) nc[d] /= n; cs[c] = nc; }
  if (!moved) break;
}
const sections = [];
for (let c = 0; c < K2; c++) {
  const idxs = []; for (let i = 0; i < topics.length; i++) if (asg[i] === c) idxs.push(i);
  if (!idxs.length) continue;
  idxs.sort((a, b) => topics[b].size - topics[a].size);
  const verses = idxs.reduce((s, i) => s + topics[i].size, 0);
  sections.push({ topicIdx: idxs, topics: idxs.length, verses });
}
sections.sort((a, b) => b.verses - a.verses);
console.log(`أقسام: ${sections.length} (من ${topics.length} موضوعًا، ${K2} مطلوبة)`);
for (const s of sections) {
  const t = s.topicIdx.slice(0, 4).map((i) => topics[i].title.slice(0, 24)).join(" · ");
  console.log(`  ×${String(s.verses).padStart(4)} آية · ${String(s.topics).padStart(2)} موضوع  |  ${t}`);
}

fs.writeFileSync(OUT, JSON.stringify({
  meta: { sections: sections.length, topics: topics.length, K: K2 },
  sections: sections.map((s) => ({ verses: s.verses, topicIdx: s.topicIdx,
    topicTitles: s.topicIdx.map((i) => topics[i].title) })),
}));
console.log(`\n→ findings/mawdui-sections.json — a swarm names the ${sections.length} sections next`);
