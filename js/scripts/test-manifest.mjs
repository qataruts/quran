/**
 * مسبار دخان المانيفست — يمر على كل قيدٍ في rag-manifest.json فيتحقق آليًّا:
 * الملفات موجودة، البنى سليمة، المتجهات مطابقة الصفوف، والإحالات مسجلة في
 * التوجيه. يُشغَّل بعد كل إضافة كتاب/طبقة (وفي CI مستقبلًا) — فكلُّ قيدٍ جديد
 * يأتي بفحصه معه تلقائيًّا. لا يلمس Gemini — محلي صرف.
 *
 * usage: node js/scripts/test-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const PUB = "/Volumes/data/new-projects/quran/js/apps/studio/public";
const MAIN = "/Volumes/data/new-projects/quran/js/apps/studio/src/main.tsx";
const read = (f) => JSON.parse(fs.readFileSync(path.join(PUB, f), "utf-8"));
let fails = 0;
const ok = (cond, label) => { console.log(`  ${cond ? "✓" : "✗"} ${label}`); if (!cond) fails++; };

const m = read("rag-manifest.json");
console.log(`■ rag-manifest.json v${m.version} (${m.generated}) — ${m.books.length} كتابًا، ${m.layers.length} طبقات`);

// الكتب البعيدة (نمط الصوت) لا ملف محليًّا لها — تُفحص على مانيفست الاستضافة
const hostedPath = "/Volumes/data/new-projects/quran/hosted-data/manifest.json";
const hosted = fs.existsSync(hostedPath) ? JSON.parse(fs.readFileSync(hostedPath, "utf-8")) : null;
const hostedIds = new Set(Object.keys((hosted && hosted.books) || {}));

// ——— الكتب ———
for (const b of m.books) {
  if (b.remote) {
    ok(hostedIds.has(b.id), `كتاب ${b.id} (بعيد): مقيد في hosted-data/manifest.json`);
    continue;
  }
  const json = path.join(PUB, `rag-${b.id}.json`);
  const bin = path.join(PUB, `rag-${b.id}.bin`);
  const hasJson = fs.existsSync(json);
  ok(hasJson, `كتاب ${b.id}: rag-${b.id}.json موجود`);
  if (!hasJson) continue;
  const entries = JSON.parse(fs.readFileSync(json, "utf-8"));
  ok(Array.isArray(entries) && entries.length > 0 && typeof entries[0].ref === "string" && typeof entries[0].text === "string",
    `كتاب ${b.id}: بنية {ref,text} سليمة (${entries.length} مدخلة)`);
  if (b.entries) ok(entries.length === b.entries, `كتاب ${b.id}: العدد يطابق المانيفست (${b.entries})`);
  if (b.embedded) {
    ok(fs.existsSync(bin), `كتاب ${b.id}: rag-${b.id}.bin موجود (embedded)`);
    if (fs.existsSync(bin)) {
      const buf = fs.readFileSync(bin);
      const headerLen = buf.readUInt32LE(0);
      const header = JSON.parse(buf.subarray(4, 4 + headerLen).toString("utf-8"));
      ok(header.count === entries.length, `كتاب ${b.id}: التطابق الصفي bin↔json (${header.count}=${entries.length})`);
      const expect = 4 + headerLen + header.count * 4 + header.count * header.dim;
      ok(buf.length === expect, `كتاب ${b.id}: حجم bin مطابق للترويسة (dim=${header.dim})`);
    }
  }
}

// ——— الطبقات ———
const routes = fs.readFileSync(MAIN, "utf-8");
for (const l of m.layers) {
  ok(fs.existsSync(path.join(PUB, l.file)), `طبقة ${l.id}: الملف ${l.file} موجود`);
  ok(["manqul", "mahsub", "muwallad"].includes(l.grade), `طبقة ${l.id}: درجة سند صحيحة (${l.grade})`);
  ok(l.anchors?.length > 0 && l.desc?.length > 10, `طبقة ${l.id}: مرسًى ووصف`);
  ok(routes.includes(`path="${l.route}"`) || l.route === "/about", `طبقة ${l.id}: الإحالة ${l.route} مسجلة في التوجيه`);
}

// ——— بنى الطبقات الخمس (عينات) ———
const furuq = read("furuq.json");
ok(Array.isArray(furuq.furuq) && furuq.furuq[0].a && furuq.furuq[0].b && Array.isArray(furuq.furuq[0].ops), "furuq: بنية الأزواج {a,b,ops}");
const lexnet = read("lexnet.json");
ok(lexnet.roots && lexnet.fields && Object.values(lexnet.roots)[0].near, "lisan: بنية {roots{near},fields}");
const wujuh = read("wujuh.json");
ok(Array.isArray(wujuh.words) && wujuh.words[0].lemma && Array.isArray(wujuh.words[0].faces), "wujuh: بنية {words[{lemma,faces}]}");
const amthal = read("amthal.json");
ok(Array.isArray(amthal.parables) && Array.isArray(amthal.similes), "amthal: بنية {parables,similes}");
ok(m.stats?.layerStats?.furuq?.pairs === furuq.furuq.length, `stats: أزواج الفروق في الإحصاء تطابق الملف (${furuq.furuq.length})`);
ok(typeof m.stats?.morph?.meta?.words === "number", "stats: أعداد الصرف حاضرة");

console.log(fails ? `\n✗ ${fails} إخفاقًا` : "\n✓ المانيفست سليم كله");
process.exit(fails ? 1 : 0);
