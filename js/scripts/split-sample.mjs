/**
 * split-sample.mjs — the frozen consensus sample's deterministic tune/holdout split.
 * Rule (published in findings/kulliyat-v2/CONSENSUS-SAMPLE.md): md5 of the item's
 * first ref string "s:a"; first byte even → tune, odd → holdout. No human choice.
 *
 * Reads the inline ITEMS table (mirrors CONSENSUS-SAMPLE.md §1-2 exactly) and writes
 * findings/kulliyat-v2/sample.json. Any edit to ITEMS after the freeze commit is a
 * protocol violation — the freeze commit hash is the seal.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "findings", "kulliyat-v2", "sample.json");

// [id, refs, unit, expected, evidence]
//   unit: "aya" | "segment" (segment text lives in the MD; refs anchor it)
//   expected: "rule" (كلّية أو جامعة) | "rule-bab" (جامعة بابٍ متوقَّعة) | "tafsil"
const ITEMS = [
  // ——— القسم الأول: الموجِبات (٤٨) ———
  [1, "2:255", "aya", "rule", "أعظم آية — صحيح مسلم"],
  [2, "112:1-4", "aya", "rule", "ثلث القرآن — البخاري"],
  [3, "1:1-7", "aya", "rule", "السبع المثاني — البخاري"],
  [4, "99:7-8", "aya", "rule", "الجامعة الفاذّة — البخاري"],
  [5, "16:90", "aya", "rule", "أجمع آية — أثر ابن مسعود"],
  [6, "6:151-153", "aya", "rule", "وصية النبي ﷺ — الترمذي"],
  [7, "39:53", "aya", "rule", "أرجى آية — آثار"],
  [8, "103:1-3", "aya", "rule", "قول الشافعي"],
  [9, "65:2-3", "segment", "rule", "حديث أبي ذر"],
  [10, "2:286", "segment", "rule", "التكليف بالوسع"],
  [11, "2:185", "segment", "rule", "التيسير"],
  [12, "22:78", "segment", "rule", "نفي الحرج"],
  [13, "5:1", "segment", "rule", "لزوم العقود"],
  [14, "4:58", "segment", "rule", "الأمانة والقضاء بالعدل"],
  [15, "42:38", "segment", "rule", "الشورى"],
  [16, "2:275", "segment", "rule", "أصل المعاملات"],
  [17, "6:164", "segment", "rule", "شخصية المسؤولية — مقطع من آية «قل»"],
  [18, "53:38-39", "aya", "rule", "المسؤولية والسعي"],
  [19, "4:29", "segment", "rule", "التراضي"],
  [20, "2:256", "segment", "rule", "لا إكراه"],
  [21, "17:15", "segment", "rule", "لا عقوبة قبل البيان"],
  [22, "4:135", "segment", "rule", "العدل المطلق"],
  [23, "42:11", "segment", "rule", "التنزيه"],
  [24, "51:56", "aya", "rule", "غاية الخلق"],
  [25, "67:2", "aya", "rule", "الابتلاء"],
  [26, "21:107", "aya", "rule", "غاية الرسالة"],
  [27, "3:185", "segment", "rule", "كل نفس ذائقة الموت + إنما توفون"],
  [28, "4:48", "segment", "rule", "حد المغفرة"],
  [29, "30:30", "segment", "rule", "الفطرة"],
  [30, "3:26", "aya", "rule", "التدبير المطلق — تختبر «اللهمّ»"],
  [31, "2:143", "segment", "rule", "الوسطية"],
  [32, "7:199", "aya", "rule", "أجمع آية لمكارم الأخلاق"],
  [33, "17:23-39", "aya", "rule", "وصايا الإسراء"],
  [34, "31:13-19", "aya", "rule", "وصايا لقمان"],
  [35, "2:177", "aya", "rule", "آية البِرّ"],
  [36, "5:2", "segment", "rule", "التعاون"],
  [37, "49:13", "segment", "rule", "ميزان الكرامة"],
  [38, "13:11", "segment", "rule", "سنّة التغيير"],
  [39, "35:43", "segment", "rule", "اطّراد السنن"],
  [40, "41:46", "aya", "rule", "شخصية العمل ونفي الظلم — مثانٍ"],
  [41, "16:97", "aya", "rule", "جزاء العمل الصالح"],
  [42, "55:60", "aya", "rule", "قاعدة الجزاء — حصر استفهامي"],
  [43, "10:44", "aya", "rule", "نفي الظلم"],
  [44, "24:55", "segment", "rule", "سنّة الاستخلاف"],
  [45, "94:5-6", "aya", "rule", "قاعدة الفرج — مثانٍ داخلي"],
  [46, "2:153", "segment", "rule", "الاستعانة والمعيّة"],
  [47, "5:3", "segment", "rule", "إكمال الدين — قضية المقطع"],
  [48, "2:282", "segment", "rule-bab", "قاعدة التوثيق — جامعة بابٍ (يقابل #70)"],
  // ——— القسم الثاني: الضدّ (٢٢) ———
  // counterType: "narrative" = يجب أن يسقط بالبوابات نفسها ·
  //              "specific"  = قاعدةٌ ضيّقة: يجوز اجتيازُ البوابات، وواجبُ الإسقاط
  //                            على طبقة الشبكة (عتبة الانتشار) — الطبقة النهائية تفصيل
  [49, "12:4", "aya", "tafsil", "سرد رؤيا", "narrative"],
  [50, "12:36", "aya", "tafsil", "حوار السجن", "narrative"],
  [51, "12:62", "aya", "tafsil", "أمر سردي لمعيّن", "narrative"],
  [52, "28:23", "aya", "tafsil", "سقي موسى", "narrative"],
  [53, "18:77", "aya", "tafsil", "رحلة الخضر", "narrative"],
  [54, "27:22", "aya", "tafsil", "خبر الهدهد", "narrative"],
  [55, "26:63", "aya", "tafsil", "أمر واقعة معجزة", "narrative"],
  [56, "19:25", "aya", "tafsil", "أمر لمعيّن في واقعة — الضد الصعب", "narrative"],
  [57, "2:35", "aya", "tafsil", "أمر واقعة لآدم", "narrative"],
  [58, "37:102", "aya", "tafsil", "حوار الذبيح", "narrative"],
  [59, "33:37", "aya", "tafsil", "واقعة زيد", "narrative"],
  [60, "8:7", "aya", "tafsil", "واقعة بدر", "narrative"],
  [61, "9:40", "aya", "tafsil", "واقعة الغار", "narrative"],
  [62, "58:1", "aya", "tafsil", "واقعة المجادِلة", "narrative"],
  [63, "66:3", "aya", "tafsil", "واقعة الإسرار", "narrative"],
  [64, "48:18", "aya", "tafsil", "بيعة الشجرة", "narrative"],
  [65, "111:1-5", "aya", "tafsil", "نزلت في معيّن", "narrative"],
  [66, "80:1-2", "aya", "tafsil", "واقعة عين", "narrative"],
  [67, "105:1-5", "aya", "tafsil", "سرد واقعة", "narrative"],
  [68, "4:11", "aya", "tafsil", "تشريع تفصيلي — أنصبة", "specific"],
  [69, "24:31", "segment", "tafsil", "تعداد تفصيلي للستر", "specific"],
  [70, "2:282", "segment", "tafsil", "المقطع الإجرائي — يقابل #48", "specific"],
];

const firstRef = (refs) => {
  const m = refs.match(/^(\d+):(\d+)/);
  return `${m[1]}:${m[2]}`;
};
const half = (id, refs) => {
  // NOTE #48/#70 share a first-ref; keyed by "id|ref" would defeat the pairing test —
  // the PAIR must land in the same half so tune/holdout each see a coherent contrast.
  // Rule: hash the FIRST REF ONLY → same-verse items always share a half. Documented.
  const h = createHash("md5").update(firstRef(refs)).digest();
  return h[0] % 2 === 0 ? "tune" : "holdout";
};

const out = ITEMS.map(([id, refs, unit, expected, evidence, counterType]) => ({
  id, refs, unit, expected, evidence, ...(counterType ? { counterType } : {}), half: half(id, refs),
}));
const counts = { tune: 0, holdout: 0, tuneRule: 0, holdRule: 0, tuneTafsil: 0, holdTafsil: 0 };
for (const o of out) {
  counts[o.half]++;
  const isRule = o.expected !== "tafsil";
  if (o.half === "tune") isRule ? counts.tuneRule++ : counts.tuneTafsil++;
  else isRule ? counts.holdRule++ : counts.holdTafsil++;
}
writeFileSync(OUT, JSON.stringify({ frozen: true, splitRule: "md5(firstRef) first byte even→tune", items: out }, null, 1));
console.log(`sample.json: ${out.length} items → tune ${counts.tune} (rule ${counts.tuneRule} / tafsil ${counts.tuneTafsil}) · holdout ${counts.holdout} (rule ${counts.holdRule} / tafsil ${counts.holdTafsil})`);
