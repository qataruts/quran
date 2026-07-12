/**
 * نِبراس — a research chat over مشكاة's own data. It retrieves from the Qur'an
 * (verses by meaning, roots + their lexical sense) and, on request, drafts a
 * منشور / خطبة / محاضرة / تلخيص FROM that gathered material — a grounded draft for
 * a scholar to build on, never tafsir or fatwa. Multi-chat, on-device, no account.
 *
 * Flow: /api/chat plans (which local tool, or compose, or answer) → the tools run
 * here for free → /api/compose writes only from what this chat gathered.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getUILang, num, useUILang } from "../i18n";
import {
  addMessage, chatMaterial, createChat, deleteChat, getChat, patchMessage, renameChat, useChats,
  type ChatAyah, type ChatMsg,
} from "../chat";
import { toolRootInfo, toolSearchMeaning } from "../lib/muinTools";
import { surahNameAr } from "../db";

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const EXAMPLES_AR = [
  "ابحث عن آياتٍ في الصبر على البلاء",
  "ما معنى جذر «رحم» ومواضعه؟",
  "اجمع آياتٍ عن العدل، ثم اكتب منشورًا موجزًا منها",
  "آيات في شكر النعمة، ثم مسوّدة خطبة",
];

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
            <div className="mu-typing"><span /><span /><span /></div>
          ) : (
            <>
              {m.text && <div className={`mu-reply${m.error ? " err" : ""}`}>{m.text}</div>}
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
      const mat = chatMaterial(cur);
      const plan = await postJson("/api/chat", {
        messages: cur.messages.filter((m) => !m.pending).map((m) => ({ role: m.role, text: m.text })),
        material: { ayahs: mat.ayahs.map((a) => ({ ref: a.ref, text: a.text })), roots: mat.roots.map((r) => ({ root: r.root })) },
      });
      const patch: Partial<ChatMsg> = { pending: false, text: plan.reply || "" };
      if (plan.action === "search_meaning" && plan.query) {
        patch.ayahs = await toolSearchMeaning(plan.query);
        if (!patch.ayahs.length) patch.text = (plan.reply || "") + (ar ? " (لم أجد آياتٍ مطابقة.)" : "");
      } else if (["search_root", "root_info", "similar_roots"].includes(plan.action) && plan.query) {
        const r = await toolRootInfo(plan.query);
        patch.roots = r.roots; patch.ayahs = r.ayahs;
        if (!r.roots.length) patch.text = (plan.reply || "") + (ar ? " (لم أجد هذا الجذر.)" : "");
      } else if (plan.action === "compose" || plan.action === "search_compose") {
        const cur2 = getChat(cid)!;
        const prior = chatMaterial(cur2);
        // gather now if asked in one message (search_compose), or if nothing's gathered yet
        let fresh: ChatAyah[] = [];
        const q = plan.query || plan.subject || "";
        if ((plan.action === "search_compose" || prior.ayahs.length === 0) && q) {
          fresh = await toolSearchMeaning(q);
          if (fresh.length) patch.ayahs = fresh;
        }
        // union of freshly-found + already-gathered verses (dedupe by ref)
        const seen = new Set<string>();
        const ayahs: ChatAyah[] = [];
        for (const a of [...fresh, ...prior.ayahs]) if (!seen.has(a.ref)) { seen.add(a.ref); ayahs.push(a); }
        if (!ayahs.length) {
          patch.text = ar ? "لم أجدْ آياتٍ في هذا الموضوع لأبني عليها — جرّبْ صياغةً أخرى للطلب، أو ابحثْ أوّلًا ثمّ اطلبِ الكتابة." : "No verses found to build on — try rephrasing, or search first then compose.";
        } else {
          // the most recent draft in this chat — so «وسّع / نقّح» continues it, not restarts
          const prev = [...cur2.messages].reverse().find((mm) => mm.draft)?.draft || "";
          const composed = await postJson("/api/compose", {
            task: plan.task || "post", subject: plan.subject || text, length: plan.length || "long",
            ayahs: ayahs.slice(0, 16).map((a) => {
              const [s, n] = a.ref.split(":");
              return { ref: `${surahNameAr(Number(s))} ${n}`, text: a.text };
            }),
            roots: prior.roots.slice(0, 12).map((r) => ({ root: r.root, gloss: r.gloss })),
            instruction: text, previous: prev,
          });
          patch.text = plan.reply || (ar ? "إليك مسوّدةً تبني عليها:" : "A draft to build on:");
          patch.draft = composed.text;
          patch.composed = true;
        }
      }
      patchMessage(cid, aid, patch);
    } catch {
      patchMessage(cid, aid, { pending: false, error: true, text: ar ? "تعذّر إتمام الطلب — تأكّد من الاتصال وحاوِل ثانيةً." : "Request failed — check your connection and retry." });
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  return (
    <div className="mu-page" ref={pageRef} style={{ "--mu-listw": `${listW}px` } as React.CSSProperties}>
      {/* chat list */}
      <aside className={`mu-list${listOpen ? " open" : ""}`}>
        <button className="primary mu-new" onClick={() => { navigate("/assistant"); setInput(""); setListOpen(false); }}>
          ＋ {ar ? "محادثة جديدة" : "New chat"}
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

        <div className="mu-thread">
          {!chat || chat.messages.length === 0 ? (
            <div className="mu-empty">
              <div className="mu-empty-mark"><span className="ai-spark" aria-hidden /></div>
              <h1 className="mu-empty-h">{ar ? "نِبراس" : "Nibras"}</h1>
              <p className="mu-empty-lead">
                {ar
                  ? "مساعدُ بحثٍ في القرآن: يجمع لك الآيات بالمعنى، ومعاني الجذور، ثم يصوغ منها مسوّدةَ منشورٍ أو خطبةٍ أو محاضرةٍ من نصّ القرآن وبياناته."
                  : "A research chat over the Qur'an: it gathers verses by meaning and root senses, then drafts a post / khutba / lecture from that material."}
              </p>
              <ol className="mu-how">
                <li>
                  <span className="mu-how-n">١</span>
                  <span>{ar ? "اطلبْ آياتٍ في موضوعٍ بالمعنى، أو معنى جذرٍ ومواضعِه." : "Ask for verses on a theme by meaning, or a root's sense."}</span>
                </li>
                <li>
                  <span className="mu-how-n">٢</span>
                  <span>{ar ? "تتجمّعُ الآياتُ والجذورُ في هذه المحادثةِ مادّةً محفوظةً لك." : "Verses and roots accumulate in this chat as saved material."}</span>
                </li>
                <li>
                  <span className="mu-how-n">٣</span>
                  <span>{ar ? "اطلبْ صياغةَ منشورٍ أو خطبةٍ أو محاضرةٍ منها، تُدعَّمُ بالآيات — ثم قل «وسِّعْ» أو «نقِّحْ» لتطويرها." : "Ask for a post / khutba / lecture from them, cited to the verses — then say 'expand' or 'refine'."}</span>
                </li>
              </ol>
              <div className="mu-ex-label muted">{ar ? "جرِّبْ:" : "Try:"}</div>
              <div className="mu-examples">
                {EXAMPLES_AR.map((ex) => (
                  <button key={ex} className="mu-ex" onClick={() => void send(ex)}>{ex}</button>
                ))}
              </div>
            </div>
          ) : (
            chat.messages.map((m) => <Bubble key={m.id} m={m} />)
          )}
          <div ref={endRef} />
        </div>

        <div className="mu-input">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder={ar ? "اطلبْ آياتٍ في موضوع، أو معنى جذر، أو صياغةَ منشورٍ منها…" : "ask for verses on a theme, a root's meaning, or a draft from them…"}
            aria-label={ar ? "رسالة" : "message"}
          />
          <button className="primary mu-send" onClick={() => void send()} disabled={busy || !input.trim()}>
            {busy ? "…" : ar ? "إرسال" : "Send"}
          </button>
        </div>
        <div className="mu-foot muted">{ar ? "نِبراس يجمع ويصوغ من بيانات القرآن — مسوّداتٌ للباحث." : "Grounded drafts from the Qur'an's data — for research."}</div>
      </main>
    </div>
  );
}
