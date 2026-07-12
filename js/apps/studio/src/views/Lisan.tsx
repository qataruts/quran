/**
 * الفروق اللغوية — compare any two of the Qur'an's words and judge the shade of
 * difference yourself, straight from the two classical lexica (الراغب + مقاييس).
 *
 * Everything here is COMPUTED, never authored:
 *   • «أقرب الكلمات في المعنى» — each root's nearest neighbours by Gemini-embedding
 *     of its lexicon definition (candidate مترادفات).
 *   • «الحقول الدلالية» — tight clusters of those neighbours (semantic fields).
 *   • when الراغب HIMSELF draws a distinction («والفرق بين… / أخصّ / أبلغ») we lift
 *     that sentence out verbatim and highlight it — his words, not ours.
 * The two full entries sit side-by-side; the reader weighs them. نحسب ونعرض.
 *
 * Distinct from «فروق التنزيل» (near-identical VERSES). Data: public/lexnet.json
 * (scripts/export-lexnet.mjs) + the معجم text already in quran-app.db. Route: /lisan.
 */
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { getAyahByLocation, rootsWithMeanings, surahNameAr, wordsByRoot } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import type { AyahDoc, RootDoc } from "../types";
import { fuzzyMatch } from "../lib/fuzzy";

/** carries an Arabic letter (a real word, not a lone waqf mark) */
const HAS_LETTER = /[ء-ي]/;

/** one āyah with the root's own word(s) highlighted (same token walk as Roots) */
function HiAyah({ ayah, matched }: { ayah: AyahDoc; matched: Set<number> }) {
  let wi = 0;
  return (
    <span className="quran lisan-shahid-txt" dir="rtl">
      {ayah.textUthmani.split(/\s+/).map((tok, i) => {
        const isW = HAS_LETTER.test(tok);
        if (isW) wi += 1;
        const hit = isW && matched.has(wi);
        return <span key={i}><span className={hit ? "w sel" : undefined}>{tok}</span>{" "}</span>;
      })}
    </span>
  );
}

interface RootInfo { occ: number; near: { r: string; s: number }[]; contrast?: string[] }
interface Lexnet {
  meta: { model: string; dim: number; roots: number; pairs: number; fields: number; sources: string[] };
  roots: Record<string, RootInfo>;
  fields: { label: string; roots: string[] }[];
}

const EXAMPLES = ["خوف", "رحم", "علم", "كتب", "صبر", "نور"];

/* ── one root's lexicon column: مقاييس · الراغب · الراغب's own فرق · شواهد ──── */
function Column({ doc, info, ar }: { doc: RootDoc; info?: RootInfo; ar: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [verses, setVerses] = useState<{ ayah: AyahDoc; matched: Set<number> }[] | null>(null);
  const [moreV, setMoreV] = useState(false);
  const maq = doc.meanings?.find((m) => m.key === "maqayis")?.text ?? "";
  const raq = doc.meanings?.find((m) => m.key === "mufradat")?.text ?? "";
  const CAP = 460;
  const clip = (txt: string) => (!expanded && txt.length > CAP ? `${txt.slice(0, CAP)}…` : txt);

  // a sample of the āyāt where this root actually occurs, word(s) highlighted
  useEffect(() => {
    let alive = true;
    setVerses(null); setMoreV(false);
    wordsByRoot(doc.root, 3000).then(async (ws) => {
      const byAyah = new Map<string, Set<number>>();
      for (const w of ws) {
        const loc = w.location.split(":").slice(0, 2).join(":");
        (byAyah.get(loc) ?? byAyah.set(loc, new Set()).get(loc)!).add(w.wordNo);
      }
      const sample = [...byAyah.entries()].slice(0, 8);
      const docs = await Promise.all(sample.map(([loc]) => getAyahByLocation(loc).catch(() => null)));
      if (!alive) return;
      setVerses(
        sample
          .map(([, matched], i) => ({ ayah: docs[i], matched }))
          .filter((v): v is { ayah: AyahDoc; matched: Set<number> } => !!v.ayah),
      );
    }).catch(() => { if (alive) setVerses([]); });
    return () => { alive = false; };
  }, [doc.root]);

  return (
    <div className="lisan-col">
      <div className="lisan-col-head">
        <span className="quran lisan-word">{doc.root}</span>
        <span className="chip">{num(doc.occurrences)} {ar ? "مرّة" : "×"}</span>
        <Link to={`/mujam/${encodeURIComponent(doc.root)}`} className="chip link" style={{ textDecoration: "none" }}>
          {ar ? "المعجم ←" : "entry ←"}
        </Link>
      </div>
      {info?.contrast?.length ? (
        <div className="lisan-contrast">
          <span className="lisan-contrast-tag">{ar ? "فرَّق الراغب" : "al-Rāghib distinguishes"}</span>
          {info.contrast.map((s, i) => <p key={i} dir="rtl">{s}</p>)}
        </div>
      ) : null}
      {maq && (
        <div className="lisan-src">
          <div className="lisan-src-ttl">{ar ? "مقاييس اللغة" : "Maqāyīs"}</div>
          <p className="lisan-src-txt" dir="rtl">{clip(maq)}</p>
        </div>
      )}
      {raq && (
        <div className="lisan-src">
          <div className="lisan-src-ttl">{ar ? "المفردات — الراغب" : "Mufradāt — al-Rāghib"}</div>
          <p className="lisan-src-txt" dir="rtl">{clip(raq)}</p>
        </div>
      )}
      {(maq.length > CAP || raq.length > CAP) && (
        <button className="chip" onClick={() => setExpanded((v) => !v)} style={{ marginTop: 10 }}>
          {expanded ? (ar ? "طيّ" : "less") : (ar ? "النصّ كاملًا" : "full text")}
        </button>
      )}

      {verses && verses.length > 0 && (
        <div className="lisan-shawahid">
          <div className="lisan-src-ttl">{ar ? "شواهد قرآنية" : "Qur'anic attestations"}</div>
          {(moreV ? verses : verses.slice(0, 3)).map(({ ayah, matched }) => {
            const [s, a] = ayah.location.split(":");
            return (
              <div key={ayah.location} className="lisan-shahid">
                <Link to={readPathOf(ayah.location)} className="lisan-shahid-ref">{surahNameAr(Number(s))} {num(Number(a))}</Link>
                <HiAyah ayah={ayah} matched={matched} />
              </div>
            );
          })}
          <div className="lisan-shawahid-foot">
            {verses.length > 3 && (
              <button className="chip" onClick={() => setMoreV((v) => !v)}>
                {moreV ? (ar ? "أقلّ" : "less") : (ar ? "شواهد أكثر" : "more")}
              </button>
            )}
            <Link to={`/roots/${encodeURIComponent(doc.root)}`} className="chip link" style={{ textDecoration: "none" }}>
              {ar ? `كلّ المواضع (${num(doc.occurrences)}) ←` : `all ${num(doc.occurrences)} ←`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── word picker: fuzzy search, or the starter examples ──────────────────── */
function Picker({
  ar, query, setQuery, results, onPick, exclude, lex,
}: {
  ar: boolean; query: string; setQuery: (s: string) => void; results: RootDoc[];
  onPick: (r: string) => void; exclude?: string | null; lex: Lexnet;
}) {
  const hits = results.filter((r) => r.root !== exclude);
  return (
    <div className="lisan-picker">
      <input
        type="text"
        dir="rtl"
        autoFocus
        value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
        placeholder={ar ? "ابحث عن كلمة أو جذر…" : "search a word or root…"}
        style={{ width: "100%", fontFamily: "var(--font-quran)" }}
      />
      {query.trim() ? (
        hits.length ? (
          <div className="lisan-results">
            {hits.map((r) => (
              <button key={r._id} className="lisan-result" onClick={() => onPick(r.root)}>
                <span className="quran">{r.root}</span>
                <span className="muted">{num(r.occurrences)}×</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ padding: 14, textAlign: "center" }}>{t("notFound")}</div>
        )
      ) : (
        <div className="lisan-examples">
          <span className="muted">{ar ? "جرّب:" : "try:"}</span>
          {EXAMPLES.filter((r) => r !== exclude && lex.roots[r]).map((r) => (
            <button key={r} className="chip" onClick={() => onPick(r)}>
              <span className="quran" style={{ fontSize: 18 }}>{r}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Lisan() {
  useUILang();
  const ar = getUILang() === "ar";
  const [lex, setLex] = useState<Lexnet | null>(null);
  const [map, setMap] = useState<Map<string, RootDoc> | null>(null);
  const [tab, setTab] = useState<"compare" | "fields">("compare");
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}lexnet.json?v=${__DATA_VERSION__}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setLex)
      .catch(() => {});
    rootsWithMeanings()
      .then((rs) => setMap(new Map(rs.map((r) => [r.root, r]))))
      .catch(() => setMap(new Map()));
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q || !map) return [] as RootDoc[];
    const out: RootDoc[] = [];
    for (const r of map.values()) {
      if (r.root.startsWith(q) || fuzzyMatch(q, r.root)) out.push(r);
      if (out.length > 60) break;
    }
    return out.sort((x, y) => y.occurrences - x.occurrences).slice(0, 30);
  }, [query, map]);

  if (!lex || !map) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  const chooseA = (r: string) => { setA(r); setB(null); setQuery(""); setTab("compare"); };
  const chooseB = (r: string) => { setB(r); setQuery(""); };
  const nearOf = (root: string) => (lex.roots[root]?.near ?? []).map((n) => n.r).filter((r) => map.has(r));

  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الفروق اللغوية" : "Lexical distinctions"}</h1>
          <p className="jw-lead">
            {ar
              ? "قارِن أيّ كلمتين قرآنيّتين، وزِنِ الفرق بينهما بنفسك من نصّ «المفردات» للراغب و«مقاييس اللغة» لابن فارس. أقربُ الكلمات في المعنى والحقولُ الدلاليّة محسوبةٌ آليًّا بمتّجهات المعنى. (غير «فروق التنزيل» التي توازن بين الآيات المتشابهة.)"
              : "Compare any two Qur'anic words and weigh the shade of difference yourself, from al-Rāghib's Mufradāt and Ibn Fāris's Maqāyīs. Nearest words and semantic fields are computed by meaning-vectors. (Distinct from «فروق التنزيل», which compares near-identical verses.)"}
          </p>
          <div className="jw-stats">
            <span className="chip"><span className="ai-spark" aria-hidden /> {ar ? "محسوب بالمعنى" : "meaning-computed"}</span>
            <span className="chip"><b>{num(lex.meta.fields)}</b> {ar ? "حقلًا دلاليًّا" : "fields"}</span>
            <span className="chip"><b>{num(lex.meta.roots)}</b> {ar ? "كلمة" : "words"}</span>
            <span className="chip">{ar ? "مصدران" : "2 lexica"}</span>
          </div>
        </header>

        <div className="sem-tabs" style={{ marginBottom: 18 }}>
          <button className={`sem-tab${tab === "compare" ? " on" : ""}`} onClick={() => setTab("compare")}>
            {ar ? "قارِن كلمتين" : "Compare two"}
          </button>
          <button className={`sem-tab${tab === "fields" ? " on" : ""}`} onClick={() => setTab("fields")}>
            {ar ? "الحقول الدلالية" : "Semantic fields"}
          </button>
        </div>

        {tab === "compare" ? (
          <>
            <div className="lisan-slots">
              <button className={`lisan-slot${a ? " filled" : ""}`} onClick={() => { setA(null); setB(null); }}>
                {a ? <span className="quran">{a}</span> : <span className="muted">{ar ? "الكلمة الأولى" : "first word"}</span>}
              </button>
              <span className="lisan-vs" aria-hidden>⟷</span>
              <button className={`lisan-slot${b ? " filled" : ""}`} disabled={!a} onClick={() => setB(null)}>
                {b ? <span className="quran">{b}</span> : <span className="muted">{ar ? "الكلمة الثانية" : "second word"}</span>}
              </button>
            </div>

            {!a ? (
              <Picker ar={ar} query={query} setQuery={setQuery} results={results} onPick={chooseA} lex={lex} />
            ) : !b ? (
              <>
                <div className="lisan-nearbar">
                  <div className="lisan-syn-head">
                    <span className="ai-spark" aria-hidden />
                    <b>{ar ? "مترادفاتها المحوسبة" : "computed synonyms"}</b>
                    <span className="muted">
                      {ar ? "— أقربُ الكلمات في معنى " : "— closest in meaning to "}
                      <span className="quran">{a}</span>
                      {ar ? "، اختر إحداها للمقارنة:" : ", pick one to compare:"}
                    </span>
                  </div>
                  <div className="lisan-near">
                    {nearOf(a).slice(0, 12).map((r) => (
                      <button key={r} className="chip" onClick={() => chooseB(r)}>
                        <span className="quran" style={{ fontSize: 17 }}>{r}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lisan-or muted">{ar ? "أو ابحث عن كلمةٍ أخرى للمقارنة" : "or search another word"}</div>
                <Picker ar={ar} query={query} setQuery={setQuery} results={results} onPick={chooseB} exclude={a} lex={lex} />
              </>
            ) : (
              <>
                <p className="lisan-verdict muted">
                  {ar
                    ? "المعجمان بين يديك — الفرقُ تُدركه بالموازنة. نعرض النصّ ولا نُقرِّر."
                    : "Both entries are before you — the difference is yours to weigh. We show the text; we don't rule."}
                </p>
                <div className="lisan-grid">
                  <Column key={a} doc={map.get(a)!} info={lex.roots[a]} ar={ar} />
                  <Column key={b} doc={map.get(b)!} info={lex.roots[b]} ar={ar} />
                </div>
              </>
            )}
          </>
        ) : (
          <div className="lisan-fields">
            {lex.fields.map((f) => (
              <div key={f.label} className="lisan-field">
                <span className="quran lisan-field-label">{f.label}</span>
                <div className="lisan-field-words">
                  {f.roots.map((r) => (
                    <button key={r} className="chip" onClick={() => chooseA(r)}>
                      <span className="quran" style={{ fontSize: 17 }}>{r}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
