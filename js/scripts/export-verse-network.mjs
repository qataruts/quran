/**
 * شبكةُ آيات القرآن — the galaxy of VERSES. A force-directed layout of the 6236
 * verses linked by the semantic-neighbour graph (quran-neighbors.bin). Each node
 * carries its جامعية (→ size), its محور/theme (→ colour), and its tier — so the
 * network shows the الكلّيّات mechanism spatially: the foundational verses become
 * bright hubs, themes become galaxies. Positions are baked; the app just paints.
 *
 * Needs d3-force locally (same as export-network.mjs).
 * Usage: node js/scripts/export-verse-network.mjs → public/verse-network.json
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "../apps/studio/public");
const ROOT = path.resolve(HERE, "../..");
const d3 = await import(path.resolve(PUB, "../node_modules/d3-force/src/index.js"));

const K = JSON.parse(fs.readFileSync(`${PUB}/kulliyat.json`, "utf8"));
const db = new DatabaseSync(`${ROOT}/quran-kg.db`, { readOnly: true });
const ayahs = db.prepare("SELECT ayah_id, location FROM ayah ORDER BY ayah_id").all();
db.close();
const N = ayahs.length;
const TIER = { "كلّية": 2, "جامعة": 1, "تفصيل": 0 };
const nodes = ayahs.map((a) => {
  const v = K.verses[a.location] || {};
  return { loc: a.location, o: v.jamiya ?? 0, c: v.theme ?? -1, t: TIER[v.tier] ?? 0 };
});

// edges = the semantic-neighbour graph (top-K per verse, de-duplicated)
const nb = fs.readFileSync(`${PUB}/quran-neighbors.bin`);
const nab = nb.buffer.slice(nb.byteOffset, nb.byteOffset + nb.byteLength);
const nhl = new DataView(nab).getUint32(0, true);
const KNB = JSON.parse(new TextDecoder().decode(new Uint8Array(nab, 4, nhl))).k;
const nbytes = new Uint8Array(nab, 4 + nhl);
const seen = new Set(), edges = [];
const TOPK = 5;
for (let u = 0; u < N; u++) {
  const base = u * KNB * 3;
  for (let i = 0; i < Math.min(TOPK, KNB); i++) {
    const off = base + i * 3; const id = nbytes[off] | (nbytes[off + 1] << 8); if (!id) break;
    const v = id - 1; if (v === u || v < 0 || v >= N) continue;
    const key = u < v ? `${u}\t${v}` : `${v}\t${u}`;
    if (seen.has(key)) continue; seen.add(key);
    edges.push({ s: u, t: v, w: nbytes[off + 2] / 100 });
  }
}

// force layout — deterministic phyllotaxis seed, links pull neighbours together
const sim = nodes.map((n, i) => ({ ...n, index: i }));
const links = edges.map((e) => ({ source: e.s, target: e.t, w: e.w }));
sim.forEach((n, i) => { const a = i * 2.39996323; const rr = 3 * Math.sqrt(i + 1); n.x = rr * Math.cos(a); n.y = rr * Math.sin(a); });
const s = d3.forceSimulation(sim)
  .force("link", d3.forceLink(links).distance(9).strength((l) => Math.min(0.35, l.w * 0.6)))
  .force("charge", d3.forceManyBody().strength(-5).distanceMax(120))
  .force("x", d3.forceX(0).strength(0.035))
  .force("y", d3.forceY(0).strength(0.035))
  .force("collide", d3.forceCollide().radius((d) => 1.2 + d.o * 3.5).iterations(2))
  .stop();
for (let i = 0; i < 400; i++) s.tick();

let sx = 0, sy = 0; for (const n of sim) { sx += n.x; sy += n.y; }
const cx = sx / N, cy = sy / N; for (const n of sim) { n.x -= cx; n.y -= cy; }
const radii = sim.map((n) => Math.hypot(n.x, n.y)).sort((a, b) => a - b);
const fitR = radii[Math.floor(0.97 * radii.length)] || 1;
const r1 = (v) => Math.round(v * 10) / 10;

const out = {
  meta: { nodes: N, edges: edges.length, themes: K.meta.themes, span: r1(2 * fitR), themeLabels: K.meta.themeLabels },
  nodes: sim.map((n) => ({ l: n.loc, o: +n.o.toFixed(3), x: r1(n.x), y: r1(n.y), c: n.c, t: n.t })),
  edges: edges.map((e) => ({ s: e.s, t: e.t, w: +e.w.toFixed(2) })),
};
fs.writeFileSync(`${PUB}/verse-network.json`, JSON.stringify(out));
console.log(`verses ${N} · edges ${edges.length} · themes ${K.meta.themes} → verse-network.json (${(fs.statSync(`${PUB}/verse-network.json`).size / 1024).toFixed(0)} KB)`);
