/**
 * الوجوه والنظائر (computed) — candidate polysemous words: a content-word whose
 * Qur'anic occurrences split into distinct meaning-contexts. We take each lemma
 * (with a root) that occurs in enough verses, cluster its verses' Gemini
 * embeddings into two, and rank by how separated AND balanced the two groups are
 * — the clearer the split, the likelier the word carries two «وجوه». Honest
 * approximation from the text's own semantics; the reader judges. → wujuh.json
 *   node scripts/export-wujuh.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "js/apps/studio/public/wujuh.json");
const MIN_VERSES = 14;
const DIM = 768;

const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });

// embeddings: ayah_id → normalized Float32Array, and ayah_id → "s:a"
const vec = new Map();
const loc = new Map();
for (const r of db.prepare("SELECT ayah_id, location FROM ayah").all()) loc.set(r.ayah_id, r.location);
for (const r of db.prepare("SELECT ayah_id, vector FROM ayah_embedding").iterate()) {
  const f = new Float32Array(r.vector.buffer, r.vector.byteOffset, DIM);
  const v = Float32Array.from(f);
  let n = 0;
  for (let i = 0; i < DIM; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= n;
  vec.set(r.ayah_id, v);
}

// content lemmas (with a root) and their distinct verses
const lemmas = db
  .prepare(
    `SELECT w.lemma_id lid, l.lemma_ar lm, rt.root_ar rt, COUNT(DISTINCT w.ayah_id) v
     FROM word w JOIN lemma l ON l.lemma_id=w.lemma_id JOIN root rt ON rt.root_id=w.root_id
     WHERE l.lemma_ar IS NOT NULL GROUP BY w.lemma_id HAVING v>=${MIN_VERSES}`,
  )
  .all();
const versesOf = db.prepare("SELECT DISTINCT ayah_id FROM word WHERE lemma_id=?");

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < DIM; i++) s += a[i] * b[i];
  return s;
};
const rng = (() => {
  let s = 0x9e3779b9 >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
})();

/** 2-means on unit vectors (cosine). Returns {a,b: member idx, ca,cb: centroids}. */
function twoMeans(vs) {
  const n = vs.length;
  let ca = vs[Math.floor(rng() * n)].slice();
  let cb = vs[Math.floor(rng() * n)].slice();
  let assign = new Array(n).fill(0);
  for (let iter = 0; iter < 25; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const g = dot(vs[i], ca) >= dot(vs[i], cb) ? 0 : 1;
      if (g !== assign[i]) moved++;
      assign[i] = g;
    }
    const na = new Float32Array(DIM);
    const nb = new Float32Array(DIM);
    let cntA = 0;
    for (let i = 0; i < n; i++) {
      const t = assign[i] === 0 ? na : nb;
      for (let j = 0; j < DIM; j++) t[j] += vs[i][j];
      if (assign[i] === 0) cntA++;
    }
    const norm = (t) => {
      let m = 0;
      for (let j = 0; j < DIM; j++) m += t[j] * t[j];
      m = Math.sqrt(m) || 1;
      for (let j = 0; j < DIM; j++) t[j] /= m;
      return t;
    };
    ca = norm(na);
    cb = norm(nb);
    if (moved === 0 && iter > 0) break;
    if (cntA === 0 || cntA === n) break;
  }
  return { assign, ca, cb };
}

const words = [];
for (const L of lemmas) {
  const ids = versesOf.all(L.lid).map((r) => r.ayah_id).filter((id) => vec.has(id));
  if (ids.length < MIN_VERSES) continue;
  const vs = ids.map((id) => vec.get(id));
  const { assign, ca, cb } = twoMeans(vs);
  const A = ids.filter((_, i) => assign[i] === 0);
  const B = ids.filter((_, i) => assign[i] === 1);
  if (A.length < 3 || B.length < 3) continue;
  const sep = 1 - dot(ca, cb); // 0..2, higher = more distinct senses
  const balance = Math.min(A.length, B.length) / Math.max(A.length, B.length);
  const score = +(sep * balance).toFixed(3);
  const rep = (grp, c) =>
    grp
      .map((id) => ({ loc: loc.get(id), s: dot(vec.get(id), c) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 4)
      .map((x) => x.loc);
  words.push({
    lemma: L.lm,
    root: L.rt,
    n: ids.length,
    score,
    faces: [
      { n: A.length, verses: rep(A, ca) },
      { n: B.length, verses: rep(B, cb) },
    ],
  });
}
db.close();

words.sort((a, b) => b.score - a.score);
const top = words.slice(0, 80);
fs.writeFileSync(OUT, JSON.stringify({ meta: { candidates: top.length, scanned: words.length, minVerses: MIN_VERSES }, words: top }));
console.log(`wujuh.json: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB · scanned ${words.length}, kept ${top.length}`);
for (const w of top.slice(0, 12)) console.log(`  ${w.lemma} (${w.root}) ·${w.n}v· score ${w.score} · ${w.faces[0].verses[0]} | ${w.faces[1].verses[0]}`);
