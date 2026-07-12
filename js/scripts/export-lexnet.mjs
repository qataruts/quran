/**
 * الفروق اللغوية / المترادفات / الحقول الدلالية — one computed semantic network
 * over the Qur'an's roots, built ONLY from the two classical lexica we already
 * carry (الراغب's المفردات + ابن فارس's مقاييس) plus Gemini embeddings.
 *
 *   • embed each root's DEFINITION (مقاييس core sense + الراغب) with
 *     gemini-embedding-001, taskType SEMANTIC_SIMILARITY, 768-dim.
 *   • nearest neighbours  → candidate synonyms  (المترادفات)
 *   • mutual-neighbour components → semantic fields (الحقول الدلالية)
 *   • verbatim «الفرق بين / أخصّ / أبلغ …» sentences الراغب himself writes
 *     → explicit distinctions (الفروق), surfaced, never invented.
 *
 * The reader compares the two entries side-by-side and judges — نحسب ونعرض.
 *
 * Usage:  GEMINI_API_KEY=… node scripts/export-lexnet.mjs
 *         (falls back to ../../.env)
 * Output: js/apps/studio/public/lexnet.json
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.resolve(HERE, "../apps/studio/public/quran-app.db");
const OUT = path.resolve(HERE, "../apps/studio/public/lexnet.json");

// --- key (env or repo-root .env) -------------------------------------------
let KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  try {
    const env = fs.readFileSync(path.resolve(HERE, "../../.env"), "utf8");
    KEY = env.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\n]+)/)?.[1];
  } catch {}
}
if (!KEY) { console.error("GEMINI_API_KEY not set (env or ../../.env)"); process.exit(1); }

const MODEL = "gemini-embedding-001";
const DIM = 768;

// --- collect root definitions ----------------------------------------------
const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare("SELECT root, occurrences, data FROM roots").all();

/** strip Qur'anic citation brackets so topical noise doesn't drown the sense */
const deNoise = (s) =>
  s.replace(/\[[^\]]*\]/g, " ").replace(/[﴿﴾]/g, " ").replace(/\s+/g, " ").trim();

// clean الراغب prose before quoting it: drop editorial footnotes [[...]], single
// [...] citations, the digitisation's | paragraph markers, and Qur'an brackets —
// so we never present garbled/spliced text as al-Rāghib's own words.
const cleanRaghib = (s) =>
  s
    .replace(/\[\[[\s\S]*?\]\]/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\|/g, " ")
    .replace(/[﴿﴾]/g, "")
    .replace(/\s+/g, " ")
    .trim();
// a citable distinction must OPEN with one of these (not merely contain «بخلاف»
// mid-thought, which produced fragments).
const CONTRAST_OK = /(?:وال?فرق بين|ال?فرق بينهما|والفرق أنّ|أخصّ من|أعمّ من|أبلغ من)/;
// anaphoric / obviously-mid-sentence openers to reject.
const FRAGMENT_START = /^(?:و?هو |و?هذا |و?ذلك |أي|نحو|قال|وقال|وقيل|فقال|كقول|والثاني|والثالث|-|—)/;

const roots = [];
for (const { root, occurrences, data } of rows) {
  const r = JSON.parse(data);
  const ms = r.meanings || [];
  if (!ms.length) continue;
  const maq = ms.find((m) => m.key === "maqayis")?.text || "";
  const raq = ms.find((m) => m.key === "mufradat")?.text || "";
  // definition text for the embedding — مقاييس core first (it states the أصل),
  // then الراغب, de-noised and capped so the essential sense dominates.
  const embedText = `${root}\n${deNoise(maq).slice(0, 600)}\n${deNoise(raq).slice(0, 900)}`.slice(0, 1500);
  // explicit distinctions الراغب writes himself (verbatim sentence extraction)
  const contrast = [];
  for (const sent of cleanRaghib(raq).split(/(?<=[.،؛])\s+/)) {
    const t = sent.trim();
    if (t.length < 18 || t.length > 300) continue;
    if (!CONTRAST_OK.test(t)) continue;      // a real distinction opener
    if (FRAGMENT_START.test(t)) continue;    // not an anaphoric mid-sentence piece
    if (/[[\]|]|ص\s*\d|\d\s*\/\s*\d/.test(t)) continue; // any leftover citation/marker
    if (!/[.،؛]$/.test(t)) continue;         // must end cleanly (not truncated)
    contrast.push(t);
    if (contrast.length >= 3) break;
  }
  roots.push({ root, occ: occurrences, embedText, contrast });
}
console.log(`${roots.length} roots carry a lexicon entry`);

// --- embed (batched), with a local vector cache so we never re-spend --------
const CACHE = path.resolve(HERE, "../../.lexnet-vecs.bin");
const vecs = new Array(roots.length);
let cached = false;
if (fs.existsSync(CACHE)) {
  const buf = fs.readFileSync(CACHE);
  if (buf.length === roots.length * DIM * 4) {
    const f = new Float32Array(buf.buffer, buf.byteOffset, roots.length * DIM);
    for (let i = 0; i < roots.length; i++) vecs[i] = f.subarray(i * DIM, (i + 1) * DIM);
    cached = true;
    console.log("loaded embeddings from cache (skipping Gemini)");
  }
}
const URL_ = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
const BATCH = 100;
for (let i = 0; !cached && i < roots.length; i += BATCH) {
  const batch = roots.slice(i, i + BATCH);
  const body = {
    requests: batch.map((r) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text: r.embedText }] },
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: DIM,
    })),
  };
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${URL_}?key=${KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      const wait = attempt * 5000;
      console.log(`  HTTP ${res.status}, retry in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    console.error(`embed failed HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const { embeddings } = await res.json();
  for (let j = 0; j < batch.length; j++) {
    // L2-normalise for cosine-via-dot
    const v = Float32Array.from(embeddings[j].values);
    let n = 0;
    for (let k = 0; k < DIM; k++) n += v[k] * v[k];
    n = Math.sqrt(n) || 1;
    for (let k = 0; k < DIM; k++) v[k] /= n;
    vecs[i + j] = v;
  }
  console.log(`  embedded ${Math.min(i + BATCH, roots.length)}/${roots.length}`);
}

if (!cached) {
  const flat = new Float32Array(roots.length * DIM);
  for (let i = 0; i < roots.length; i++) flat.set(vecs[i], i * DIM);
  fs.writeFileSync(CACHE, Buffer.from(flat.buffer));
  console.log("cached embeddings → .lexnet-vecs.bin (future runs skip Gemini)");
}

// --- nearest neighbours (cosine) -------------------------------------------
const cos = (a, b) => { let s = 0; for (let k = 0; k < DIM; k++) s += a[k] * b[k]; return s; };
const NEAR_K = 12;         // candidate synonyms kept per root
const NEAR_MIN = 0.60;     // floor for "close in meaning" (rank matters more)
const FIELD_MIN = 0.855;   // strong-link floor for building fields (≈ p90)

const near = new Array(roots.length);
for (let i = 0; i < roots.length; i++) {
  const scored = [];
  for (let j = 0; j < roots.length; j++) {
    if (j === i) continue;
    const s = cos(vecs[i], vecs[j]);
    if (s >= NEAR_MIN) scored.push([j, s]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  near[i] = scored.slice(0, NEAR_K);
}

// distribution sanity check
const allTop = near.map((n) => n[0]?.[1]).filter(Boolean).sort((a, b) => a - b);
if (allTop.length) {
  const q = (p) => allTop[Math.floor(p * (allTop.length - 1))].toFixed(3);
  console.log(`top-neighbour cosine — p10 ${q(0.1)} · median ${q(0.5)} · p90 ${q(0.9)}`);
}

// --- semantic fields = greedy seed-based disjoint clusters ------------------
// Union-find over this compressed (0.84+-everywhere) cosine space collapses to
// one giant blob; instead grow a tight field around each highest-occurrence
// unclaimed seed, taking only its strong *mutual* neighbours. Disjoint,
// labelled by the seed, and no transitive chaining.
const inTop = (a, b) => near[a].some(([j]) => j === b);
const order = [...roots.keys()].sort((a, b) => roots[b].occ - roots[a].occ);
const claimed = new Uint8Array(roots.length);
const fields = [];
for (const seed of order) {
  if (claimed[seed]) continue;
  const members = [seed];
  claimed[seed] = 1;
  for (const [j, s] of near[seed]) {
    if (claimed[j] || s < FIELD_MIN || !inTop(j, seed)) continue; // strong + mutual
    members.push(j);
    claimed[j] = 1;
    if (members.length >= 10) break;
  }
  if (members.length >= 3) fields.push(members.map((i) => roots[i].root));
  else members.forEach((i) => (claimed[i] = 0)); // release — too small to be a field
}
fields.sort((a, b) => b.length - a.length);

// --- write ------------------------------------------------------------------
const outRoots = {};
let pairCount = 0;
for (let i = 0; i < roots.length; i++) {
  const r = roots[i];
  const nb = near[i].map(([j, s]) => ({ r: roots[j].root, s: Math.round(s * 1000) / 1000 }));
  pairCount += nb.length;
  if (nb.length === 0 && r.contrast.length === 0) continue;
  outRoots[r.root] = { occ: r.occ, near: nb };
  if (r.contrast.length) outRoots[r.root].contrast = r.contrast;
}
const out = {
  meta: {
    model: MODEL, dim: DIM,
    roots: Object.keys(outRoots).length,
    pairs: pairCount,
    fields: fields.length,
    sources: ["المفردات في غريب القرآن — الراغب الأصفهاني", "مقاييس اللغة — ابن فارس"],
  },
  roots: outRoots,
  fields: fields.map((rs) => ({ label: rs[0], roots: rs })),
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\nwrote ${path.relative(process.cwd(), OUT)} — ${out.meta.roots} roots, ${pairCount} near-pairs, ${fields.length} fields (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
console.log(`largest fields:`);
for (const f of fields.slice(0, 8)) console.log(`  «${f[0]}» (${f.length}): ${f.slice(0, 10).join("، ")}${f.length > 10 ? " …" : ""}`);
db.close();
