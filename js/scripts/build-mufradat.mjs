/**
 * build-mufradat.mjs — المفردات في غريب القرآن (الراغب الأصفهاني), root-keyed, into a
 * browser lookup: public/mufradat.json = { normRoot: text }. Shown (lazily, on expand)
 * in the word card beside مشكاة's own root gloss. A cited classical lexicon — the
 * authoritative full text, separate from the computed layers.
 *
 * Root keys are NORMALIZED (strip diacritics/tatweel, unify hamza/alef, ى→ي, ة→ه) so
 * الراغب's headwords line up with QAC roots as far as strong letters allow.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "data", "lexicon", "mufradat.jsonl");
const OUT = join(HERE, "..", "apps", "studio", "public", "mufradat.json");

export const normRoot = (r) =>
  (r || "")
    .normalize("NFC")
    .replace(/[ً-ْـٰ]/g, "") // harakat, tatweel, dagger-alef
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "")
    .trim();

const clean = (s) => s.replace(/\s+/g, " ").trim();

const lines = readFileSync(SRC, "utf8").trim().split("\n").filter(Boolean);
const map = {};
let dups = 0;
for (const line of lines) {
  let rec;
  try { rec = JSON.parse(line); } catch { continue; }
  if (!rec.root || !rec.text) continue;
  const k = normRoot(rec.root);
  if (!k) continue;
  if (map[k]) { map[k] += "\n\n" + clean(rec.text); dups++; } // merge collisions
  else map[k] = clean(rec.text);
}
writeFileSync(OUT, JSON.stringify(map));
// tiny index (just the root keys) so the word card can decide to show the toggle
// without pulling the full 3 MB text
writeFileSync(join(dirname(OUT), "mufradat-roots.json"), JSON.stringify(Object.keys(map)));
const mb = (Buffer.byteLength(JSON.stringify(map)) / 1e6).toFixed(1);
console.log(`mufradat.json: ${Object.keys(map).length} roots, ${mb} MB (${dups} merged collisions) + mufradat-roots.json index`);
