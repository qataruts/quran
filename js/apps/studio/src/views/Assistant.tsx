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
import { retrieveBooks, hasBooks, bookLabel } from "../rag";
import { asbabFor, tafsirFor } from "../books";
import { loadTafsil, searchUnits, topicOf, unitOf, type TafsilUnit } from "../tafsil";
import { ayahByLocationMap, surahNameAr } from "../db";

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const EXAMPLES_AR = [
  "حدّثني عن الصبر في القرآن: آياتُه ومعناه في المعاجم",
  "رتّبْ لي محاورَ خطبةٍ عن شكر النعمة ثم اكتبها",
  "ما الفرق بين الخوف والخشية في القرآن؟",
  "أُعِدُّ بحثًا عن العدل — ساعدني في مادته ومخططه",
];

/** ما تعرضه فقاعة الحالة أثناء نداء أداة */
const TOOL_STATUS: Record<string, (a: Record<string, unknown>) => string> = {
  search_meaning: (a) => `يبحث عن آيات: ${String(a.query ?? "").slice(0, 60)}…`,
  search_root: (a) => `يستقصي الجذر: ${String(a.word ?? "")}`,
  tafsir_of: (a) => `يقرأ التفاسير عند ${String(a.ref ?? "")}`,
  asbab_of: (a) => `يراجع أسباب النزول عند ${String(a.ref ?? "")}`,
  search_books: (a) => `يبحث في الكتب: ${String(a.query ?? "").slice(0, 60)}…`,
  context_of: (a) => `يقرأ سياق ${String(a.ref ?? "")}`,
  search_passages: (a) => `يبحث في المقاطع: ${String(a.query ?? "").slice(0, 60)}…`,
  compose_draft: (a) => `يؤلّف مسودة: ${String(a.subject ?? "")}`,
};

const refName = (ref: string): string => {
  const [s, n] = ref.split(":");
  return `${surahNameAr(Number(s))} ${n}`;
};

/** عرضٌ آمنٌ لنص المساعد: يحوّل عادات Markdown الخفيفة (**غامق**، `*` نقاط،
 *  ## عناوين) إلى عناصرَ حقيقية بدل ظهور الوسوم حرفيًّا — بلا HTML خام. */
function renderReply(text: string): ReactNode {
  const bold = (line: string, key: number): ReactNode => {
    const parts = line.split(/\*\*([^*]+)\*\*/g);
    if (parts.length === 1) return <span key={key}>{line}</span>;
    return <span key={key}>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</span>;
  };
  return text.split("\n").map((raw, i) => {
    let line = raw;
    const head = /^#{1,4}\s+(.*)$/.exec(line);
    if (head) return <div key={i} style={{ fontWeight: 700, marginTop: 6 }}>{bold(head[1], 0)}</div>;
    const m = /^(\s*)([*•-])\s+(.*)$/.exec(line);
    if (m) {
      const depth = Math.min(Math.floor(m[1].length / 2), 3);
      return (
        <div key={i} style={{ paddingInlineStart: 14 + depth * 14 }}>
          <span className="muted">• </span>{bold(m[3], 0)}
        </div>
      );
    }
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    return <div key={i}>{bold(line, 0)}</div>;
  });
}

function Bubble({ m }: { m: ChatMsg }) {
  const ar = getUILang() === "ar";
  const copy = () => navigator.clipboard?.writeText(m.draft || m.text || "");
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
              {m.text && <div className={`mu-reply${m.error ? " err" : ""}`}>{renderReply(m.text)}</div>}
              {m.ayahs && m.ayahs.length > 0 && (
                <div className="mu-ayahs">
                  {m.ayahs.map((a) => {
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
              {m.roots && m.roots.length > 0 && (
                <div className="mu-roots">
                  {m.roots.map((r) => (
                    <span key={r.root} className="mu-root">
                      <Link to={`/journey/${encodeURIComponent(r.root)}`} className="quran mu-root-w">{r.root}</Link>
                      <span className="muted"> · {num(r.occ)}</span>
                      {r.gloss && <div className="mu-root-g">{r.gloss}</div>}
                    </span>
                  ))}
                </div>
              )}
              {m.books && m.books.length > 0 && (
                <div className="mu-books">
                  <div className="mu-books-h muted">{ar ? "من المصادر (مذكورةً):" : "from the sources (cited):"}</div>
                  {m.books.map((b, i) => (
                    <div key={i} className="mu-book">
                      <div className="mu-book-src">◆ {bookLabel(b.source)}{b.ref ? ` · ${b.ref}` : ""}</div>
                      <div className="mu-book-t">{b.text}</div>
                    </div>
                  ))}
                </div>
              )}
              {m.draft && (
                <div className="mu-draft">
                  <div className="mu-draft-note muted">{ar ? "مسوّدةٌ محسوبةٌ من الآيات أعلاه — راجِعْها." : "A computed draft from the verses above — review it."}</div>
                  <div className="mu-draft-body">{m.draft}</div>
                  <button className="chip mu-copy" onClick={copy}>{ar ? "نسخ" : "copy"} ⧉</button>
                </div>
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
          const r = await toolRootInfo(String(args.word ?? ""));
          for (const rt of r.roots) if (!acc.roots.some((x) => x.root === rt.root)) acc.roots.push(rt);
          addAyahs(r.ayahs.slice(0, 6));
          return {
            roots: r.roots.map((rt) => ({ root: rt.root, occurrences: rt.occ, sense: (rt.gloss || "").slice(0, 400) })),
            ayahs: r.ayahs.slice(0, 6).map((a) => ({ ref: a.ref, surah: refName(a.ref), text: a.text })),
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
          await loadTafsil();
          const texts = await ayahByLocationMap();
          const spanText = (u: TafsilUnit, cap = 1600): string => {
            const parts: string[] = [];
            for (let a = u.a1; a <= u.a2; a++) parts.push(texts.get(`${u.s}:${a}`)?.textClean ?? "");
            const t = parts.join(" ۝ ");
            return t.length > cap ? `${t.slice(0, cap)}…` : t;
          };
          const pack = (u: TafsilUnit) => ({
            range: `${u.s}:${u.a1}-${u.a2}`,
            span: `${surahNameAr(u.s)} ${u.a1}–${u.a2}`,
            topic: topicOf(u.t)?.name ?? "",
            text: spanText(u),
          });
          if (name === "context_of") {
            const ref = String(args.ref ?? "").trim();
            if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return { error: "ref يجب أن يكون بصيغة رقم_السورة:رقم_الآية" };
            const u = unitOf(ref);
            if (!u) return { ref, found: false, note: "لا مقطعَ لهذا الموضع" };
            const p = pack(u);
            acc.books.push({ source: "التفصيل الموضوعي", ref: p.span, text: p.text.slice(0, 700) });
            return { ref, passage: p };
          }
          const k = Math.min(Number(args.k) || 4, 8);
          const hits = await searchUnits(String(args.query ?? ""), k);
          for (const h of hits.slice(0, 3)) {
            const p = pack(h.unit);
            acc.books.push({ source: "التفصيل الموضوعي", ref: p.span, text: p.text.slice(0, 700) });
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
      const steps: { name: string; args: Record<string, unknown>; result: unknown }[] = [];
      let finalText = "";
      for (let round = 0; round < 5; round++) {
        const res = await postJson("/api/assist", { messages: history, steps });
        if (res.text) { finalText = res.text; break; }
        const calls: { name: string; args: Record<string, unknown> }[] = Array.isArray(res.calls) ? res.calls.slice(0, 4) : [];
        if (!calls.length) { finalText = ar ? "لم أستطع إتمام هذا الطلب." : "Could not complete this request."; break; }
        for (const c of calls) {
          patchMessage(cid, aid, { pending: true, text: TOOL_STATUS[c.name]?.(c.args) ?? c.name });
          const result = await runTool(c.name, c.args ?? {});
          steps.push({ name: c.name, args: c.args ?? {}, result });
        }
      }
      if (!finalText) finalText = ar ? "طال البحث — هذا ما جمعتُه حتى الآن، فاسألني عنه أو ضيّق الطلب." : "Search ran long — here is what was gathered; narrow the request.";

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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  const empty = !chat || chat.messages.length === 0;
  const composer = (
    <div className="mu-input">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        rows={1}
        placeholder={ar ? "اكتبْ ما تريد…" : "write anything…"}
        aria-label={ar ? "رسالة" : "message"}
      />
      <button className="mu-send" onClick={() => void send()} disabled={busy || !input.trim()} aria-label={ar ? "إرسال" : "send"}>
        {busy ? (
          <span aria-hidden>…</span>
        ) : (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
        )}
      </button>
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
              <h1 className="mu-empty-h">{ar ? "بمَ نبدأ؟" : "Where shall we begin?"}</h1>
              <p className="mu-hero-sub">
                {ar
                  ? "نِبراس — مساعدُ بحثٍ يحاورك ويبحث بنفسه في القرآن ولغته والتفاسير المسندة أثناء الحديث: اسأل، وناقش، ورتّب أفكارك، واطلب بحثًا أو خطبةً أو مقالة — وكلُّ واقعةٍ عنده بمصدرها."
                  : "Nibras — a research assistant that converses and searches the Qur'an, its language and cited tafsīr on its own as you talk: ask, discuss, organize ideas, request a paper or khutba — every fact carries its source."}
              </p>
              {composer}
              <div className="mu-examples">
                {EXAMPLES_AR.slice(0, 4).map((ex) => (
                  <button key={ex} className="mu-ex" onClick={() => void send(ex)}>{ex}</button>
                ))}
              </div>
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
