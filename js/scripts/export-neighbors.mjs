/**
 * آيات قريبة المعنى — precompute the top-K semantic neighbors of every ayah
 * from the Gemini vectors in quran-kg.db, into a compact sidecar the app
 * ships: quran-neighbors.bin.
 *
 * Format (little-endian):
 *   uint32 headerLength
 *   JSON   { magic:"qkg-nb-1", count, k }           (padded to 4-byte align)
 *   then count * k * (uint16 ayahNo, uint8 score100) — neighbor global ayah
 *   numbers (1..6236; 0 = empty slot) and score as round(cos*100).
 *
 * ~6236 × 8 × 3 B ≈ 150 KB. Full O(n²) cosine over 768-dim float32 (~30 s).
 *
 * Usage: node scripts/export-neighbors.mjs   (needs ayah_embedding filled)
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.resolve(HERE, "../../quran-kg.db");
const OUT = path.resolve(HERE, "../../quran-neighbors.bin");
const MODEL = "gemini-embedding-001";
const DIM = 768;
const K = 8;
const MIN_SCORE = 0.5;

const db = new DatabaseSync(DB, { readOnly: true });
const rows = db
  .prepare("SELECT ayah_id, vector FROM ayah_embedding WHERE model=? AND dim=? ORDER BY ayah_id")
  .all(MODEL, DIM);
db.close();
const N = rows.length;
if (N === 0) {
  console.error("no embeddings — run embed-ayahs.mjs first");
  process.exit(1);
}

// L2-normalize into one contiguous matrix for cache-friendly dots.
const mat = new Float32Array(N * DIM);
for (let r = 0; r < N; r++) {
  const v = new Float32Array(rows[r].vector.buffer, rows[r].vector.byteOffset, DIM);
  let n = 0;
  for (let i = 0; i < DIM; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) mat[r * DIM + i] = v[i] / n;
}
console.log(`normalized ${N} vectors, computing top-${K} neighbors …`);

const out = Buffer.alloc(N * K * 3);
const t0 = Date.now();
for (let a = 0; a < N; a++) {
  // top-K via simple insertion (K is tiny)
  const ids = new Int32Array(K);
  const scores = new Float32Array(K).fill(-1);
  const base = a * DIM;
  for (let b = 0; b < N; b++) {
    if (b === a) continue;
    let dot = 0;
    const bb = b * DIM;
    for (let i = 0; i < DIM; i++) dot += mat[base + i] * mat[bb + i];
    if (dot <= scores[K - 1]) continue;
    let j = K - 1;
    while (j > 0 && scores[j - 1] < dot) {
      scores[j] = scores[j - 1];
      ids[j] = ids[j - 1];
      j--;
    }
    scores[j] = dot;
    ids[j] = b + 1;
  }
  for (let k = 0; k < K; k++) {
    const off = (a * K + k) * 3;
    if (scores[k] >= MIN_SCORE) {
      out.writeUInt16LE(ids[k], off);
      out.writeUInt8(Math.max(0, Math.min(100, Math.round(scores[k] * 100))), off + 2);
    } // else leave zeros
  }
  if ((a + 1) % 500 === 0) console.log(`  ${a + 1}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

let headerJson = JSON.stringify({ magic: "qkg-nb-1", count: N, k: K });
while ((4 + Buffer.byteLength(headerJson)) % 4 !== 0) headerJson += " ";
const header = Buffer.from(headerJson);
const head = Buffer.alloc(4);
head.writeUInt32LE(header.length);
fs.writeFileSync(OUT, Buffer.concat([head, header, out]));
console.log(`wrote ${OUT} (${((4 + header.length + out.length) / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
