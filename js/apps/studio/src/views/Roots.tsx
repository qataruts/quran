/**
 * Roots — the root explorer.
 *
 * /roots        → index: prefix search + top-100 roots table.
 * /roots/:root  → detail: header + collect, derived lemmas (filterable),
 *                 related roots, occurrences as FULL ayahs with the matched
 *                 word(s) highlighted.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ayahLocationsOfRoot,
  fuzzyRoots,
  getAyahByLocation,
  getRoot,
  neighborsOfRoot,
  searchRoots,
  topRoots,
  wordsByLemma,
  wordsByRoot,
} from "../db";
import type { NeighborRoot } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc, RootDoc, SegmentDoc, WordDoc } from "../types";
import { VERB_FORM_ROMAN, label, readPathOf } from "../types";
import AyahRef from "../components/AyahRef";
import CollectButton from "../components/CollectButton";
import Translations from "../components/Translations";
import AudioButton, { ayahIdOf } from "../components/AudioButton";

const AYAH_CAP = 150;

/** Does this whitespace token carry an Arabic letter (vs a lone waqf mark)? */
const HAS_LETTER = /[ء-يٱ-ۓە]/;

function sortMushaf(ws: WordDoc[]): WordDoc[] {
  return [...ws].sort(
    (x: WordDoc, y: WordDoc) =>
      x.surahNo - y.surahNo || x.ayahNo - y.ayahNo || x.wordNo - y.wordNo,
  );
}

/** pos / derivation / verb-form chips for one matched word. */
function WordChips({ w, root }: { w: WordDoc; root: string }) {
  const seg: SegmentDoc | undefined =
    w.segments.find((s: SegmentDoc) => s.root === root) ??
    w.segments.find((s: SegmentDoc) => s.role === "stem");
  return (
    <>
      {seg?.posAr && <span className="chip">{seg.posAr}</span>}
      {seg?.derivation && (
        <span className="chip">
          <b>{label(seg.derivation)}</b>
        </span>
      )}
      {seg?.verbForm != null && (
        <span className="chip">
          {t("morph.form")} <b>{VERB_FORM_ROMAN[seg.verbForm - 1] ?? seg.verbForm}</b>
        </span>
      )}
    </>
  );
}

/** Full ayah text with the matched word positions highlighted. */
function HighlightedAyah({
  ayah,
  matchedWordNos,
  onOpen,
}: {
  ayah: AyahDoc;
  matchedWordNos: Set<number>;
  onOpen: () => void;
}) {
  const tokens = ayah.textUthmani.split(/\s+/);
  let wordIdx = 0;
  return (
    <div
      className="quran"
      style={{ fontSize: 23, lineHeight: 2.1, cursor: "pointer" }}
      title={t("nav.reader")}
      onClick={onOpen}
    >
      {tokens.map((tok, i) => {
        const isWord = HAS_LETTER.test(tok);
        if (isWord) wordIdx += 1;
        const hit = isWord && matchedWordNos.has(wordIdx);
        return (
          <span key={i}>
            <span className={hit ? "w sel" : undefined}>{tok}</span>{" "}
          </span>
        );
      })}
    </div>
  );
}

/** The word's meaning from one classical source — two lines, expandable. */
function MeaningEntry({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 220;
  return (
    <div>
      <div
        dir="rtl"
        style={{
          fontSize: 15.5,
          lineHeight: 2,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",
          ...(isLong && !open
            ? {
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }
            : {}),
        }}
      >
        {text}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>{title}</span>
        {isLong && (
          <button
            className="chip link"
            style={{ border: "none", fontSize: 11, padding: "1px 8px" }}
            onClick={() => setOpen(!open)}
          >
            {open ? "اطوِ ▴" : "المزيد ▾"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Index mode                                                                */
/* ------------------------------------------------------------------------ */

function RootIndex() {
  useUILang();
  const [query, setQuery] = useState("");
  const [roots, setRoots] = useState<RootDoc[] | null>(null);
  const [fuzzy, setFuzzy] = useState(false);

  useEffect(() => {
    let alive = true;
    const q = query.trim();
    setFuzzy(false);
    if (!q) {
      topRoots(100).then((rs) => alive && setRoots(rs)).catch(() => alive && setRoots([]));
      return () => { alive = false; };
    }
    // BROAD (fuzzy) search: rank ALL roots by letter-closeness, so typing any
    // word / partial / misspelling surfaces the nearest roots — no need to know
    // the exact root form (شقي→شقو, الزنى→زني). Exact prefix hits lead.
    Promise.all([
      searchRoots(q, 50).catch(() => [] as RootDoc[]),
      fuzzyRoots(q, 30).catch(() => [] as { doc: RootDoc; dist: number }[]),
    ])
      .then(([byPrefix, fuzzyHits]) => {
        if (!alive) return;
        const seen = new Set<string>();
        const out: RootDoc[] = [];
        for (const r of byPrefix) if (!seen.has(r.root)) { seen.add(r.root); out.push(r); }
        for (const f of fuzzyHits) if (!seen.has(f.doc.root)) { seen.add(f.doc.root); out.push(f.doc); }
        setRoots(out);
        const exact = byPrefix.some((r) => r.root === q) || fuzzyHits.some((f) => f.dist === 0);
        setFuzzy(!exact && out.length > 0);
      })
      .catch(() => alive && setRoots([]));
    return () => { alive = false; };
  }, [query]);

  const ar = getUILang() === "ar";

  return (
    <div className="page">
      <div className="page-narrow">
        <h2 style={{ marginTop: 0 }}>{t("roots.title")}</h2>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: 640 }}>
          {t("roots.what")}
        </p>
        <p style={{ margin: "-4px 0 14px", fontSize: 13.5, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            to="/network"
            className="chip link"
            style={{ textDecoration: "none" }}
            title={ar ? "شبكة الجذور التي تلتقي في الآيات نفسها" : "network of roots that meet in the same ayahs"}
          >
            {ar ? "توارد الجذور — الجذور التي ترد معًا ←" : "Root co-occurrence →"}
          </Link>
          <Link
            to="/wujuh"
            className="chip link"
            style={{ textDecoration: "none" }}
            title={ar ? "كلماتٌ ترد سياقاتها في مجموعتين متمايزتين (محسوبة)" : "words whose contexts split into two senses (computed)"}
          >
            {ar ? "الوجوه والنظائر — الكلمات متعدّدة المعنى ←" : "Polysemy →"}
          </Link>
        </p>
        <input
          type="text"
          dir="rtl"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder={t("roots.search")}
          style={{ width: "100%", marginBottom: 16, fontFamily: "var(--font-quran)" }}
        />
        {fuzzy && (
          <div className="muted" style={{ marginTop: -8, marginBottom: 14, fontSize: 13.5 }}>
            {ar ? (
              <>أقرب الجذور إلى «<span className="quran" style={{ fontSize: 17 }}>{query.trim()}</span>» <span style={{ color: "var(--gold)" }}>· بحث تقريبيّ بالحروف</span></>
            ) : (
              <>Closest roots to «{query.trim()}» <span style={{ color: "var(--gold)" }}>· fuzzy letter search</span></>
            )}
          </div>
        )}
        <div className="card">
          {roots == null ? (
            <p className="muted">{t("loading")}</p>
          ) : roots.length === 0 ? (
            <p className="muted">
              {t("notFound")} — <span className="quran" style={{ fontSize: 18 }}>{query.trim()}</span>
            </p>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 8 }}>
                {t("roots.top")} ({num(roots.length)})
              </div>
              {/* mobile-first: a responsive grid of tappable root cards — the
                  whole card navigates (no redundant «استكشف»). */}
              <div className="roots-grid">
                {roots.map((r: RootDoc) => (
                  <Link
                    key={r._id}
                    to={`/roots/${encodeURIComponent(r.root)}`}
                    className="root-card"
                    title={`${r.root} — ${num(r.occurrences)} ${t("roots.occurrences")} · ${num(r.lemmas.length)} ${t("roots.lemmas")}`}
                  >
                    <span className="root-card-name quran">{r.root}</span>
                    <span className="root-card-meta">
                      {num(r.occurrences)} {t("roots.occurrences")} · {num(r.lemmas.length)} {t("roots.lemmas")}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Detail mode                                                               */
/* ------------------------------------------------------------------------ */

function RootDetail({ root }: { root: string }) {
  useUILang();
  const navigate = useNavigate();
  const [rootDoc, setRootDoc] = useState<RootDoc | null | undefined>(undefined);
  const [words, setWords] = useState<WordDoc[] | null>(null);
  const [related, setRelated] = useState<NeighborRoot[] | null>(null);
  const [selectedLemma, setSelectedLemma] = useState<string | null>(null);
  const [lemmaWords, setLemmaWords] = useState<Record<string, WordDoc[]>>({});
  const [ayahMap, setAyahMap] = useState<Map<string, AyahDoc | null>>(new Map());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    Promise.all([
      getRoot(root),
      wordsByRoot(root, 6000),
      neighborsOfRoot(root, 20).catch((): NeighborRoot[] => []),
    ])
      .then(([r, ws, rel]: [RootDoc | null, WordDoc[], NeighborRoot[]]) => {
        if (!mounted.current) return;
        setRootDoc(r);
        setWords(sortMushaf(ws));
        setRelated(rel);
      })
      .catch(() => {
        if (mounted.current) setRootDoc(null);
      });
    return () => {
      mounted.current = false;
    };
  }, [root]);

  const ayahLocs = useMemo<string[]>(
    () => (rootDoc ? ayahLocationsOfRoot(rootDoc) : []),
    [rootDoc],
  );

  const toggleLemma = (lemma: string) => {
    if (selectedLemma === lemma) {
      setSelectedLemma(null);
      return;
    }
    setSelectedLemma(lemma);
    if (!lemmaWords[lemma]) {
      wordsByLemma(lemma)
        .then((ws: WordDoc[]) => {
          if (mounted.current) {
            setLemmaWords((prev: Record<string, WordDoc[]>) => ({ ...prev, [lemma]: ws }));
          }
        })
        .catch(() => {
          if (mounted.current) {
            setLemmaWords((prev: Record<string, WordDoc[]>) => ({ ...prev, [lemma]: [] }));
          }
        });
    }
  };

  /** Occurrence source: all root words, or the intersection with the lemma. */
  const displayWords = useMemo<WordDoc[] | null>(() => {
    if (!words) return null;
    if (!selectedLemma) return words;
    const lw = lemmaWords[selectedLemma];
    if (!lw) return null; // lemma words still loading
    const locs = new Set(lw.map((w: WordDoc) => w.location));
    return words.filter((w: WordDoc) => locs.has(w.location));
  }, [words, selectedLemma, lemmaWords]);

  /** Group by ayah "s:a"; insertion order = mushaf order (words are sorted). */
  const groups = useMemo<[string, WordDoc[]][] | null>(() => {
    if (!displayWords) return null;
    const map = new Map<string, WordDoc[]>();
    for (const w of displayWords) {
      const key = `${w.surahNo}:${w.ayahNo}`;
      const arr = map.get(key);
      if (arr) arr.push(w);
      else map.set(key, [w]);
    }
    return [...map.entries()];
  }, [displayWords]);

  const shown = useMemo(() => (groups ? groups.slice(0, AYAH_CAP) : []), [groups]);

  // Fetch the full ayah docs for the shown occurrences (batched, cached).
  const shownKey = shown.map(([loc]) => loc).join("|");
  useEffect(() => {
    if (!shownKey) return;
    const missing = shownKey.split("|").filter((loc) => !ayahMap.has(loc));
    if (missing.length === 0) return;
    let alive = true;
    Promise.all(missing.map((loc) => getAyahByLocation(loc).catch(() => null))).then((docs) => {
      if (!alive || !mounted.current) return;
      setAyahMap((prev) => {
        const next = new Map(prev);
        missing.forEach((loc, i) => next.set(loc, docs[i]));
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  if (rootDoc === undefined) {
    return (
      <div className="page">
        <div className="page-narrow">
          <p className="muted">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (rootDoc === null) {
    return (
      <div className="page">
        <div className="page-narrow">
          <div className="card">
            <p>
              {t("notFound")} — <span className="quran" style={{ fontSize: 22 }}>{root}</span>
            </p>
            <Link to="/roots">← {t("roots.title")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="muted" style={{ marginBottom: 10 }}>
          <Link to="/roots">{t("roots.title")}</Link> / {t("roots.detail")}
        </div>

        {/* Header */}
        <div
          className="card"
          style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}
        >
          <div className="quran" style={{ fontSize: 46, lineHeight: 1.3 }}>{rootDoc.root}</div>
          <div>
            <div style={{ fontWeight: 600 }}>
              {num(rootDoc.occurrences)} {t("roots.times")}
            </div>
            <div className="muted">
              {num(rootDoc.lemmas.length)} {t("roots.lemmas")} · {num(ayahLocs.length)}{" "}
              {t("roots.inAyahs")}
            </div>
          </div>
          <span style={{ marginInlineStart: "auto" }}>
            <CollectButton
              locations={ayahLocs}
              criterion={{ kind: "root", value: rootDoc.root }}
              label={`${t("roots.collectAll")} (${num(ayahLocs.length)})`}
            />
          </span>
        </div>

        {/* Word meaning — one classical source, kept short */}
        {rootDoc.meanings && rootDoc.meanings.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t("roots.meanings")}</h3>
            <MeaningEntry
              title={rootDoc.meanings[0].title}
              text={rootDoc.meanings[0].text}
            />
          </div>
        )}

        {/* Derived lemmas */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t("roots.lemmas")}</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {t("roots.clickLemma")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {rootDoc.lemmas.map((l: { lemma: string; occurrences: number }) => (
              <button
                key={l.lemma}
                className="chip link"
                onClick={() => toggleLemma(l.lemma)}
                style={
                  selectedLemma === l.lemma
                    ? { background: "var(--accent)", color: "#fff" }
                    : undefined
                }
              >
                <span className="quran" style={{ fontSize: 17, lineHeight: 1.3 }}>{l.lemma}</span>
                <span>({num(l.occurrences)})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Related roots */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>{t("roots.related")}</h3>
          {related == null ? (
            <p className="muted">{t("loading")}</p>
          ) : related.length === 0 ? (
            <p className="muted">{t("notFound")}</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                {t("roots.relatedHint")}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {related.map((e: NeighborRoot) => (
                  <Link
                    key={e.root}
                    to={`/roots/${encodeURIComponent(e.root)}`}
                    className="chip link"
                  >
                    <span className="quran" style={{ fontSize: 17, lineHeight: 1.3 }}>
                      {e.root}
                    </span>
                    <span>
                      ({num(e.w)} {t("roots.sharedAyahs")})
                    </span>
                  </Link>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Link to={`/network/${encodeURIComponent(rootDoc.root)}`}>
                  {t("roots.viewNetwork")}
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Occurrences — full ayahs with matched words highlighted */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>
            {t("roots.occurrences")}
            {selectedLemma && (
              <span className="muted" style={{ fontWeight: 400 }}>
                {" "}
                — <span className="quran" style={{ fontSize: 17 }}>{selectedLemma}</span>
              </span>
            )}
          </h3>
          {groups == null ? (
            <p className="muted">{t("loading")}</p>
          ) : groups.length === 0 ? (
            <p className="muted">{t("notFound")}</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                {groups.length > AYAH_CAP
                  ? `${t("showing")} ${num(AYAH_CAP)} ${t("of")} ${num(groups.length)}`
                  : `${num(groups.length)} ${t("roots.inAyahs")}`}
              </p>
              <div>
                {shown.map(([loc, ws]: [string, WordDoc[]]) => {
                  const ayah = ayahMap.get(loc);
                  const matched = new Set(ws.map((w: WordDoc) => w.wordNo));
                  return (
                    <div
                      key={loc}
                      style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 2,
                        }}
                      >
                        <AyahRef location={loc} />
                        {ws.map((w: WordDoc) => (
                          <WordChips key={w.location} w={w} root={rootDoc.root} />
                        ))}
                        <span style={{ flex: 1 }} />
                        {ayah && <AudioButton ayahId={ayahIdOf(ayah)} />}
                      </div>
                      {ayah ? (
                        <>
                          <HighlightedAyah
                            ayah={ayah}
                            matchedWordNos={matched}
                            onOpen={() => navigate(readPathOf(loc))}
                          />
                          <Translations ayah={ayah} />
                        </>
                      ) : (
                        <div className="quran" style={{ fontSize: 23 }}>
                          {ws.map((w: WordDoc) => (
                            <span key={w.location} className="w sel">
                              {w.textUthmani}{" "}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export default function Roots() {
  const params = useParams<{ root?: string }>();
  if (!params.root) return <RootIndex />;
  const root = decodeURIComponent(params.root);
  // key resets lemma filter and loaded data when navigating between roots
  return <RootDetail key={root} root={root} />;
}
