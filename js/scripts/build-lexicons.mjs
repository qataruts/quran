/**
 * build-lexicons.mjs — the covenant's two classical معاجم into browser lookups,
 * keyed by (normalized) root, shown in the word card beside مشكاة's own gloss:
 *   المفردات في غريب القرآن — الراغب  · مقاييس اللغة — ابن فارس
 * Cited sources, separate from the computed layers.
 *
 * Outputs (public/):
 *   <id>.json          — { normRoot: text }  (loaded on demand, per lexicon)
 *   lexicon-index.json — { id: [normRoots…] } (tiny; decides which toggles to show)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEX = join(HERE, "..", "data", "lexicon");
const OUT = join(HERE, "..", "apps", "studio", "public");

const LEXICONS = [
  ["mufradat", "المفردات — الراغب"],
  ["maqayis", "مقاييس اللغة — ابن فارس"],
];

export const normRoot = (r) =>
  (r || "")
    .normalize("NFC")
    .replace(/[ً-ْـٰ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "");
// strip the editor's inline apparatus ([[انظر: اللسان…]], [[العين 8/368]]) — it's
// the muḥaqqiq's footnotes, not al-Rāghib's متن; clutters reading & dilutes embeddings
const clean = (s) => s.replace(/\[\[.*?\]\]/g, " ").replace(/\s+/g, " ").trim();

const index = {};
for (const [id, label] of LEXICONS) {
  const src = join(LEX, `${id}.jsonl`);
  const lines = readFileSync(src, "utf8").trim().split("\n").filter(Boolean);
  const map = {};
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (!rec.root || !rec.text) continue;
    const k = normRoot(rec.root);
    if (!k) continue;
    if (map[k]) map[k] += "\n\n" + clean(rec.text);
    else map[k] = clean(rec.text);
  }
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(map));
  index[id] = Object.keys(map);
  const mb = (Buffer.byteLength(JSON.stringify(map)) / 1e6).toFixed(1);
  console.log(`${id.padEnd(10)} ${String(index[id].length).padStart(5)} roots  ${mb} MB  (${label})`);
}
writeFileSync(join(OUT, "lexicon-index.json"), JSON.stringify(index));
const idxMb = (Buffer.byteLength(JSON.stringify(index)) / 1e3).toFixed(0);
console.log(`lexicon-index.json  ${idxMb} KB`);
