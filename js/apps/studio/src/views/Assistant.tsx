/**
 * نِبراس — an expert research ASSISTANT over مشكاة's own data (agentic loop).
 *
 * The model holds the whole conversation and drives مشكاة's tools ITSELF —
 * meaning-search, roots, cited tafsir/asbāb, book passages, draft composing —
 * calling them as many times as it needs inside one reply (/api/assist returns
 * either tool calls or the final text; the tools execute here, on-device, free).
 * Free in style and conversation; bound in facts to what the tools returned —
 * verses are NEVER written from model memory. Multi-chat, on-device, no account.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getUILang, num, useUILang } from "../i18n";
import {
  addMessage, chatMaterial, createChat, deleteChat, getChat, patchMessage, renameChat, useChats,
  type ChatAyah, type ChatBook, type ChatMsg, type ChatRoot,
} from "../chat";
import { toolRootInfo, toolSearchMeaning } from "../lib/muinTools";
import { retrieveBooks, hasBooks, bookLabel, BOOK_SOURCES } from "../rag";
import { asbabFor, tafsirFor } from "../books";
import { loadSiyaq, searchSiyaq, unitOf, type SiyaqUnit } from "../siyaq";
import { ensureLayers, layersDigest, layerLookup, layerSearch, countLive } from "../layers";
import { resolveRootReady } from "../searchForms";
import { ayahByLocationMap, surahNameAr } from "../db";

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** مثالٌ واحدٌ يوضّح الفكرة — لا قائمة تشتّت (قرار مالك 2026-07-19) */
const EXAMPLE_AR = "ما الفرق بين الخوف والخشية في القرآن؟";

/** ما تعرضه فقاعة الحالة أثناء نداء أداة */
const TOOL_STATUS: Record<string, (a: Record<string, unknown>) => string> = {
  search_meaning: (a) => `يبحث عن آيات: ${String(a.query ?? "").slice(0, 60)}…`,
  search_root: (a) => `يستقصي الجذر: ${String(a.word ?? "")}`,
  tafsir_of: (a) => `يقرأ التفاسير عند ${String(a.ref ?? "")}`,
  asbab_of: (a) => `يراجع أسباب النزول عند ${String(a.ref ?? "")}`,
  search_books: (a) => `يبحث في الكتب: ${String(a.query ?? "").slice(0, 60)}…`,
  context_of: (a) => `يقرأ سياق ${String(a.ref ?? "")}`,
  search_passages: (a) => `يبحث في المقاطع: ${String(a.query ?? "").slice(0, 60)}…`,
  layer_of: (a) => `يستدعي طبقة ${String(a.layer ?? "")}: ${String(a.anchor ?? "").slice(0, 40)}`,
  search_layer: (a) => `يبحث في ${String(a.layer ?? "")}: ${String(a.query ?? "").slice(0, 50)}…`,
  count_live: (a) => `يعدّ رسم «${String(a.expr ?? "").slice(0, 30)}» عدًّا حتميًّا…`,
  compose_draft: (a) => `يؤلّف مسودة: ${String(a.subject ?? "")}`,
};

const refName = (ref: string): string => {
  const [s, n] = ref.split(":");
  return `${surahNameAr(Number(s))} ${n}`;
};

// ——— القاعدة الذهبية أداةً (لا وعدًا): تنقية الاقتباسات القرآنية ———
/** حركات وتطويل وعلامات ضبط — ما قد يضيفه النموذج من ذاكرته فوق نصنا النظيف */
const TASHKEEL = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
/** يجمع كل النصوص التي أعادتها الأدوات في هذا الدور (آيات ومقاطع ومصادر) */
function collectToolTexts(v: unknown, into: string[]): void {
  if (!v || typeof v !== "object") return;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && (k === "text" || k === "sense")) into.push(val);
    else if (typeof val === "object") collectToolTexts(val, into);
  }
}
/** كل ﴿…﴾ في الجواب طابقت حروفُه نصَّ أداةٍ بعد تجريد التشكيل يُستبدل به النصُّ
 *  الحرفي النظيف كما أعادته الأداة — فلا يبقى تشكيلٌ مضافٌ من ذاكرة النموذج
 *  فوق كتاب الله. ما لم تطابق حروفُه يُترك كما هو (يكشفه الفحص لا نُجمّله). */
function enforceVerbatim(text: string, toolTexts: string[]): string {
  if (!toolTexts.length) return text;
  // مقارنتان: مجرّدةٌ (التشكيل والوصل والمدّ مطوية)، ثم عديمةُ الألف احتياطًا —
  // فالخنجرية ٰ تنوب عن الألف أحيانًا (وَٰلديه=والديه) ولا تنوب أحيانًا
  // (هَٰذا=هذا)، وءا العثمانية = آ الممدودة؛ هيكلُ الحروف بلا ألفاتٍ هو الفيصل
  const cmp = (x: string): string => x.replace(TASHKEEL, "").replace(/\u0671/g, "ا").replace(/آ/g, "ءا");
  const hayBare = cmp(toolTexts.join("\n"));
  const hayA = hayBare.replace(/ا/g, "");
  const dispFold = (f: string): string => f.replace(/\u0670/g, "ا").replace(TASHKEEL, "").replace(/\u0671/g, "ا").trim();
  return text.replace(/﴿([^﴾]*)﴾/g, (whole, q: string) => {
    const frags = q.split(/…|\.\.\./);
    const plain = frags.map((f) => f.replace(TASHKEEL, "").replace(/\u0671/g, "ا").trim());
    if (plain.join("") === frags.map((f) => f.trim()).join("")) return whole; // نظيفٌ أصلًا
    const stripped = frags.map((f) => cmp(f).trim());
    if (stripped.every((f) => !f || hayBare.includes(f))) return `﴿${plain.join(" … ")}﴾`;
    const aless = stripped.map((f) => f.replace(/ا/g, ""));
    if (aless.every((f) => !f || hayA.includes(f))) return `﴿${frags.map(dispFold).join(" … ")}﴾`;
    return whole;
  });
}

// ——— مراجع الآيات داخل النثر روابطُ قراءة (السورة الآية) ———
let surahNums: Map<string, number> | null = null;
function surahNumOf(name: string): number | null {
  if (!surahNums) {
    surahNums = new Map();
    for (let i = 1; i <= 114; i++) surahNums.set(surahNameAr(i).replace(/\s+/g, " ").trim(), i);
  }
  const k = name.replace(/\s+/g, " ").replace(/^سورة\s+/, "").trim();
  return surahNums.get(k) ?? null;
}
const AR2EN: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const arInt = (s: string): number => Number(s.replace(/[٠-٩]/g, (d) => AR2EN[d]));
/** «البقرة ١٥٣» → {s,a} — أو null إن لم يكن مرجعَ آية */
function parseRefLabel(label: string): { s: number; a: number } | null {
  const m = /^(.+?)\s+([0-9٠-٩]{1,3})(?:\s*[-–—]\s*[0-9٠-٩]{1,3})?$/.exec(label.trim());
  if (!m) return null;
  const s = surahNumOf(m[1]);
  const a = arInt(m[2]);
  return s && a >= 1 && a <= 286 ? { s, a } : null;
}
const QSTRIP = /[ً-ٰٟۖ-ۭـ]/g;
/** موضعُ الاقتباس ﴿…﴾ من مراجع آيات الرسالة — مطابقةُ حروفٍ مجردة لا تخمين */
function refOfQuote(q: string, ayahs?: ChatAyah[]): string | null {
  if (!ayahs?.length) return null;
  const frag = q.replace(/[﴿﴾]/g, "").split(/…|\.\.\./)[0].replace(QSTRIP, "").replace(/ٱ/g, "ا").replace(/\s+/g, " ").trim();
  if (frag.length < 8) return null;
  for (const a of ayahs) {
    const t = a.text.replace(QSTRIP, "").replace(/ٱ/g, "ا").replace(/\s+/g, " ");
    if (t.includes(frag)) return a.ref;
  }
  return null;
}

/** عرضٌ آمنٌ لنص المساعد: يحوّل عادات Markdown الخفيفة (**غامق**، `*` نقاط،
 *  ## عناوين) إلى عناصرَ حقيقية بدل ظهور الوسوم حرفيًّا — بلا HTML خام.
 *  والآياتُ المنسوجة بين ﴿…﴾ بخط المصحف، ومراجعُها [السورة الآية] روابطُ
 *  تفتح الموضع في القارئ — والاقتباسُ المطابقُ لمرجعٍ يُذيَّل بمرجعه إن غاب. */
function renderReply(text: string, ayahs?: ChatAyah[]): ReactNode {
  const bold = (line: string, key: number): ReactNode => {
    const parts = line.split(/\*\*([^*]+)\*\*/g);
    if (parts.length === 1) return <span key={key}>{line}</span>;
    return <span key={key}>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</span>;
  };
  const rich = (line: string, key: number): ReactNode => {
    const segs = line.split(/(﴿[^﴾]*﴾|\[[^\]\n]{2,40}\])/g);
    if (segs.length === 1) return bold(line, key);
    const out: ReactNode[] = [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.startsWith("﴿")) {
        const ref = refOfQuote(s, ayahs);
        out.push(ref
          ? <Link key={i} to={`/read/${ref.split(":")[0]}/${ref.split(":")[1]}`} className="mu-vq mu-vq-lnk">{s}</Link>
          : <span key={i} className="mu-vq">{s}</span>);
        // إن لم يُتبِع النموذجُ الاقتباسَ بمرجعه [السورة الآية] أُلحق مرجعُه المطابَق رابطًا
        const next = (segs[i + 1] ?? "").trimStart();
        if (ref && !(next.startsWith("[") && parseRefLabel(next.slice(1, next.indexOf("]"))))) {
          out.push(<Link key={`${i}r`} to={`/read/${ref.split(":")[0]}/${ref.split(":")[1]}`} className="mu-ref-lnk"> ({refName(ref)})</Link>);
        }
      } else if (s.startsWith("[") && s.endsWith("]")) {
        const label = s.slice(1, -1);
        const r = parseRefLabel(label);
        out.push(r
          ? <Link key={i} to={`/read/${r.s}/${r.a}`} className="mu-ref-lnk">({label})</Link>
          : bold(s, i));
      } else if (s) {
        out.push(bold(s, i));
      }
    }
    return <span key={key}>{out}</span>;
  };
  return text.split("\n").map((raw, i) => {
    let line = raw;
    const head = /^#{1,4}\s+(.*)$/.exec(line);
    if (head) return <div key={i} style={{ fontWeight: 700, marginTop: 6 }}>{rich(head[1], 0)}</div>;
    const m = /^(\s*)([*•-])\s+(.*)$/.exec(line);
    if (m) {
      const depth = Math.min(Math.floor(m[1].length / 2), 3);
      return (
        <div key={i} style={{ paddingInlineStart: 14 + depth * 14 }}>
          <span className="muted">• </span>{rich(m[3], 0)}
        </div>
      );
    }
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    return <div key={i}>{rich(line, 0)}</div>;
  });
}

/** عدٌّ عربيٌّ سليم لسطر «المراجع»: مفرد/مثنى/جمع */
const countAr = (n: number, one: string, two: string, few: string): string =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${num(n)} ${few}` : `${num(n)} ${one}`;

function Bubble({ m }: { m: ChatMsg }) {
  const ar = getUILang() === "ar";
  const copy = () => navigator.clipboard?.writeText(m.draft || m.text || "");
  const copyReply = () => navigator.clipboard?.writeText(m.text || "");
  // كشفٌ تدريجيٌّ سطرًا سطرًا لحظةَ وصول الجواب — إحساسُ البث دون المساس
  // بحارس السند (النص فُحص كاملًا في الخادم قبل أن يصل)
  const [revealed, setRevealed] = useState<number | null>(null);
  const wasPending = useRef(m.pending);
  useEffect(() => {
    const was = wasPending.current;
    wasPending.current = m.pending;
    if (!(was && !m.pending && m.text && !m.error)) return;
    const total = m.text.split("\n").length;
    if (total < 3) return;
    setRevealed(1);
    let n = 1;
    const iv = setInterval(() => {
      n += 1;
      if (n >= total) { clearInterval(iv); setRevealed(null); } else setRevealed(n);
    }, 110);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.pending]);
  const shownText = m.text && revealed !== null ? m.text.split("\n").slice(0, revealed).join("\n") : m.text;
  // وسمٌ بصري إذا تضمن الجواب استنباطًا مولَّدًا — درجة السند الثالثة ظاهرة للعين
  const hasIstinbat = !!m.text && /استنباط\s*مولّ?د/.test(m.text);
  const nAyahs = m.ayahs?.length ?? 0;
  const nRoots = m.roots?.length ?? 0;
  const nBooks = m.books?.length ?? 0;
  const refCounts = [
    nAyahs ? (ar ? countAr(nAyahs, "آية", "آيتان", "آيات") : `${nAyahs} verses`) : "",
    nRoots ? (ar ? countAr(nRoots, "جذر", "جذران", "جذور") : `${nRoots} roots`) : "",
    nBooks ? (ar ? countAr(nBooks, "مصدر", "مصدران", "مصادر") : `${nBooks} sources`) : "",
  ].filter(Boolean).join(" · ");
  return (
    <div className={`mu-msg ${m.role}`}>
      {m.role === "user" ? (
        <div className="mu-user">{m.text}</div>
      ) : (
        <div className="mu-asst">
          {m.pending ? (
            <>
              <div className="mu-typing"><span /><span /><span /></div>
              {m.text && <div className="mu-status">{m.text}</div>}
            </>
          ) : (
            <>
              {m.text && <div className={`mu-reply${m.error ? " err" : ""}`}>{renderReply(shownText || "", m.ayahs)}</div>}
              {m.text && !m.error && revealed === null && (
                <div className="mu-reply-bar">
                  {hasIstinbat && <span className="mu-ist-tag">{ar ? "يتضمن استنباطًا مولَّدًا بمقدماته — ليس نقلًا" : "includes a generated inference"}</span>}
                  <button className="mu-copy-sm" onClick={copyReply} title={ar ? "نسخ الجواب بمقدماته" : "copy answer"}>⧉</button>
                </div>
              )}
              {m.draft && (
                <div className="mu-draft">
                  <div className="mu-draft-note muted">{ar ? "مسوّدةٌ مؤلّفةٌ من المادة المجموعة — راجِعْها." : "A draft composed from the gathered material — review it."}</div>
                  <div className="mu-draft-body">{m.draft}</div>
                  <button className="chip mu-copy" onClick={copy}>{ar ? "نسخ" : "copy"} ⧉</button>
                </div>
              )}
              {/* المراجعُ الداعمة — مطويةٌ تحت الجواب؛ المتنُ هو النثر المنسوج أعلاه */}
              {refCounts && revealed === null && (
                <details className="mu-refs">
                  <summary>
                    <svg className="mu-refs-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                    <span className="mu-refs-t">{ar ? "المراجع" : "References"}</span>
                    <span className="mu-refs-n">{refCounts}</span>
                  </summary>
                  <div className="mu-refs-body">
                    {nAyahs > 0 && (
                      <div className="mu-ayahs">
                        {m.ayahs!.map((a) => {
                          const [s, n] = a.ref.split(":");
                          return (
                            <Link key={a.ref} to={`/read/${s}/${n}`} className="mu-ayah">
                              <span className="quran mu-ayah-t">{a.text}</span>
                              <span className="muted mu-ayah-r">{ar ? "الآية" : ""} {a.ref}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                    {nRoots > 0 && (
                      <div className="mu-roots">
                        {m.roots!.map((r) => (
                          <span key={r.root} className="mu-root">
                            <Link to={`/journey/${encodeURIComponent(r.root)}`} className="quran mu-root-w">{r.root}</Link>
                            <span className="muted"> · {num(r.occ)}</span>
                            {r.gloss && <div className="mu-root-g">{r.gloss}</div>}
                          </span>
                        ))}
                      </div>
                    )}
                    {nBooks > 0 && (
                      <div className="mu-books">
                        <div className="mu-books-h muted">{ar ? "من المصادر (مذكورةً):" : "from the sources (cited):"}</div>
                        {m.books!.map((b, i) => (
                          <div key={i} className="mu-book">
                            <div className="mu-book-src">
                              ◆ {b.href ? <Link to={b.href} className="mu-book-ln">{bookLabel(b.source)}</Link> : bookLabel(b.source)}
                              {b.ref ? ` · ${b.ref}` : ""}
                            </div>
                            <div className="mu-book-t">{b.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Assistant() {
  useUILang();
  const ar = getUILang() === "ar";
  const chats = useChats();
  const { id } = useParams();
  const navigate = useNavigate();
  const chat = chats.find((c) => c.id === id) ?? null;
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // عُدّة نبراس تُعرض من المانيفست نفسه (لا قائمة مكتوبة تَقدُم) — تُحمَّل للعرض
  const [srcsReady, setSrcsReady] = useState(false);
  useEffect(() => { void ensureLayers().then(() => setSrcsReady(true)).catch(() => {}); }, []);
  const endRef = useRef<HTMLDivElement>(null);
  // resizable chat-list column (drag the divider) — persisted, RTL-aware
  const [listW, setListW] = useState<number>(() => { const v = Number(localStorage.getItem("nibras-listw")); return v >= 180 && v <= 460 ? v : 250; });
  const wRef = useRef(listW);
  const dragging = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const onResizeMove = (e: React.PointerEvent) => {
    if (!dragging.current || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const w = getUILang() === "ar" ? rect.right - e.clientX : e.clientX - rect.left;
    const clamped = Math.max(180, Math.min(460, Math.round(w)));
    wRef.current = clamped;
    setListW(clamped);
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat?.messages.length, busy]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    let cid = chat?.id;
    if (!cid) { cid = createChat(); navigate(`/assistant/${cid}`); }
    const existing = getChat(cid);
    if (existing && existing.messages.length === 0) renameChat(cid, text.slice(0, 42));
    addMessage(cid, { role: "user", text });
    setInput("");
    const aid = addMessage(cid, { role: "assistant", text: "", pending: true });
    setBusy(true);
    try {
      const cur = getChat(cid)!;
      // تاريخ الحوار للنموذج — المسودات السابقة تُلحق بنصها مقتطعةً ليبني عليها
      const history = cur.messages
        .filter((m) => !m.pending)
        .map((m) => ({
          role: m.role,
          text: (m.text || "") + (m.draft ? `\n[مسودة سابقة]\n${m.draft.slice(0, 1500)}` : ""),
        }));

      // ما يتراكم عبر نداءات الأدوات في هذا الدور — يُعرض تحت الجواب النهائي
      const acc: { ayahs: ChatAyah[]; roots: ChatRoot[]; books: ChatBook[]; draft?: string } = { ayahs: [], roots: [], books: [] };
      const seenAyah = new Set<string>();
      const addAyahs = (list: ChatAyah[]) => {
        for (const a of list) if (!seenAyah.has(a.ref)) { seenAyah.add(a.ref); acc.ayahs.push(a); }
      };

      /** ينفّذ أداةً محليًّا ويعيد نتيجتها للنموذج (مقتضبةً ومسندة) */
      const runTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
        if (name === "search_meaning") {
          const k = Math.min(Number(args.k) || 8, 14);
          const ayahs = await toolSearchMeaning(String(args.query ?? ""), k);
          addAyahs(ayahs);
          return { ayahs: ayahs.map((a) => ({ ref: a.ref, surah: refName(a.ref), text: a.text })) };
        }
        if (name === "search_root") {
          const word = String(args.word ?? "");
          let r = await toolRootInfo(word);
          if (!r.roots.length) {
            // مطبِّع الصيغ: كلمة مكتوبة (السماء) → جذرها (سمو) ثم إعادة الاستقصاء
            const alt = await resolveRootReady(word);
            if (alt) r = await toolRootInfo(alt);
          }
          for (const rt of r.roots) if (!acc.roots.some((x) => x.root === rt.root)) acc.roots.push(rt);
          addAyahs(r.ayahs.slice(0, 6));
          return {
            roots: r.roots.map((rt) => ({ root: rt.root, occurrences: rt.occ, sense: (rt.gloss || "").slice(0, 400) })),
            ayahs: r.ayahs.slice(0, 6).map((a) => ({ ref: a.ref, surah: refName(a.ref), text: a.text })),
          };
        }
        if (name === "count_live") {
          const res = await countLive(String(args.expr ?? ""), args.surah ? Number(args.surah) : undefined);
          if (res.error) return { error: res.error };
          for (const e of res.entries) acc.books.push({ source: e.label, ref: e.ref ?? "", text: e.text.slice(0, 1200) });
          return { entries: res.entries.map((e) => ({ source: e.label, text: e.text })), note: res.note };
        }
        if (name === "layer_of" || name === "search_layer") {
          const res = name === "layer_of"
            ? await layerLookup(String(args.layer ?? ""), String(args.anchor ?? ""))
            : await layerSearch(String(args.layer ?? ""), String(args.query ?? ""), Math.min(Number(args.k) || 6, 8));
          if (res.error) return { error: res.error };
          // القصُّ هنا يساوي أقصى ما تنتجه الطبقات (١١٠٠) — فبطاقة المرجع تحمل
          // كلَّ ما رآه النموذج، ولا يُعرض اقتباسٌ بلا سنده الكامل في المراجع
          for (const e of res.entries.slice(0, 6)) acc.books.push({ source: e.label, ref: e.ref ?? "", text: e.text.slice(0, 1200), href: e.href });
          if (!res.entries.length) return { layer: res.layer, found: false, note: res.note ?? "لا نتائج في هذه الطبقة" };
          return {
            layer: res.layer,
            entries: res.entries.map((e) => ({ source: e.label, ref: e.ref, text: e.text })),
            ...(res.note ? { note: res.note } : {}),
          };
        }
        if (name === "tafsir_of" || name === "asbab_of") {
          const ref = String(args.ref ?? "").trim();
          if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return { error: "ref يجب أن يكون بصيغة رقم_السورة:رقم_الآية" };
          const entries = name === "tafsir_of" ? (await tafsirFor(ref)).slice(0, 3) : (await asbabFor(ref)).slice(0, 2);
          for (const e of entries) acc.books.push({ source: e.source, ref: refName(ref), text: e.text.slice(0, 700) });
          if (!entries.length) return { ref, found: false, note: "لا نصَّ عند هذا الموضع في المصادر المضمّنة" };
          return { ref, surah: refName(ref), entries: entries.map((e) => ({ source: e.label, text: e.text.slice(0, 700) })) };
        }
        if (name === "search_books") {
          if (!hasBooks()) return { entries: [], note: "لا كتبَ مضمّنةً للبحث الدلالي" };
          const hits = await retrieveBooks(String(args.query ?? ""), { topK: 6 });
          for (const b of hits) acc.books.push({ source: b.source, ref: b.ref, text: b.text });
          return { entries: hits.map((b) => ({ source: bookLabel(b.source), ref: b.ref, text: b.text.slice(0, 500) })) };
        }
        if (name === "context_of" || name === "search_passages") {
          await loadSiyaq();
          const texts = await ayahByLocationMap();
          const spanText = (u: SiyaqUnit, cap = 1600): string => {
            const parts: string[] = [];
            for (let a = u.a1; a <= u.a2; a++) parts.push(texts.get(`${u.s}:${a}`)?.textClean ?? "");
            const t = parts.join(" ۝ ");
            return t.length > cap ? `${t.slice(0, cap)}…` : t;
          };
          const pack = (u: SiyaqUnit) => ({
            range: `${u.s}:${u.a1}-${u.a2}`,
            span: `${surahNameAr(u.s)} ${u.a1}–${u.a2}`,
            unitName: u.name,
            text: spanText(u),
          });
          if (name === "context_of") {
            const ref = String(args.ref ?? "").trim();
            if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return { error: "ref يجب أن يكون بصيغة رقم_السورة:رقم_الآية" };
            const u = unitOf(ref);
            if (!u) return { ref, found: false, note: "لا وحدةَ لهذا الموضع" };
            const p = pack(u);
            acc.books.push({ source: "وحدة سياق", ref: `${p.span} · ${u.name}`, text: p.text.slice(0, 700) });
            return { ref, passage: p };
          }
          const k = Math.min(Number(args.k) || 4, 8);
          const hits = await searchSiyaq(String(args.query ?? ""), k);
          for (const h of hits.slice(0, 3)) {
            const p = pack(h.unit);
            acc.books.push({ source: "وحدة سياق", ref: `${p.span} · ${h.unit.name}`, text: p.text.slice(0, 700) });
          }
          return { passages: hits.map((h) => pack(h.unit)) };
        }
        if (name === "compose_draft") {
          const prior = chatMaterial(getChat(cid!)!);
          const seen = new Set<string>();
          const ayahs: ChatAyah[] = [];
          for (const a of [...acc.ayahs, ...prior.ayahs]) if (!seen.has(a.ref)) { seen.add(a.ref); ayahs.push(a); }
          if (!ayahs.length) return { ok: false, note: "لا آياتَ مجموعةً بعد — ابحث أولًا ثم ألِّف" };
          const roots = [...acc.roots, ...prior.roots].slice(0, 12);
          const books = acc.books.length ? acc.books : hasBooks() ? await retrieveBooks(String(args.subject ?? text), { topK: 6 }) : [];
          const prev = [...getChat(cid!)!.messages].reverse().find((mm) => mm.draft)?.draft || "";
          const composed = await postJson("/api/compose", {
            task: String(args.task ?? "post"), subject: String(args.subject ?? text), length: String(args.length ?? "long"),
            ayahs: ayahs.slice(0, 16).map((a) => ({ ref: refName(a.ref), text: a.text })),
            roots: roots.map((r) => ({ root: r.root, gloss: r.gloss })),
            books: books.slice(0, 8).map((b) => ({ source: bookLabel(b.source), ref: b.ref, text: b.text })),
            instruction: text, previous: prev,
          });
          acc.draft = composed.text;
          return { ok: true, shown: true, opening: String(composed.text || "").slice(0, 300) };
        }
        return { error: `أداة غير معروفة: ${name}` };
      };

      // حلقة الوكيل: النموذج يطلب أدواتٍ فنُنفّذها ونعيد النداء، حتى نصٍّ نهائي
      // موجزُ طبقات مشكاة (من المانيفست) يُرسل مع كل نداء ليعرف النموذجُ عُدّته
      await ensureLayers();
      const layers = layersDigest();
      const steps: { name: string; args: Record<string, unknown>; result: unknown }[] = [];
      const toolTexts: string[] = []; // نصوص الأدوات الحرفية — للتنقية القرآنية
      let finalText = "";
      for (let round = 0; round < 6; round++) {
        const res = await postJson("/api/assist", { messages: history, steps, layers });
        if (res.finalize) {
          // المادة اكتملت — نداءٌ مستقل للتأليف النهائي بالنموذج الأقوى،
          // ونصُّ المرحلة الأولى احتياطٌ إن أخفق
          patchMessage(cid, aid, { pending: true, text: ar ? "ينسج الجوابَ من المادة…" : "weaving the answer…" });
          try {
            const fin = await postJson("/api/assist", { messages: history, steps, layers, finalize: true });
            finalText = fin.text || res.text || "";
          } catch {
            finalText = res.text || "";
          }
          break;
        }
        if (res.text) { finalText = res.text; break; }
        const calls: { name: string; args: Record<string, unknown> }[] = Array.isArray(res.calls) ? res.calls.slice(0, 4) : [];
        if (!calls.length) { finalText = ar ? "لم أستطع إتمام هذا الطلب." : "Could not complete this request."; break; }
        for (const c of calls) {
          // نداءٌ مطابقٌ لسابقه لا يُنفَّذ ثانية — تُعاد نتيجته بتنبيهٍ يوقف التكرار
          const dupKey = `${c.name}|${JSON.stringify(c.args ?? {})}`;
          const prev = steps.find((st) => `${st.name}|${JSON.stringify(st.args)}` === dupKey);
          if (prev) {
            steps.push({ name: c.name, args: c.args ?? {}, result: { note: "نداءٌ مكرر — النتيجة نفسها أعلاه؛ لا تكرر الجمع: اكتب بما حضر" } });
            continue;
          }
          patchMessage(cid, aid, { pending: true, text: TOOL_STATUS[c.name]?.(c.args) ?? c.name });
          const result = await runTool(c.name, c.args ?? {});
          collectToolTexts(result, toolTexts);
          steps.push({ name: c.name, args: c.args ?? {}, result });
        }
      }
      if (!finalText && steps.length) {
        // نفدت الجولات والمادة مجموعة — تأليفٌ قسري بالنموذج الأقوى مما حضر
        patchMessage(cid, aid, { pending: true, text: ar ? "ينسج الجوابَ من المادة…" : "weaving the answer…" });
        try {
          const fin = await postJson("/api/assist", { messages: history, steps, layers, finalize: true });
          finalText = fin.text || "";
        } catch { /* يسقط للرسالة الاحتياطية */ }
      }
      if (!finalText) finalText = ar ? "طال البحث — هذا ما جمعتُه حتى الآن، فاسألني عنه أو ضيّق الطلب." : "Search ran long — here is what was gathered; narrow the request.";
      // سندُ التنقية: نصوص أدوات هذا الدور + أجوبةُ المساعد السابقة (آياتُها من أدوات أدوارٍ مضت)
      finalText = enforceVerbatim(finalText, [...toolTexts, ...history.filter((h) => h.role === "assistant").map((h) => h.text)]);

      patchMessage(cid, aid, {
        pending: false,
        text: finalText,
        ...(acc.ayahs.length ? { ayahs: acc.ayahs.slice(0, 12) } : {}),
        ...(acc.roots.length ? { roots: acc.roots.slice(0, 8) } : {}),
        ...(acc.books.length ? { books: acc.books.slice(0, 6) } : {}),
        ...(acc.draft ? { draft: acc.draft, composed: true } : {}),
      });
    } catch {
      patchMessage(cid, aid, { pending: false, error: true, text: ar ? "تعذّر إتمام الطلب — تأكّد من الاتصال وحاوِل ثانيةً." : "Request failed — check your connection and retry." });
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    // إنتر = سطر جديد (جوالا وحاسوبا)؛ الإرسال بالزر — وCtrl/Cmd+Enter اختصار
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  };

  const empty = !chat || chat.messages.length === 0;
  const composer = (
    <div className="mu-input">
      <button className="mu-send" onClick={() => void send()} disabled={busy || !input.trim()} aria-label={ar ? "إرسال" : "send"}>
        {busy ? (
          <span aria-hidden>…</span>
        ) : (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
        )}
      </button>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        rows={1}
        placeholder={ar ? "اكتبْ سؤالك هنا…" : "write your question here…"}
        aria-label={ar ? "رسالة" : "message"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="enter"
      />
    </div>
  );

  return (
    <div className="mu-page" ref={pageRef} style={{ "--mu-listw": `${listW}px` } as React.CSSProperties}>
      {/* chat list */}
      <aside className={`mu-list${listOpen ? " open" : ""}`}>
        <button className="mu-new" onClick={() => { navigate("/assistant"); setInput(""); setListOpen(false); }}>
          <span className="mu-new-plus" aria-hidden>＋</span> {ar ? "محادثة جديدة" : "New chat"}
        </button>
        <div className="mu-chats">
          {chats.map((c) => (
            <div key={c.id} className={`mu-chat${c.id === id ? " on" : ""}`}>
              <Link to={`/assistant/${c.id}`} className="mu-chat-t" onClick={() => setListOpen(false)}>{c.title}</Link>
              <button className="mu-chat-x" aria-label={ar ? "حذف" : "delete"} onClick={() => { if (confirm(ar ? "حذف المحادثة؟" : "Delete chat?")) { deleteChat(c.id); if (c.id === id) navigate("/assistant"); } }}>✕</button>
            </div>
          ))}
        </div>
      </aside>
      <div
        className="mu-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={ar ? "تغيير عرض القائمة" : "resize list"}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); dragging.current = true; }}
        onPointerMove={onResizeMove}
        onPointerUp={() => { if (dragging.current) { dragging.current = false; localStorage.setItem("nibras-listw", String(wRef.current)); } }}
      />
      {listOpen && <div className="mu-list-bg" onClick={() => setListOpen(false)} />}

      {/* thread */}
      <main className="mu-main">
        <div className="mu-topbar">
          <button className="mu-list-btn" onClick={() => setListOpen((v) => !v)} aria-label={ar ? "المحادثات" : "chats"}>☰</button>
          <span className="mu-title">{chat?.title || (ar ? "نِبراس" : "Nibras")}</span>
        </div>

        <div className={`mu-thread${empty ? " empty" : ""}`}>
          {empty ? (
            <div className="mu-hero">
              <div className="mu-empty-mark"><span className="ai-spark" aria-hidden /></div>
              <h1 className="mu-empty-h">{ar ? "تحدَّثْ مع نِبراس" : "Talk to Nibras"}</h1>
              <span className="mu-empty-tag">{ar ? "مساعدُ مشكاة الذكيّ — يبحث في بياناتها ويجيب بإسناد" : "مشكاة's AI assistant — searches its data, answers with citations"}</span>
              <p className="mu-hero-sub">
                {ar
                  ? "يحاورك ويبحث بنفسه أثناء الحديث في القرآن ولغته وكتب المكتبة المسندة: اسألْ عن آيةٍ أو معنًى أو فرقٍ لغوي، وناقشْ ورتّبْ أفكارك، واطلبْ بحثًا أو خطبةً أو مقالة — كلُّ واقعةٍ عنده بمصدرها، والآياتُ من نصّ المصحف لا من ذاكرته."
                  : "It converses and searches on its own as you talk — the Qur'an, its language, and the cited library: ask about a verse, a meaning, a linguistic distinction; discuss and organize ideas; request a paper or khutba — every fact carries its source, and verses come from the muṣḥaf's text, never from memory."}
              </p>
              {composer}
              <button className="mu-ex" onClick={() => void send(EXAMPLE_AR)}>
                <span className="mu-ex-hint">{ar ? "جرّبْ مثلًا: " : "try: "}</span>{EXAMPLE_AR}
              </button>
              {srcsReady && (
                <details className="mu-srcs">
                  <summary>{ar ? "ما مصادرُ نبراس وأدواتُه؟" : "What does Nibras search?"}</summary>
                  <div className="mu-srcs-body">
                    <div><b>{ar ? "المصحفُ أولًا: " : "The muṣḥaf first: "}</b>{ar ? "بحثٌ بالمعنى في الآيات، واستقصاءُ الجذور وصيغِها، ووحداتُ السياق، وعدٌّ حتميٌّ للرسم — والآياتُ تُنقل من نصّ المصحف لا من ذاكرة النموذج." : "meaning-search over the verses, root inquiry, context units, deterministic counting — verses come from the muṣḥaf's text."}</div>
                    <div><b>{ar ? `طبقاتُ مشكاة (${num(layersDigest().filter((l) => l.id !== "search").length)}): ` : "Layers: "}</b>{layersDigest().filter((l) => l.id !== "search").map((l) => l.label.split(" (")[0]).join("، ")} — {ar ? "بدرجتي سندٍ معلنتين: محسوبٌ من حساباتنا، ومنقولٌ يُقتبس منسوبًا لمصدره." : "each labeled محسوب (computed) or منقول (quoted)."}</div>
                    <div>
                      <b>{ar ? `المضمّنُ لبحثه الدلالي (${num(BOOK_SOURCES.filter((b) => b.embedded).length)}): ` : "Embedded for semantic search: "}</b>
                      {BOOK_SOURCES.filter((b) => b.embedded).map((b) => b.label).join("، ")}.
                    </div>
                    <div>
                      <b>{ar ? "ويقرأ نصًّا عند الآية (دون تضمين): " : "Read verbatim at a verse: "}</b>
                      {ar
                        ? "التفاسيرُ الميسّرةُ الخمسة، وأسبابُ النزول، والقراءاتُ، والإعرابُ — تُقتبس عند الموضع المطلوب؛ ومداخلُ كتبِ البيان تُستدعى بعناوينها عبر طبقة البيان."
                        : "the five concise tafsirs, asbāb, qirāʾāt and iʿrāb at the requested verse; bayān book entries by their headings via the bayān layer."}
                    </div>
                    <div className="muted">
                      {ar ? "أما التفاسيرُ العريقةُ العشرون فللاستعراض في " : "The twenty classical tafsirs are browsable in "}
                      <Link to="/tafasir">{ar ? "قسم التفاسير والمصادر" : "the sources section"}</Link>
                      {ar ? " — خارجَ أدوات نبراس عمدًا (حتى لا يمتلئ سياقُه من كتابٍ واحد)." : " — deliberately outside Nibras's tools."}
                    </div>
                  </div>
                </details>
              )}
            </div>
          ) : (
            <>
              {chat.messages.map((m) => <Bubble key={m.id} m={m} />)}
              <div ref={endRef} />
            </>
          )}
        </div>

        {!empty && (
          <div className="mu-inputbar">
            {composer}
            <div className="mu-foot muted">{ar ? "نِبراس يبحث في بياناتنا ويؤلّف منها بإسناد — عونٌ للباحث لا فتوى، والعبرةُ بمراجعة أهل العلم." : "Nibras searches our data and composes from it with citations — research aid, not fatwa."}</div>
          </div>
        )}
      </main>
    </div>
  );
}
