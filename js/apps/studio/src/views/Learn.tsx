/**
 * مسار الجذور — a spaced-repetition drill over the Qur'an's roots. Each card is
 * a root; the answer is its classical gloss (الراغب / مقاييس). New roots are
 * introduced most-frequent-first, so the learner's effort tracks the mushaf —
 * the coverage bar shows what share of the Qur'an's words those roots make up.
 * Nothing here is interpretation: it is the lexicon, drilled.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { allRootsList } from "../db";
import { getUILang, num, useUILang } from "../i18n";
import type { RootDoc } from "../types";
import { cardOf, grade, isLearned, resetSrs, useSrs, type Grade } from "../srs";

const NEW_PER_SESSION = 8;
const deNoise = (s: string) => s.replace(/\[[^\]]*\]/g, " ").replace(/[﴿﴾]/g, "").replace(/\s+/g, " ").trim();

export default function Learn() {
  useUILang();
  const ar = getUILang() === "ar";
  const srs = useSrs();
  const [roots, setRoots] = useState<RootDoc[] | null>(null);
  const [session, setSession] = useState<RootDoc[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // only roots that carry a classical gloss can be a card
    allRootsList()
      .then((rs) => setRoots(rs.filter((r) => r.meanings && r.meanings.length > 0)))
      .catch(() => setRoots([]));
  }, []);

  // frequency-sorted, and the study stats
  const byFreq = useMemo(
    () => (roots ? [...roots].sort((a, b) => (b.occurrences ?? 0) - (a.occurrences ?? 0)) : []),
    [roots],
  );
  const stats = useMemo(() => {
    const now = Date.now();
    let totalOcc = 0, learnedOcc = 0, learned = 0, due = 0;
    for (const r of byFreq) {
      totalOcc += r.occurrences ?? 0;
      const c = srs[r.root];
      if (isLearned(c)) { learned += 1; learnedOcc += r.occurrences ?? 0; }
      if (c && c.due <= now) due += 1;
    }
    return { total: byFreq.length, learned, due, coverage: totalOcc ? Math.round((learnedOcc / totalOcc) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byFreq, srs]);

  const startSession = useCallback(() => {
    const now = Date.now();
    const due = byFreq.filter((r) => { const c = srs[r.root]; return c && c.due <= now; });
    const fresh = byFreq.filter((r) => !srs[r.root]).slice(0, NEW_PER_SESSION);
    setSession([...due, ...fresh]);
    setIdx(0);
    setRevealed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byFreq]);

  const card = session[idx];
  const onGrade = useCallback((q: Grade) => {
    const r = session[idx];
    if (!r) return;
    grade(r.root, q);
    if (q === 0) setSession((s) => [...s, r]); // repeat a forgotten card later this session
    setIdx((i) => i + 1);
    setRevealed(false);
  }, [session, idx]);

  // keyboard: space reveals, 1–4 grade
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      if (!card) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setRevealed(true); }
      else if (revealed && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); onGrade((Number(e.key) - 1) as Grade); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, onGrade]);

  if (!roots) return <div className="page"><p className="muted">{ar ? "جارٍ التحميل…" : "Loading…"}</p></div>;

  const inSession = session.length > 0 && idx < session.length;

  return (
    <div className="page">
      <div className="learn-wrap">
        <header className="learn-head">
          <h1 className="learn-title">{ar ? "مسار الجذور" : "The Root Path"}</h1>
          <p className="learn-lead">
            {ar
              ? "احفظ جذور القرآن بالتكرار المتباعد — من الأكثر ورودًا، فتغطّي معظم كلماته سريعًا. جوابُ كلّ جذرٍ معناه من المعجمين، لا تفسير."
              : "Memorise the Qur'an's roots by spaced repetition — most-frequent first, so you cover most of its words fast. Each answer is the lexical sense, not interpretation."}
          </p>
          <div className="learn-stats">
            <span className="learn-stat"><b>{num(stats.coverage)}٪</b> {ar ? "تغطية النصّ" : "text coverage"}</span>
            <span className="learn-stat"><b>{num(stats.learned)}</b> {ar ? "جذرًا محفوظًا" : "roots learned"}</span>
            <span className="learn-stat"><b>{num(stats.due)}</b> {ar ? "للمراجعة الآن" : "due now"}</span>
            <span className="learn-stat muted">{ar ? `من ${num(stats.total)}` : `of ${stats.total}`}</span>
          </div>
          <div className="learn-cover"><div style={{ width: `${stats.coverage}%` }} /></div>
        </header>

        {!inSession ? (
          <div className="learn-idle">
            <p className="muted">
              {idx > 0
                ? (ar ? "أحسنت — انتهت الجلسة." : "Done — session complete.")
                : stats.due > 0
                  ? (ar ? `لديك ${num(stats.due)} جذرًا مستحقًّا للمراجعة.` : `${stats.due} roots due for review.`)
                  : (ar ? "ابدأ رحلتك مع جذور القرآن." : "Begin your journey through the Qur'an's roots.")}
            </p>
            <button className="primary learn-begin" onClick={startSession}>
              {stats.due > 0 ? (ar ? "راجِعِ الآن" : "Review now") : (ar ? "تعلّم جذورًا جديدة" : "Learn new roots")}
            </button>
            {stats.learned > 0 && (
              <button
                className="chip learn-reset"
                onClick={() => { if (confirm(ar ? "تصفير كل تقدّم الحفظ؟" : "Reset all learning progress?")) resetSrs(); }}
              >
                ↺ {ar ? "تصفير التقدّم" : "reset progress"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="learn-progress muted">{num(idx + 1)} / {num(session.length)}</div>
            <div className="learn-card" key={card.root + idx}>
              <div className="learn-front">
                <div className="learn-root quran">{card.root}</div>
                <div className="learn-occ muted">
                  {ar
                    ? `ورد ${num(card.occurrences)} مرّة · ${num(card.lemmas.length)} من المشتقّات`
                    : `${card.occurrences} occurrences · ${card.lemmas.length} derivations`}
                  {cardOf(card.root) == null && <span className="learn-new"> · {ar ? "جديد" : "new"}</span>}
                </div>
              </div>

              {!revealed ? (
                <button className="primary learn-reveal" onClick={() => setRevealed(true)}>
                  {ar ? "أظهِر المعنى" : "Reveal"} <span className="learn-kbd">space</span>
                </button>
              ) : (
                <>
                  <div className="learn-back">
                    {(card.meanings ?? []).map((m) => (
                      <div key={m.key} className="learn-mean">
                        <span className="learn-mean-src muted">{m.title}</span>
                        <p className="learn-mean-text">{deNoise(m.text).slice(0, 460)}{deNoise(m.text).length > 460 ? "…" : ""}</p>
                      </div>
                    ))}
                    {card.lemmas.length > 0 && (
                      <div className="learn-deriv">
                        {card.lemmas.slice(0, 10).map((l) => (
                          <span key={l.lemma} className="chip quran learn-deriv-w">{l.lemma}</span>
                        ))}
                      </div>
                    )}
                    <Link to={`/roots/${encodeURIComponent(card.root)}`} className="chip link learn-see">
                      {ar ? "مواضعه في المصحف ←" : "occurrences in the mushaf →"}
                    </Link>
                  </div>
                  <div className="learn-grades">
                    <button className="lg lg-again" onClick={() => onGrade(0)}>{ar ? "أعِدْ" : "Again"}<span className="learn-kbd">1</span></button>
                    <button className="lg lg-hard" onClick={() => onGrade(1)}>{ar ? "صعب" : "Hard"}<span className="learn-kbd">2</span></button>
                    <button className="lg lg-good" onClick={() => onGrade(2)}>{ar ? "جيّد" : "Good"}<span className="learn-kbd">3</span></button>
                    <button className="lg lg-easy" onClick={() => onGrade(3)}>{ar ? "سهل" : "Easy"}<span className="learn-kbd">4</span></button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
