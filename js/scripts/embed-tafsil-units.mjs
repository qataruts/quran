/**
 * تضمين مقاطع التفصيل الموضوعي (١٢٨١ وحدة سياق) بنفس معاملات تضمين الآيات
 * حرفيًّا (gemini-embedding-001، dim 768، RETRIEVAL_DOCUMENT، تكميم int8 بعد
 * تطبيع الطول) — والمخرج bin بنفس صيغة quran-embeddings.bin ليقرأه العميل
 * بنفس الشيفرة: tafsil-embeddings.bin.
 *
 * نصُّ الوحدة = آياتُها المتتالية من quran-kg.db (نصّنا القياسي) بفاصل نقطة.
 *   GEMINI_API_KEY=... node scripts/embed-tafsil-units.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const UNITS = path.join(ROOT, "js/data/tafsil/units.json");
const OUT = path.join(ROOT, "js/apps/studio/public/tafsil-embeddings.bin");
const MODEL = "gemini-embedding-001";
const DIM = 768;

const KEY = process.env.GEMINI_API_KEY || (() => {
  try { return fs.readFileSync(path.join(ROOT, ".env"), "utf-8").match(/GEMINI_API_KEY=(.+)/)[1].trim(); } catch { return null; }
})();
if (!KEY) { console.error("GEMINI_API_KEY missing"); process.exit(1); }

const { units } = JSON.parse(fs.readFileSync(UNITS, "utf-8"));
const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const textStmt = db.prepare("SELECT text_clean t FROM ayah WHERE surah_no=? AND ayah_no=?");
const texts = units.map((u) => {
  const parts = [];
  for (let a = u.a1; a <= u.a2; a++) parts.push(textStmt.get(u.s, a).t);
  return parts.join(". ");
});
db.close();

const URL_ = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
const vectors = new Array(units.length);
const BATCH = 50;
for (let i = 0; i < texts.length; i += BATCH) {
  const batch = texts.slice(i, i + BATCH);
  const body = {
    requests: batch.map((t) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text: t.slice(0, 8000) }] },
      taskType: "RETRIEVAL_DOCUMENT",
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
    if ((res.status === 429 || res.status >= 500) && attempt <= 6) {
      const wait = attempt * 5000;
      console.log(`  HTTP ${res.status}, retry in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    console.error(`embed failed HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const data = await res.json();
  data.embeddings.forEach((e, j) => { vectors[i + j] = e.values; });
  process.stdout.write(`\r${Math.min(i + BATCH, texts.length)}/${texts.length}`);
}
console.log("");

// —— تكميم int8 بعد تطبيع الطول (مطابق لـ export-embeddings.mjs) ——
const count = vectors.length;
const scales = new Float32Array(count);
const data = new Int8Array(count * DIM);
for (let r = 0; r < count; r++) {
  const v = vectors[r];
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  let maxAbs = 0;
  for (let i = 0; i < DIM; i++) maxAbs = Math.max(maxAbs, Math.abs(v[i] / norm));
  const s = maxAbs / 127 || 1;
  scales[r] = s;
  for (let i = 0; i < DIM; i++) data[r * DIM + i] = Math.round(v[i] / norm / s);
}
let headerJson = JSON.stringify({ magic: "qkg-emb-1", model: MODEL, dim: DIM, count, quant: "int8", kind: "tafsil-units" });
while ((4 + Buffer.byteLength(headerJson)) % 4 !== 0) headerJson += " ";
const header = Buffer.from(headerJson);
const head = Buffer.alloc(4);
head.writeUInt32LE(header.length);
fs.writeFileSync(OUT, Buffer.concat([head, header, Buffer.from(scales.buffer), Buffer.from(data.buffer)]));
console.log(`→ ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB, ${count} vectors)`);
