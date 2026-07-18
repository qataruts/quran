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
import { searchBooks, bookTextAt, BOOK_SOURCES, GENRE_LABELS, refreshDerivedSources, type BookSource, type Genre } from "./books";
import { getAyahByLocation } from "./db";

export interface ManifestBook { id: string; label: string; genre: Genre; author?: string; embedded?: boolean; entries?: number }
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
  const out: LayerDigestEntry[] = manifest.layers.map((l) => ({
    id: l.id,
    label: l.label,
    grade: l.grade,
    desc: `${l.desc}${l.count ? ` (${l.count} مدخلة)` : ""} — تُستدعى بـlayer_of(${l.id}, ${l.anchors[0] === "aya" ? "آية مثل 30:37" : l.anchors[0] === "root" ? "جذر مثل سمو" : l.anchors[0] === "lemma" ? "كلمة مثل استوى" : "مصطلح أو «عام»"})`,
  }));
  // عائلتا الكتب المرجعيتان الجديدتان على نبراس: القراءات والإعراب (استدعاء بآية)
  for (const g of ["qiraat", "i3rab"] as Genre[]) {
    const books = manifest.books.filter((b) => b.genre === g);
    if (books.length) {
      out.push({
        id: g, label: `${GENRE_LABELS[g]} (${books.map((b) => b.label).join("، ")})`, grade: "manqul",
        desc: `نص ${GENRE_LABELS[g]} عند موضعٍ بعينه — تُستدعى بـlayer_of(${g}, آية مثل 18:97)`,
      });
    }
  }
  // البحث الدلالي المخصوص: داخل كتابٍ واحد أو عائلةٍ واحدة
  const embedded = manifest.books.filter((b) => b.embedded);
  out.push({
    id: "search", label: "بحثٌ دلالي داخل كتابٍ أو عائلةٍ بعينها", grade: "manqul",
    desc: `search_layer(المعرف, وصف غني) — معرفات الكتب: ${embedded.map((b) => b.id).join("، ")}؛ أو عائلة: tafsir، asbab، gharib، lexicon`,
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
async function statsLookup(anchor: string): Promise<LayerResult> {
  await ensureLayers();
  if (!manifest) return { layer: "stats", entries: [], error: "تعذر تحميل المانيفست" };
  const facts = statFacts(manifest);
  const q = bare(anchor);
  const generic = !q || ["عام", "الكل", "كل", "إحصاء", "احصاء"].includes(q);
  const hits = generic ? facts.slice(0, 28) : facts.filter((f) => f.k.includes(q));
  if (!hits.length) return { layer: "stats", entries: [], note: `لا إحصاءَ محسوبًا عندنا يطابق «${anchor}» — والقاعدة: ما لا إحصاء له لا يُعَدّ ولا يُقدَّر` };
  return {
    layer: "stats",
    entries: [{ label: "إحصاءات مشكاة المحسوبة", text: hits.map((f) => `${f.k}: ${f.v}`).join(" · ").slice(0, 1200) }],
    note: "هذه أرقام محسوبة سلفًا في طبقات مشكاة — تُنقل كما هي وتُنسب إليها",
  };
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

/** الاستدعاء الدقيق بمرسًى — أداة layer_of */
export async function layerLookup(layer: string, anchor: string): Promise<LayerResult> {
  await ensureLayers();
  const id = layer.trim();
  if (id === "furuq") return furuqLookup(anchor.trim());
  if (id === "lisan") return lisanLookup(anchor);
  if (id === "wujuh") return wujuhLookup(anchor);
  if (id === "amthal") return amthalLookup(anchor.trim());
  if (id === "stats") return statsLookup(anchor);
  if (id === "qiraat" || id === "i3rab") return genreLookup(id as Genre, anchor.trim());
  const book = BOOK_SOURCES.find((b) => b.id === id);
  if (book) {
    if (!AYA_RE.test(anchor.trim())) return { layer: id, entries: [], error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية" };
    const text = await bookTextAt(book.id, anchor.trim());
    return text
      ? { layer: id, entries: [{ label: book.label, ref: anchor.trim(), text: text.slice(0, 700) }] }
      : { layer: id, entries: [], note: `لا نصَّ عند ${anchor} في ${book.label}` };
  }
  const contract = manifest?.layers.find((l) => l.id === id);
  if (contract) return contractLookup(contract, anchor);
  return { layer: id, entries: [], error: `طبقة غير معروفة «${id}» — المتاح: ${knownIds()}` };
}

/** البحث الدلالي داخل كتابٍ أو عائلةٍ بعينها — أداة search_layer */
export async function layerSearch(layer: string, query: string, k = 6): Promise<LayerResult> {
  await ensureLayers();
  const id = layer.trim();
  const inGenre = ["tafsir", "asbab", "gharib", "lexicon", "qiraat", "i3rab"].includes(id)
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
  return { layer: id, entries: hits.map((h) => ({ label: label(h.source), ref: h.ref, text: h.text.slice(0, 500) })) };
}

// مطبِّع الصيغ (كلمة مكتوبة → جذرها) موجودٌ أصلًا في searchForms.ts
// (resolveRootReady) بتطبيعه الصحيح المطابق لمولّد الملف — لا نكرره هنا.
