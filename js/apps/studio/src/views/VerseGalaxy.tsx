/**
 * شبكةُ الآيات — the galaxy of VERSES. Every one of the 6236 āyāt is a star, sized
 * by its جامعية (weight of meaning), coloured by its محور (theme), linked by the
 * semantic-neighbour graph. The الكلّيّات mechanism made spatial: foundational
 * verses (الكلّيّات) become the bright hubs, themes become galaxies. Pan, zoom,
 * tap a star for the verse. Layout baked in scripts/export-verse-network.mjs.
 * Data: public/verse-network.json. Route: /shabaka.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, useUILang } from "../i18n";
import type { AyahDoc } from "../types";

interface VNode { l: string; o: number; x: number; y: number; c: number; t: number }
interface VEdge { s: number; t: number; w: number }
interface Net { meta: { nodes: number; edges: number; themes: number; span: number; themeLabels?: string[] }; nodes: VNode[]; edges: VEdge[] }

// 90 themes → distinct hues by the golden angle (adjacent themes stay separable)
const hue = (c: number) => (c * 137.508) % 360;
const colorOf = (n: VNode) => (n.c < 0 ? "hsl(150,5%,55%)" : `hsl(${hue(n.c)}, ${62 + n.t * 6}%, ${46 + n.t * 9}%)`);
const TIER = ["تفصيل", "جامعة", "كلّيّة"];
const arRef = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

export default function VerseGalaxy() {
  useUILang();
  const ar = getUILang() === "ar";
  const [net, setNet] = useState<Net | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [query, setQuery] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({ k: 1, tx: 0, ty: 0 });
  const hover = useRef<number | null>(null);
  const selRef = useRef<number | null>(null);
  const adj = useRef<Map<number, number[]>>(new Map());
  const edgePath = useRef<Path2D | null>(null);
  const byTheme = useRef<number[][]>([]);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const raf = useRef(0);

  useEffect(() => { selRef.current = sel; schedule(); }, [sel]);
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);

  function buildDerived(j: Net) {
    const a = new Map<number, number[]>();
    for (const e of j.edges) {
      (a.get(e.s) ?? a.set(e.s, []).get(e.s)!).push(e.t);
      (a.get(e.t) ?? a.set(e.t, []).get(e.t)!).push(e.s);
    }
    adj.current = a;
    const strong = [...j.edges].sort((x, y) => y.w - x.w).slice(0, 4000);
    const p = new Path2D();
    for (const e of strong) { const s = j.nodes[e.s], t = j.nodes[e.t]; p.moveTo(s.x, s.y); p.lineTo(t.x, t.y); }
    edgePath.current = p;
    const buckets: number[][] = [];
    j.nodes.forEach((nd, i) => { const c = nd.c < 0 ? 90 : nd.c; (buckets[c] ??= []).push(i); });
    byTheme.current = buckets;
  }

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}verse-network.json?v=${__DATA_VERSION__}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Net | null) => { if (!j) return; buildDerived(j); setNet(j); })
      .catch(() => {});
  }, []);

  // label only the الكلّيّات (t===2) — the bright hubs
  const hubIds = useMemo(() => (net ? net.nodes.map((n, i) => (n.t === 2 ? i : -1)).filter((i) => i >= 0) : []), [net]);

  function schedule() { if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; draw(); }); }

  function fit() {
    const cv = canvasRef.current, n = net, wrap = wrapRef.current;
    if (!cv || !n || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const k = Math.min(W, H) / (n.meta.span * 0.9);
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

    if (edgePath.current) {
      ctx.setTransform(k * dpr, 0, 0, k * dpr, tx * dpr, ty * dpr);
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = "#89ab9c"; ctx.lineWidth = 0.5 / k;
      ctx.stroke(edgePath.current);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const SX = (x: number) => x * k + tx, SY = (y: number) => y * k + ty;
    const zf = Math.min(1.6, 0.5 + k * 0.9);
    const rOf = (nd: VNode) => Math.max(1.1, (0.9 + nd.o * 3.2 + nd.t * 1.6) * zf);

    const buckets = byTheme.current;
    for (let c = 0; c < buckets.length; c++) {
      const ids = buckets[c]; if (!ids) continue;
      ctx.beginPath();
      for (const i of ids) { const nd = n.nodes[i]; const r = rOf(nd); ctx.moveTo(SX(nd.x) + r, SY(nd.y)); ctx.arc(SX(nd.x), SY(nd.y), r, 0, 6.2832); }
      ctx.fillStyle = c === 90 ? "hsl(150,5%,55%)" : `hsl(${hue(c)}, 64%, 55%)`; ctx.fill();
    }

    const hi = selRef.current ?? hover.current;
    if (hi != null) {
      const nd = n.nodes[hi];
      ctx.strokeStyle = "rgba(244,222,138,0.55)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const j of adj.current.get(hi) ?? []) { const b = n.nodes[j]; ctx.moveTo(SX(nd.x), SY(nd.y)); ctx.lineTo(SX(b.x), SY(b.y)); }
      ctx.stroke();
      for (const j of adj.current.get(hi) ?? []) { const b = n.nodes[j]; ctx.beginPath(); ctx.arc(SX(b.x), SY(b.y), rOf(b) + 1.2, 0, 6.2832); ctx.fillStyle = colorOf(b); ctx.fill(); }
      ctx.beginPath(); ctx.arc(SX(nd.x), SY(nd.y), rOf(nd) + 3.5, 0, 6.2832); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }

    // hub labels — the كلّيّات, by surah:ayah (thin out when zoomed far)
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
    ctx.font = "600 12px var(--font-quran), serif";
    const showLabels = k > 0.35;
    if (showLabels) for (const i of hubIds) {
      if (i === hi) continue;
      const nd = n.nodes[i];
      const x = SX(nd.x), y = SY(nd.y) - rOf(nd) - 3;
      if (x < -40 || x > W / dpr + 40 || y < 0 || y > H / dpr) continue;
      ctx.strokeStyle = "#0b0f13"; ctx.lineWidth = 3.5; ctx.strokeText(arRef(nd.l), x, y);
      ctx.fillStyle = "#e8e6e0"; ctx.fillText(arRef(nd.l), x, y);
    }
    if (hi != null) {
      const nd = n.nodes[hi];
      const label = arRef(nd.l);
      ctx.font = "700 20px var(--font-quran), serif";
      const tw = ctx.measureText(label).width, pad = 12, ph = 32;
      const cx = SX(nd.x), cy = SY(nd.y) - rOf(nd) - 10;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - tw / 2 - pad, cy - ph, tw + pad * 2, ph, 10);
      else ctx.rect(cx - tw / 2 - pad, cy - ph, tw + pad * 2, ph);
      ctx.fillStyle = "rgba(10,14,18,0.94)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(label, cx, cy - ph / 2 + 1);
    }
  }

  function nodeAt(mx: number, my: number): number | null {
    const n = net; if (!n) return null;
    const { k, tx, ty } = view.current;
    let best = -1, bd = 14 * 14;
    for (let i = 0; i < n.nodes.length; i++) { const nd = n.nodes[i]; const dx = nd.x * k + tx - mx, dy = nd.y * k + ty - my; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best < 0 ? null : best;
  }
  const xy = (e: React.PointerEvent | React.WheelEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const zoomAround = (x: number, y: number, factor: number) => {
    const v = view.current;
    const nk = Math.max(0.06, Math.min(60, v.k * factor));
    v.tx = x - (x - v.tx) * (nk / v.k); v.ty = y - (y - v.ty) * (nk / v.k); v.k = nk;
  };
  const onWheel = (e: React.WheelEvent) => { const { x, y } = xy(e); zoomAround(x, y, Math.exp(-e.deltaY * 0.0012)); schedule(); };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = xy(e); pointers.current.set(e.pointerId, { x, y });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag.current = null;
    } else drag.current = { x, y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const { x, y } = xy(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y });
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
    if (pointers.current.size === 1) { const [p] = [...pointers.current.values()]; drag.current = { x: p.x, y: p.y, moved: true }; return; }
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
    const nd = n.nodes[i]; const k = Math.max(view.current.k, 3);
    view.current = { k, tx: W / 2 - nd.x * k, ty: H / 2 - nd.y * k }; setSel(i); schedule();
  }

  const results = useMemo(() => {
    const q = query.trim(); if (!q || !net) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < net.nodes.length; i++) {
      const loc = net.nodes[i].l;
      if (arRef(loc).includes(q) || loc.includes(q) || (texts.get(loc)?.textClean ?? "").includes(q)) out.push(i);
      if (out.length > 30) break;
    }
    return out.sort((a, b) => net.nodes[b].o - net.nodes[a].o).slice(0, 15);
  }, [query, net, texts]);

  const selNode = sel != null && net ? net.nodes[sel] : null;
  const themeLabel = selNode && net?.meta.themeLabels ? net.meta.themeLabels[selNode.c] : "";

  return (
    <div className="page gx-page">
      <div className="gx-head">
        <div className="gx-titlebar">
          <h1 className="jw-title gx-title">{ar ? "شبكة الآيات" : "The verse galaxy"}</h1>
          {net && <span className="muted gx-stat">{num(net.meta.nodes)} {ar ? "آية" : "verses"} · {num(net.meta.themes)} {ar ? "محورًا" : "themes"}</span>}
          <span className="gx-flex" />
          <div className="gx-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} dir="rtl"
              onKeyDown={(e) => { if (e.key === "Enter" && results[0] != null) { focusNode(results[0]); setQuery(""); } }}
              placeholder={ar ? "ابحث عن آية…" : "search a verse…"} />
            {query.trim() && results.length > 0 && (
              <div className="gx-results">
                {results.map((i) => (
                  <button key={i} onClick={() => { focusNode(i); setQuery(""); }}>
                    <span>{arRef(net!.nodes[i].l)}</span> <span className="muted">{num(Math.round(net!.nodes[i].o * 100))}٪</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="gx-legend">
          <span><i className="gx-lg gx-lg-k" /> {ar ? "كلّيّة" : "kulliyya"}</span>
          <span><i className="gx-lg gx-lg-j" /> {ar ? "جامعة" : "jāmiʿa"}</span>
          <span><i className="gx-lg gx-lg-t" /> {ar ? "تفصيل" : "tafṣīl"}</span>
          <span className="muted">{ar ? "الحجمُ = الجامعيّة · اللونُ = المحور" : "size = weight · colour = theme"}</span>
        </div>
      </div>

      <div className="gx-stage" ref={wrapRef}>
        {!net && <div className="gx-loading">{ar ? "جارٍ بناء شبكة الآيات…" : "building the verse galaxy…"}</div>}
        <canvas ref={canvasRef} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerCancel={onCancel}
          onPointerLeave={() => { if (hover.current != null) { hover.current = null; schedule(); } }}
          style={{ touchAction: "none", cursor: "grab" }} />
        {selNode && (
          <div className="gx-panel card">
            <button className="gx-close" onClick={() => setSel(null)} aria-label="close">✕</button>
            <div className="gx-panel-h">
              <span className="gx-dot" style={{ background: colorOf(selNode) }} />
              <Link to={`/read/${selNode.l.split(":")[0]}/${selNode.l.split(":")[1]}`} className="gx-root" style={{ textDecoration: "none" }}>{arRef(selNode.l)}</Link>
              <span className={`kl-badge ${selNode.t === 2 ? "k" : selNode.t === 1 ? "j" : "t"}`}>{TIER[selNode.t]}</span>
              <span className="chip">{num(Math.round(selNode.o * 100))}٪</span>
            </div>
            {texts.get(selNode.l) && <p className="gx-mean quran" dir="rtl">{texts.get(selNode.l)!.textClean}</p>}
            {themeLabel && <div className="muted gx-nb-h">◇ {themeLabel}</div>}
            <div className="gx-links">
              <Link to={`/read/${selNode.l.split(":")[0]}/${selNode.l.split(":")[1]}`} className="chip link">{ar ? "اقرأ الآية ←" : "read ←"}</Link>
              <Link to="/kulliyat" className="chip link">{ar ? "الكلّيّات ←" : "kulliyyāt ←"}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
