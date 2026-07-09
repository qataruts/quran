/** Copy the app database + meaning vectors into public/ for Vite (the FTS5
 *  sql.js wasm is bundled by Vite itself via the ?url import in main.ts).
 *  On CI/Vercel the raw db is absent — it is decompressed from the committed
 *  quran-app.db.gz instead. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, "public");
fs.mkdirSync(PUB, { recursive: true });

const db = path.resolve(HERE, "../../../quran-app.db");
const dbGz = path.resolve(HERE, "../../../quran-app.db.gz");
if (fs.existsSync(db)) {
  fs.copyFileSync(db, path.join(PUB, "quran-app.db"));
} else if (fs.existsSync(dbGz)) {
  fs.writeFileSync(path.join(PUB, "quran-app.db"), zlib.gunzipSync(fs.readFileSync(dbGz)));
  console.log("decompressed quran-app.db.gz");
} else {
  console.error("quran-app.db(.gz) not found — run: node ../../scripts/convert-to-app-db.mjs");
  process.exit(1);
}

const nb = path.resolve(HERE, "../../../quran-neighbors.bin");
if (fs.existsSync(nb)) fs.copyFileSync(nb, path.join(PUB, "quran-neighbors.bin"));

const emb = path.resolve(HERE, "../../../quran-embeddings.bin");
if (fs.existsSync(emb)) {
  fs.copyFileSync(emb, path.join(PUB, "quran-embeddings.bin"));
} else {
  console.warn("quran-embeddings.bin missing — Meaning search disabled (run export-embeddings.mjs)");
}
console.log("assets copied to public/");
