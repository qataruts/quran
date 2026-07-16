/**
 * بذرة السياق الحتمية — كاشفُ حدود وحدات السياق على فجوات الآيات الـ٦١٢٢ داخل السور.
 *
 * المصادر: مغلقةُ المشروع حصرًا (نص القرآن + QAC + تضمينات الآيات الموجودة).
 * لا ركوعاتَ ولا أيسرَ ولا تفصيلَ موضوعيًّا في السمات — تلك مراجعُ تحقُّقٍ وصفيٍّ فقط.
 *
 * الإشارات الإحدى عشرة لكل فجوة (بين الآية a والآية a+1):
 *  1. semDepth   — عمقُ هبوط التشابه الدلالي (TextTiling قياسي على نوافذ ±2 من متجهاتنا)
 *  2. rootBreak  — انقطاع تداخل الجذور احتواءً (بلا جذور شائعة DF>١٥٪، وبمادةٍ ≥٤ جذور)
 *  3. personShift— التفات: تحول توزيع الأشخاص (خطاب↔غيبة) بين الآيتين المتجاورتين (QAC)
 *  4. rhymeShift — نقطةُ تحول الروي: روي مستقر قبلُ يخالف رويًّا مستقرًّا بعدُ
 *  5. nida       — الآية التالية تفتتح بنداء (يا أيها/يا عباد/يا بني…)
 *  6. storyOpen  — فاتحة قصّ/استفتاح (وإذ/ولقد/واذكر/ألم تر/هل أتاك…)
 *  7. qul        — الآية التالية تفتتح بـ«قل»
 *  8. closer     — الآية السابقة تُختم بتعقيبٍ خاتم (إن في ذلك لآية/لآيات، لازمة الشعراء…)
 *  9. conjF      — فاتحةُ التالية بالفاء/ثم = عطفٌ واصل (وزن سالب)
 * 10. asyndeton  — فاتحةٌ بلا عاطف = استئناف (إشارة حدٍّ خفيفة)
 * 11. dialTurn   — «قال…» بعد سياق «قال» = دورُ حوارٍ داخل المشهد (وزن سالب)
 *
 * الدمج: تركيبٌ خطيٌّ بأوزانٍ **مبدئية معلنة** (تُعاد معايرتها على نصف العيّنة المجمّدة
 * بعد تجميدها بقرار المالك — لا ضبطَ على أي مرجعٍ منقول). التصنيف ثلاثي: حدٌّ واثق /
 * وصلٌ واثق / منطقة رمادية (للسرب).
 *
 * Writes: findings/siyaq-seed/{gaps.jsonl, SEED-REPORT.md, examples.md, sample-candidates.md}
 * Usage: node scripts/siyaq-seed.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT_DIR = path.join(ROOT, "findings/siyaq-seed");
fs.mkdirSync(OUT_DIR, { recursive: true });

const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });

// —— الآيات: نص، سورة/رقم، روي ——
const ayahs = db.prepare("SELECT ayah_id, surah_no s, ayah_no a, text_clean t FROM ayah ORDER BY ayah_id").all();
const AC = new Map(db.prepare("SELECT surah_no n, ayah_count c FROM surah").all().map((r) => [r.n, r.c]));
const surahName = new Map(db.prepare("SELECT surah_no n, name_ar nm FROM surah").all().map((r) => [r.n, r.nm]));
const idOf = new Map(ayahs.map((x) => [`${x.s}:${x.a}`, x.ayah_id]));
const strip = (t) => (t || "").replace(/[ً-ٰٟۖ-ۭـ]/g, "");
const royOf = (t) => { const w = strip(t).trim().split(/\s+/); const last = [...(w[w.length - 1] || "")]; return last[last.length - 1] || ""; };

// —— المتجهات (768 float32) ——
const VDIM = 768;
const vecs = new Map();
for (const r of db.prepare("SELECT ayah_id, vector FROM ayah_embedding WHERE dim=768").iterate()) {
  const v = new Float32Array(r.vector.buffer, r.vector.byteOffset, VDIM);
  const c = new Float32Array(VDIM);
  let n = 0;
  for (let i = 0; i < VDIM; i++) { c[i] = v[i]; n += v[i] * v[i]; }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < VDIM; i++) c[i] /= n;
  vecs.set(r.ayah_id, c);
}

// —— الجذور لكل آية (مع استبعاد الجذور الشائعة جدًّا: DF > ١٥٪ من الآيات — حتمي) ——
const rootDF = new Map();
for (const r of db.prepare("SELECT root_id, COUNT(DISTINCT ayah_id) c FROM word WHERE root_id IS NOT NULL GROUP BY root_id").iterate()) rootDF.set(r.root_id, r.c);
const STOP_DF = 6236 * 0.15;
const rootsOf = new Map();
for (const r of db.prepare("SELECT ayah_id, root_id FROM word WHERE root_id IS NOT NULL").iterate()) {
  if ((rootDF.get(r.root_id) ?? 0) > STOP_DF) continue;
  let s2 = rootsOf.get(r.ayah_id);
  if (!s2) rootsOf.set(r.ayah_id, (s2 = new Set()));
  s2.add(r.root_id);
}

// —— توزيع الأشخاص لكل آية (QAC segment.person) ——
const persOf = new Map(); // ayah_id -> [p1,p2,p3]
for (const r of db.prepare("SELECT ayah_id, person, COUNT(*) c FROM segment WHERE person IS NOT NULL GROUP BY ayah_id, person").iterate()) {
  let arr = persOf.get(r.ayah_id);
  if (!arr) persOf.set(r.ayah_id, (arr = [0, 0, 0]));
  arr[r.person - 1] += r.c;
}
db.close();

// —— أدوات النوافذ ——
const meanVec = (ids) => {
  const m = new Float32Array(VDIM);
  let k = 0;
  for (const id of ids) { const v = vecs.get(id); if (!v) continue; for (let i = 0; i < VDIM; i++) m[i] += v[i]; k++; }
  if (k) { let n = 0; for (let i = 0; i < VDIM; i++) n += m[i] * m[i]; n = Math.sqrt(n) || 1; for (let i = 0; i < VDIM; i++) m[i] /= n; }
  return m;
};
const cos = (x, y) => { let d = 0; for (let i = 0; i < VDIM; i++) d += x[i] * y[i]; return d; };
const unionRoots = (ids) => { const u = new Set(); for (const id of ids) for (const r of rootsOf.get(id) ?? []) u.add(r); return u; };
const persProfile = (ids) => {
  const p = [0, 0, 0];
  for (const id of ids) { const a = persOf.get(id); if (a) { p[0] += a[0]; p[1] += a[1]; p[2] += a[2]; } }
  const t = p[0] + p[1] + p[2];
  return t ? p.map((x) => x / t) : null;
};

// —— القوائم السطحية (مغلقة، معلنة) ——
const NIDA = ["يا أيها", "ياأيها", "يا عباد", "يا بني", "يا قوم", "يا نساء", "يا أهل"];
const STORY = ["وإذ ", "إذ قال", "ولقد ", "واذكر ", "اذكر ", "ألم تر", "هل أتاك", "وقال الملأ", "ونادى", "واتل "];
const CLOSER_STRONG = ["إن في ذلك لآية", "إن في ذلك لآيات", "وإن ربك لهو العزيز الرحيم", "إن ربك لهو العزيز الرحيم"];
const CLOSER_WEAK = ["لعلكم ت", "لعلهم ي", "خالدين فيها", "وذلك جزاء", "أولئك هم"];

// —— الفجوات وإشاراتها ——
const W = 2;
const gaps = [];
for (let s = 1; s <= 114; s++) {
  const n = AC.get(s);
  const simRow = [];
  for (let a = 1; a < n; a++) {
    const L = [], R = [];
    for (let d = 0; d < W; d++) { const la = a - d, ra = a + 1 + d; if (la >= 1) L.push(idOf.get(`${s}:${la}`)); if (ra <= n) R.push(idOf.get(`${s}:${ra}`)); }
    simRow.push(cos(meanVec(L), meanVec(R)));
  }
  // عمق TextTiling القياسي: تسلّقٌ ما دام الصعود متصلًا من الفجوة نحو القمتين
  for (let a = 1; a < n; a++) {
    const i = a - 1;
    const v = simRow[i];
    let lp = v;
    for (let j = i - 1; j >= 0 && simRow[j] >= lp; j--) lp = simRow[j];
    let rp = v;
    for (let j = i + 1; j < simRow.length && simRow[j] >= rp; j++) rp = simRow[j];
    const depth = (lp - v) + (rp - v);

    const L = [], R = [];
    for (let d = 0; d < W; d++) { const la = a - d, ra = a + 1 + d; if (la >= 1) L.push(idOf.get(`${s}:${la}`)); if (ra <= n) R.push(idOf.get(`${s}:${ra}`)); }
    // انقطاع الجذور: احتواءً لا Jaccard (يحيّد أثر طول الآية)، ولا يُحتسب إلا بمادة كافية
    const rl = unionRoots(L), rr = unionRoots(R);
    let inter = 0; for (const x of rl) if (rr.has(x)) inter++;
    const minSize = Math.min(rl.size, rr.size);
    const rootBreak = minSize >= 4 ? 1 - inter / minSize : 0;

    // التفات الضمائر: الآيتان المتجاورتان أولًا (أدق)، والنافذة احتياطًا عند الشحّ
    const pa1 = persProfile([idOf.get(`${s}:${a}`)]);
    const pa2 = persProfile([idOf.get(`${s}:${a + 1}`)]);
    const pl = pa1 ?? persProfile(L);
    const pr = pa2 ?? persProfile(R);
    const enough = (p, ids) => p && ids.reduce((t2, id) => { const x = persOf.get(id); return t2 + (x ? x[0] + x[1] + x[2] : 0); }, 0) >= 3;
    let personShift = 0;
    if (enough(pl, pa1 ? [idOf.get(`${s}:${a}`)] : L) && enough(pr, pa2 ? [idOf.get(`${s}:${a + 1}`)] : R)) {
      personShift = (Math.abs(pl[1] - pr[1]) + Math.abs(pl[2] - pr[2])) / 2; // خطاب↔غيبة جوهر الالتفات
    }

    const prevT = strip(ayahs[idOf.get(`${s}:${a}`) - 1].t);
    const nextT = strip(ayahs[idOf.get(`${s}:${a + 1}`) - 1].t);
    const roys = [a - 1 >= 1 ? royOf(ayahs[idOf.get(`${s}:${a - 1}`) - 1].t) : null, royOf(ayahs[idOf.get(`${s}:${a}`) - 1].t), royOf(ayahs[idOf.get(`${s}:${a + 1}`) - 1].t), a + 2 <= n ? royOf(ayahs[idOf.get(`${s}:${a + 2}`) - 1].t) : null];
    const rhymeShift = roys[1] !== roys[2] && (roys[0] === null || roys[0] === roys[1]) && (roys[3] === null || roys[2] === roys[3]) ? 1 : 0;

    const nida = NIDA.some((p) => nextT.startsWith(p)) ? 1 : 0;
    const story = STORY.some((p) => nextT.startsWith(p)) ? 1 : 0;
    const qul = /^قل\s/.test(nextT) ? 1 : 0;
    const tail = prevT.slice(-60);
    const closerS = CLOSER_STRONG.some((p) => tail.includes(p)) ? 1 : 0;
    const closerW = closerS ? 0 : CLOSER_WEAK.some((p) => tail.includes(p)) ? 1 : 0;

    // العطف والاستئناف (نحو كلاسيكي): فاتحةٌ بالفاء/ثم = عطفٌ واصل؛ فاتحةٌ بلا
    // عاطفٍ أصلًا = استئنافٌ (إشارةُ حدٍّ خفيفة). الواو تُترك حياديةً (تحتمل الوجهين).
    const first = nextT.split(/\s+/)[0] ?? "";
    const conjF = first.startsWith("ف") && first.length > 1 ? 1 : first === "ثم" ? 1 : 0;
    const asyndeton = !conjF && !first.startsWith("و") ? 1 : 0;

    // وصلُ الحوار: فاتحةُ «قال/قالوا/قالا/قالت» بعد سياقٍ فيه قولٌ أو سؤال = دورُ حوارٍ
    // داخل المشهد نفسه (تقلّبُ المتحاورين يخدع العمقَ الدلالي — الكهف ٦٦→٦٧ نموذجًا)
    const QSAID = /^(قال|قالوا|قالا|قالت)\s/;
    const dialTurn = QSAID.test(nextT) && /(^|\s)(قال|قالوا|قالا|قالت|يقول|قل|نكلم|تكلم)\s/.test(prevT) ? 1 : 0;

    // وصلُ التعليل والجزاء: فاتحةُ «ذلك/ذلكم بأن…»، «جزاءً بما…»، «أولئك…» تعقيبٌ
    // على ما قبلها لا سياقٌ جديد (نحو التذييل — إشارةُ وصلٍ راجحة)
    const taalil = /^(ذلك بأن|ذلكم بأن|ذلك جزاء|جزاء بما|أولئك )/.test(nextT) ? 1 : 0;

    gaps.push({ s, a, depth, rootBreak, personShift, rhymeShift, nida, story, qul, closerS, closerW, conjF, asyndeton, dialTurn, taalil });
  }
}
console.log(`فجوات: ${gaps.length}`);

// —— z-score للمتصلة ثم التركيب المبدئي المعلن ——
const z = (key) => {
  const vals = gaps.map((g) => g[key]);
  const mu = vals.reduce((x, y) => x + y, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mu) ** 2, 0) / vals.length) || 1;
  for (const g of gaps) g["z_" + key] = (g[key] - mu) / sd;
};
["depth", "rootBreak", "personShift"].forEach(z);

// أوزان مبدئية معلنة (مبرَّرة لغويًّا/بنائيًّا مسبقًا) — المعايرة الحقيقية على نصف
// العيّنة المجمّدة فقط، لا على أي مرجعٍ منقول
const W0 = { depth: 1.0, rootBreak: 0.6, personShift: 0.6, rhymeShift: 0.6, nida: 1.4, story: 1.1, qul: 0.7, closerS: 0.9, closerW: 0.3, conjF: -1.0, asyndeton: 0.4, dialTurn: -0.9, taalil: -0.8 };
for (const g of gaps) {
  g.score = W0.depth * g.z_depth + W0.rootBreak * g.z_rootBreak + W0.personShift * g.z_personShift +
    W0.rhymeShift * g.rhymeShift + W0.nida * g.nida + W0.story * g.story + W0.qul * g.qul +
    W0.closerS * g.closerS + W0.closerW * g.closerW + W0.conjF * g.conjF + W0.asyndeton * g.asyndeton + W0.dialTurn * g.dialTurn + W0.taalil * g.taalil;
}

// —— التصنيف الثلاثي المبدئي: حدّ واثق ~١٢٪ · رمادي ~٣١٪ · وصل واثق الباقي ——
const sorted = [...gaps].sort((x, y) => y.score - x.score);
const HI = sorted[Math.floor(gaps.length * 0.09)].score;
const LO = sorted[Math.floor(gaps.length * 0.43)].score;
for (const g of gaps) g.cls = g.score >= HI ? "boundary" : g.score >= LO ? "gray" : "continuation";
const counts = { boundary: 0, gray: 0, continuation: 0 };
for (const g of gaps) counts[g.cls]++;
console.log("الفئات:", JSON.stringify(counts));

// —— التحقق الوصفي على المراجع الثلاثة (منقولة — للتحقق لا للسمات) ——
const tafsil = JSON.parse(fs.readFileSync(path.join(ROOT, "js/data/tafsil/units.json"), "utf-8")).units;
const tafsilStarts = new Set(tafsil.map((u) => `${u.s}:${u.a1}`));
const aysar = JSON.parse(fs.readFileSync(path.join(ROOT, "js/apps/studio/public/rag-aysar.json"), "utf-8"));
const aysarStarts = new Set(aysar.map((e) => e.ref));
const db2 = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const rukuStarts = new Set();
{
  let prev = null;
  for (const r of db2.prepare("SELECT surah_no s, ayah_no a, ruku FROM ayah ORDER BY ayah_id").iterate()) {
    const key = `${r.s}/${r.ruku}`;
    if (key !== prev) rukuStarts.add(`${r.s}:${r.a}`);
    prev = key;
  }
}
db2.close();
const refs = { tafsil: tafsilStarts, aysar: aysarStarts, ruku: rukuStarts };
const agree = {};
for (const cls of ["boundary", "gray", "continuation"]) {
  const set = gaps.filter((g) => g.cls === cls);
  agree[cls] = { n: set.length };
  for (const [nm, st] of Object.entries(refs)) {
    const hit = set.filter((g) => st.has(`${g.s}:${g.a + 1}`)).length;
    agree[cls][nm] = +(hit / set.length).toFixed(3);
  }
}
console.log("توافق البدايات (نسبة كون الفجوة بدايةَ وحدةٍ في المرجع):");
console.table ? console.table(agree) : console.log(JSON.stringify(agree, null, 1));

// —— المخرجات ——
fs.writeFileSync(path.join(OUT_DIR, "gaps.jsonl"), gaps.map((g) => JSON.stringify(g)).join("\n") + "\n");

// أمثلة للمراجعة (بنصوصها)
const textOf = new Map(ayahs.map((x) => [`${x.s}:${x.a}`, x.t]));
const sample = (cls, k) => {
  const set = gaps.filter((g) => g.cls === cls);
  const step = Math.max(1, Math.floor(set.length / k));
  return set.filter((_, i) => i % step === 0).slice(0, k);
};
let ex = "# أمثلة البذرة — للمراجعة اليدوية\n\n(علامة ✂ = الفجوة المصنّفة)\n";
for (const cls of ["boundary", "continuation", "gray"]) {
  ex += `\n## ${cls}\n`;
  for (const g of sample(cls, 20)) {
    ex += `\n**${surahName.get(g.s)} ${g.a}✂${g.a + 1}** (score ${g.score.toFixed(2)}${g.nida ? " نداء" : ""}${g.story ? " قصّ" : ""}${g.qul ? " قل" : ""}${g.closerS ? " تعقيب" : ""}${g.rhymeShift ? " روي" : ""})\n`;
    ex += `- …${textOf.get(`${g.s}:${g.a}`).slice(-90)}\n- ${textOf.get(`${g.s}:${g.a + 1}`).slice(0, 90)}…\n`;
  }
}
fs.writeFileSync(path.join(OUT_DIR, "examples.md"), ex);

// مرشّحات العيّنة المجمّدة: إجماع المراجع الثلاثة (حدودًا وضدًّا) — للمالك أن يجمّد
const consensusB = gaps.filter((g) => tafsilStarts.has(`${g.s}:${g.a + 1}`) && aysarStarts.has(`${g.s}:${g.a + 1}`) && rukuStarts.has(`${g.s}:${g.a + 1}`));
const consensusC = gaps.filter((g) => !tafsilStarts.has(`${g.s}:${g.a + 1}`) && !aysarStarts.has(`${g.s}:${g.a + 1}`) && !rukuStarts.has(`${g.s}:${g.a + 1}`) && g.z_depth < 0);
const pick = (arr, k) => { const step = Math.max(1, Math.floor(arr.length / k)); return arr.filter((_, i) => i % step === 0).slice(0, k); };
let sc = `# مرشّحات العيّنة المجمّدة لوحدات السياق — لقرار المالك

**الحدود المرشّحة** (إجماع المراجع الثلاثة على بداية وحدة: التفصيل ∩ أيسر ∩ الركوعات
= ${consensusB.length} فجوة؛ نعرض ٥٠ موزّعة): يصادق المالك على ~٤٠.
**الضدّ المرشّح** (إجماعها الثلاثي على الوصل + تشابه دلالي فوق الوسط = ${consensusC.length}؛
نعرض ٣٠): يصادق على ~٢٠. ثم تُجمَّد بقفل commit وتُشقّ نصفين (ضبط/محجوب) قبل أي معايرة.

## حدود مرشّحة (السورة الآية✂الآية)
`;
for (const g of pick(consensusB, 50)) sc += `- ${surahName.get(g.s)} ${g.a}✂${g.a + 1} — «…${textOf.get(`${g.s}:${g.a}`).slice(-45)}» ← «${textOf.get(`${g.s}:${g.a + 1}`).slice(0, 45)}…»\n`;
sc += `\n## ضدٌّ مرشّح (وصلٌ بإجماع)\n`;
for (const g of pick(consensusC, 30)) sc += `- ${surahName.get(g.s)} ${g.a}✂${g.a + 1} — «…${textOf.get(`${g.s}:${g.a}`).slice(-45)}» ← «${textOf.get(`${g.s}:${g.a + 1}`).slice(0, 45)}…»\n`;
fs.writeFileSync(path.join(OUT_DIR, "sample-candidates.md"), sc);

// التقرير
const dist = {};
for (const g of gaps) { const k = [g.nida && "نداء", g.story && "قصّ", g.qul && "قل", g.closerS && "تعقيب قوي", g.rhymeShift && "روي"].filter(Boolean).join("+") || "—"; dist[k] = (dist[k] ?? 0) + 1; }
let rep = `# تقرير بذرة السياق الحتمية — v0 (أوزان مبدئية معلنة)

**التاريخ:** 2026-07-15 · **الفجوات:** ${gaps.length} · **السمات:** مصادر مغلقة حصرًا
(متجهاتنا + QAC + النص) — لا ركوعات ولا أيسر ولا تفصيل في السمات.

## الفئات المبدئية

| فئة | عدد | بداية وحدة في التفصيل | في أيسر | في الركوعات |
|---|---|---|---|---|
${["boundary", "gray", "continuation"].map((c) => `| ${c} | ${agree[c].n} | ${(agree[c].tafsil * 100).toFixed(1)}٪ | ${(agree[c].aysar * 100).toFixed(1)}٪ | ${(agree[c].ruku * 100).toFixed(1)}٪ |`).join("\n")}

قاعدة القراءة: المراجعُ منقولةٌ فالمقارنة وصفية — لكن فجوةً «حدًّا واثقًا» عندنا ينبغي
أن تكون بدايةَ وحدةٍ عند المراجع أكثر بكثير من فجوةٍ «وصلًا واثقًا». الفرق بين الصفين
هو صحةُ اتجاه البذرة قبل أي معايرة.

## الأوزان المبدئية (تُعاد معايرتها على نصف العيّنة المجمّدة فقط)
\`${JSON.stringify(W0)}\`
عتبتا الفئات: أعلى ١٢٪ حدٌّ واثق · ٣١٪ رمادي (للسرب) · الباقي وصل واثق.

## توزيع الإشارات السطحية على الفجوات
${Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## الملفات
- gaps.jsonl — كل فجوة بإشاراتها ودرجتها وفئتها
- examples.md — ٦٠ مثالًا بنصوصها للمراجعة اليدوية
- sample-candidates.md — مرشّحات العيّنة المجمّدة (إجماع المراجع الثلاثة) لقرار المالك
`;
fs.writeFileSync(path.join(OUT_DIR, "SEED-REPORT.md"), rep);
console.log("→ findings/siyaq-seed/{gaps.jsonl, SEED-REPORT.md, examples.md, sample-candidates.md}");
