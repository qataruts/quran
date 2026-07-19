/**
 * سجل طبقات مشكاة — قلب «نبراس الشامل» (findings/NIBRAS-SHAMIL-PLAN.md م١).
 *
 * يقرأ rag-manifest.json (المولَّد بـjs/scripts/build-manifest.mjs) فيعرف كل
 * كتبِ مشكاة وطبقاتِها: إضافةُ كتابٍ = ملفا العقد + قيدُ مانيفست — صفر تعديل
 * كود («العائلات المفتوحة»). ويقدّم لنبراس:
 *   - layersDigest(): موجزُ الطبقات الذي يُرسَل مع كل نداء ليُحقَن في دستور
 *     الخادم (فيعرف النموذجُ ما عندنا دون تضخيم الدستور بأسماء الكتب).
 *   - layerLookup(layer, anchor): استدعاء دقيق بمرسًى (آية/جذر/لمّة/مصطلح).
 *   - layerSearch(layer, query): بحث دلالي داخل كتابٍ أو عائلةٍ بعينها.
 * الأرقام كلها معدودة سلفًا (طبقة stats) — نبراس لا يَعُدّ أبدًا.
 */
import { searchBooks, bookTextAt, loadBookEntries, BOOK_SOURCES, GENRE_LABELS, refreshDerivedSources, type BookSource, type Genre } from "./books";
import { getAyahByLocation, getAyahByGlobalNo, surahNameAr, listSurahs } from "./db";
import { loadSiyaq, unitOf } from "./siyaq";
import { loadTabwib, loadTopics, topicBabsList } from "./tabwib";
import { loadEvidence, evidenceOf, gateLabel, REL_ORDER } from "./v2evidence";
import { similarOf } from "./similar";

export interface ManifestBook { id: string; label: string; genre: Genre; author?: string; embedded?: boolean; entries?: number; remote?: boolean; note?: string }
export interface ManifestLayer { id: string; label: string; file: string; grade: "manqul" | "mahsub" | "muwallad"; anchors: string[]; route: string; desc: string; count?: number }
interface Manifest {
  version: number;
  books: ManifestBook[];
  layers: ManifestLayer[];
  stats: { layerStats: Record<string, Record<string, unknown>>; morph: { meta: Record<string, unknown> } };
}

const STRIP = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const bare = (s: string): string => String(s).replace(STRIP, "").trim();
const AYA_RE = /^\d{1,3}:\d{1,3}$/;

// \u0645\u0631\u0633\u0649 \u0627\u0644\u0622\u064A\u0629 \u0628\u0627\u0644\u0635\u064A\u063A\u062A\u064A\u0646: \u00AB112:1\u00BB \u0623\u0648 \u00AB\u0627\u0644\u0625\u062E\u0644\u0627\u0635 1\u00BB \u0623\u0648 \u00AB\u0633\u0648\u0631\u0629 \u0627\u0644\u0625\u062E\u0644\u0627\u0635 \u0661\u00BB \u2014 \u064A\u064F\u062D\u0644 \u0647\u0646\u0627
// \u0641\u0644\u0627 \u064A\u062A\u0639\u062B\u0631 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0641\u064A \u062A\u062D\u0648\u064A\u0644 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0633\u0648\u0631 \u0623\u0631\u0642\u0627\u0645\u064B\u0627 (\u0639\u0644\u0629 \u062D\u064A\u0629: \u0627\u0644\u0625\u062E\u0644\u0627\u0635 \u0661 \u2192 1:5)
const AR_DIGITS: Record<string, string> = { "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4", "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9" };
const latinDigits = (s: string): string => s.replace(/[\u0660-\u0669]/g, (d) => AR_DIGITS[d]);
let surahNos: Map<string, number> | null = null;
async function resolveAyaAnchor(anchor: string): Promise<string | null> {
  const a = latinDigits(anchor.trim());
  if (AYA_RE.test(a)) return a;
  const m = /^(.+?)\s+(\d{1,3})$/.exec(bare(a).replace(/^\u0633\u0648\u0631\u0629\s+/, ""));
  if (!m) return null;
  if (!surahNos) {
    await listSurahs();
    surahNos = new Map();
    for (let s = 1; s <= 114; s++) {
      const n = bare(surahNameAr(s));
      surahNos.set(n, s);
      surahNos.set(n.replace(/^\u0627\u0644/, ""), s);
    }
  }
  const name = m[1].trim();
  const s = surahNos.get(name) ?? surahNos.get(name.replace(/^\u0627\u0644/, ""));
  return s ? `${s}:${Number(m[2])}` : null;
}

let manifest: Manifest | null = null;
let manifestLoading: Promise<Manifest | null> | null = null;

/** تحميل المانيفست (مرة واحدة) ومزامنة سجل الكتب معه — الكتب الجديدة تظهر تلقائيًّا */
export function ensureLayers(): Promise<Manifest | null> {
  if (manifest) return Promise.resolve(manifest);
  manifestLoading ??= fetch(`${import.meta.env.BASE_URL}rag-manifest.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m: Manifest | null) => {
      if (m?.books?.length && m?.layers) {
        // المانيفست مصدرُ الحقيقة: يستبدل قائمة الكتب المزروعة في الكود مكانيًّا
        // (المراجع المستوردة تبقى صالحة لأن المصفوفة نفسها تُعدَّل لا تُستبدل)
        BOOK_SOURCES.splice(0, BOOK_SOURCES.length, ...(m.books as BookSource[]));
        refreshDerivedSources();
        manifest = m;
      }
      // فشل التحميل لا يُخزَّن للأبد — المحاولة تُعاد في النداء التالي
      if (!manifest) manifestLoading = null;
      return manifest;
    })
    .catch(() => { manifestLoading = null; return null; });
  return manifestLoading;
}

// ——— الموجز المُرسَل للخادم (يُحقن قسمًا في دستور نبراس) ———
export interface LayerDigestEntry { id: string; label: string; grade: string; desc: string }

export function layersDigest(): LayerDigestEntry[] {
  if (!manifest) return [];
  const anchorEx = (a?: string): string =>
    a === "aya" ? "آية مثل 30:37" : a === "root" ? "جذر مثل سمو" : a === "lemma" ? "كلمة مثل استوى" : a === "surah" ? "سورة اسمًا أو رقمًا" : "مصطلح أو «عام»";
  // «bayan» يُبنى موحدًا أدناه (بطاقات + كتب) — فلا يمر من القالب العام
  const out: LayerDigestEntry[] = manifest.layers.filter((l) => l.id !== "bayan").map((l) => ({
    id: l.id,
    label: l.label,
    grade: l.grade,
    desc: `${l.desc}${l.count ? ` (${l.count} مدخلة)` : ""} — تُستدعى بـlayer_of(${l.id}, ${anchorEx(l.anchors[0])}${l.anchors.length > 1 ? ` أو ${anchorEx(l.anchors[1])}` : ""})`,
  }));
  // عائلتا الكتب المرجعيتان بمرسى آية: القراءات والإعراب
  for (const g of ["qiraat", "i3rab"] as Genre[]) {
    const books = manifest.books.filter((b) => b.genre === g);
    if (books.length) {
      out.push({
        id: g, label: `${GENRE_LABELS[g]} (${books.map((b) => b.label).join("، ")})`, grade: "manqul",
        desc: `نص ${GENRE_LABELS[g]} عند موضعٍ بعينه — تُستدعى بـlayer_of(${g}, آية مثل 18:97)`,
      });
    }
  }
  // قسم البيان موحدًا: البطاقات المحررة ثم الآلية ثم مداخل الكتب — نداء واحد
  const bayan = manifest.books.filter((b) => b.genre === "bayan" && !b.remote);
  const bayanCards = manifest.layers.find((l) => l.id === "bayan");
  if (bayan.length || bayanCards) {
    const withVec = bayan.filter((b) => b.embedded);
    out.push({
      id: "bayan", label: "قسم البيان (بطاقات تدبر اللغة + كتب البيان)", grade: "manqul",
      desc: `layer_of(bayan, مصطلح أو زوج مثل «أتى / جاء» أو «الفرق بين الخوف والخشية») يعيد: البطاقةَ المحررة (كشف محسوب + قراءات الأعلام منقولة) ثم الآليةَ التوليد (موسومة بلا تحرير) ثم مداخلَ الكتب (${bayan.map((b) => b.label).join("، ")})${withVec.length ? `؛ وsearch_layer(bayan, وصف غني) بحثٌ دلالي في نصوص المضمنة (${withVec.map((b) => b.id).join("، ")})` : ""}`,
    });
  }
  // البحث الدلالي المخصوص: داخل كتابٍ واحد أو عائلةٍ واحدة
  const embedded = manifest.books.filter((b) => b.embedded);
  out.push({
    id: "search", label: "بحثٌ دلالي داخل كتابٍ أو عائلةٍ بعينها", grade: "manqul",
    desc: `search_layer(المعرف, وصف غني) — معرفات الكتب: ${embedded.map((b) => b.id).join("، ")}؛ أو عائلة: tafsir، asbab، gharib، lexicon، bayan`,
  });
  return out;
}

// ——— نتيجة موحدة للأداتين ———
export interface LayerEntry { label: string; ref?: string; text: string; href?: string }
export interface LayerResult { layer: string; entries: LayerEntry[]; note?: string; error?: string }

const knownIds = (): string => {
  const ls = manifest?.layers.map((l) => l.id) ?? [];
  return [...ls, "qiraat", "i3rab", ...(manifest?.books.filter((b) => b.embedded).map((b) => b.id) ?? [])].join("، ");
};

// ——— محمّلات الطبقات (كسنّة siyaq: تحميل كسول ثم ذاكرة) ———
const cache = new Map<string, unknown>();
async function loadJson<T>(file: string): Promise<T | null> {
  if (cache.has(file)) return cache.get(file) as T;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}${file}?v=${__DATA_VERSION__}`);
    const j = r.ok ? await r.json() : null;
    cache.set(file, j);
    return j as T;
  } catch { cache.set(file, null); return null; }
}

// فروق التنزيل — أزواج المتشابهات محاذاةً
// أنماط ops الثلاثة (كما في src/furuq.ts): كلمة مشتركة | ["-",محذوفة] | ["+",مزيدة] | ["~",في_أ,في_ب]
type FuruqOp = string | ["-" | "+", string] | ["~", string, string];
interface FuruqPair { a: string; b: string; tier: string; cat: string; eq: number; ops: FuruqOp[] }
function furuqText(p: FuruqPair): string {
  const words = p.ops
    .map((o) => (Array.isArray(o) ? (o[0] === "~" ? `[${o[1]}↔${o[2]}]` : o[0] === "-" ? `[−${o[1]}]` : `[+${o[1]}]`) : o))
    .join(" ");
  return `الزوج ${p.a} ↔ ${p.b} — الفئة: ${p.cat}، التطابق ${Math.round(p.eq * 100)}٪ (المعقوفات: [أ↔ب] إبدال، [−] في أ فقط، [+] في ب فقط): ${words}`.slice(0, 600);
}
async function furuqLookup(anchor: string): Promise<LayerResult> {
  if (!AYA_RE.test(anchor)) return { layer: "furuq", entries: [], error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية مثل 30:37" };
  const data = await loadJson<{ furuq: FuruqPair[] }>("furuq.json");
  if (!data) return { layer: "furuq", entries: [], error: "تعذر تحميل الطبقة" };
  const hits = data.furuq.filter((p) => p.a === anchor || p.b === anchor).slice(0, 3);
  if (!hits.length) return { layer: "furuq", entries: [], note: `لا زوجَ متشابهٍ مسجلًا عند ${anchor} في طبقة فروق التنزيل` };
  // نصّا الآيتين يُرفقان مع الزوج كي ينسجهما نبراس دون بحثٍ إضافي
  const entries: LayerEntry[] = [];
  for (const p of hits) {
    const [va, vb] = await Promise.all([getAyahByLocation(p.a), getAyahByLocation(p.b)]);
    const ta = va ? `\nنص ${p.a}: ${va.textUthmani || va.textClean}` : "";
    const tb = vb ? `\nنص ${p.b}: ${vb.textUthmani || vb.textClean}` : "";
    entries.push({ label: "فروق التنزيل", ref: `${p.a} ↔ ${p.b}`, text: `${furuqText(p)}${ta}${tb}`.slice(0, 1100), href: "/furuq" });
  }
  return { layer: "furuq", entries };
}

// شبكة الجذور الدلالية (lexnet)
interface Lexnet { roots: Record<string, { occ: number; near: { r: string; s: number }[] }>; fields: { label: string; roots: string[] }[] }
async function lisanLookup(anchor: string): Promise<LayerResult> {
  const data = await loadJson<Lexnet>("lexnet.json");
  if (!data) return { layer: "lisan", entries: [], error: "تعذر تحميل الطبقة" };
  const root = bare(anchor);
  const rec = data.roots[root];
  if (!rec) return { layer: "lisan", entries: [], note: `الجذر «${root}» ليس في شبكة الجذور (${Object.keys(data.roots).length} جذرًا)` };
  const near = rec.near.slice(0, 8).map((n) => `${n.r} (${n.s.toFixed(2)})`).join("، ");
  const fields = data.fields.filter((f) => f.roots.includes(root)).map((f) => f.label).slice(0, 6).join("، ");
  return {
    layer: "lisan",
    entries: [{
      label: "شبكة الجذور الدلالية", ref: root, href: "/lisan",
      text: `الجذر ${root}: ${rec.occ} موضعًا في المصحف؛ أقرب الجذور إليه دلالةً: ${near}${fields ? `؛ حقوله المعنوية: ${fields}` : ""}`,
    }],
  };
}

// الوجوه والنظائر
interface WujuhWord { lemma: string; root: string; n: number; faces: { n: number; verses: string[]; sense: string }[]; quote?: string; source?: string }
async function wujuhLookup(anchor: string): Promise<LayerResult> {
  const data = await loadJson<{ words: WujuhWord[] }>("wujuh.json");
  if (!data) return { layer: "wujuh", entries: [], error: "تعذر تحميل الطبقة" };
  const q = bare(anchor);
  const w = data.words.find((x) => bare(x.lemma) === q || x.root === q || bare(x.lemma).includes(q));
  if (!w) return { layer: "wujuh", entries: [], note: `لا وجوهَ مؤسَّسةً للفظ «${anchor}» في طبقتنا (المؤسَّس: ${data.words.map((x) => x.lemma).join("، ")})` };
  const faces = w.faces.map((f, i) => `الوجه ${i + 1} (${f.verses.length} آية): ${f.sense} — من آياته: ${f.verses.slice(0, 4).join("، ")}`).join("\n");
  const quote = w.quote && w.source ? `\nالشاهد المنقول — ${w.source}: «${w.quote.slice(0, 260)}»` : "";
  return { layer: "wujuh", entries: [{ label: "الوجوه والنظائر", ref: w.lemma, href: "/wujuh", text: `${w.lemma} (جذر ${w.root}، ${w.n} موضعًا):\n${faces}${quote}`.slice(0, 900) }] };
}

// الأمثال والتشبيهات
async function amthalLookup(anchor: string): Promise<LayerResult> {
  const data = await loadJson<{ parables: string[]; similes: string[] }>("amthal.json");
  if (!data) return { layer: "amthal", entries: [], error: "تعذر تحميل الطبقة" };
  if (AYA_RE.test(anchor)) {
    const inP = data.parables.includes(anchor);
    const inS = data.similes.includes(anchor);
    const text = inP ? `الموضع ${anchor} من الأمثال المصرّحة في المصحف` : inS ? `الموضع ${anchor} من مواضع التشبيه في المصحف` : `الموضع ${anchor} ليس في مواضع الأمثال (${data.parables.length}) ولا التشبيهات (${data.similes.length}) المحسوبة`;
    return { layer: "amthal", entries: [{ label: "الأمثال والتشبيهات", ref: anchor, href: "/amthal", text }] };
  }
  return {
    layer: "amthal",
    entries: [{
      label: "الأمثال والتشبيهات", href: "/amthal",
      text: `الأمثال المصرّحة ${data.parables.length}: ${data.parables.slice(0, 12).join("، ")}…\nالتشبيهات ${data.similes.length}: ${data.similes.slice(0, 12).join("، ")}…`,
    }],
  };
}

// الإحصاءات — كل معدودٍ سلفًا (نبراس لا يَعُدّ أبدًا)
interface StatFact { k: string; v: string }
function statFacts(m: Manifest): StatFact[] {
  const L = m.stats.layerStats as Record<string, Record<string, unknown>>;
  const mm = m.stats.morph.meta as Record<string, unknown>;
  const facts: StatFact[] = [];
  const add = (k: string, v: unknown) => { if (v !== undefined && v !== null) facts.push({ k, v: String(v) }); };
  add("أزواج فروق التنزيل", (L.furuq as Record<string, unknown>)?.pairs);
  add("أبواب المصحف الموضوعي", (L.mawdui as Record<string, unknown>)?.sections);
  add("موضوعات المصحف الموضوعي", (L.mawdui as Record<string, unknown>)?.topics);
  add("آيات المصحف", (L.mawdui as Record<string, unknown>)?.verses);
  add("المقاطع الصرفية (QAC)", mm.segments);
  add("كلمات المصحف (QAC)", mm.words);
  add("الأفعال (QAC)", mm.verbs);
  add("الجذور (QAC)", mm.roots);
  add("اللمّات (QAC)", mm.lemmas);
  add("حروف المصحف (QAC)", mm.letters);
  for (const l of m.layers) if (l.count) add(`مدخلات طبقة ${l.label}`, l.count);
  for (const b of m.books) if (b.entries) add(`مدخلات ${b.label}`, b.entries);
  return facts;
}
// كلماتُ حشوٍ لا تميّز مفتاحًا («عدد أزواج…» تطابق «أزواج…»)
const STAT_STOP = new Set(["عدد", "اعداد", "أعداد", "احصاء", "إحصاء", "احصاءات", "إحصاءات", "كم", "مجموع", "اجمالي", "إجمالي", "كل", "في", "من"]);
async function statsLookup(anchor: string): Promise<LayerResult> {
  await ensureLayers();
  if (!manifest) return { layer: "stats", entries: [], error: "تعذر تحميل المانيفست" };
  const facts = statFacts(manifest);
  const toks = bare(anchor).split(/\s+/).filter((w) => w.length >= 3 && !STAT_STOP.has(w));
  // مطابقة بالكلمات (مع تجريد «ال») — وعند اللاتطابق تُعاد القائمة كلها ليختار
  // النموذجُ منها، فلا يقال «لا إحصاء» لرقمٍ موجودٍ بصياغةٍ أخرى
  const scored = facts
    .map((f) => ({ f, s: toks.filter((t) => f.k.includes(t) || f.k.includes(t.replace(/^ال/, ""))).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f);
  const hits = scored.length ? scored : facts;
  const note = scored.length
    ? "هذه أرقام محسوبة سلفًا في طبقات مشكاة — تُنقل كما هي وتُنسب إليها"
    : "لم يطابق المصطلحُ مفتاحًا بعينه — هذه كلُّ الإحصاءات المحسوبة المتاحة، خذ منها ما يجيب السؤال ولا تعُدَّ شيئًا بنفسك";
  return {
    layer: "stats",
    entries: [{ label: "إحصاءات مشكاة المحسوبة", text: hits.slice(0, 28).map((f) => `${f.k}: ${f.v}`).join(" · ").slice(0, 1200) }],
    note,
  };
}

// مطابقة المصطلحات بالكلمات: «الفرق بين أتى وجاء» تجد بطاقة «أتى / جاء»
// ومدخل «الفرق بين الإتيان والمجيء» — كلماتُ الحشو تسقط ويُحتسب انطباق البقية
const TERM_STOP = new Set(["الفرق", "فرق", "بين", "في", "من", "عن", "ما", "او", "أو", "معنى", "كلمة", "لفظ"]);
function termTokens(s: string): string[] {
  return bare(s).split(/\s+/).filter((w) => w.length >= 2 && !TERM_STOP.has(w));
}
function termScore(title: string, toks: string[]): number {
  const t = bare(title);
  return toks.filter((k) => t.includes(k) || (k.startsWith("و") && t.includes(k.slice(1)))).length;
}
/** أفضل عنصرٍ عنوانُه يطابق المرسى كلماتٍ — أو null */
function bestByTitle<T>(items: T[], titleOf: (x: T) => string, anchor: string): T | null {
  const q = bare(anchor);
  const direct = items.find((x) => bare(titleOf(x)).includes(q));
  if (direct) return direct;
  const toks = termTokens(anchor);
  if (!toks.length) return null;
  const need = Math.min(2, toks.length);
  let best: T | null = null;
  let bestScore = 0;
  for (const x of items) {
    const s = termScore(titleOf(x), toks);
    if (s >= need && s > bestScore) { best = x; bestScore = s; }
  }
  return best;
}

// كتب المداخل المصطلحية (البيان والمعاجم): الاستدعاء بعنوان المدخل لا بآية.
// حصة المصدر مقطعان والمجموع أربعة — ضوابط سياق خطة البيان الملزمة.
async function termBookLookup(sources: BookSource[], anchor: string, layerId: string): Promise<LayerResult> {
  const q = bare(anchor);
  if (q.length < 3) return { layer: layerId, entries: [], error: "المرسى عنوانُ مدخلٍ أو مصطلحٌ (ثلاثة أحرف فأكثر)" };
  const entries: LayerEntry[] = [];
  const toks = termTokens(anchor);
  const need = Math.min(2, Math.max(1, toks.length));
  for (const s of sources) {
    if (entries.length >= 4) break;
    const list = await loadBookEntries(s.id);
    if (!list) continue;
    const direct = list.filter((e) => bare(e.ref).includes(q));
    const scored = direct.length
      ? direct
      : list
          .map((e) => ({ e, sc: termScore(e.ref, toks) }))
          .filter((x) => x.sc >= need)
          .sort((a, b) => b.sc - a.sc)
          .map((x) => x.e);
    for (const h of scored.slice(0, 2)) entries.push({ label: s.label, ref: h.ref, text: h.text.slice(0, 900), href: "/tafasir" });
  }
  if (!entries.length) {
    return { layer: layerId, entries: [], note: `لا مدخلَ بعنوانٍ يطابق «${anchor}» في ${sources.length > 1 ? "كتب البيان المضمنة" : sources[0]?.label ?? layerId} — جرّب search_layer للبحث الدلالي في نصوصها، أو صياغةً أخرى للعنوان` };
  }
  return { layer: layerId, entries: entries.slice(0, 4) };
}

// عائلات الكتب المرجعية بالاستدعاء الموضعي (القراءات، الإعراب، …)
async function genreLookup(genre: Genre, anchor: string): Promise<LayerResult> {
  if (!AYA_RE.test(anchor)) return { layer: genre, entries: [], error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية مثل 18:97" };
  const sources = BOOK_SOURCES.filter((b) => b.genre === genre);
  const entries: LayerEntry[] = [];
  // نصُّ الآية يُرفق مع أول نتيجة كي ينسجه نبراس دون بحثٍ إضافي
  const aya = await getAyahByLocation(anchor);
  const ayaLine = aya ? `نص الآية ${anchor}: ${aya.textUthmani || aya.textClean}\n` : "";
  for (const s of sources) {
    const text = await bookTextAt(s.id, anchor);
    if (text) entries.push({ label: s.label, ref: anchor, text: `${entries.length === 0 ? ayaLine : ""}${text}`.slice(0, 900), href: `/read/${anchor.split(":")[0]}/${anchor.split(":")[1]}` });
  }
  if (!entries.length) return { layer: genre, entries: [], note: `لا نصَّ عند ${anchor} في كتب ${GENRE_LABELS[genre]} المضمّنة` };
  return { layer: genre, entries };
}

// الجسر العام لطبقات العقد: أي قيد مانيفست بملف rag-<layer>.json على قيد
// NIBRAS-DATA-CONTRACT ({id,layer,text,source,grade,anchor}) يُخدَم هنا دون
// كودٍ خاص — فطبقات البيان القادمة تعمل من يوم قيدها («صفر تعديل كود» فعلًا).
interface ContractEntry {
  text: string;
  source?: { work?: string; author?: string; locus?: string };
  anchor?: { aya?: string[]; root?: string[]; term?: string };
}
async function contractLookup(l: ManifestLayer, anchor: string): Promise<LayerResult> {
  const data = await loadJson<ContractEntry[]>(l.file);
  if (!Array.isArray(data)) return { layer: l.id, entries: [], error: `تعذر تحميل طبقة ${l.label}` };
  const q = bare(anchor);
  const hit = (e: ContractEntry): boolean => {
    const a = e.anchor ?? {};
    if (AYA_RE.test(q) && a.aya?.includes(q)) return true;
    if (a.root?.some((r) => bare(r) === q)) return true;
    if (a.term && (bare(a.term) === q || bare(a.term).includes(q))) return true;
    return false;
  };
  const hits = data.filter(hit).slice(0, 4);
  if (!hits.length) return { layer: l.id, entries: [], note: `لا مدخلةَ بمرسى «${anchor}» في طبقة ${l.label}` };
  return {
    layer: l.id,
    entries: hits.map((e) => ({
      label: e.source?.work ? `${l.label} — ${e.source.work}${e.source.author ? ` (${e.source.author})` : ""}` : l.label,
      ref: e.source?.locus ?? e.anchor?.term ?? e.anchor?.aya?.[0] ?? "",
      text: e.text.slice(0, 900),
      href: l.route,
    })),
  };
}

// ——— بطاقات البيان الموحدة: محررة ← آلية ← مداخل الكتب (درجات موسومة) ———
interface BayanCard { id: string; title: string; type: string; kashf: string; readings?: { src: string; quote: string }[] }
interface AutoSide { root: string; total: number; makki: number; madani: number; colloc?: [string, number][] }
interface AutoCard { id: string; head: string; roots: string[]; sides: AutoSide[]; reading?: { src: string; quote: string } }
async function bayanLookup(anchor: string): Promise<LayerResult> {
  const q = bare(anchor);
  if (q.length < 3) return { layer: "bayan", entries: [], error: "المرسى مصطلحٌ أو عنوان مدخل (ثلاثة أحرف فأكثر)" };
  const entries: LayerEntry[] = [];
  // ١) البطاقات المحررة (خريطة محسوبة + قراءات منقولة منسوبة)
  const edited = await loadJson<{ cards: BayanCard[] }>("bayan.json");
  const card = edited ? bestByTitle(edited.cards, (c) => `${c.title} ${c.kashf}`, anchor) : null;
  if (card) {
    const readings = (card.readings ?? []).slice(0, 2).map((r) => `${r.src}: «${r.quote.slice(0, 220)}»`).join("\n");
    entries.push({
      label: "بطاقة بيان محررة", ref: card.title, href: "/bayan",
      text: `${card.title}\nالكشف (محسوب من المصحف كله): ${card.kashf}${readings ? `\nقراءات الأعلام (منقولة):\n${readings}` : ""}`.slice(0, 1100),
    });
  }
  // ٢) البطاقات الآلية (حساب حتمي ونقل منسوب — بلا تحرير بشري ولا تعليل)
  if (entries.length < 2) {
    const auto = await loadJson<{ cards: AutoCard[] }>("bayan-auto.json");
    const ac = auto
      ? bestByTitle(auto.cards, (c) => `${c.head} ${c.roots.join(" ")}`, anchor)
      : null;
    if (ac) {
      const sides = ac.sides.map((s) => `${s.root}: ${s.total} موضعًا (مكي ${s.makki}/مدني ${s.madani})${s.colloc?.length ? `؛ أبرز مصاحباته: ${s.colloc.slice(0, 4).map(([w]) => w).join("، ")}` : ""}`).join(" · ");
      entries.push({
        label: "بطاقة بيان آلية التوليد (بلا تحرير)", ref: ac.head, href: "/bayan",
        text: `${ac.head}\nخريطتا الجذرين (محسوب): ${sides}${ac.reading ? `\nالنقل المنسوب — ${ac.reading.src}: «${ac.reading.quote.slice(0, 220)}»` : ""}`.slice(0, 1100),
      });
    }
  }
  // ٣) مداخل كتب البيان (منقول بعنوان المدخل)
  const books = await termBookLookup(BOOK_SOURCES.filter((b) => b.genre === "bayan" && !b.remote), anchor, "bayan");
  for (const e of books.entries) {
    if (entries.length >= 4) break;
    entries.push(e);
  }
  if (!entries.length) return { layer: "bayan", entries: [], note: books.note ?? `لا بطاقةَ ولا مدخلَ يطابق «${anchor}» في قسم البيان — جرّب search_layer(bayan, وصف) للبحث الدلالي في نصوص الكتب` };
  return { layer: "bayan", entries: entries.slice(0, 4) };
}

// ——— التبويب الموضوعي المحسوب: المصحف كله مبوَّب بوحداته (أبواب ← مواضيع) ———
async function tabwibLookup(anchor: string): Promise<LayerResult> {
  await Promise.all([loadSiyaq(), loadTabwib(), loadTopics()]);
  const babs = topicBabsList();
  if (!babs.length) return { layer: "tabwib", entries: [], error: "تعذر تحميل التبويب الموضوعي" };
  const a = anchor.trim();
  if (AYA_RE.test(a)) {
    const u = unitOf(a);
    if (!u) return { layer: "tabwib", entries: [], note: `لا وحدةَ سياقٍ لهذا الموضع` };
    const homes: string[] = [];
    for (const bab of babs) for (const t of bab.topics) if (t.units.includes(u.i)) homes.push(`${bab.name} ← ${t.name}`);
    return {
      layer: "tabwib",
      entries: [{
        label: "التبويب الموضوعي المحسوب", ref: `${surahNameAr(u.s)} ${u.a1}–${u.a2}`, href: "/tabwib",
        text: `الآية ${a} في وحدة «${u.name}» (${surahNameAr(u.s)} ${u.a1}–${u.a2})${homes.length ? `؛ موضعها من التبويب: ${homes.slice(0, 3).join(" · ")}` : "؛ لم تُسند وحدتها لموضوعٍ بعد"}`,
      }],
    };
  }
  const q = bare(a);
  for (const bab of babs) {
    const topic = bab.topics.find((t) => bare(t.name).includes(q));
    if (topic) {
      // أسماء عيّنة الوحدات من طبقة السياق
      const names: string[] = [];
      const { units } = (await loadSiyaq()) ?? { units: [] };
      for (const i of topic.units.slice(0, 8)) {
        const u = units[i];
        if (u) names.push(`«${u.name}» (${surahNameAr(u.s)} ${u.a1}–${u.a2})`);
      }
      return {
        layer: "tabwib",
        entries: [{
          label: "التبويب الموضوعي المحسوب", ref: `${bab.name} ← ${topic.name}`, href: "/tabwib",
          text: `موضوع «${topic.name}» في باب «${bab.name}»: ${topic.units.length} وحدةً، منها: ${names.join("، ")}`.slice(0, 1100),
        }],
      };
    }
    if (bare(bab.name).includes(q)) {
      return {
        layer: "tabwib",
        entries: [{
          label: "التبويب الموضوعي المحسوب", ref: bab.name, href: "/tabwib",
          text: `باب «${bab.name}»: ${bab.unitsCount} وحدةً في ${bab.topics.length} موضوعًا: ${bab.topics.map((t) => `${t.name} (${t.units.length})`).slice(0, 10).join("، ")}`.slice(0, 1100),
        }],
      };
    }
  }
  return { layer: "tabwib", entries: [], note: `لا بابَ ولا موضوعَ يطابق «${anchor}» — الأبواب: ${babs.map((b) => b.name).join("، ")}`.slice(0, 600) };
}

// ——— سمات الآية وصلاتها (الشارتان — شبكة v3 المفحوصة) ———
async function simatLookup(anchor: string): Promise<LayerResult> {
  if (!AYA_RE.test(anchor.trim())) return { layer: "simat", entries: [], error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية" };
  const a = anchor.trim();
  await loadEvidence();
  const units = evidenceOf(a);
  if (!units.length) return { layer: "simat", entries: [], note: `لا شاراتِ مسجلةً عند ${a} في الشبكة المفحوصة` };
  const parts: string[] = [];
  for (const u of units.slice(0, 3)) {
    const gates = u.g.map(gateLabel).slice(0, 4).join("، ");
    const rels: string[] = [];
    for (const rel of REL_ORDER) {
      const locs = u.links?.[rel];
      if (locs?.length) rels.push(`${rel}: ${locs.slice(0, 4).join("، ")}`);
    }
    parts.push(`${u.u === "aya" ? "الآية كاملة" : "وحدة منها"}${gates ? ` — صيغة قاعدة (بوابات: ${gates})` : ""}${rels.length ? `؛ ثبت تفرّعه — ${rels.join(" · ")}` : ""}${u.tw ? `؛ مثانٍ: ${u.tw}` : ""}`);
  }
  const [s, n] = a.split(":");
  return {
    layer: "simat",
    entries: [{ label: "سمات الآية وصلاتها (الشبكة المفحوصة)", ref: a, href: `/aya/${s}/${n}`, text: parts.join("\n").slice(0, 1100) }],
  };
}

// ——— مثلها: أقرب الآيات معنًى (محسوب سلفًا) ———
async function mithlLookup(anchor: string): Promise<LayerResult> {
  if (!AYA_RE.test(anchor.trim())) return { layer: "mithl", entries: [], error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية" };
  const a = anchor.trim();
  const doc = await getAyahByLocation(a);
  if (!doc) return { layer: "mithl", entries: [], note: `لا آيةَ بهذا الموضع` };
  const globalNo = Number(doc._id.slice(1));
  const neighbors = (await similarOf(globalNo)).slice(0, 6);
  if (!neighbors.length) return { layer: "mithl", entries: [], note: "لا جاراتِ مسجلةً لهذه الآية" };
  const lines: string[] = [];
  for (const n of neighbors) {
    const d = await getAyahByGlobalNo(n.ayahId);
    if (d) lines.push(`${d.location} (${surahNameAr(d.surahNo)} ${d.ayahNo}): ${(d.textUthmani || d.textClean).slice(0, 120)}`);
  }
  const [s, n] = a.split(":");
  return {
    layer: "mithl",
    entries: [{ label: "مثلها — أقرب الآيات معنًى", ref: a, href: `/read/${s}/${n}`, text: `أقرب الآيات معنًى إلى ${a}:\n${lines.join("\n")}`.slice(0, 1100) }],
  };
}

// ——— أطلس الفواصل: حرف الفاصلة ورويّها لكل سورة ———
interface FawasilData { letters: { letter: string; count: number; pct: number }[]; endings: { end: string; count: number }[]; surahs: { no: number; name: string; dom: string; domPct: number; ayahs: number }[] }
async function fawasilLookup(anchor: string): Promise<LayerResult> {
  const data = await loadJson<FawasilData>("fawasil.json");
  if (!data) return { layer: "fawasil", entries: [], error: "تعذر تحميل الأطلس" };
  const q = bare(anchor);
  const byNo = /^\d{1,3}$/.test(q) ? data.surahs.find((s) => s.no === Number(q)) : null;
  const byName = byNo ?? data.surahs.find((s) => bare(s.name) === q || bare(s.name).includes(q));
  if (byName) {
    return {
      layer: "fawasil",
      entries: [{
        label: "أطلس الفواصل", ref: byName.name, href: "/fawasil",
        text: `سورة ${byName.name} (${byName.ayahs} آية): حرف الفاصلة الغالب «${byName.dom}» بنسبة ${byName.domPct}٪`,
      }],
    };
  }
  const letters = data.letters.slice(0, 6).map((l) => `${l.letter} (${l.pct}٪)`).join("، ");
  const endings = data.endings.slice(0, 6).map((e) => `${e.end} (${e.count})`).join("، ");
  return {
    layer: "fawasil",
    entries: [{ label: "أطلس الفواصل", href: "/fawasil", text: `أغلب حروف الفواصل في المصحف: ${letters}؛ وأشيع خواتم الفواصل: ${endings}` }],
  };
}

/** الاستدعاء الدقيق بمرسًى — أداة layer_of */
export async function layerLookup(layer: string, anchor: string): Promise<LayerResult> {
  await ensureLayers();
  const id = layer.trim();
  // «الإخلاص 1» تُحل إلى «112:1» — وإن لم يكن المرسى آيةً بقي كما هو (مصطلحًا)
  const a = (await resolveAyaAnchor(anchor)) ?? anchor.trim();
  if (id === "furuq") return furuqLookup(a);
  if (id === "lisan") return lisanLookup(a);
  if (id === "wujuh") return wujuhLookup(a);
  if (id === "amthal") return amthalLookup(a);
  if (id === "stats") return statsLookup(a);
  if (id === "qiraat" || id === "i3rab") return genreLookup(id as Genre, a);
  if (id === "bayan") return bayanLookup(a);
  if (id === "tabwib" || id === "mawadi" || id === "mawdui") return tabwibLookup(a);
  if (id === "simat") return simatLookup(a);
  if (id === "mithl") return mithlLookup(a);
  if (id === "fawasil") return fawasilLookup(a);
  const book = BOOK_SOURCES.find((b) => b.id === id);
  if (book) {
    // كتب المداخل المصطلحية تُستدعى بعنوان المدخل؛ والموضعية بآية
    if (book.genre === "bayan" || book.genre === "lexicon") return termBookLookup([book], a, id);
    if (book.remote) return { layer: id, entries: [], note: `«${book.label}» من مكتبة الاستعراض الموسعة — يُقرأ في قسم التفاسير، وليس ضمن مصادر نبراس المضمنة` };
    if (!AYA_RE.test(a)) return { layer: id, entries: [], error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية أو «اسم_السورة رقم_الآية»" };
    const text = await bookTextAt(book.id, a);
    return text
      ? { layer: id, entries: [{ label: book.label, ref: a, text: text.slice(0, 700) }] }
      : { layer: id, entries: [], note: `لا نصَّ عند ${a} في ${book.label}` };
  }
  const contract = manifest?.layers.find((l) => l.id === id);
  if (contract) return contractLookup(contract, anchor);
  return { layer: id, entries: [], error: `طبقة غير معروفة «${id}» — المتاح: ${knownIds()}` };
}

/** البحث الدلالي داخل كتابٍ أو عائلةٍ بعينها — أداة search_layer */
export async function layerSearch(layer: string, query: string, k = 6): Promise<LayerResult> {
  await ensureLayers();
  const id = layer.trim();
  const inGenre = ["tafsir", "asbab", "gharib", "lexicon", "qiraat", "i3rab", "bayan"].includes(id)
    ? BOOK_SOURCES.filter((b) => b.genre === (id as Genre) && b.embedded).map((b) => b.id)
    : null;
  const book = BOOK_SOURCES.find((b) => b.id === id);
  const sources = inGenre ?? (book?.embedded ? [book.id] : null);
  if (!sources) {
    if (book) return { layer: id, entries: [], error: `«${book.label}» بلا متجهات بحثٍ — استعمل layer_of(${id}, آية) للاستدعاء الموضعي` };
    if (manifest?.layers.some((l) => l.id === id)) return { layer: id, entries: [], error: `طبقة «${id}» تُستدعى بمرسًى عبر layer_of لا بالبحث الدلالي` };
    return { layer: id, entries: [], error: `طبقة غير معروفة «${id}» — المتاح: ${knownIds()}` };
  }
  if (!sources.length) return { layer: id, entries: [], note: "لا كتبَ بمتجهاتٍ في هذه العائلة بعد" };
  const hits = await searchBooks(query.trim().slice(0, 800), sources, Math.min(k, 8));
  const label = (sid: string) => BOOK_SOURCES.find((b) => b.id === sid)?.label ?? sid;
  // حصة المصدر الواحد مقطعان في النتيجة الواحدة (ضوابط سياق خطة البيان)
  const perSource = new Map<string, number>();
  const capped = hits.filter((h) => {
    const n = (perSource.get(h.source) ?? 0) + 1;
    perSource.set(h.source, n);
    return n <= 2;
  });
  return { layer: id, entries: capped.map((h) => ({ label: label(h.source), ref: h.ref, text: h.text.slice(0, 500) })) };
}

// مطبِّع الصيغ (كلمة مكتوبة → جذرها) موجودٌ أصلًا في searchForms.ts
// (resolveRootReady) بتطبيعه الصحيح المطابق لمولّد الملف — لا نكرره هنا.
