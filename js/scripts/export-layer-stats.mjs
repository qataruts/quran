/**
 * Collect the small `meta` blocks of every knowledge layer into one tiny file
 * (public/layer-stats.json) so the إحصاءات page can show the whole picture
 * without loading the multi-MB layer files. Run after any layer rebuild:
 *   node scripts/export-layer-stats.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "../apps/studio/public");
const read = (f) => JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8"));

const jawami = read("jawami.json").meta ?? {};
const muhkamat = read("muhkamat.json").meta ?? {};
const mawdui = read("mawdui.json").meta ?? {};
const furuq = read("furuq.json").meta ?? {};
const verseIndex = read("verse-index.json").meta ?? {};

// jawami.tafsil = { "s:a": [ [loc, rel], ... ] }
const jw = read("jawami.json");
const relCounts = {};
for (const links of Object.values(jw.tafsil ?? {}))
  for (const [, rel] of links) relCounts[rel] = (relCounts[rel] ?? 0) + 1;

// mathani (reciprocal تفصيل pairs) — each pair counted once
const linkSet = new Set();
for (const [hub, links] of Object.entries(jw.tafsil ?? {}))
  for (const [loc] of links) linkSet.add(`${hub}|${loc}`);
let mathani = 0;
const counted = new Set();
for (const [hub, links] of Object.entries(jw.tafsil ?? {}))
  for (const [loc] of links) {
    if (linkSet.has(`${loc}|${hub}`)) {
      const key = [hub, loc].sort().join("~");
      if (!counted.has(key)) { counted.add(key); mathani++; }
    }
  }

const out = {
  jawami: { principles: jawami.principles, hubs: jawami.hubs, links: jawami.links, rels: relCounts },
  muhkamat: { count: muhkamat.muhkamat, kubra: muhkamat.kubra, network: muhkamat.network },
  mawdui: { sections: mawdui.sections, topics: mawdui.topics, verses: mawdui.verses },
  furuq: { pairs: furuq.pairs, categories: furuq.categories },
  network: { inNetwork: verseIndex.inNetwork, mathani },
  totals: { verses: verseIndex.verses ?? mawdui.verses },
};

const dest = path.join(PUB, "layer-stats.json");
fs.writeFileSync(dest, JSON.stringify(out));
console.log("layer-stats.json:", JSON.stringify(out).length, "bytes");
console.log("  jawami:", out.jawami.principles, "· links:", out.jawami.links, "· rels:", out.jawami.rels);
console.log("  muhkamat:", out.muhkamat.count, "· mawdui:", out.mawdui.sections, "/", out.mawdui.topics);
console.log("  furuq:", out.furuq.pairs, "· mathani:", out.network.mathani);
