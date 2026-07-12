/**
 * شبكة القرآن — the galaxy of roots. Precomputes a force-directed layout of the
 * root co-occurrence network at THREE connection strengths (roots sharing ≥1, ≥2,
 * ≥3 verses) so the reader can pick the degree of connection. Each render keeps
 * only the roots that ARE connected at that strength (isolated roots dropped),
 * plus a Louvain community for colour. Positions are baked so the app just paints.
 *
 * Needs d3-force locally (kept OUT of package.json; install:
 *   cd js/apps/studio && npm i --ignore-scripts d3-force d3-quadtree)
 * Usage: node js/scripts/export-network.mjs   → public/network-{1,2,3}.json
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "../apps/studio/public");
const DB = path.join(PUB, "quran-app.db");
const d3 = await import(path.resolve(PUB, "../node_modules/d3-force/src/index.js"));

const db = new DatabaseSync(DB, { readOnly: true });
const rootRows = db.prepare("SELECT root, occurrences FROM roots WHERE occurrences > 0").all();
// verse → set of roots, from the words table
const verseRoots = new Map();
for (const r of db.prepare("SELECT surahNo s, ayahNo a, root FROM words WHERE root IS NOT NULL AND root != ''").iterate()) {
  const v = `${r.s}:${r.a}`;
  (verseRoots.get(v) ?? verseRoots.set(v, new Set()).get(v)).add(r.root);
}
db.close();
// co-occurrence weight = number of shared verses, for every root pair
const pairW = new Map();
for (const set of verseRoots.values()) {
  const arr = [...set].sort();
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const k = `${arr[i]}\t${arr[j]}`;
    pairW.set(k, (pairW.get(k) || 0) + 1);
  }
}

function build(MIN_W) {
  const edgeRows = [];
  for (const [k, w] of pairW) if (w >= MIN_W) { const [a, b] = k.split("\t"); edgeRows.push({ a, b, w }); }
  // keep only roots connected at this strength
  const deg0 = new Map();
  for (const e of edgeRows) { deg0.set(e.a, (deg0.get(e.a) || 0) + 1); deg0.set(e.b, (deg0.get(e.b) || 0) + 1); }
  const nodes = rootRows.filter((r) => deg0.has(r.root)).map((r) => ({ id: r.root, occ: r.occurrences }));
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = edgeRows.filter((e) => idx.has(e.a) && idx.has(e.b));

  // adjacency
  const adj = nodes.map(() => []);
  for (const e of edges) { const a = idx.get(e.a), b = idx.get(e.b); adj[a].push([b, e.w]); adj[b].push([a, e.w]); }

  // Louvain local-moving (one level) → colour communities
  const deg = nodes.map(() => 0);
  let m2 = 0;
  for (const e of edges) { deg[idx.get(e.a)] += e.w; deg[idx.get(e.b)] += e.w; m2 += 2 * e.w; }
  let label = nodes.map((_, i) => i);
  const commDeg = deg.slice();
  for (let pass = 0; pass < 20; pass++) {
    let improved = false;
    for (let i = 0; i < nodes.length; i++) {
      const ci = label[i];
      const wTo = new Map();
      for (const [j, w] of adj[i]) wTo.set(label[j], (wTo.get(label[j]) ?? 0) + w);
      commDeg[ci] -= deg[i];
      let best = ci, bestGain = (wTo.get(ci) ?? 0) - (deg[i] * commDeg[ci]) / m2;
      for (const [c, wc] of wTo) { if (c === ci) continue; const gain = wc - (deg[i] * commDeg[c]) / m2; if (gain > bestGain) { bestGain = gain; best = c; } }
      commDeg[best] += deg[i];
      if (best !== ci) { label[i] = best; improved = true; }
    }
    if (!improved) break;
  }
  const size = new Map();
  for (const l of label) size.set(l, (size.get(l) ?? 0) + 1);
  const big = [...size.entries()].filter(([, n]) => n >= 6).sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const cmap = new Map(big.map((l, i) => [l, i]));
  const cluster = label.map((l) => cmap.get(l) ?? -1);

  // force layout — deterministic seed + collision-dominant even ball
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = edges.map((e) => ({ source: idx.get(e.a), target: idx.get(e.b), w: e.w }));
  simNodes.forEach((n, i) => { const a = i * 2.39996323; const rr = 3 * Math.sqrt(i + 1); n.x = rr * Math.cos(a); n.y = rr * Math.sin(a); });
  const sim = d3
    .forceSimulation(simNodes)
    .force("link", d3.forceLink(simLinks).distance(16).strength((l) => Math.min(0.13, l.w / 130)))
    .force("charge", d3.forceManyBody().strength(-12))
    .force("x", d3.forceX(0).strength(0.05))
    .force("y", d3.forceY(0).strength(0.05))
    .force("collide", d3.forceCollide().radius((d) => 3.8 + Math.sqrt(d.occ) / 2.7).iterations(4))
    .stop();
  for (let i = 0; i < 600; i++) sim.tick();

  let sxs = 0, sys = 0;
  for (const n of simNodes) { sxs += n.x; sys += n.y; }
  const cx = sxs / simNodes.length, cy = sys / simNodes.length;
  for (const n of simNodes) { n.x -= cx; n.y -= cy; }
  const radii = simNodes.map((n) => Math.hypot(n.x, n.y)).sort((a, b) => a - b);
  const fitR = radii[Math.floor(0.97 * radii.length)] || radii[radii.length - 1];
  const r1 = (v) => Math.round(v * 10) / 10;

  const out = {
    meta: { minW: MIN_W, nodes: nodes.length, edges: edges.length, clusters: big.length, span: r1(2 * fitR) },
    nodes: simNodes.map((n, i) => ({ r: n.id, o: n.occ, x: r1(n.x), y: r1(n.y), c: cluster[i] })),
    edges: edges.map((e) => ({ s: idx.get(e.a), t: idx.get(e.b), w: e.w })),
  };
  const OUT = path.join(PUB, `network-${MIN_W}.json`);
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`w≥${MIN_W}: ${nodes.length} roots · ${edges.length} edges · ${big.length} clusters → network-${MIN_W}.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

for (const th of [5, 4, 3, 2, 1]) build(th);
