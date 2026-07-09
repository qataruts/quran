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
import SimilarAyahs from "../components/SimilarAyahs";
import { getAyahByGlobalNo, searchAyahs, searchRoots } from "../db";
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

type Mode = "text" | "meaning";

interface Hit {
  ayah: AyahDoc;
  score?: number;
}

/** One result row — identical look in both modes (score chip when present). */
function ResultRow({ hit, criterion }: { hit: Hit; criterion: string }) {
  useUILang();
  const navigate = useNavigate();
  const { ayah, score } = hit;
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
        <AudioButton ayahId={ayahIdOf(ayah)} />
        <SimilarAyahs ayahId={ayahIdOf(ayah)} location={ayah.location} />
        <CollectButton
          locations={[ayah.location]}
          criterion={{ kind: "search", value: criterion }}
          label="⊕"
        />
      </div>
      <div
        className="quran"
        style={{ fontSize: 21, lineHeight: 2, cursor: "pointer" }}
        title={t("nav.reader")}
        onClick={() => navigate(readPathOf(ayah.location))}
      >
        {ayah.textUthmani}
      </div>
      <Translations ayah={ayah} />
    </div>
  );
}

export default function Search() {
  useUILang();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const mode: Mode = searchParams.get("m") === "1" ? "meaning" : "text";

  const [input, setInput] = useState<string>(q);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [rootHits, setRootHits] = useState<RootDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [vectorPct, setVectorPct] = useState<number | null>(null);

  const seq = useRef(0);
  const lastPushed = useRef(q);

  const setMode = (m: Mode) => {
    seq.current++;
    setHits(null);
    setError(null);
    setNeedsSetup(false);
    setLoading(false);
    setSearchParams(m === "meaning" ? (input ? { q: input, m: "1" } : { m: "1" }) : input ? { q: input } : {}, {
      replace: true,
    });
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
      setSearchParams(next ? { q: next } : {}, { replace: true });
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

  // Restore a meaning search from the URL once (deep links, reload).
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
  };

  const criterion = mode === "meaning" ? `معنى: ${q}` : q;
  const shown = hits ? hits.slice(0, DISPLAY_CAP) : [];
  const examples =
    mode === "meaning"
      ? getUILang() === "ar"
        ? MEANING_EXAMPLES_AR
        : MEANING_EXAMPLES_EN
      : TEXT_EXAMPLES;

  return (
    <div className="page">
      <div className="page-narrow">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>{t("search.title")}</h2>
          <span
            className="chip"
            style={{ background: "var(--panel)", border: "1px solid var(--line)", gap: 0, padding: 2 }}
          >
            {(["text", "meaning"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "3px 14px",
                  background: mode === m ? "var(--accent-soft)" : "transparent",
                  color: mode === m ? "var(--accent)" : "var(--muted)",
                  fontWeight: mode === m ? 600 : 400,
                }}
              >
                {m === "text" ? t("search.mode.text") : t("search.mode.meaning")}
              </button>
            ))}
          </span>
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            autoFocus
            dir={getUILang() === "ar" ? undefined : "auto"}
            value={input}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            placeholder={mode === "meaning" ? t("meaning.placeholder") : t("search.placeholder")}
            style={{ flex: 1, fontSize: 17, padding: "12px 14px" }}
            aria-label={t("search.title")}
          />
          {mode === "meaning" && (
            <button className="primary" disabled={loading}>
              {loading ? t("meaning.searching") : t("meaning.search")}
            </button>
          )}
        </form>
        <div className="muted" style={{ marginTop: 6 }}>
          {mode === "meaning" ? t("meaning.sub") : t("search.hint")}
        </div>

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

        {!q && !loading && !needsSetup && (
          <div className="card" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {examples.map((ex: string) => (
                <button
                  key={ex}
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
              {hits.length > DISPLAY_CAP && (
                <span className="muted">
                  {t("showing")} {num(DISPLAY_CAP)}
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
                <ResultRow key={h.ayah.location} hit={h} criterion={criterion} />
              ))}
            </div>
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
