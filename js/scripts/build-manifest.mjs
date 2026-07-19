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
// فهرس الاستضافة الثابتة (qataruts/mishkat-data) — مصدر أعداد الكتب البعيدة
const HOSTED = "/Volumes/data/new-projects/quran/hosted-data/manifest.json";
const hosted = fs.existsSync(HOSTED) ? JSON.parse(fs.readFileSync(HOSTED, "utf-8")).books : {};

// ——— الكتب (عائلات مفتوحة: tafsir/asbab/gharib/i3rab/qiraat/lexicon) ———
// المصدر التاريخي BOOK_SOURCES في books.ts — من الآن يُولَّد هنا ويُقرأ منه.
const BOOKS = [
  { id: "muyassar", label: "التفسير الميسّر", genre: "tafsir" },
  { id: "jalalayn", label: "تفسير الجلالين", genre: "tafsir" },
  { id: "mukhtasar", label: "المختصر في التفسير", genre: "tafsir", author: "مركز تفسير" },
  { id: "saadi", label: "تيسير الكريم الرحمن", genre: "tafsir", author: "السعدي" },
  { id: "aysar", label: "أيسر التفاسير", genre: "tafsir", author: "أبو بكر الجزائري" },
  // — التفاسير العريقة: تُجلب سورةً سورةً عند الطلب من qataruts/mishkat-data (نمط الصوت) —
  { id: "tabari", label: "جامع البيان", genre: "tafsir", author: "الطبري", remote: true },
  { id: "ibnkathir", label: "تفسير القرآن العظيم", genre: "tafsir", author: "ابن كثير", remote: true },
  { id: "qurtubi", label: "الجامع لأحكام القرآن", genre: "tafsir", author: "القرطبي", remote: true },
  { id: "razi", label: "مفاتيح الغيب", genre: "tafsir", author: "الرازي", remote: true },
  { id: "kashshaf", label: "الكشّاف", genre: "tafsir", author: "الزمخشري", remote: true },
  { id: "ibnatiyyah", label: "المحرَّر الوجيز", genre: "tafsir", author: "ابن عطية", remote: true },
  { id: "baghawi", label: "معالم التنزيل", genre: "tafsir", author: "البغوي", remote: true },
  { id: "ibnashur", label: "التحرير والتنوير", genre: "tafsir", author: "ابن عاشور", remote: true },
  { id: "shawkani", label: "فتح القدير", genre: "tafsir", author: "الشوكاني", remote: true },
  { id: "alusi", label: "روح المعاني", genre: "tafsir", author: "الألوسي", remote: true },
  { id: "abusuud", label: "إرشاد العقل السليم", genre: "tafsir", author: "أبو السعود", remote: true },
  { id: "durrmanthur", label: "الدر المنثور", genre: "tafsir", author: "السيوطي", remote: true },
  { id: "adwaalbayan", label: "أضواء البيان", genre: "tafsir", author: "الشنقيطي", remote: true },
  { id: "bahrmuhit", label: "البحر المحيط", genre: "tafsir", author: "أبو حيان", remote: true },
  { id: "nasafi", label: "مدارك التنزيل", genre: "tafsir", author: "النسفي", remote: true },
  { id: "qasimi", label: "محاسن التأويل", genre: "tafsir", author: "القاسمي", remote: true },
  { id: "baydawi", label: "أنوار التنزيل", genre: "tafsir", author: "البيضاوي", remote: true, note: "نسخة جزئية" },
  { id: "ibnabihatim", label: "التفسير بالمأثور", genre: "tafsir", author: "ابن أبي حاتم", remote: true, note: "نسخة جزئية" },
  { id: "uthaymeen", label: "تفسير العثيمين", genre: "tafsir", author: "ابن عثيمين", remote: true, note: "نسخة جزئية" },
  { id: "tadabbur", label: "الوقفات التدبرية", genre: "tafsir", author: "مركز تدبر", remote: true, note: "وقفات مختارة" },
  { id: "gharibmuyassar", label: "الميسّر في غريب القرآن", genre: "gharib" },
  { id: "seraj", label: "السراج في غريب القرآن", genre: "gharib", author: "الخضيري" },
  { id: "i3rabmuyassar", label: "الإعراب الميسّر", genre: "i3rab" },
  { id: "nashr", label: "النشر في القراءات العشر", genre: "qiraat", author: "ابن الجزري" },
  { id: "qiraat", label: "الموسوعة القرآنية للقراءات", genre: "qiraat" },
  { id: "wahidi", label: "أسباب نزول القرآن", genre: "asbab", author: "الواحدي" },
  { id: "muharrar", label: "المحرَّر في أسباب النزول", genre: "asbab", author: "المزيني" },
  // — كتب البيان (مصطلحيّة: فروق/وجوه/بصائر/متشابه/علوم — مداخلُها عناوين لا آيات) —
  // «كل كتابٍ مستخدمٍ في مشكاة يجب أن يكون في المكتبة» — توليدها build-bayan-books.mjs
  { id: "furuqaskari", label: "الفروق اللغوية", genre: "bayan", author: "أبو هلال العسكري" },
  { id: "basair", label: "بصائر ذوي التمييز", genre: "bayan", author: "الفيروزآبادي" },
  { id: "wujuhaskari", label: "الوجوه والنظائر", genre: "bayan", author: "أبو هلال العسكري" },
  { id: "damghani", label: "قاموس القرآن (الوجوه والنظائر)", genre: "bayan", author: "الدامغاني" },
  { id: "nuzha", label: "نزهة الأعين النواظر", genre: "bayan", author: "ابن الجوزي" },
  { id: "durra", label: "درة التنزيل وغرة التأويل", genre: "bayan", author: "الخطيب الإسكافي" },
  { id: "malak", label: "ملاك التأويل", genre: "bayan", author: "ابن الزبير الغرناطي" },
  { id: "burhan", label: "البرهان في علوم القرآن", genre: "bayan", author: "الزركشي" },
  { id: "itqan", label: "الإتقان في علوم القرآن", genre: "bayan", author: "السيوطي" },
  { id: "mufradat", label: "المفردات في غريب القرآن", genre: "lexicon", author: "الراغب الأصفهاني" },
  { id: "maqayis", label: "مقاييس اللغة", genre: "lexicon", author: "ابن فارس" },
];

const books = BOOKS.map((b) => {
  if (b.remote) {
    // بعيدٌ «نمطَ الصوت»: لا ملف محليًّا — وجودُه وعددُه من فهرس الاستضافة
    const h = hosted[b.id];
    if (!h) { console.error(`✗ كتاب بعيد ليس في فهرس الاستضافة: ${b.id}`); process.exit(1); }
    return { ...b, embedded: false, entries: h.entries };
  }
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
  {
    id: "bayan", label: "بطاقات البيان (تدبر لغة القرآن)", file: "bayan.json", grade: "mahsub",
    anchors: ["term", "root"], route: "/bayan",
    desc: "بطاقات منتقاة: خريطة استعمالٍ محسوبة (المواضع والصرف والمصاحبات وبصمة الافتراق) لكل زوجٍ أو صيغة، ومعها قراءاتُ الأعلام منقولةً منسوبة (grade القراءات: manqul)",
    count: read("bayan.json").cards.length,
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
const nRemote = books.filter((b) => b.remote).length;
console.log(`✓ rag-manifest.json: ${books.length} كتابًا (${books.length - nRemote} محليًّا منها ${books.filter((b) => b.embedded).length} بمتجهات، و${nRemote} بعيدًا نمطَ الصوت) + ${layers.length} طبقات`);
