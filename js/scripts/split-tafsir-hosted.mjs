/**
 * تعبئة التفاسير العريقة «على نمط الصوت»: من data/tafsir/<id>.jsonl إلى
 * hosted-data/tafsir/<id>/<NNN>.json — ملف لكل سورة ([{ref,text}...]) يُجلب
 * عند الطلب من استضافة ثابتة ويُخزَّن. الكتب الخمسة المحلية (rag-*) لا تُقسم.
 *
 * Usage: node scripts/split-tafsir-hosted.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(ROOT, "data/tafsir");
const OUT = path.join(ROOT, "..", "hosted-data", "tafsir");
const LOCAL = new Set(["muyassar", "jalalayn", "mukhtasar", "saadi", "aysar"]);

fs.mkdirSync(OUT, { recursive: true });
const manifest = { date: "2026-07-19", note: "مشكاة — التفاسير المرتبطة بالآيات، تُجلب سورةً سورةً عند الطلب (نمط الصوت)", books: {} };
let grand = 0;
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".jsonl"))) {
  const id = f.replace(".jsonl", "");
  if (LOCAL.has(id)) continue;
  const bySura = new Map();
  for (const line of fs.readFileSync(path.join(SRC, f), "utf-8").split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (!e.ref || !e.text) continue;
    const su = Number(e.ref.split(":")[0]);
    if (!su || su < 1 || su > 114) continue;
    (bySura.get(su) ?? bySura.set(su, []).get(su)).push(e);
  }
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  let size = 0, entries = 0;
  for (const [su, arr] of bySura) {
    arr.sort((a, b) => Number(a.ref.split(":")[1]) - Number(b.ref.split(":")[1]));
    const s = JSON.stringify(arr);
    fs.writeFileSync(path.join(dir, `${String(su).padStart(3, "0")}.json`), s);
    size += s.length;
    entries += arr.length;
  }
  manifest.books[id] = { suras: bySura.size, entries, mb: +(size / 1048576).toFixed(1) };
  grand += size;
  console.log(`${id}: ${entries} مدخلًا · ${bySura.size} سورة · ${(size / 1048576).toFixed(1)} م.ب`);
}
fs.writeFileSync(path.join(OUT, "..", "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`\nالإجمالي: ${(grand / 1048576).toFixed(0)} م.ب · ${Object.keys(manifest.books).length} كتابًا`);
