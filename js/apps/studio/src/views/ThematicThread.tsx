/**
 * الخيوطُ الموضوعيّة — trace ANY meaning through the whole mushaf. You seed a
 * concept (الرحمة، الآخرة، الصبر…); we embed it, take the centroid of its nearest
 * verses, then measure every one of the 6236 āyāt against that centre. The result
 * is a computed thread: a «presence» fingerprint across the 114 sūras, and the
 * verses most on the thread. Same reproducible technique that anchors التوحيد.
 * Route: /khayt. (see docs/mechanism-roadmap.md)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getAyahByGlobalNo, listSurahs, surahNameAr } from "../db";
import { getUILang, num, useUILang } from "../i18n";
import type { SurahDoc } from "../types";
import { centroidProximity, loadVectors, meaningSearch, vectorsReady } from "../semantic";

const SUGGESTIONS = ["الرحمة", "الآخرة والحساب", "الصبر عند الشدّة", "التوحيد", "العدل والقسط", "الشكر", "الخوف والرجاء", "التوبة والمغفرة", "خلق السماوات والأرض", "الإنفاق في سبيل الله"];
const mushafKey = (loc: string) => { const [s, a] = loc.split(":").map(Number); return s * 1000 + a; };

interface TV { loc: string; text: string; p: number; surah: number }

export default function ThematicThread() {
  useUILang();
  const ar = getUILang() === "ar";
  const [surahs, setSurahs] = useState<SurahDoc[]>([]);
  const [input, setInput] = useState("");
  const [concept, setConcept] = useState("");
  const [thread, setThread] = useState<TV[]>([]);
  const [heat, setHeat] = useState<number[]>([]); // per-surah intensity 0..1 (index = surahNo-1)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => { listSurahs().then(setSurahs); }, []);

  // row (0-based global) → surahNo, from the surah ayah-counts (built once)
  const rowSurah = useMemo(() => {
    if (!surahs.length) return null;
    const byNo = [...surahs].sort((a, b) => a.surahNo - b.surahNo);
    const arr = new Int16Array(6236);
    let r = 0;
    for (const s of byNo) for (let i = 0; i < s.ayahCount; i++) arr[r++] = s.surahNo;
    return arr;
  }, [surahs]);

  async function run(c: string) {
    const query = c.trim();
    if (!query || !rowSurah) return;
    const id = ++seq.current;
    setLoading(true); setError(null); setConcept(query);
    try {
      if (!vectorsReady()) await loadVectors();
      const seed = await meaningSearch(query, 25);
      if (seq.current !== id) return;
      const prox = await centroidProximity(seed.map((h) => h.ayahId - 1));
      if (seq.current !== id) return;
      // top verses on the thread → resolve → mushaf order
      const order = Array.from(prox.keys()).sort((a, b) => prox[b] - prox[a]).slice(0, 70);
      const resolved = await Promise.all(order.map(async (r) => {
        const a = await getAyahByGlobalNo(r + 1);
        return a ? { loc: a.location, text: a.textClean || a.textUthmani, p: prox[r], surah: a.surahNo } as TV : null;
      }));
      if (seq.current !== id) return;
      setThread(resolved.filter((x): x is TV => !!x).sort((a, b) => mushafKey(a.loc) - mushafKey(b.loc)));
      // per-surah presence = max proximity of any verse in the sūra
      const mx = new Float32Array(114);
      for (let r = 0; r < prox.length; r++) { const s = rowSurah[r] - 1; if (s >= 0 && prox[r] > mx[s]) mx[s] = prox[r]; }
      let lo = 1, hi = 0; for (const v of mx) { if (v > 0 && v < lo) lo = v; if (v > hi) hi = v; }
      const span = hi - lo || 1;
      setHeat(Array.from(mx, (v) => (v <= 0 ? 0 : (v - lo) / span)));
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

            <div className="th-section-h">{ar ? `الآياتُ الأقربُ إلى «${concept}» (بترتيب المصحف)` : "verses most on the thread"}</div>
            <div className="th-list">
              {thread.map((v) => (
                <Link key={v.loc} to={`/read/${v.loc.split(":")[0]}/${v.loc.split(":")[1]}`} className="th-verse">
                  <span className="th-ref">{surahNameAr(v.surah)} {num(v.loc.split(":")[1])}</span>
                  <span className="th-p" style={{ color: heatColor(1) }}>{num(Math.round(v.p * 100))}٪</span>
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
