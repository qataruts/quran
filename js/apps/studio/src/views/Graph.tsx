/**
 * النسيج الواحد — an INTERACTIVE view of the جوامع network. A محكمة sits at the
 * centre; its تفصيل fan out, each edge coloured by the kind of relation. Tap a
 * node to glide the network onto it (re-centre in place, animated) and walk the
 * fabric outward; drag to pan, pinch / buttons to zoom. Radial + one hub at a
 * time, so it stays legible on a phone. Route: /graph and /graph/:s/:a.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { REL_INFO, elaborates, isPrinciple, isRootPrinciple, tafsilOf, useJawami, type Rel } from "../jawami";
import { surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { usePanZoom } from "../panzoom";
import MushafLink from "../components/MushafLink";

const REL_ORDER: Rel[] = ["بيان", "مثال", "جزاء", "توكيد"];
const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
const shortRef = (loc: string) => {
  const [s, a] = loc.split(":");
  return `${num(Number(s))}:${num(Number(a))}`;
};

export default function Graph() {
  useUILang();
  const ar = getUILang() === "ar";
  const navigate = useNavigate();
  const { s, a } = useParams<{ s?: string; a?: string }>();
  const jw = useJawami();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const widest = useMemo(() => {
    if (!jw) return null;
    let best: string | null = null;
    let n = -1;
    for (const loc of Object.keys(jw.principles)) {
      if (!isRootPrinciple(loc)) continue;
      const d = tafsilOf(loc).length;
      if (d > n) {
        n = d;
        best = loc;
      }
    }
    return best;
  }, [jw]);

  // the current centre lives in state so re-centring is instant + animatable
  const [center, setCenter] = useState<string | null>(null);
  useEffect(() => {
    if (jw) setCenter(s && a ? `${s}:${a}` : widest);
  }, [jw, s, a, widest]);

  // pan/zoom transform over a 0..100 viewBox (shared engine)
  const { view, reset, zoomAt, svgHandlers } = usePanZoom(svgRef);
  useEffect(() => reset(), [center]); // re-centre → reset the pan/zoom onto it

  if (!jw) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }
  if (!center) return null;

  const fwd = tafsilOf(center);
  const back = elaborates(center);
  const neighbours = [
    ...fwd.map((l) => ({ ...l, dir: "out" as const })),
    ...back.filter((b) => !fwd.some((f) => f.loc === b.loc)).map((l) => ({ ...l, dir: "in" as const })),
  ];
  const R = 38;
  const N = Math.max(neighbours.length, 1);
  const nodes = neighbours.map((nb, i) => {
    const ang = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { ...nb, x: 50 + R * Math.cos(ang), y: 50 + R * Math.sin(ang) };
  });
  const byRel = REL_ORDER.map((rel) => ({ rel, items: fwd.filter((l) => l.rel === rel) })).filter((g) => g.items.length);
  // keep the URL roughly in sync without forcing a remount
  const recenter = (loc: string) => {
    setCenter(loc);
    navigate(`/graph/${loc.split(":")[0]}/${loc.split(":")[1]}`, { replace: true });
  };

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "النسيج الواحد" : "One Fabric"}</h1>
          <p className="jw-lead">
            {ar
              ? "شبكةُ الجوامع تفاعليّةً: انقر أيّ عقدةٍ ليتوسّط النسيجُ حولها، واسحب للتحريك، وقرِّب بأصبعين. لونُ كل خيطٍ بحسب نوع الصلة."
              : "The principle network, interactive: tap a node to re-centre, drag to pan, pinch to zoom. Each thread is coloured by relation."}
          </p>
        </header>

        <div className="graph-center-bar">
          <span className="graph-center-ref">{arName(center)}</span>
          <span className="muted">{num(fwd.length)} {ar ? "تفصيل" : "tafsīl"}</span>
          <span style={{ flex: 1 }} />
          <MushafLink loc={center} />
        </div>

        <div className="graph-stage">
          <svg
            ref={svgRef}
            className="graph-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            {...svgHandlers}
            role="img"
            aria-label={ar ? "شبكة المحكمة وتفصيلها" : "muḥkama network"}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <g key={center} className="graph-content">
              {nodes.map((nd) => (
                <line
                  key={`e${nd.loc}`}
                  className="graph-edge"
                  x1={50} y1={50} x2={nd.x} y2={nd.y}
                  stroke={REL_INFO[nd.rel as Rel]?.color ?? "var(--line)"}
                  strokeWidth={0.5} strokeOpacity={nd.dir === "in" ? 0.4 : 0.85}
                  strokeDasharray={nd.dir === "in" ? "1.5 1.5" : undefined}
                />
              ))}
              {nodes.map((nd) => (
                <g
                  key={`n${nd.loc}`}
                  className="graph-node"
                  transform={`translate(${nd.x} ${nd.y})`}
                  onClick={() => recenter(nd.loc)}
                  style={{ cursor: "pointer" }}
                >
                  <circle r={isPrinciple(nd.loc) ? 2.6 : 1.9} fill={REL_INFO[nd.rel as Rel]?.color ?? "var(--muted)"} />
                  <text y={-3.4} textAnchor="middle" className="graph-label">{shortRef(nd.loc)}</text>
                </g>
              ))}
              <g transform="translate(50 50)">
                <circle r={4.6} className="graph-hub" />
                <text y={1.6} textAnchor="middle" className="graph-hub-label">◆</text>
              </g>
            </g>
            </g>
          </svg>
          <div className="graph-ctrls">
            <button onClick={() => zoomAt(50, 50, 1.25)} aria-label={ar ? "تقريب" : "zoom in"}>＋</button>
            <button onClick={() => zoomAt(50, 50, 1 / 1.25)} aria-label={ar ? "تبعيد" : "zoom out"}>－</button>
            <button onClick={reset} aria-label={ar ? "توسيط" : "reset"}>⟳</button>
          </div>
        </div>

        <div className="graph-legend">
          {REL_ORDER.map((rel) => (
            <span key={rel} className="graph-leg">
              <span className="graph-leg-dot" style={{ background: REL_INFO[rel].color }} />
              {rel} <span className="muted">· {REL_INFO[rel].note}</span>
            </span>
          ))}
        </div>

        {byRel.map(({ rel, items }) => (
          <div key={rel} className="jw-relgroup">
            <div className="jw-relhead" style={{ color: REL_INFO[rel].color }}>
              <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />
              {rel} <span className="muted">{num(items.length)}</span>
            </div>
            {items.map((l) => (
              <div key={l.loc} className="jw-verse">
                <button className="jw-verse-ref" onClick={() => recenter(l.loc)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {arName(l.loc)} {tafsilOf(l.loc).length > 0 && <span className="muted">{num(tafsilOf(l.loc).length)} ↻</span>}
                </button>
                <span style={{ flex: 1 }} />
                <MushafLink loc={l.loc} compact />
              </div>
            ))}
          </div>
        ))}

        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <Link to="/muhkamat" className="chip link" style={{ textDecoration: "none" }}>
            ← {ar ? "المحكمات" : "Muḥkamāt"}
          </Link>
        </div>
      </div>
    </div>
  );
}
