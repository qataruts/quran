/**
 * توارد الجذور — root co-occurrence (roots that recur together in the same ayahs).
 *
 * /network            → picker: search + top roots.
 * /network/:root      → ranked companions list; each row expands inline into
 *                       the actual shared ayahs with BOTH roots highlighted.
 * /network/:a/:b      → «آيات اللقاء»: every ayah where the two roots meet,
 *                       in mushaf order — a readable, collectable story.
 *
 * (Replaces the former force-graph canvas: co-occurrence is shown as
 * evidence — real ayahs — not as an abstract diagram.)
 */
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAyahByLocation, getRoot, neighborsOfRoot, searchRoots, topRoots } from "../db";
import type { NeighborRoot } from "../db";
import { num, t, useUILang } from "../i18n";
import type { AyahDoc, RootDoc } from "../types";
import AyahRef from "../components/AyahRef";
import AudioButton, { ayahIdOf } from "../components/AudioButton";
import CollectButton from "../components/CollectButton";
import HighlightedAyah from "../components/HighlightedAyah";
import Translations from "../components/Translations";

/* ------------------------------------------------------------------ */
/* shared-ayah computation                                             */
/* ------------------------------------------------------------------ */

interface Meeting {
  /** "s:a" */
  key: string;
  aWords: Set<number>;
  bWords: Set<number>;
}

/** word-number sets per ayah key, from a root doc's "s:a:w" locations. */
function wordsByAyahKey(doc: RootDoc): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const loc of doc.locations) {
    const [s, a, w] = loc.split(":");
    const key = `${s}:${a}`;
    const set = map.get(key);
    if (set) set.add(Number(w));
    else map.set(key, new Set([Number(w)]));
  }
  return map;
}

/** Ayahs where both roots occur, in mushaf order (locations are ordered). */
function meetingsOf(a: RootDoc, b: RootDoc): Meeting[] {
  const aMap = wordsByAyahKey(a);
  const bMap = wordsByAyahKey(b);
  const out: Meeting[] = [];
  for (const [key, aWords] of aMap) {
    const bWords = bMap.get(key);
    if (bWords) out.push({ key, aWords, bWords });
  }
  return out;
}

/** First sentence-ish of a root's classical gloss. */
const glossOf = (doc: RootDoc | null): string | null => {
  const text = doc?.meanings?.[0]?.text;
  if (!text) return null;
  const cut = text.slice(0, 110);
  return cut.length < text.length ? `${cut}…` : cut;
};

/* ------------------------------------------------------------------ */
/* Meeting list (shared by expanded row and pair page)                 */
/* ------------------------------------------------------------------ */

function MeetingAyah({ meeting }: { meeting: Meeting }) {
  const [ayah, setAyah] = useState<AyahDoc | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getAyahByLocation(meeting.key)
      .then((d) => alive && setAyah(d))
      .catch(() => alive && setAyah(null));
    return () => {
      alive = false;
    };
  }, [meeting.key]);
  if (ayah === undefined) return <div className="muted">{t("loading")}</div>;
  if (ayah === null) return null;
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <AyahRef location={meeting.key} />
        <span style={{ flex: 1 }} />
        <AudioButton ayahId={ayahIdOf(ayah)} />
        <CollectButton locations={[meeting.key]} criterion={{ kind: "manual", value: meeting.key }} label="⊕" />
      </div>
      <HighlightedAyah ayah={ayah} matched={meeting.aWords} matchedB={meeting.bWords} />
      <Translations ayah={ayah} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Picker                                                              */
/* ------------------------------------------------------------------ */

function Picker() {
  useUILang();
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<RootDoc[]>([]);
  useEffect(() => {
    let alive = true;
    (query.trim() ? searchRoots(query.trim(), 30) : topRoots(30))
      .then((rs) => alive && setShown(rs))
      .catch(() => alive && setShown([]));
    return () => {
      alive = false;
    };
  }, [query]);
  return (
    <div className="page">
      <div className="page-narrow">
        <Link to="/roots" className="chip link" style={{ textDecoration: "none", marginBottom: 12, display: "inline-block" }}>
          ← {t("nav.roots")}
        </Link>
        <h2 style={{ marginTop: 0 }}>{t("network.title")}</h2>
        <p className="muted" style={{ fontSize: 14 }}>{t("network.sub")}</p>
        <div className="card">
          <input
            dir="rtl"
            style={{ width: "100%", fontFamily: "var(--font-quran)" }}
            placeholder={t("roots.search")}
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {shown.map((r) => (
              <Link key={r._id} to={`/network/${encodeURIComponent(r.root)}`} className="chip link" style={{ textDecoration: "none" }}>
                <span className="quran" style={{ fontSize: 19, lineHeight: 1.3 }}>{r.root}</span>
                <b>{num(r.occurrences)}</b>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Companions view (/network/:root)                                    */
/* ------------------------------------------------------------------ */

const EXPAND_CAP = 10;

function CompanionRow({
  center,
  centerDoc,
  neighbor,
  maxW,
}: {
  center: string;
  centerDoc: RootDoc;
  neighbor: NeighborRoot;
  maxW: number;
}) {
  useUILang();
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<RootDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!open || doc !== undefined) return;
    let alive = true;
    getRoot(neighbor.root)
      .then((d) => alive && setDoc(d))
      .catch(() => alive && setDoc(null));
    return () => {
      alive = false;
    };
  }, [open, doc, neighbor.root]);

  const meetings = useMemo(
    () => (doc ? meetingsOf(centerDoc, doc) : []),
    [doc, centerDoc],
  );

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div
        role="button"
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer" }}
      >
        <span className="quran" style={{ fontSize: 24, lineHeight: 1.4, minWidth: 64 }}>
          {neighbor.root}
        </span>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ height: 8, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(neighbor.w / maxW) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
          </div>
        </div>
        <span className="muted" style={{ whiteSpace: "nowrap" }}>
          {t("network.meetIn")} <b style={{ color: "var(--ink)" }}>{num(neighbor.w)}</b> {t("roots.inAyahs")}
        </span>
        <span className="muted">{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 8px 12px" }}>
          {doc === undefined ? (
            <div className="muted">{t("loading")}</div>
          ) : doc === null ? (
            <div className="muted">{t("notFound")}</div>
          ) : (
            <>
              {glossOf(doc) && (
                <div className="muted" dir="rtl" style={{ marginBottom: 8, lineHeight: 1.9 }}>
                  {glossOf(doc)}
                </div>
              )}
              {meetings.slice(0, EXPAND_CAP).map((m) => (
                <MeetingAyah key={m.key} meeting={m} />
              ))}
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <Link
                  className="chip link"
                  to={`/network/${encodeURIComponent(center)}/${encodeURIComponent(neighbor.root)}`}
                >
                  {t("network.readAll")} ({num(meetings.length)}) ←
                </Link>
                <Link className="chip" to={`/roots/${encodeURIComponent(neighbor.root)}`} style={{ textDecoration: "none" }}>
                  {t("network.openRoot")}
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mini-constellation — a deterministic SVG signpost (no physics): the root at
 * the center, its strongest companions around it. Nodes re-center; edges open
 * the pair page. The companions LIST remains the primary interface.
 */
function Constellation({ center, neighbors }: { center: string; neighbors: NeighborRoot[] }) {
  useUILang();
  const navigate = useNavigate();
  const top = neighbors.slice(0, 10);
  if (top.length === 0) return null;
  const S = 340;
  const c = S / 2;
  const maxW = top[0].w;
  const nodes = top.map((n, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / top.length;
    const radius = 78 + 82 * (1 - n.w / maxW);
    return {
      ...n,
      x: c + Math.cos(angle) * radius,
      y: c + Math.sin(angle) * radius,
      r: 17 + 11 * (n.w / maxW),
    };
  });
  return (
    <div className="card" style={{ flex: "0 1 380px", alignSelf: "flex-start" }}>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ width: "100%", display: "block" }}>
        {nodes.map((n) => (
          <line
            key={`e-${n.root}`}
            x1={c}
            y1={c}
            x2={n.x}
            y2={n.y}
            stroke="var(--accent)"
            strokeOpacity={0.25 + 0.45 * (n.w / maxW)}
            strokeWidth={1 + 3.5 * (n.w / maxW)}
            style={{ cursor: "pointer" }}
            onClick={() =>
              navigate(`/network/${encodeURIComponent(center)}/${encodeURIComponent(n.root)}`)
            }
          >
            <title>{`${center} × ${n.root} — ${num(n.w)}`}</title>
          </line>
        ))}
        {nodes.map((n) => (
          <g
            key={`n-${n.root}`}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/network/${encodeURIComponent(n.root)}`)}
          >
            <circle cx={n.x} cy={n.y} r={n.r} fill="var(--accent-soft)" stroke="var(--accent)" strokeOpacity={0.5} />
            <text
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--ink)"
              style={{ fontFamily: "var(--font-quran)", fontSize: Math.max(13, n.r * 0.78) }}
            >
              {n.root}
            </text>
            <title>{n.root}</title>
          </g>
        ))}
        <circle cx={c} cy={c} r={30} fill="var(--accent)" />
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--panel)"
          style={{ fontFamily: "var(--font-quran)", fontSize: 20 }}
        >
          {center}
        </text>
      </svg>
      <div className="muted" style={{ textAlign: "center", marginTop: 6 }}>
        {t("network.mini")}
      </div>
    </div>
  );
}

function Companions({ root }: { root: string }) {
  useUILang();
  const [centerDoc, setCenterDoc] = useState<RootDoc | null | undefined>(undefined);
  const [neighbors, setNeighbors] = useState<NeighborRoot[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getRoot(root), neighborsOfRoot(root, 30).catch((): NeighborRoot[] => [])])
      .then(([doc, ns]) => {
        if (!alive) return;
        setCenterDoc(doc);
        setNeighbors(ns);
      })
      .catch(() => alive && setCenterDoc(null));
    return () => {
      alive = false;
    };
  }, [root]);

  if (centerDoc === undefined) {
    return (
      <div className="page">
        <div className="page-narrow muted">{t("loading")}</div>
      </div>
    );
  }
  if (centerDoc === null) {
    return (
      <div className="page">
        <div className="page-narrow">
          <div className="card">
            {t("notFound")} — <Link to="/network">{t("network.pickAnother")}</Link>
          </div>
        </div>
      </div>
    );
  }
  const maxW = neighbors && neighbors.length > 0 ? neighbors[0].w : 1;

  return (
    <div className="page">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link to="/roots" className="chip link" style={{ textDecoration: "none", marginBottom: 10, display: "inline-block" }}>
          ← {t("nav.roots")}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <span className="quran" style={{ fontSize: 34, lineHeight: 1.3 }}>{root}</span>
          <span className="chip">
            {t("roots.occurrences")} <b>{num(centerDoc.occurrences)}</b>
          </span>
          <Link className="chip link" style={{ textDecoration: "none" }} to={`/roots/${encodeURIComponent(root)}`}>
            {t("network.openRoot")}
          </Link>
          <Link className="chip" style={{ textDecoration: "none" }} to="/network">
            {t("network.pickAnother")}
          </Link>
        </div>
        {glossOf(centerDoc) && (
          <p className="muted" dir="rtl" style={{ lineHeight: 1.9, marginTop: 2 }}>
            {glossOf(centerDoc)}
          </p>
        )}
        <p className="muted">{t("network.sub")}</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="card" style={{ flex: "1 1 460px", minWidth: 0 }}>
            {neighbors == null ? (
              <div className="muted">{t("loading")}</div>
            ) : neighbors.length === 0 ? (
              <div className="muted">{t("notFound")}</div>
            ) : (
              neighbors.map((n) => (
                <CompanionRow key={n.root} center={root} centerDoc={centerDoc} neighbor={n} maxW={maxW} />
              ))
            )}
          </div>
          {neighbors != null && <Constellation center={root} neighbors={neighbors} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pair page (/network/:a/:b) — آيات اللقاء                            */
/* ------------------------------------------------------------------ */

function Pair({ a, b }: { a: string; b: string }) {
  useUILang();
  const [docs, setDocs] = useState<[RootDoc | null, RootDoc | null] | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    Promise.all([getRoot(a), getRoot(b)])
      .then((d) => alive && setDocs(d as [RootDoc | null, RootDoc | null]))
      .catch(() => alive && setDocs([null, null]));
    return () => {
      alive = false;
    };
  }, [a, b]);

  const meetings = useMemo(
    () => (docs && docs[0] && docs[1] ? meetingsOf(docs[0], docs[1]) : []),
    [docs],
  );

  if (docs === undefined) {
    return (
      <div className="page">
        <div className="page-narrow muted">{t("loading")}</div>
      </div>
    );
  }
  if (!docs[0] || !docs[1]) {
    return (
      <div className="page">
        <div className="page-narrow">
          <div className="card">
            {t("notFound")} — <Link to="/network">{t("network.pickAnother")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="muted" style={{ marginBottom: 8 }}>
          <Link to={`/network/${encodeURIComponent(a)}`}>{t("network.title")}</Link> /{" "}
          {t("network.pair")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <span className="quran" style={{ fontSize: 22, lineHeight: 1.3 }}>{a}</span>
          </span>
          <span className="quran" style={{ fontSize: 18 }}>×</span>
          <span className="chip gold">
            <span className="quran" style={{ fontSize: 22, lineHeight: 1.3 }}>{b}</span>
          </span>
          <span className="muted">
            {t("network.meetIn")} <b style={{ color: "var(--ink)" }}>{num(meetings.length)}</b>{" "}
            {t("roots.inAyahs")}
          </span>
          <span style={{ flex: 1 }} />
          <CollectButton
            locations={meetings.map((m) => m.key)}
            criterion={{ kind: "search", value: `${a} × ${b}` }}
            label={`${t("search.collectAll")} (${num(meetings.length)})`}
          />
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          {meetings.map((m) => (
            <MeetingAyah key={m.key} meeting={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Network() {
  const params = useParams<{ root?: string; other?: string }>();
  const root = params.root != null ? decodeURIComponent(params.root) : null;
  const other = params.other != null ? decodeURIComponent(params.other) : null;
  if (root && other) return <Pair key={`${root}|${other}`} a={root} b={other} />;
  if (root) return <Companions key={root} root={root} />;
  return <Picker />;
}
