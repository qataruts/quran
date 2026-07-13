/**
 * الخيوطُ الموضوعيّة — trace ANY meaning through the whole mushaf. You seed a
 * concept (الرحمة، الآخرة، الصبر…); we embed it, take the centroid of its nearest
 * verses, then measure every one of the 6236 āyāt against that centre. The result
 * is a computed thread: a «presence» fingerprint across the 114 sūras, and the
 * verses most on the thread. Same reproducible technique that anchors التوحيد.
 * Route: /khayt. (see docs/mechanism-roadmap.md)
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fuzzyRoots, getAyahByGlobalNo, getAyahByLocation, searchAyahs, surahNameAr } from "../db";
import { getUILang, num, useUILang } from "../i18n";
import { loadVectors, meaningSearch, vectorsReady } from "../semantic";

const SUGGESTIONS = ["الرحمة", "الآخرة والحساب", "الصبر عند الشدّة", "التوحيد", "العدل والقسط", "الشكر", "الخوف والرجاء", "التوبة والمغفرة", "خلق السماوات والأرض", "الإنفاق في سبيل الله"];
const mushafKey = (loc: string) => { const [s, a] = loc.split(":").map(Number); return s * 1000 + a; };

interface TV { loc: string; text: string; p: number; surah: number }

export default function ThematicThread() {
  useUILang();
  const ar = getUILang() === "ar";
  const [input, setInput] = useState("");
  const [concept, setConcept] = useState("");
  const [thread, setThread] = useState<TV[]>([]);
  const [heat, setHeat] = useState<number[]>([]); // per-surah intensity 0..1 (index = surahNo-1)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const [params] = useSearchParams();

  // seed from a link, e.g. /khayt?q=رحم — trace that word/root straight away
  useEffect(() => {
    const seed = params.get("q");
    if (seed && seed.trim()) { setInput(seed); void run(seed); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clear() { seq.current++; setInput(""); setConcept(""); setThread([]); setHeat([]); setError(null); setLoading(false); }

  async function run(c: string) {
    const query = c.trim();
    if (!query) return;
    const id = ++seq.current;
    setLoading(true); setError(null); setConcept(query);
    try {
      if (!vectorsReady()) await loadVectors();
      // Lexical GROUNDING + a tight semantic halo. Pure embedding proximity is too
      // fuzzy for specific words (all verses embed close together), so the CORE of the
      // thread is the verses that ACTUALLY contain the concept (FTS — precise, and its
      // count reflects rarity: «وسوس» → a handful, «الرحمة» → many). We then add only a
      // FEW near-top semantic verses, to catch the field's synonyms (غفور for الرحمة)
      // without letting the fuzzy cloud back in.
      const [lex, sem, rm] = await Promise.all([searchAyahs(query), meaningSearch(query, 200), fuzzyRoots(query, 1)]);
      if (seq.current !== id) return;
      const semResolved = (await Promise.all(sem.map(async (h) => {
        const a = await getAyahByGlobalNo(h.ayahId);
        return a ? { loc: a.location, text: a.textClean || a.textUthmani, surah: a.surahNo, score: h.score } : null;
      }))).filter((x): x is { loc: string; text: string; surah: number; score: number } => !!x);
      if (seq.current !== id) return;
      const semScore = new Map(semResolved.map((x) => [x.loc, x.score]));
      const map = new Map<string, TV>();
      for (const a of lex) map.set(a.location, { loc: a.location, text: a.textClean || a.textUthmani, surah: a.surahNo, p: semScore.get(a.location) ?? 0 });
      // add a RARE root's FULL occurrences — catches the morphological forms FTS
      // misses (فوسوس/توسوس for root وسوس). Skip common roots (رحم → الرحمن everywhere).
      const rd = rm[0]?.doc;
      // .locations may be word-level (s:a:w) — normalize to verse (s:a) + dedupe
      const rvLocs = rd ? [...new Set((rd.locations ?? []).map((l) => String(l).split(":").slice(0, 2).join(":")))] : [];
      const rootLocs = rvLocs.length <= 50 ? rvLocs : [];
      for (const loc of rootLocs) {
        if (map.has(loc)) continue;
        const a = await getAyahByLocation(loc);
        if (a) map.set(loc, { loc, text: a.textClean || a.textUthmani, surah: a.surahNo, p: semScore.get(loc) ?? 0 });
      }
      const top = sem[0]?.score ?? 0;
      let halo = 0;
      for (const x of semResolved) {
        if (halo >= 12 || x.score < top - 0.05) break;
        if (!map.has(x.loc)) { map.set(x.loc, { loc: x.loc, text: x.text, surah: x.surah, p: x.score }); halo++; }
      }
      const verses = [...map.values()];
      setThread(verses.sort((a, b) => mushafKey(a.loc) - mushafKey(b.loc)));
      const mx = new Float32Array(114);
      for (const v of verses) { const s = v.surah - 1; const w = v.p || 0.55; if (s >= 0 && w > mx[s]) mx[s] = w; }
      let lo = 1, hi = 0; for (const v of mx) { if (v > 0 && v < lo) lo = v; if (v > hi) hi = v; }
      const span = hi - lo || 1;
      setHeat(Array.from(mx, (v) => (v <= 0 ? 0 : 0.3 + 0.7 * (v - lo) / span)));
      setLoading(false);
    } catch (e) {
      if (seq.current !== id) return;
      setError((e as Error).message === "no-embedder" ? (ar ? "يلزم مفتاحُ التضمين (Gemini) لهذه الميزة." : "needs an embedding key") : (ar ? "تعذّر بناءُ الخيط." : "failed"));
      setLoading(false);
    }
  }

  const heatColor = (v: number) => (v <= 0 ? "var(--line)" : `hsl(${28 + v * 12}, ${55 + v * 35}%, ${72 - v * 34}%)`);

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الخيوطُ الموضوعيّة" : "Thematic threads"}</h1>
          <p className="jw-lead">
            {ar
              ? "اطلبْ معنًى، نتتبّعْه لك عبرَ المصحف كلِّه: نُمثّل المعنى بمتّجهٍ، ونقيسُ قربَ كلِّ آيةٍ منه — فيظهرُ «حضورُ» المعنى في السور، وأقربُ الآيات إليه. حسابٌ لا رأي."
              : "Name a meaning; we trace it across the whole mushaf by embedding proximity — its presence per sūra and the verses most on the thread."}
          </p>
          <form className="th-form" onSubmit={(e) => { e.preventDefault(); run(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} dir="rtl"
              placeholder={ar ? "اكتب معنًى… (الرحمة، الصبر، الآخرة)" : "a meaning… (mercy, patience)"} />
            <button type="submit" disabled={loading || !input.trim()}>{ar ? "تتبّعْ" : "trace"}</button>
            {(concept || input) && <button type="button" className="th-clear" onClick={clear} title={ar ? "مسح النتائج" : "clear"}>✕</button>}
          </form>
          <div className="th-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => { setInput(s); run(s); }}>{s}</button>
            ))}
          </div>
        </header>

        {loading && <div className="muted" style={{ padding: 30, textAlign: "center" }}>{ar ? `جارٍ تتبّعُ «${concept}» عبر المصحف…` : "tracing…"}</div>}
        {error && <div className="muted" style={{ padding: 20, textAlign: "center", color: "var(--gold)" }}>{error}</div>}

        {!loading && heat.length > 0 && (
          <>
            <div className="th-section-h">{ar ? `حضورُ «${concept}» في سور المصحف` : `presence of «${concept}» across the sūras`}</div>
            <div className="th-strip" role="img" aria-label={ar ? "حضور المعنى في السور" : "presence per sura"}>
              {heat.map((v, i) => (
                <Link key={i} to={`/read/${i + 1}/1`} className="th-cell" style={{ background: heatColor(v) }}
                  title={`${surahNameAr(i + 1)} — ${ar ? "الحضور" : "presence"} ${num(Math.round(v * 100))}٪`} />
              ))}
            </div>

            <div className="th-section-h">{ar ? `${num(thread.length)} آيةً على خيطِ «${concept}» (بترتيب المصحف)` : `${thread.length} verses on the «${concept}» thread`}</div>
            <div className="th-list">
              {thread.map((v) => (
                <Link key={v.loc} to={`/read/${v.loc.split(":")[0]}/${v.loc.split(":")[1]}`} className="th-verse">
                  <span className="th-ref">{surahNameAr(v.surah)} {num(v.loc.split(":")[1])}</span>
                  <span className="th-p">{v.p > 0 ? `${num(Math.round(v.p * 100))}٪` : "•"}</span>
                  <span className="quran th-text">{v.text}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
