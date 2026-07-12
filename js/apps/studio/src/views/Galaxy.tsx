/**
 * شبكة القرآن — the galaxy of roots. Every one of the Qur'an's ~1650 roots is a
 * star; a thread joins two roots that share an āyah. The force-layout (precomputed
 * in scripts/export-network.mjs) settles co-occurring roots into computed
 * constellations, coloured by community. Pan, zoom, hover, or search a root.
 *
 * Performance: the ~17k edges are baked ONCE into a world-space Path2D and drawn
 * with ctx.setTransform — pan/zoom is a transform + one stroke, not 17k rebuilds.
 * Data: public/network.json. Route: /galaxy.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getRoot } from "../db";
import { getUILang, num, useUILang } from "../i18n";
import type { RootDoc } from "../types";
import { fuzzyMatch } from "../lib/fuzzy";

interface NNode { r: string; o: number; x: number; y: number; c: number }
interface NEdge { s: number; t: number; w: number }
interface Net { meta: { nodes: number; edges: number; clusters: number; span: number }; nodes: NNode[]; edges: NEdge[] }

const PALETTE = Array.from({ length: 16 }, (_, i) => `hsl(${Math.round((i * 360) / 16)}, 60%, 52%)`);
const colorOf = (c: number) => (c < 0 ? "hsl(150, 5%, 58%)" : PALETTE[c % 16]);

export default function Galaxy() {
  useUILang();
  const ar = getUILang() === "ar";
  const [net, setNet] = useState<Net | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [selDoc, setSelDoc] = useState<RootDoc | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [deg, setDeg] = useState(3); // connection degree: link roots sharing ≥deg verses

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({ k: 1, tx: 0, ty: 0 });
  const hover = useRef<number | null>(null);
  const selRef = useRef<number | null>(null);
  const adj = useRef<Map<number, [number, number][]>>(new Map());
  const edgePath = useRef<Path2D | null>(null);
  const byCluster = useRef<number[][]>([]);
  const colors = useRef({ bg: "#f7f4ee", ink: "#222", dark: false });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map()); // active touches
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null); // two-finger zoom
  const raf = useRef(0);
  const netCache = useRef<Map<number, Net>>(new Map());

  useEffect(() => { selRef.current = sel; schedule(); }, [sel]);

  function readColors() {
    // a fixed deep-space ground — the coloured root-stars pop against it
    colors.current = { bg: "#0f1419", ink: "#eceae4", dark: true };
  }

  // derive adjacency, the ambient edge Path2D, and cluster buckets from a network
  function buildDerived(j: Net) {
    const a = new Map<number, [number, number][]>();
    for (const e of j.edges) {
      (a.get(e.s) ?? a.set(e.s, []).get(e.s)!).push([e.t, e.w]);
      (a.get(e.t) ?? a.set(e.t, []).get(e.t)!).push([e.s, e.w]);
    }
    adj.current = a;
    // ambient threads = the strongest ~2500 only (perf); full set stays in `adj`
    const strong = [...j.edges].sort((x, y) => y.w - x.w).slice(0, 2500);
    const p = new Path2D();
    for (const e of strong) { const s = j.nodes[e.s], t = j.nodes[e.t]; p.moveTo(s.x, s.y); p.lineTo(t.x, t.y); }
    edgePath.current = p;
    const buckets: number[][] = [];
    j.nodes.forEach((nd, i) => { const c = nd.c < 0 ? 16 : nd.c; (buckets[c] ??= []).push(i); });
    byCluster.current = buckets;
  }

  // theme observer (once)
  useEffect(() => {
    readColors();
    const mo = new MutationObserver(() => { readColors(); schedule(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => mo.disconnect();
  }, []);

  // load the network for the chosen connection degree (cached per degree)
  useEffect(() => {
    const cached = netCache.current.get(deg);
    if (cached) { buildDerived(cached); setSel(null); setNet(cached); return; }
    setNet(null); setSel(null);
    fetch(`${import.meta.env.BASE_URL}network-${deg}.json?v=${__DATA_VERSION__}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Net | null) => { if (!j) return; netCache.current.set(deg, j); buildDerived(j); setNet(j); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deg]);

  useEffect(() => {
    if (sel == null || !net) { setSelDoc(undefined); return; }
    let live = true; setSelDoc(undefined);
    getRoot(net.nodes[sel].r).then((d) => live && setSelDoc(d)).catch(() => live && setSelDoc(null));
    return () => { live = false; };
  }, [sel, net]);

  const hubMin = useMemo(() => {
    if (!net) return Infinity;
    const occ = net.nodes.map((n) => n.o).sort((a, b) => b - a);
    return occ[Math.min(89, occ.length - 1)] ?? 0;
  }, [net]);

  function schedule() { if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; draw(); }); }

  function fit() {
    const cv = canvasRef.current, n = net, wrap = wrapRef.current;
    if (!cv || !n || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const k = Math.min(W, H) / (n.meta.span * 0.82);
    view.current = { k, tx: W / 2, ty: H / 2 };
    schedule();
  }
  useEffect(() => {
    if (!net) return;
    fit();
    const ro = new ResizeObserver(() => fit());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  function draw() {
    const cv = canvasRef.current, n = net;
    if (!cv || !n) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { k, tx, ty } = view.current;
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, "#161e24"); grad.addColorStop(1, "#0a0e12");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    // ── edges: one baked path, drawn under the world transform ──
    if (edgePath.current) {
      ctx.setTransform(k * dpr, 0, 0, k * dpr, tx * dpr, ty * dpr);
      ctx.globalAlpha = 0.13;
      ctx.strokeStyle = "#89ab9c"; ctx.lineWidth = 0.6 / k;
      ctx.stroke(edgePath.current);
      ctx.globalAlpha = 1;
    }
    // back to screen space (dpr only) for crisp round stars + labels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const SX = (x: number) => x * k + tx, SY = (y: number) => y * k + ty;
    const rOf = (o: number) => Math.max(1.4, (1.2 + Math.sqrt(o) / 2.6) * Math.min(1.5, 0.5 + k * 0.8));

    // ── stars: batched by cluster (one fill per colour) ──
    const buckets = byCluster.current;
    for (let c = 0; c < buckets.length; c++) {
      const ids = buckets[c]; if (!ids) continue;
      ctx.beginPath();
      for (const i of ids) { const nd = n.nodes[i]; const r = rOf(nd.o); ctx.moveTo(SX(nd.x) + r, SY(nd.y)); ctx.arc(SX(nd.x), SY(nd.y), r, 0, 6.2832); }
      ctx.fillStyle = c === 16 ? colorOf(-1) : PALETTE[c % 16]; ctx.fill();
    }

    // ── focus (selected or hover): its threads + neighbour rings + white ring ──
    const hi = selRef.current ?? hover.current;
    if (hi != null) {
      const nd = n.nodes[hi];
      ctx.strokeStyle = "rgba(244,222,138,0.6)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [j] of adj.current.get(hi) ?? []) { const b = n.nodes[j]; ctx.moveTo(SX(nd.x), SY(nd.y)); ctx.lineTo(SX(b.x), SY(b.y)); }
      ctx.stroke();
      for (const [j] of adj.current.get(hi) ?? []) { const b = n.nodes[j]; ctx.beginPath(); ctx.arc(SX(b.x), SY(b.y), rOf(b.o) + 1.3, 0, 6.2832); ctx.fillStyle = colorOf(b.c); ctx.fill(); }
      ctx.beginPath(); ctx.arc(SX(nd.x), SY(nd.y), rOf(nd.o) + 3.5, 0, 6.2832); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }

    // ── hub labels (halo) ──
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
    ctx.font = "600 13px var(--font-quran), serif";
    for (let i = 0; i < n.nodes.length; i++) {
      const nd = n.nodes[i];
      if (nd.o < hubMin || i === hi) continue;
      const x = SX(nd.x), y = SY(nd.y) - rOf(nd.o) - 3;
      ctx.strokeStyle = "#0b0f13"; ctx.lineWidth = 3.5; ctx.strokeText(nd.r, x, y);
      ctx.fillStyle = "#e8e6e0"; ctx.fillText(nd.r, x, y);
    }
    // ── focus label — a prominent pill, so even a tiny star reads clearly ──
    if (hi != null) {
      const nd = n.nodes[hi];
      ctx.font = "700 22px var(--font-quran), serif";
      const tw = ctx.measureText(nd.r).width, pad = 12, ph = 34;
      const cx = SX(nd.x), cy = SY(nd.y) - rOf(nd.o) - 10;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - tw / 2 - pad, cy - ph, tw + pad * 2, ph, 10);
      else ctx.rect(cx - tw / 2 - pad, cy - ph, tw + pad * 2, ph);
      ctx.fillStyle = "rgba(10,14,18,0.94)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(nd.r, cx, cy - ph / 2 + 1);
    }
  }

  // ── interaction ──
  function nodeAt(mx: number, my: number): number | null {
    const n = net; if (!n) return null;
    const { k, tx, ty } = view.current;
    let best = -1, bd = 16 * 16;
    for (let i = 0; i < n.nodes.length; i++) { const nd = n.nodes[i]; const dx = nd.x * k + tx - mx, dy = nd.y * k + ty - my; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best < 0 ? null : best;
  }
  const xy = (e: React.PointerEvent | React.WheelEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  // zoom the view by `factor`, keeping the point (x,y) fixed on screen
  const zoomAround = (x: number, y: number, factor: number) => {
    const v = view.current;
    const nk = Math.max(0.04, Math.min(60, v.k * factor));
    v.tx = x - (x - v.tx) * (nk / v.k); v.ty = y - (y - v.ty) * (nk / v.k); v.k = nk;
  };
  const onWheel = (e: React.WheelEvent) => { const { x, y } = xy(e); zoomAround(x, y, Math.exp(-e.deltaY * 0.0012)); schedule(); };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = xy(e); pointers.current.set(e.pointerId, { x, y });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag.current = null; // two fingers → pinch, not pan
    } else drag.current = { x, y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const { x, y } = xy(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y });
    // pinch-to-zoom (+ two-finger pan): scale around the fingers' midpoint
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const p = pinch.current;
      if (p.dist > 0) zoomAround(cx, cy, dist / p.dist);
      view.current.tx += cx - p.cx; view.current.ty += cy - p.cy;
      pinch.current = { dist, cx, cy }; schedule(); return;
    }
    if (drag.current) { const dx = x - drag.current.x, dy = y - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true; view.current.tx += dx; view.current.ty += dy; drag.current.x = x; drag.current.y = y; schedule(); return; }
    const h = nodeAt(x, y); if (h !== hover.current) { hover.current = h; if (canvasRef.current) canvasRef.current.style.cursor = h == null ? "grab" : "pointer"; schedule(); }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) { // second finger lifted — re-anchor pan, no tap-select
      const [p] = [...pointers.current.values()]; drag.current = { x: p.x, y: p.y, moved: true }; return;
    }
    const d = drag.current; drag.current = null;
    if (d && !d.moved && pointers.current.size === 0) { const { x, y } = xy(e); setSel(nodeAt(x, y)); }
  };
  const onCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  function focusNode(i: number) {
    const n = net, cv = canvasRef.current; if (!n || !cv) return;
    const dpr = window.devicePixelRatio || 1; const W = cv.width / dpr, H = cv.height / dpr;
    const nd = n.nodes[i]; const k = Math.max(view.current.k, 2.4);
    view.current = { k, tx: W / 2 - nd.x * k, ty: H / 2 - nd.y * k }; setSel(i); schedule();
  }

  const results = useMemo(() => {
    const q = query.trim(); if (!q || !net) return [] as { i: number; r: string; o: number }[];
    const out: { i: number; r: string; o: number }[] = [];
    for (let i = 0; i < net.nodes.length; i++) { const nd = net.nodes[i]; if (nd.r.startsWith(q) || fuzzyMatch(q, nd.r)) out.push({ i, r: nd.r, o: nd.o }); if (out.length > 40) break; }
    return out.sort((a, b) => b.o - a.o).slice(0, 20);
  }, [query, net]);

  const neighbors = useMemo(() => {
    if (sel == null || !net) return [] as { r: string; w: number; i: number }[];
    return (adj.current.get(sel) ?? []).map(([j, w]) => ({ r: net.nodes[j].r, w, i: j })).sort((a, b) => b.w - a.w).slice(0, 10);
  }, [sel, net]);

  return (
    <div className="page gx-page">
      <div className="gx-head">
        <div className="gx-titlebar">
          <h1 className="jw-title gx-title">{ar ? "شبكة القرآن" : "The Qur'an network"}</h1>
          {net && <span className="muted gx-stat">{num(net.meta.nodes)} {ar ? "جذرًا" : "roots"} · {num(net.meta.edges)} {ar ? "رابطًا" : "links"} · {num(net.meta.clusters)} {ar ? "كوكبة" : "clusters"}</span>}
          <div className="gx-deg">
            <span className="muted">{ar ? "الترابط" : "links"}</span>
            {[1, 2, 3, 4, 5].map((d) => (
              <button key={d} className={deg === d ? "on" : ""} onClick={() => setDeg(d)}
                title={ar ? `جذورٌ تشترك في ${num(d)} آياتٍ فأكثر` : `roots sharing ${d}+ verses`}>{num(d)}+</button>
            ))}
          </div>
          <span className="gx-flex" />
          <div className="gx-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} dir="rtl"
              onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { focusNode(results[0].i); setQuery(""); } }}
              placeholder={ar ? "ابحث عن جذر…" : "search a root…"} />
            {query.trim() && results.length > 0 && (
              <div className="gx-results">
                {results.map((r) => (
                  <button key={r.i} onClick={() => { focusNode(r.i); setQuery(""); }}>
                    <span className="quran">{r.r}</span> <span className="muted">{num(r.o)}×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="gx-stage" ref={wrapRef}>
        {!net && <div className="gx-loading">{ar ? "جارٍ بناء الشبكة…" : "building the network…"}</div>}
        <canvas ref={canvasRef} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerCancel={onCancel}
          onPointerLeave={() => { if (hover.current != null) { hover.current = null; schedule(); } }}
          style={{ touchAction: "none", cursor: "grab" }} />
        {sel != null && net && (
          <div className="gx-panel card">
            <button className="gx-close" onClick={() => setSel(null)} aria-label="close">✕</button>
            <div className="gx-panel-h">
              <span className="gx-dot" style={{ background: colorOf(net.nodes[sel].c) }} />
              <span className="quran gx-root">{net.nodes[sel].r}</span>
              <span className="chip">{num(net.nodes[sel].o)} {ar ? "مرّة" : "×"}</span>
            </div>
            {selDoc?.meanings?.[0] && <p className="gx-mean quran" dir="rtl">{selDoc.meanings[0].text.slice(0, 170)}…</p>}
            {neighbors.length > 0 && (
              <>
                <div className="muted gx-nb-h">{ar ? "أكثرُ ما يتوارد معه" : "co-occurs most with"}</div>
                <div className="gx-nb">
                  {neighbors.map((nb) => (
                    <button key={nb.i} className="chip" onClick={() => focusNode(nb.i)}>
                      <span className="quran" style={{ fontSize: 16 }}>{nb.r}</span> <span className="muted">{num(nb.w)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="gx-links">
              <Link to={`/roots/${encodeURIComponent(net.nodes[sel].r)}`} className="chip link">{ar ? "المواضع ←" : "usage ←"}</Link>
              <Link to={`/mujam/${encodeURIComponent(net.nodes[sel].r)}`} className="chip link">{ar ? "المعجم ←" : "entry ←"}</Link>
              <Link to={`/fabric/${encodeURIComponent(net.nodes[sel].r)}`} className="chip link">{ar ? "النسيج ←" : "fabric ←"}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
