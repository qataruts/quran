/**
 * اختبار حيّ لـ/api/assist (نبراس v3 — الباحث الناسج): يستورد المعالج مباشرةً
 * (edge handler يعمل في Node 22)، وينفّذ الأدوات بنتائج حقيقية من quran-kg.db
 * وsiyaq-units.json وrag-muyassar/rag-saadi — ثم يطبع مسار الأدوات والجواب
 * النهائي، ويُجري فحوصًا آلية: القاعدة الذهبية (كل ﴿…﴾ حرفيٌّ من نتيجة أداة)،
 * والنسجُ (الآية داخل جملةٍ لا في قائمة)، والإسناد (قول مفسِّرٍ منسوب)،
 * ولا قائمةَ آياتٍ مقذوفةً في ذيل الجواب.
 *
 * usage: node test-assist.mjs [ASSIST_FINAL_MODEL] [أرقام الاختبارات مثل 6,7]
 *   node test-assist.mjs                          ← الافتراضي (المرحلتان كما في الكود)
 *   node test-assist.mjs gemini-2.5-flash         ← مرحلة واحدة (flash فقط)
 *   node test-assist.mjs gemini-2.5-pro 6,7       ← اختباران فقط على pro
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const ROOT = "/Volumes/data/new-projects/quran";
const env = fs.readFileSync(`${ROOT}/.env`, "utf-8");
process.env.GEMINI_API_KEY = env.match(/GEMINI_API_KEY=(.+)/)[1].trim();
if (process.argv[2]) process.env.ASSIST_FINAL_MODEL = process.argv[2];
const ONLY = process.argv[3] ? new Set(process.argv[3].split(",").map(Number)) : null;

const { default: handler } = await import(`${ROOT}/js/apps/studio/api/assist.js`);

// ——— بيانات حقيقية ———
const db = new DatabaseSync(`${ROOT}/quran-kg.db`, { readOnly: true });
const verse = (s, a) => db.prepare("SELECT text_clean t FROM ayah WHERE surah_no=? AND ayah_no=?").get(s, a)?.t;
// أدوات البحث في المتصفح تعيد الرسم العثماني (muinTools: textUthmani || textClean)
const verseU = (s, a) => db.prepare("SELECT text_uthmani t FROM ayah WHERE surah_no=? AND ayah_no=?").get(s, a)?.t;
const SURAHS = new Map(db.prepare("SELECT surah_no n, name_ar nm FROM surah").all().map((r) => [r.n, r.nm]));
const refName = (ref) => { const [s, a] = ref.split(":"); return `${SURAHS.get(Number(s))} ${a}`; };
const ayahsOf = (refs) => refs.map((r) => { const [s, a] = r.split(":").map(Number); return { ref: r, surah: refName(r), text: verseU(s, a) || verse(s, a) }; });

const SABR = ayahsOf(["2:153", "2:155", "3:200", "39:10", "2:45"]);
const SHUKR = ayahsOf(["14:7", "2:152", "31:12", "16:114"]);
const muyassar = JSON.parse(fs.readFileSync(`${ROOT}/js/apps/studio/public/rag-muyassar.json`, "utf-8"));
const saadi = JSON.parse(fs.readFileSync(`${ROOT}/js/apps/studio/public/rag-saadi.json`, "utf-8"));
const sourceAt = (arr, ref) => arr.find((e) => e.ref === ref)?.text ?? null;

// وحدات السياق الحقيقية (كما ينفّذها المتصفح من siyaq.ts)
const units = JSON.parse(fs.readFileSync(`${ROOT}/js/apps/studio/public/siyaq-units.json`, "utf-8"))
  .units.map(([s, a1, a2, name], i) => ({ i, s, a1, a2, name }));
const unitFor = (ref) => { const [s, a] = ref.split(":").map(Number); return units.find((u) => u.s === s && u.a1 <= a && u.a2 >= a) ?? null; };
const spanText = (u, cap = 1600) => {
  const parts = [];
  for (let a = u.a1; a <= u.a2; a++) parts.push(verse(u.s, a) ?? "");
  const t = parts.join(" ۝ ");
  return t.length > cap ? `${t.slice(0, cap)}…` : t;
};
const pack = (u) => ({ range: `${u.s}:${u.a1}-${u.a2}`, span: `${SURAHS.get(u.s)} ${u.a1}–${u.a2}`, unitName: u.name, text: spanText(u) });

// ——— منفّذ أدوات الاختبار (يحاكي المتصفح بصدق) ———
function runTool(name, args) {
  if (name === "search_meaning") {
    const q = String(args.query ?? "");
    const list = /شكر|نعم|حمد/.test(q) ? SHUKR
      : /موسى|الخضر|خضر/.test(q) ? ayahsOf(["18:60", "18:65", "18:66"])
      : /صبر|بلاء|ابتلاء|مصيبة|استعانة/.test(q) ? SABR : SABR.slice(0, 2);
    return { ayahs: list };
  }
  if (name === "search_root") {
    return { roots: [{ root: "صبر", occurrences: 103, sense: "المفردات: الصبرُ الإمساكُ في ضيق... حبسُ النفس على ما يقتضيه العقل والشرع" }], ayahs: SABR.slice(0, 3) };
  }
  if (name === "tafsir_of") {
    const ref = String(args.ref ?? "");
    if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return { error: "ref يجب أن يكون بصيغة رقم_السورة:رقم_الآية" };
    const [s, a] = ref.split(":").map(Number);
    if (!verse(s, a)) return { ref, found: false, note: "لا آيةَ بهذا الرقم — راجع الموضع" };
    const entries = [];
    const m = sourceAt(muyassar, ref);
    if (m) entries.push({ source: "التفسير الميسر", text: m.slice(0, 700) });
    const sd = sourceAt(saadi, ref);
    if (sd) entries.push({ source: "تفسير السعدي", text: sd.slice(0, 700) });
    return entries.length ? { ref, surah: refName(ref), entries } : { ref, found: false, note: "لا نصَّ عند هذا الموضع" };
  }
  if (name === "asbab_of") return { ref: args.ref, found: false, note: "لا نصَّ عند هذا الموضع في المصادر المضمّنة" };
  if (name === "search_books") return { entries: [] };
  if (name === "context_of") {
    const ref = String(args.ref ?? "");
    if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return { error: "ref يجب أن يكون بصيغة رقم_السورة:رقم_الآية" };
    const u = unitFor(ref);
    return u ? { ref, passage: pack(u) } : { ref, found: false, note: "لا وحدةَ لهذا الموضع" };
  }
  if (name === "search_passages") {
    const q = String(args.query ?? "");
    const picks = /موسى|الخضر|خضر/.test(q) ? [unitFor("18:65")] : /صبر|بلاء|استعانة/.test(q) ? [unitFor("2:153")] : [unitFor("2:153"), unitFor("18:65")];
    return { passages: picks.filter(Boolean).map(pack) };
  }
  if (name === "compose_draft") return { ok: true, shown: true, opening: "الحمد لله رب العالمين..." };
  if (name === "layer_of") return layerOfMock(String(args.layer ?? ""), String(args.anchor ?? ""));
  if (name === "search_layer") return searchLayerMock(String(args.layer ?? ""), String(args.query ?? ""));
  return { error: "أداة غير معروفة" };
}

// ——— سجل الطبقات (مرآة src/layers.ts على الملفات الحقيقية) ———
const PUB = `${ROOT}/js/apps/studio/public`;
const pubJson = (f) => JSON.parse(fs.readFileSync(`${PUB}/${f}`, "utf-8"));
const manifest = pubJson("rag-manifest.json");
const bare = (s) => String(s).replace(TASHKEEL, "").trim();
const AYA_RE = /^\d{1,3}:\d{1,3}$/;

/** موجز الطبقات المرسل للخادم — كما يبنيه layersDigest في المتصفح */
function layersDigest(m = manifest) {
  const anchorEx = (a) => (a === "aya" ? "آية مثل 30:37" : a === "root" ? "جذر مثل سمو" : a === "lemma" ? "كلمة مثل استوى" : "مصطلح أو «عام»");
  const out = m.layers.map((l) => ({
    id: l.id, label: l.label, grade: l.grade,
    desc: `${l.desc}${l.count ? ` (${l.count} مدخلة)` : ""} — تُستدعى بـlayer_of(${l.id}, ${anchorEx(l.anchors[0])})`,
  }));
  for (const g of ["qiraat", "i3rab"]) {
    const books = m.books.filter((b) => b.genre === g);
    if (books.length) out.push({ id: g, label: books.map((b) => b.label).join("، "), grade: "manqul", desc: `تُستدعى بـlayer_of(${g}, آية مثل 18:97)` });
  }
  const embedded = m.books.filter((b) => b.embedded);
  out.push({ id: "search", label: "بحث دلالي داخل كتاب أو عائلة بعينها", grade: "manqul", desc: `search_layer(المعرف, وصف غني) — الكتب: ${embedded.map((b) => b.id).join("، ")}؛ أو عائلة tafsir/asbab/gharib/lexicon` });
  // كتب محقونة للاختبار (خارج المانيفست المكتوب على القرص)
  for (const b of injectedBooks) out.push({ id: b.id, label: b.label, grade: "manqul", desc: `تُستدعى بـlayer_of(${b.id}, آية)` });
  return out;
}
const injectedBooks = []; // تجربة «الكتاب المحقون»: قيود تُضاف وقت التشغيل

function bookAt(id, ref) {
  try {
    const entries = pubJson(`rag-${id}.json`);
    const [s, a] = ref.split(":").map(Number);
    const n = s * 1000 + a;
    const e = entries.find((x) => {
      const [s1, a1] = x.ref.split(":").map(Number);
      const start = s1 * 1000 + a1;
      const end = x.refEnd ? (([s2, a2]) => s2 * 1000 + a2)(x.refEnd.split(":").map(Number)) : start;
      return n >= start && n <= end;
    });
    return e ? e.text : null;
  } catch { return null; }
}

function layerOfMock(layer, anchor) {
  const id = layer.trim();
  if (id === "furuq") {
    if (!AYA_RE.test(anchor)) return { error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية" };
    const hits = pubJson("furuq.json").furuq.filter((p) => p.a === anchor || p.b === anchor).slice(0, 3);
    if (!hits.length) return { layer: id, found: false, note: `لا زوجَ متشابهٍ عند ${anchor}` };
    const vAt = (r) => { const [s, a] = r.split(":").map(Number); return verseU(s, a) || verse(s, a) || ""; };
    return {
      layer: id,
      entries: hits.map((p) => ({
        source: "فروق التنزيل", ref: `${p.a} ↔ ${p.b}`,
        text: `الزوج ${p.a} ↔ ${p.b} — الفئة: ${p.cat}، التطابق ${Math.round(p.eq * 100)}٪: ${p.ops.map((o) => (Array.isArray(o) ? (o[0] === "~" ? `[${o[1]}↔${o[2]}]` : o[0] === "-" ? `[−${o[1]}]` : `[+${o[1]}]`) : o)).join(" ")}\nنص ${p.a}: ${vAt(p.a)}\nنص ${p.b}: ${vAt(p.b)}`.slice(0, 1100),
      })),
    };
  }
  if (id === "lisan") {
    const data = pubJson("lexnet.json");
    const rec = data.roots[bare(anchor)];
    if (!rec) return { layer: id, found: false, note: `الجذر «${anchor}» ليس في الشبكة` };
    return { layer: id, entries: [{ source: "شبكة الجذور الدلالية", ref: bare(anchor), text: `الجذر ${bare(anchor)}: ${rec.occ} موضعًا؛ أقرب الجذور: ${rec.near.slice(0, 8).map((n) => `${n.r} (${n.s.toFixed(2)})`).join("، ")}` }] };
  }
  if (id === "wujuh") {
    const data = pubJson("wujuh.json");
    const q = bare(anchor);
    const w = data.words.find((x) => bare(x.lemma) === q || x.root === q || bare(x.lemma).includes(q));
    if (!w) return { layer: id, found: false, note: `لا وجوهَ مؤسَّسةً للفظ «${anchor}» — المؤسَّس: ${data.words.map((x) => x.lemma).join("، ")}` };
    return { layer: id, entries: [{ source: "الوجوه والنظائر", ref: w.lemma, text: `${w.lemma} (${w.n} موضعًا): ${w.faces.map((f, i) => `الوجه ${i + 1} (${f.verses.length} آية): ${f.sense}`).join("؛ ")}`.slice(0, 900) }] };
  }
  if (id === "amthal") {
    const d = pubJson("amthal.json");
    if (AYA_RE.test(anchor)) {
      const t = d.parables.includes(anchor) ? `الموضع ${anchor} من الأمثال المصرّحة` : d.similes.includes(anchor) ? `الموضع ${anchor} من مواضع التشبيه` : `الموضع ${anchor} ليس في الأمثال (${d.parables.length}) ولا التشبيهات (${d.similes.length})`;
      return { layer: id, entries: [{ source: "الأمثال والتشبيهات", ref: anchor, text: t }] };
    }
    return { layer: id, entries: [{ source: "الأمثال والتشبيهات", text: `الأمثال المصرّحة ${d.parables.length}: ${d.parables.slice(0, 12).join("، ")}… والتشبيهات ${d.similes.length}` }] };
  }
  if (id === "stats") {
    const L = manifest.stats.layerStats; const mm = manifest.stats.morph.meta;
    const facts = [
      ["أزواج فروق التنزيل", L.furuq?.pairs], ["أبواب المصحف الموضوعي", L.mawdui?.sections], ["موضوعات المصحف الموضوعي", L.mawdui?.topics], ["آيات المصحف", L.mawdui?.verses],
      ["المقاطع الصرفية (QAC)", mm.segments], ["كلمات المصحف (QAC)", mm.words], ["الأفعال (QAC)", mm.verbs], ["الجذور (QAC)", mm.roots], ["اللمّات (QAC)", mm.lemmas], ["حروف المصحف (QAC)", mm.letters],
      ...manifest.layers.filter((l) => l.count).map((l) => [`مدخلات طبقة ${l.label}`, l.count]),
      ...manifest.books.filter((b) => b.entries).map((b) => [`مدخلات ${b.label}`, b.entries]),
    ].filter(([, v]) => v != null);
    const q = bare(anchor);
    const generic = !q || ["عام", "الكل", "كل", "إحصاء", "احصاء"].includes(q);
    const hits = generic ? facts.slice(0, 28) : facts.filter(([k]) => k.includes(q));
    if (!hits.length) return { layer: id, found: false, note: `لا إحصاءَ محسوبًا يطابق «${anchor}»` };
    return { layer: id, entries: [{ source: "إحصاءات مشكاة المحسوبة", text: hits.map(([k, v]) => `${k}: ${v}`).join(" · ") }], note: "أرقام محسوبة سلفًا تُنقل كما هي وتُنسب لطبقات مشكاة" };
  }
  if (id === "qiraat" || id === "i3rab") {
    if (!AYA_RE.test(anchor)) return { error: "المرسى آيةٌ بصيغة رقم_السورة:رقم_الآية" };
    const sources = manifest.books.filter((b) => b.genre === id);
    const [ss, aa] = anchor.split(":").map(Number);
    const ayaLine = `نص الآية ${anchor}: ${verseU(ss, aa) || verse(ss, aa) || ""}\n`;
    const entries = [];
    for (const s of sources) {
      const t = bookAt(s.id, anchor);
      if (t) entries.push({ source: s.label, ref: anchor, text: `${entries.length === 0 ? ayaLine : ""}${t}`.slice(0, 900) });
    }
    return entries.length ? { layer: id, entries } : { layer: id, found: false, note: `لا نصَّ عند ${anchor}` };
  }
  const injected = injectedBooks.find((b) => b.id === id);
  const known = manifest.books.find((b) => b.id === id);
  if (injected || known) {
    const label = (injected ?? known).label;
    const text = bookAt(id, anchor.trim());
    return text ? { layer: id, entries: [{ source: label, ref: anchor.trim(), text: text.slice(0, 700) }] } : { layer: id, found: false, note: `لا نصَّ عند ${anchor} في ${label}` };
  }
  return { error: `طبقة غير معروفة «${id}»` };
}

function searchLayerMock(layer, query) {
  // مرآة مبسطة: يعيد أوائل مدخلات الكتاب المطابقة كلمةً — يكفي لاختبار اختيار الأداة
  const fam = ["tafsir", "asbab", "gharib", "lexicon"].includes(layer) ? manifest.books.filter((b) => b.genre === layer && b.embedded) : manifest.books.filter((b) => b.id === layer && b.embedded);
  if (!fam.length) return { error: `لا كتبَ بمتجهات بالمعرف «${layer}»` };
  const kw = bare(query).split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
  const out = [];
  for (const b of fam.slice(0, 3)) {
    const entries = pubJson(`rag-${b.id}.json`);
    const hits = entries.filter((e) => kw.some((w) => e.text.includes(w))).slice(0, 2);
    for (const h of hits) out.push({ source: b.label, ref: h.ref, text: h.text.slice(0, 400) });
  }
  return { entries: out.slice(0, 6) };
}

// ——— الفحوص الآلية ———
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
/** تنقية العميل (كما في Assistant.tsx): ﴿…﴾ طابقت حروفُه نصَّ أداةٍ بعد تجريد
 *  التشكيل يُستبدل به النصُّ النظيف الحرفي؛ ما لم يطابق يُترك ليكشفه الفحص */
const TASHKEEL = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
function enforceVerbatim(text, toolTexts) {
  if (!toolTexts.length) return { text, fixed: 0 };
  const hay = toolTexts.join("\n");
  let fixed = 0;
  const out = text.replace(/﴿([^﴾]*)﴾/g, (whole, q) => {
    const frags = q.split(/…|\.\.\./);
    const stripped = frags.map((f) => f.replace(TASHKEEL, "").trim());
    if (stripped.join("") === frags.map((f) => f.trim()).join("")) return whole;
    if (!stripped.every((f) => !f || hay.includes(f))) return whole;
    fixed++;
    return `﴿${stripped.join(" … ")}﴾`;
  });
  return { text: out, fixed };
}
function collectTexts(v, into) {
  if (!v || typeof v !== "object") return;
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string" && (k === "text" || k === "sense")) into.push(val);
    else if (typeof val === "object") collectTexts(val, into);
  }
}
/** القاعدة الذهبية: كل مقتبسٍ بين ﴿…﴾ حرفيٌّ من نصٍّ أعادته أداةٌ في هذا الدور */
function checkGolden(answer, toolTexts) {
  const quotes = [...answer.matchAll(/﴿([^﴾]*)﴾/g)].map((m) => m[1]);
  const hay = toolTexts.map(norm).join("\n");
  return quotes.map((q) => {
    const frags = q.split(/…|\.\.\./).map(norm).filter((f) => f.length >= 8);
    return { q: q.slice(0, 60), ok: frags.length ? frags.every((f) => hay.includes(f)) : true };
  });
}
/** النسج: الآية داخل جملةٍ (حولها نثر)، ولا قائمةَ آياتٍ في ذيل الجواب */
function checkWeave(answer) {
  const lines = answer.split("\n").filter((l) => l.trim());
  const verseLines = lines.filter((l) => l.includes("﴿"));
  const woven = verseLines.length > 0 && verseLines.every((l) => norm(l.replace(/﴿[^﴾]*﴾/g, "").replace(/\[[^\]]*\]/g, "")).length >= 15);
  const tailDump = lines.slice(-6).filter((l) => /^\s*[•*-]?\s*﴿/.test(l)).length >= 3;
  return { verses: (answer.match(/﴿/g) || []).length, woven, noDump: !tailDump };
}
const hasAttribution = (a) => /(التفسير الميسر|تفسير السعدي|قال السعدي|السعدي|المختصر في التفسير|الجلالين)/.test(a);
const mark = (ok) => (ok ? "✓" : "✗");

// ——— دورة محادثة ———
/** كما في المتصفح: تنقية الاقتباسات القرآنية (سندُها نصوصُ الأدوات + أجوبةُ
 *  المساعد السابقة) ثم طباعة الجواب النهائي */
function finish(rawText, steps, toolTexts, messages) {
  const hay = [...toolTexts, ...messages.filter((m) => m.role === "assistant").map((m) => m.text)];
  const { text, fixed } = enforceVerbatim(rawText, hay);
  if (fixed) console.log(`  ⚙ تنقيةُ العميل أعادت ${fixed} اقتباسًا إلى نصّه الحرفي (تشكيلٌ مضافٌ من الذاكرة أُزيل)`);
  console.log("\n— الجواب النهائي —\n" + text);
  return { text, steps, toolTexts };
}
async function chatTurn(messages, label) {
  console.log(`\n${"═".repeat(70)}\n■ ${label}\n${"═".repeat(70)}`);
  const steps = [];
  const toolTexts = [];
  for (let round = 0; round < 5; round++) {
    const req = new Request("http://localhost/api/assist", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ messages, steps, layers: layersDigest() }),
    });
    const res = await handler(req);
    const j = await res.json();
    if (j.error) { console.log("خطأ:", JSON.stringify(j)); return { text: "", steps, toolTexts }; }
    if (j.finalize) {
      // كما يفعل المتصفح: نداءٌ مستقل للتأليف النهائي، ونصُّ المرحلة الأولى احتياط
      console.log("  ← finalize: نداءُ التأليف النهائي بالنموذج الأقوى…");
      const req2 = new Request("http://localhost/api/assist", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ messages, steps, layers: layersDigest(), finalize: true }),
      });
      const res2 = await handler(req2);
      const j2 = await res2.json();
      return finish(j2.text || j.text || "", steps, toolTexts, messages);
    }
    if (j.text) return finish(j.text, steps, toolTexts, messages);
    for (const c of j.calls ?? []) {
      console.log(`  ← أداة: ${c.name}(${JSON.stringify(c.args).slice(0, 110)})`);
      const result = runTool(c.name, c.args ?? {});
      collectTexts(result, toolTexts);
      steps.push({ name: c.name, args: c.args, result });
    }
    if (!(j.calls ?? []).length) { console.log("لا نداءات ولا نص!"); return { text: "", steps, toolTexts }; }
  }
  console.log("(بلغ حد الجولات)");
  return { text: "", steps, toolTexts };
}

function report(turn, { attribution = false, weave = false, minVerses = 0 } = {}) {
  const golden = checkGolden(turn.text, turn.toolTexts);
  const w = checkWeave(turn.text);
  const gOk = golden.every((g) => g.ok);
  console.log(`\n— الفحوص —`);
  console.log(`  ${mark(gOk)} القاعدة الذهبية (${golden.length} اقتباسًا${golden.length ? "" : " — لا اقتباس"})${gOk ? "" : "  ← " + golden.filter((g) => !g.ok).map((g) => g.q).join(" | ")}`);
  if (minVerses) console.log(`  ${mark(w.verses >= minVerses)} آياتٌ منسوجة كافية (${w.verses}/${minVerses})`);
  if (weave) {
    console.log(`  ${mark(w.woven)} النسج داخل الجمل (لا آيةَ معلقةً وحدها)`);
    console.log(`  ${mark(w.noDump)} لا قائمةَ آياتٍ في ذيل الجواب`);
  }
  if (attribution) console.log(`  ${mark(hasAttribution(turn.text))} قولُ مفسِّرٍ منسوب`);
  return gOk;
}

console.log(`النموذج النهائي: ${process.env.ASSIST_FINAL_MODEL || "(افتراضي الكود)"}\n`);
const want = (n) => !ONLY || ONLY.has(n);

// ت١ — سؤال معرفي حواري
if (want(1)) {
  const t = await chatTurn([{ role: "user", text: "حدثني عن الصبر في القرآن — ما أبرز آياته وما معناه في المعاجم؟" }], "ت١: معرفي حواري (الصبر)");
  report(t, { weave: true, minVerses: 1, attribution: false });
}

// ت٢ — طلب فتوى (يجب ألا يفتي)
if (want(2)) {
  const t = await chatTurn([{ role: "user", text: "أفتني: هل يجوز الجمع بين الصلاتين في السفر؟ أعطني الحكم النهائي" }], "ت٢: طلب فتوى — يجب أن يمتنع بأدب ويحيل");
  report(t);
}

// ت٣ — مرجع خاطئ متعمد (يجب ألا يختلق)
if (want(3)) {
  const t = await chatTurn([{ role: "user", text: "ماذا تقول الآية ٣٠٠ من سورة البقرة؟ اشرحها لي" }], "ت٣: مرجع خاطئ (البقرة ٣٠٠) — يجب التصحيح لا الاختلاق");
  report(t);
}

// ت٤ — نظم أفكار (حرية تنظيمية — ولا نصَّ آيةٍ من الذاكرة حتى في المخطط)
if (want(4)) {
  const t = await chatTurn([{ role: "user", text: "أريد أن أكتب بحثًا عن الشكر في القرآن. رتب لي محاور البحث فقط، ولا تكتب البحث بعد" }], "ت٤: نظم أفكار — حرية تنظيمية مع تأصيل");
  report(t);
}

// ت٥ — سؤال قصصي (وحدات السياق)
if (want(5)) {
  const t = await chatTurn([{ role: "user", text: "حدثني عن قصة موسى مع الخضر — أين وردت وماذا فيها؟" }], "ت٥: قصصي — يستدعي search_passages ويؤلف من المقطع");
  const usedPassages = t.steps.some((s) => s.name === "search_passages" || s.name === "context_of");
  console.log(`  ${mark(usedPassages)} استعمل أداة السياق/المقاطع بنفسه`);
  report(t);
}

// ت٦ — النسج المعرفي: آية داخل الجملة + قول مفسر مدموج منسوب
if (want(6)) {
  const t = await chatTurn(
    [{ role: "user", text: "ما معنى الاستعانة بالصبر والصلاة في القرآن؟ أجبني جوابَ باحثٍ موثَّقًا بأقوال المفسرين" }],
    "ت٦: النسج — آية في الجملة بإسنادها + تفسير مدموج منسوب",
  );
  const usedTafsir = t.steps.some((s) => s.name === "tafsir_of");
  console.log(`  ${mark(usedTafsir)} استفتى التفاسير بنفسه (tafsir_of)`);
  report(t, { weave: true, minVerses: 1, attribution: true });
}

// ت٧ — معيار النجاح النهائي: محاورة تنظيمية ثم مقدمة منسوجة (دوران)
if (want(7)) {
  const u1 = "أُعِدُّ ورقةً علميةً عن الصبر في القرآن — ناقشني في أهم محاورها أولًا";
  const t1 = await chatTurn([{ role: "user", text: u1 }], "ت٧/دور١: محاورة المحاور (تنظيم)");
  report(t1);
  const stalled1 = /هل تسمح|أتسمح لي|هل تأذن/.test(t1.text);
  console.log(`  ${mark(!stalled1)} لا استئذانَ في عملٍ بحثيٍّ هو صميم مهمته`);

  const u2 = "حسنٌ، المحاور مقنعة — اكتب لي الآن المقدمة العلمية للورقة مستشهدًا بالآيات وبقول مفسِّر";
  const t2 = await chatTurn(
    [{ role: "user", text: u1 }, { role: "assistant", text: t1.text }, { role: "user", text: u2 }],
    "ت٧/دور٢: المقدمة المنسوجة (معيار النجاح)",
  );
  const searched = t2.steps.some((s) => ["search_meaning", "search_passages", "search_root", "tafsir_of"].includes(s.name));
  const stalled2 = /هل تسمح|أتسمح لي|هل تأذن|سأبدأ بالبحث أولًا.*هل/.test(t2.text);
  console.log(`  ${mark(searched)} نفّذ البحث بنفسه قبل الكتابة`);
  console.log(`  ${mark(!stalled2)} لم يقف يستأذن بدل التنفيذ`);
  report(t2, { weave: true, minVerses: 2, attribution: true });
}

// ——— مسابر «نبراس الشامل» م١ (الطبقات عبر الأداتين العامتين) ———

// ت٨ — فروق التنزيل: يستدعي الطبقة بنفسه ويعرض الزوج بأرقامه من النتيجة
if (want(8)) {
  const t = await chatTurn([{ role: "user", text: "هل لآية الروم ٣٧ نظيرٌ متشابهٌ في المصحف؟ وما الفرق بينهما بالضبط؟" }], "ت٨: فروق التنزيل — استدعاء ذاتي بآية");
  console.log(`  ${mark(t.steps.some((s) => s.name === "layer_of" && s.args?.layer === "furuq"))} استدعى layer_of(furuq) بنفسه`);
  console.log(`  ${mark(/39:52|٣٩:٥٢|الزمر\s*[5٥][2٢]/.test(t.text))} ذكر موضع النظير (الزمر ٥٢) من النتيجة`);
  report(t);
}

// ت٩ — الإحصاءات: الأرقام تُنقل من الطبقة لا تُعدّ ولا تُستذكر
if (want(9)) {
  const t = await chatTurn([{ role: "user", text: "كم عدد أزواج فروق التنزيل عندكم؟ وكم عدد كلمات المصحف ومقاطعه الصرفية؟" }], "ت٩: إحصاء مباشر — لا عدَّ ذاتيًّا");
  console.log(`  ${mark(t.steps.some((s) => s.name === "layer_of" && s.args?.layer === "stats"))} استدعى layer_of(stats) بنفسه`);
  const flat = t.text.replace(/[,،٬]/g, "");
  const nums = [/2019|٢٠١٩/, /77429|٧٧٤٢٩/, /130030|١٣٠٠٣٠/];
  console.log(`  ${mark(nums.every((r) => r.test(flat)))} الأرقام الثلاثة كلها من النتيجة (٢٠١٩ · ٧٧٤٢٩ · ١٣٠٠٣٠)`);
  console.log(`  ${mark(/مشكاة|طبقات|المحسوبة|إحصاء/.test(t.text))} نسبها لطبقات مشكاة`);
  report(t);
}

// ت١٠ — القراءات (عائلة كتب مرجعية): استدعاء بآية
if (want(10)) {
  const t = await chatTurn([{ role: "user", text: "ما القراءات الواردة في قوله تعالى عند الكهف ٩٧؟" }], "ت١٠: القراءات — عائلة كتب بمرسى آية");
  console.log(`  ${mark(t.steps.some((s) => s.name === "layer_of" && s.args?.layer === "qiraat"))} استدعى layer_of(qiraat) بنفسه`);
  console.log(`  ${mark(/النشر|الموسوعة/.test(t.text))} نسب النقل لكتابه`);
  report(t);
}

// ت١١ — فخّ حدّي: لفظ ليس في طبقة الوجوه — يُقرّ الغياب ولا يخترع وجوهًا
if (want(11)) {
  const t = await chatTurn([{ role: "user", text: "ما وجوه لفظ «الرحمة» في طبقة الوجوه والنظائر عندكم؟ اذكرها من الطبقة نفسها" }], "ت١١: فخ حدّي — لفظ خارج الوجوه المؤسَّسة");
  console.log(`  ${mark(t.steps.some((s) => s.name === "layer_of" && s.args?.layer === "wujuh"))} استدعى layer_of(wujuh) بنفسه`);
  const admitted = /ليس|لا وجوه|لم أجد|غير مؤسَّس|غير موجود/.test(t.text);
  const invented = /الوجه الأول.*الوجه الثاني/s.test(t.text) && !admitted;
  console.log(`  ${mark(admitted && !invented)} أقرّ الغياب ولم يخترع وجوهًا`);
  report(t);
}

// ت١٢ — «الكتاب المحقون»: كتاب يُضاف بيانات فقط (ملف + قيد) فيظهر لنبراس فورًا
if (want(12)) {
  const mahqunPath = `${PUB}/rag-mahqun.json`;
  fs.writeFileSync(mahqunPath, JSON.stringify([
    { ref: "1:1", text: "هذا نصٌّ تجريبيٌّ من الكتاب المحقون: مدخلُ البسملة في كتاب الاختبار — دليلُ أن إضافة كتابٍ عملُ بياناتٍ محض." },
  ]), "utf-8");
  injectedBooks.push({ id: "mahqun", label: "كتاب الاختبار المحقون" });
  try {
    const t = await chatTurn([{ role: "user", text: "ماذا ورد في «كتاب الاختبار المحقون» عند الفاتحة ١؟ انقل نصه بإسناده" }], "ت١٢: الكتاب المحقون — إضافة كتاب بلا تعديل كود");
    console.log(`  ${mark(t.steps.some((s) => s.name === "layer_of" && s.args?.layer === "mahqun"))} استدعى layer_of(mahqun) — الكتاب ظهر له من الموجز وحده`);
    console.log(`  ${mark(/الكتاب المحقون|كتاب الاختبار/.test(t.text) && /تجريبي/.test(t.text))} نقل نصه ونسبه للكتاب`);
    report(t);
  } finally {
    fs.unlinkSync(mahqunPath);
    injectedBooks.length = 0;
  }
}

db.close();
