/**
 * البحث — one search page, two modes (route /search, ?q=&m=1).
 *
 *   «نصّي»    (default) — FTS5 text search, debounced as you type.
 *   «بالمعنى»            — semantic search over Gemini vectors (submit to run:
 *                          each query costs one embedding call).
 *
 * Old /meaning links redirect here with m=1.
 */
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import CollectButton from "../components/CollectButton";
import Translations from "../components/Translations";
import AyahRef from "../components/AyahRef";
import AudioButton, { ayahIdOf } from "../components/AudioButton";
import { SimilarAyahsPanel } from "../components/SimilarAyahs";
import { TadabburPanel } from "../components/TadabburChip";
import { highlightVerse } from "../highlight";
import { similarOf } from "../similar";
import { getAyahByGlobalNo, getAyahByLocation, searchAyahs, searchRoots } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc, RootDoc } from "../types";
import { readPathOf } from "../types";
import {
  getEndpoint,
  getUserKey,
  loadVectors,
  meaningSearch,
  setEndpoint,
  setUserKey,
  vectorsReady,
} from "../semantic";
import { useOmniResults } from "../omni";

const DISPLAY_CAP = 200;
const TEXT_EXAMPLES = ["الرحمن", '"يا أيها الذين آمنوا"', "صبر*"];
const MEANING_EXAMPLES_AR = [
  "الصبر عند الشدة والفقد",
  "العفو عند الغضب",
  "رحمة الله بعباده",
  "الغاية من الخلق",
  "الصدق في البيع والتجارة",
];
const MEANING_EXAMPLES_EN = [
  "patience in hardship and loss",
  "forgiving people when angry",
  "the purpose of creation",
  "honesty in trade",
];

/** Arabic letters only (a plausible root / bare-word token). */
const ARABIC_TOKEN = /^[ء-ي]+$/;

const LINKS_EXAMPLES: { label: string; loc: string }[] = [
  { label: "يوسف ٩", loc: "12:9" },
  { label: "البقرة ٤٤", loc: "2:44" },
  { label: "آية الكرسي", loc: "2:255" },
  { label: "الرحمن ١٣", loc: "55:13" },
  { label: "الإخلاص ١", loc: "112:1" },
];
const MODE_LABELS: Record<Mode, [string, string]> = {
  meaning: ["بالمعنى", "By meaning"],
  links: ["ارتباطات آية", "Verse links"],
  tadabbur: ["تدبّر آية", "Reflect"],
  text: ["بالنص", "By text"],
};
const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
/** Parse "s:a" (Arabic or western digits) → a valid location, else null. */
const parseLoc = (s: string): string | null => {
  const m = toWestern(s).trim().match(/^(\d{1,3})\s*[:：\-]\s*(\d{1,3})$/);
  if (!m) return null;
  const su = Number(m[1]);
  const ay = Number(m[2]);
  if (su < 1 || su > 114 || ay < 1) return null;
  return `${su}:${ay}`;
};

type Mode = "meaning" | "links" | "tadabbur" | "text";

interface Hit {
  ayah: AyahDoc;
  score?: number;
}

/** One result row — identical look in both modes (score chip when present).
 *  Tapping the verse opens its «آيات ذات صلة» (semantic neighbours) inline;
 *  the مصحف opens only via the explicit button — so a result is a place to
 *  explore, not a trapdoor into the reader. */
function ResultRow({ hit, criterion, query }: { hit: Hit; criterion: string; query: string }) {
  useUILang();
  const navigate = useNavigate();
  const { ayah, score } = hit;
  const ar = getUILang() === "ar";
  const gid = ayahIdOf(ayah);
  const [showRelated, setShowRelated] = useState(false);
  const [relCount, setRelCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    similarOf(gid).then((ns) => live && setRelCount(ns.length));
    return () => {
      live = false;
    };
  }, [gid]);

  const openReader = () => navigate(readPathOf(ayah.location));
  const hasRelated = relCount != null && relCount > 0;
  // tap the verse → related dropdown when there are neighbours, else the reader
  const onVerseTap = () => (hasRelated ? setShowRelated((v) => !v) : openReader());

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <AyahRef location={ayah.location} />
        {score != null && (
          <span className="chip">
            {t("meaning.closeness")} <b>{num((score * 100).toFixed(1))}٪</b>
          </span>
        )}
        <span className="chip">
          {t("reader.juz")} <b>{num(ayah.juz)}</b>
        </span>
        <span className="chip">
          {t("reader.page")} <b>{num(ayah.page)}</b>
        </span>
        <span style={{ flex: 1 }} />
        <AudioButton ayahId={gid} />
        <button
          className="chip"
          onClick={openReader}
          title={ar ? "افتح الآية في المصحف" : "open in the reader"}
          style={{ border: "none", cursor: "pointer" }}
        >
          ↗ {ar ? "المصحف" : "read"}
        </button>
        <CollectButton
          locations={[ayah.location]}
          criterion={{ kind: "search", value: criterion }}
          label="⊕"
        />
      </div>
      <div
        className="quran"
        style={{ fontSize: 21, lineHeight: 2, cursor: "pointer" }}
        title={hasRelated ? (ar ? "آياتٌ ذات صلة" : "related verses") : t("nav.reader")}
        onClick={onVerseTap}
      >
        {highlightVerse(ayah.textUthmani, query)}
      </div>
      {hasRelated && (
        <button
          className={`chip similar${showRelated ? " open" : ""}`}
          onClick={() => setShowRelated((v) => !v)}
          style={{ cursor: "pointer", marginTop: 4 }}
          title={ar ? "آياتٌ ذات صلة بالمعنى" : "semantically related verses"}
        >
          <span className="ai-spark" aria-hidden /> {ar ? "آياتٌ ذات صلة" : "related"}
          <span className="count-badge">{num(relCount!)}</span>
          <span style={{ marginInlineStart: 4 }}>{showRelated ? "▾" : "◂"}</span>
        </button>
      )}
      {showRelated && hasRelated && (
        <SimilarAyahsPanel ayahId={gid} location={ayah.location} />
      )}
      <Translations ayah={ayah} />
    </div>
  );
}

/** ارتباطات آية — step 1: find a verse (by surah, number, or a word) and pick it
 *  from a dropdown; step 2 (the caller) shows its AI-computed neighbours. RTL for
 *  Arabic. Reuses the omni resolver so «البقرة ٤٤» / «آية الكرسي» / «الصبر» all work. */
function VersePicker({ onPick }: { onPick: (loc: string) => void }) {
  useUILang();
  const ar = getUILang() === "ar";
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const items = useOmniResults(q).filter((it) => /^\/read\/\d+\/\d+/.test(it.to)); // only verse-resolving hits

  useEffect(() => setActive(0), [items.length]);
  useEffect(() => {
    if (!focused) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);

  const pick = (to: string) => {
    const m = to.match(/^\/read\/(\d+)\/(\d+)/);
    if (!m) return;
    setQ("");
    setFocused(false);
    onPick(`${m[1]}:${m[2]}`);
  };
  const show = focused && q.trim() !== "" && items.length > 0;

  return (
    <div className="inline-omni" ref={wrapRef} dir={ar ? "rtl" : "ltr"}>
      <div className="page-search">
        <span className="page-search-icon" aria-hidden>⌕</span>
        <input
          autoFocus
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={ar ? "اختر آيةً: سورة، أو رقم، أو كلمة…" : "find a verse: surah, number, or a word…"}
          aria-label={ar ? "اختيار آية" : "pick a verse"}
          style={{ fontSize: 17 }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              pick(items[active].to);
            } else if (e.key === "Escape") {
              setFocused(false);
            }
          }}
        />
        {q && (
          <button className="page-search-clear" onClick={() => setQ("")} aria-label={ar ? "مسح" : "clear"}>
            ✕
          </button>
        )}
      </div>
      {show && (
        <div className="inline-omni-results" role="listbox">
          {items.map((it, i) => (
            <div
              key={it.key}
              role="option"
              aria-selected={i === active}
              onClick={() => pick(it.to)}
              onMouseEnter={() => setActive(i)}
              className={`inline-omni-row${i === active ? " active" : ""}`}
            >
              <span className="chip inline-omni-kind">{it.kind === "text" ? (ar ? "نصّ" : "text") : (ar ? "آية" : "ayah")}</span>
              <span className={it.kind === "text" ? "quran inline-omni-label" : "inline-omni-label"}>{it.label}</span>
              {it.sub && <span className="muted inline-omni-sub">{it.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Search() {
  useUILang();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  // «اسأل القرآن» is the AI hub: meaning is the default; ?m=links shows a verse's
  // AI-computed semantic neighbours; ?m=text is plain FTS. (old ?m=1 / /meaning
  // links resolve to meaning too, since "1" is neither "text" nor "links".)
  const mParam = searchParams.get("m");
  const mode: Mode =
    mParam === "text" ? "text" : mParam === "links" ? "links" : mParam === "tadabbur" ? "tadabbur" : "meaning";

  const [input, setInput] = useState<string>(q);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [rootHits, setRootHits] = useState<RootDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [vectorPct, setVectorPct] = useState<number | null>(null);
  const [linkVerse, setLinkVerse] = useState<AyahDoc | null>(null); // links mode: the verse whose neighbours we show

  const seq = useRef(0);
  const lastPushed = useRef(q);

  const setMode = (m: Mode) => {
    seq.current++;
    setHits(null);
    setError(null);
    setNeedsSetup(false);
    setLoading(false);
    const params: Record<string, string> = {};
    if (input.trim()) params.q = input.trim();
    if (m !== "meaning") params.m = m; // meaning is the default → no param
    setSearchParams(params, { replace: true });
  };

  // URL → input (back/forward navigation, reload, external links).
  useEffect(() => {
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      setInput(q);
    }
  }, [q]);

  // TEXT mode: input → URL, debounced.
  useEffect(() => {
    if (mode !== "text") return;
    const timer = setTimeout(() => {
      const next = input.trim();
      if (next === q) return;
      lastPushed.current = next;
      // keep m=text so the debounced URL write doesn't fall back to meaning
      setSearchParams(next ? { q: next, m: "text" } : { m: "text" }, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [input, q, mode, setSearchParams]);

  // TEXT mode: URL query → FTS results + root suggestions.
  useEffect(() => {
    if (mode !== "text") return;
    const id = ++seq.current;
    if (!q) {
      setHits(null);
      setRootHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    searchAyahs(q)
      .then((res: AyahDoc[]) => {
        if (seq.current !== id) return;
        setHits(res.map((ayah) => ({ ayah })));
        setLoading(false);
      })
      .catch(() => {
        if (seq.current !== id) return;
        setHits([]);
        setLoading(false);
        setError(t("search.hint"));
      });
    const token = q.endsWith("*") ? q.slice(0, -1) : q;
    if (ARABIC_TOKEN.test(token)) {
      searchRoots(token, 5)
        .then((rs) => seq.current === id && setRootHits(rs))
        .catch(() => seq.current === id && setRootHits([]));
    } else {
      setRootHits([]);
    }
  }, [q, mode]);

  // MEANING mode: run on demand (submit / examples / URL restore).
  const runMeaning = async (text: string) => {
    const query = text.trim();
    if (!query) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    setRootHits([]);
    lastPushed.current = query;
    setSearchParams({ q: query, m: "1" }, { replace: true });
    try {
      if (!vectorsReady()) {
        setVectorPct(0);
        await loadVectors((pct) => setVectorPct(pct));
      }
      const found = await meaningSearch(query, 20);
      const resolved = await Promise.all(
        found.map(async (h) => ({ score: h.score, ayah: await getAyahByGlobalNo(h.ayahId) })),
      );
      if (seq.current !== id) return;
      setHits(
        resolved.flatMap((x): Hit[] => (x.ayah != null ? [{ score: x.score, ayah: x.ayah }] : [])),
      );
    } catch (e) {
      if (seq.current !== id) return;
      if ((e as Error).message === "no-embedder") setNeedsSetup(true);
      else setError((e as Error).message);
      setHits(null);
    } finally {
      if (seq.current === id) {
        setLoading(false);
        setVectorPct(null);
      }
    }
  };

  // LINKS mode: submitting just writes the URL; the reactive effect below
  // resolves the verse — so mount, deep links, back/forward and examples all
  // behave identically (no fragile mount-once path).
  const runLinks = (text: string) => {
    const s = text.trim();
    lastPushed.current = s;
    const m = mode === "tadabbur" ? "tadabbur" : "links";
    setSearchParams(s ? { q: s, m } : { m }, { replace: true });
  };

  // LINKS/TADABBUR mode: q → the picked verse (neighbours or reflection).
  useEffect(() => {
    if (mode !== "links" && mode !== "tadabbur") return;
    const id = ++seq.current;
    const arNow = getUILang() === "ar";
    if (!q) {
      setLinkVerse(null);
      setError(null);
      return;
    }
    const loc = parseLoc(q);
    if (!loc) {
      setLinkVerse(null);
      setError(arNow ? "اكتب مرجع الآية هكذا: ٢:٢٥٥ (سورة:آية)" : "enter a verse like 2:255 (surah:ayah)");
      return;
    }
    setError(null);
    getAyahByLocation(loc)
      .then((a) => {
        if (seq.current !== id) return;
        setLinkVerse(a);
        if (!a) setError(arNow ? "لا توجد آية بهذا المرجع." : "no verse at that reference.");
      })
      .catch(() => {});
  }, [q, mode]);

  // Restore a MEANING search from the URL once (deep links, reload).
  const restored = useRef(false);
  useEffect(() => {
    if (mode === "meaning" && q && !restored.current) {
      restored.current = true;
      void runMeaning(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "meaning") void runMeaning(input);
    else if (mode === "links") void runLinks(input);
  };

  const ar = getUILang() === "ar";
  const criterion = mode === "meaning" ? `معنى: ${q}` : mode === "links" ? `ارتباطات: ${q}` : q;
  const [visible, setVisible] = useState(DISPLAY_CAP);
  useEffect(() => setVisible(DISPLAY_CAP), [hits]); // reset paging on a new result set
  const shown = hits ? hits.slice(0, visible) : [];
  const examples = mode === "meaning" ? (ar ? MEANING_EXAMPLES_AR : MEANING_EXAMPLES_EN) : TEXT_EXAMPLES;

  /** Clear results and return to the empty state (keeps the current mode). */
  const resetSearch = () => {
    seq.current++;
    setInput("");
    setHits(null);
    setError(null);
    setNeedsSetup(false);
    setLinkVerse(null);
    lastPushed.current = "";
    setSearchParams(mode === "meaning" ? {} : { m: mode }, { replace: true });
  };

  return (
    <div className="page">
      <div className="page-narrow">
        <header className="jw-header" style={{ marginBottom: 12 }}>
          <h1 className="jw-title">{ar ? "البحث الدلالي" : "Semantic search"}</h1>
          <p className="jw-lead">
            {ar
              ? "ثلاثُ أدواتٍ بالذكاء الاصطناعيّ: ابحثْ بالمعنى لا باللفظ، أو اعرضْ الآياتِ المرتبطةَ دلاليًّا بآية، أو اطلبْ تدبُّرَ آيةٍ مؤسَّسًا على أدواتنا. نسترجعُ آياتِ القرآن نفسها، والتدبّرُ إعانةٌ لا تفسير."
              : "Three AI tools: search by meaning, see the verses semantically linked to a verse, or ask for a grounded reflection on a verse. We return the Qur'an's own verses; reflection is assistance, not tafsir."}
          </p>
          <div className="sem-tabs">
            {(["meaning", "links", "tadabbur"] as Mode[]).map((m) => (
              <button key={m} className={`sem-tab${mode === m ? " on" : ""}`} onClick={() => setMode(m)}>
                {ar ? MODE_LABELS[m][0] : MODE_LABELS[m][1]}
              </button>
            ))}
          </div>
        </header>

        {mode === "links" || mode === "tadabbur" ? (
          <div className="inline-omni-wrap">
            <VersePicker onPick={(loc) => runLinks(loc)} />
            {!linkVerse && (
              <div className="sem-try">
                <span className="muted">{ar ? "جرّب:" : "try:"}</span>
                {LINKS_EXAMPLES.map((ex) => (
                  <button key={ex.loc} type="button" className="chip link" onClick={() => runLinks(ex.loc)}>
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="inline-omni">
            {/* identical structure/box to the verse picker → unified shape + height */}
            <div className="page-search" dir={ar ? "rtl" : "ltr"}>
              <span className="page-search-icon" aria-hidden />
              <input
                autoFocus
                value={input}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                placeholder={mode === "meaning" ? t("meaning.placeholder") : t("search.placeholder")}
                aria-label={ar ? "البحث الدلالي" : "Semantic search"}
                style={{ fontSize: 17 }}
                enterKeyHint="search"
              />
              {(input || q) && (
                <button type="button" className="page-search-clear" onClick={resetSearch} aria-label={ar ? "مسح" : "clear"}>
                  ✕
                </button>
              )}
            </div>
            {!q && !loading && !needsSetup && (
              <div className="sem-try">
                <span className="muted">{ar ? "جرّب:" : "try:"}</span>
                {examples.map((ex: string) => (
                  <button
                    key={ex}
                    type="button"
                    className="chip link"
                    onClick={() => {
                      setInput(ex);
                      if (mode === "meaning") void runMeaning(ex);
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}

        {vectorPct != null && (
          <div className="muted" style={{ marginTop: 8 }}>
            {t("meaning.loadingVectors")} {num(vectorPct)}%
          </div>
        )}
        {needsSetup && <SetupCard onDone={() => void runMeaning(input)} />}

        {mode === "text" && rootHits.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <span className="muted">{t("search.rootHint")}</span>
            {rootHits.map((r: RootDoc) => (
              <Link key={r.root} to={`/roots/${encodeURIComponent(r.root)}`} className="chip link">
                <b>{r.root}</b> ×{num(r.occurrences)}
              </Link>
            ))}
            <span className="muted">؟</span>
          </div>
        )}

        {(mode === "links" || mode === "tadabbur") && linkVerse && (
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <AyahRef location={linkVerse.location} />
              <span style={{ flex: 1 }} />
              <AudioButton ayahId={ayahIdOf(linkVerse)} />
              <Link to={readPathOf(linkVerse.location)} className="chip link" style={{ textDecoration: "none" }}>
                ↗ {ar ? "المصحف" : "read"}
              </Link>
              <button type="button" className="chip" onClick={resetSearch} title={ar ? "مسح" : "clear"} style={{ border: "none", cursor: "pointer" }}>
                ✕
              </button>
            </div>
            <div className="quran" style={{ fontSize: 22, lineHeight: 2 }}>{linkVerse.textUthmani}</div>
            <Translations ayah={linkVerse} />
            {mode === "links" ? (
              <>
                <div style={{ margin: "12px 0 2px", fontWeight: 600 }}>
                  {ar ? "أقربُ آيات القرآن إليها معنًى:" : "the Qur'an's verses closest to it in meaning:"}
                </div>
                <SimilarAyahsPanel ayahId={ayahIdOf(linkVerse)} location={linkVerse.location} />
              </>
            ) : (
              <div style={{ marginTop: 12 }}>
                <TadabburPanel ayah={linkVerse} ayahId={ayahIdOf(linkVerse)} open />
              </div>
            )}
          </div>
        )}

        {loading && vectorPct == null && (
          <div className="muted" style={{ marginTop: 18 }}>
            {t("loading")}
          </div>
        )}

        {error && !loading && (
          <div className="card" style={{ marginTop: 18, color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {q && !loading && !error && hits && hits.length === 0 && (
          <div className="card" style={{ marginTop: 18 }}>
            {t("notFound")} — <span className="quran" style={{ fontSize: 18 }}>{q}</span>
          </div>
        )}

        {q && !loading && hits && hits.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "16px 0 10px" }}>
              <strong>
                {num(hits.length)} {mode === "meaning" ? t("meaning.results") : t("search.results")}
              </strong>
              {hits.length > shown.length && (
                <span className="muted">
                  {t("showing")} {num(shown.length)}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <CollectButton
                locations={hits.map((h) => h.ayah.location)}
                criterion={{ kind: "search", value: criterion }}
                label={`${t("search.collectAll")} (${num(hits.length)})`}
              />
            </div>
            <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {shown.map((h) => (
                <ResultRow key={h.ayah.location} hit={h} criterion={criterion} query={q} />
              ))}
            </div>
            {hits.length > visible && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                <button className="chip" onClick={() => setVisible((v) => v + DISPLAY_CAP)}>
                  {ar ? `عرض ${num(Math.min(DISPLAY_CAP, hits.length - visible))} أكثر ▾` : `Show ${num(Math.min(DISPLAY_CAP, hits.length - visible))} more ▾`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */


function SetupCard({ onDone }: { onDone: () => void }) {
  useUILang();
  const [endpoint, setEp] = useState(getEndpoint());
  const [key, setKey] = useState(getUserKey() ?? "");
  return (
    <div className="card" style={{ margin: "12px 0" }}>
      <b>{t("meaning.setup.title")}</b>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        {t("meaning.setup.body")}{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          {t("meaning.setup.getKey")}
        </a>
        )
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        <label className="muted">
          {t("meaning.setup.endpoint")}
          <input dir="ltr" style={{ width: "100%" }} value={endpoint} onChange={(e) => setEp(e.target.value)} />
        </label>
        <label className="muted">
          {t("meaning.setup.orKey")}
          <input
            dir="ltr"
            style={{ width: "100%" }}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza…"
          />
        </label>
        <div>
          <button
            className="primary"
            onClick={() => {
              setEndpoint(endpoint.trim() || "/api/embed");
              setUserKey(key.trim());
              onDone();
            }}
          >
            {t("meaning.setup.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
