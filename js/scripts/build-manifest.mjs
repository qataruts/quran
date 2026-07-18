/**
 * مولّد rag-manifest.json — فهرسُ طبقات مشكاة وكتبها الذي يقرؤه سجل الطبقات
 * (src/layers.ts) عند الإقلاع. المانيفست هو «العائلات المفتوحة» عمليًّا:
 * إضافة كتابٍ = ملفا العقد + قيدٌ هنا (أو في OVERRIDES أدناه) — صفر تعديل كود.
 *
 * يقرأ الملفات الفعلية في public/ فيتحقق من وجودها ويستخرج أعدادها (كتل meta)
 * — فالمانيفست أيضًا فهرسُ الحقائق المعدودة سلفًا (ركن «لا عدَّ ذاتيًّا»).
 *
 * usage: node js/scripts/build-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const PUB = "/Volumes/data/new-projects/quran/js/apps/studio/public";
const read = (f) => JSON.parse(fs.readFileSync(path.join(PUB, f), "utf-8"));
const exists = (f) => fs.existsSync(path.join(PUB, f));

// ——— الكتب (عائلات مفتوحة: tafsir/asbab/gharib/i3rab/qiraat/lexicon) ———
// المصدر التاريخي BOOK_SOURCES في books.ts — من الآن يُولَّد هنا ويُقرأ منه.
const BOOKS = [
  { id: "muyassar", label: "التفسير الميسّر", genre: "tafsir" },
  { id: "jalalayn", label: "تفسير الجلالين", genre: "tafsir" },
  { id: "mukhtasar", label: "المختصر في التفسير", genre: "tafsir", author: "مركز تفسير" },
  { id: "saadi", label: "تيسير الكريم الرحمن", genre: "tafsir", author: "السعدي" },
  { id: "aysar", label: "أيسر التفاسير", genre: "tafsir", author: "أبو بكر الجزائري" },
  { id: "gharibmuyassar", label: "الميسّر في غريب القرآن", genre: "gharib" },
  { id: "seraj", label: "السراج في غريب القرآن", genre: "gharib", author: "الخضيري" },
  { id: "i3rabmuyassar", label: "الإعراب الميسّر", genre: "i3rab" },
  { id: "nashr", label: "النشر في القراءات العشر", genre: "qiraat", author: "ابن الجزري" },
  { id: "qiraat", label: "الموسوعة القرآنية للقراءات", genre: "qiraat" },
  { id: "wahidi", label: "أسباب نزول القرآن", genre: "asbab", author: "الواحدي" },
  { id: "muharrar", label: "المحرَّر في أسباب النزول", genre: "asbab", author: "المزيني" },
  { id: "mufradat", label: "المفردات في غريب القرآن", genre: "lexicon", author: "الراغب الأصفهاني" },
  { id: "maqayis", label: "مقاييس اللغة", genre: "lexicon", author: "ابن فارس" },
];

const books = BOOKS.map((b) => {
  const json = `rag-${b.id}.json`;
  if (!exists(json)) { console.error(`✗ كتاب بلا ملف: ${json}`); process.exit(1); }
  const entries = read(json).length;
  return { ...b, embedded: exists(`rag-${b.id}.bin`), entries };
});

// ——— الطبقات المحسوبة/المهيكلة (دفعة م١ — والقادم يُضاف قيودًا هنا) ———
const furuq = read("furuq.json");
const lexnet = read("lexnet.json");
const wujuh = read("wujuh.json");
const amthal = read("amthal.json");
const layerStats = read("layer-stats.json");
const morph = read("morph-stats.json");

const layers = [
  {
    id: "furuq", label: "فروق التنزيل", file: "furuq.json", grade: "mahsub",
    anchors: ["aya"], route: "/furuq",
    desc: "أزواج المتشابهات محاذاةً حرفية: موضعا الزوج وفئة الفرق ودرجة التطابق والكلمات المُبدلة/المزيدة",
    count: furuq.furuq.length,
  },
  {
    id: "lisan", label: "شبكة الجذور الدلالية (الفروق اللغوية)", file: "lexnet.json", grade: "mahsub",
    anchors: ["root"], route: "/lisan",
    desc: "لكل جذرٍ: مواضعُه وأقربُ الجذور إليه دلالةً وحقولُه المعنوية — لأسئلة الفروق بين الألفاظ المتقاربة",
    count: Object.keys(lexnet.roots).length,
  },
  {
    id: "wujuh", label: "الوجوه والنظائر", file: "wujuh.json", grade: "manqul",
    anchors: ["lemma"], route: "/wujuh",
    desc: "ألفاظٌ تعددت وجوهُ معانيها في المصحف: لكل وجهٍ آياتُه وشاهدُه المنقول من المعاجم",
    count: wujuh.words.length,
  },
  {
    id: "amthal", label: "الأمثال والتشبيهات", file: "amthal.json", grade: "mahsub",
    anchors: ["aya"], route: "/amthal",
    desc: "مواضع الأمثال المصرّحة والتشبيهات في المصحف",
    count: amthal.parables.length + amthal.similes.length,
  },
  {
    id: "stats", label: "إحصاءات مشكاة المحسوبة", file: "layer-stats.json", grade: "mahsub",
    anchors: ["term"], route: "/about",
    desc: "كل معدودٍ سلفًا: أعداد الطبقات والصرف والجذور والحروف — الأرقام تُنقل من هنا ولا تُعَدّ أبدًا",
  },
];

const manifest = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  books,
  layers,
  // حقائق معدودة سلفًا على مستوى المصحف — تظهر عبر طبقة stats
  stats: {
    layerStats,
    morph: { meta: morph.meta },
  },
};

fs.writeFileSync(path.join(PUB, "rag-manifest.json"), JSON.stringify(manifest, null, 1), "utf-8");
console.log(`✓ rag-manifest.json: ${books.length} كتابًا (${books.filter((b) => b.embedded).length} بمتجهات) + ${layers.length} طبقات`);
