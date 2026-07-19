/**
 * الآيةُ في الميزان — the verse's HUB: a clear, single-verse page that ties it to
 * every computed layer of the project. Reached by tapping a verse's tier chip
 * anywhere. Shows the verse in full, its مرتبة/جامعية, its محور, its place in the
 * tree, the six-factor arithmetic (WhyRank), and — folded — مثلها (semantic
 * neighbours), فروق التنزيل, the محور's أصل + أخوات, and the verse's roots.
 * Route: /aya/:s/:a. «نحسب ونعرض».
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr, wordsOfAyah } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import WhyRank from "../components/WhyRank";
import EvidencePanel from "../components/EvidencePanel";
import { ayahIdOf } from "../components/AudioButton";
import { similarOf } from "../similar";
import { loadFuruq, catLabel } from "../furuq";
import {
  childrenOf, classOf, kulliyaOf, subtreeCounts, themeHeadOf, themeName, themeSizeOf, themeVerses, useKulliyat,
} from "../kulliyat";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
const tierCls = (t?: string) => (t === "كلّية" ? "k" : t === "جامعة" ? "j" : "t");
const ayaPath = (loc: string) => `/aya/${loc.split(":")[0]}/${loc.split(":")[1]}`;

/** a compact verse row that links to its own card */
function VerseRow({ loc, texts, extra }: { loc: string; texts: Map<string, AyahDoc>; extra?: React.ReactNode }) {
  return (
    <Link to={ayaPath(loc)} className="aya-kid">
      <span className="kl-verse-ref">{arName(loc)}</span>
      {classOf(loc) && <span className={`kl-badge ${tierCls(classOf(loc)?.tier)}`} style={{ flex: "none" }}>{classOf(loc)?.tier}</span>}
      <span className="quran aya-kid-text">{texts.get(loc)?.textClean ?? loc}</span>
      {extra}
    </Link>
  );
}

export default function AyaCard() {
  useUILang();
  const ar = getUILang() === "ar";
  const ready = useKulliyat();
  const { s, a } = useParams<{ s: string; a: string }>();
  const loc = `${s}:${a}`;
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);

  const cls = ready ? classOf(loc) : null;
  const kulliya = useMemo(() => (ready ? kulliyaOf(loc) : null), [ready, loc]);
  const kids = useMemo(() => (ready ? childrenOf(loc) : []), [ready, loc]);
  const sub = ready && cls && cls.tier !== "تفصيل" ? subtreeCounts(loc) : null;

  // global-id → AyahDoc, for resolving semantic neighbours to locations
  const byId = useMemo(() => { const m = new Map<number, AyahDoc>(); for (const d of texts.values()) m.set(ayahIdOf(d), d); return m; }, [texts]);

  const [neighbors, setNeighbors] = useState<{ loc: string; score: number }[]>([]);
  const [twins, setTwins] = useState<{ loc: string; cat: string }[]>([]);
  const [roots, setRoots] = useState<string[]>([]);

  useEffect(() => {
    const self = texts.get(loc);
    if (!self) { setNeighbors([]); return; }
    let live = true;
    similarOf(ayahIdOf(self))
      .then((ns) => { if (!live) return;
        setNeighbors(ns.map((n) => { const d = byId.get(n.ayahId); return d ? { loc: `${d.surahNo}:${d.ayahNo}`, score: n.score } : null; }).filter(Boolean).slice(0, 8) as { loc: string; score: number }[]);
      })
      .catch(() => { if (live) setNeighbors([]); });
    return () => { live = false; };
  }, [loc, texts, byId]);

  useEffect(() => {
    let live = true;
    loadFuruq()
      .then((fd) => { if (!live) return;
        const out: { loc: string; cat: string }[] = [];
        for (const f of fd.furuq) { if (f.a === loc) out.push({ loc: f.b, cat: f.cat }); else if (f.b === loc) out.push({ loc: f.a, cat: f.cat }); }
        setTwins(out);
      })
      .catch(() => { if (live) setTwins([]); });
    return () => { live = false; };
  }, [loc]);

  useEffect(() => {
    let live = true;
    const [ss, aa] = loc.split(":").map(Number);
    wordsOfAyah(ss, aa)
      .then((ws) => { if (!live) return;
        const seen = new Set<string>(); const rs: string[] = [];
        for (const w of ws) { const r = (w as { root?: string }).root; if (r && !seen.has(r)) { seen.add(r); rs.push(r); } }
        setRoots(rs);
      })
      .catch(() => { if (live) setRoots([]); });
    return () => { live = false; };
  }, [loc]);

  const themeSibs = useMemo(() => (ready && cls ? themeVerses(cls.theme).filter((l) => l !== loc).slice(0, 6) : []), [ready, cls, loc]);
  const themeHead = ready && cls ? themeHeadOf(cls.theme) : null;

  if (!ready) return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;
  if (!cls) return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("notFound")}</div></div>;

  const under: string[] = [];
  if (sub) { if (sub.jamia) under.push(ar ? `${num(sub.jamia)} جامعة` : `${sub.jamia} jāmiʿa`); if (sub.tafsil) under.push(ar ? `${num(sub.tafsil)} تفصيلًا` : `${sub.tafsil} tafṣīl`); }

  return (
    <div className="page">
      <div className="jw-wrap aya-wrap">
        <header className="jw-header">
          <div className="aya-crumb">
            <Link to="/kulliyat">{ar ? "الكلّيّات" : "Kulliyyāt"}</Link>
            <span className="mw-sep">›</span>
            <span className="mw-here">{arName(loc)}</span>
          </div>
          <h1 className="jw-title" style={{ marginBottom: 6 }}>{ar ? "بطاقةُ الآية" : "Verse card"}</h1>
          <div className="aya-head-badges">
            <Link to={`/read/${s}/${a}`} className="kl-verse-ref" style={{ fontSize: 15 }}>{arName(loc)}</Link>
            <span className={`kl-badge ${tierCls(cls.tier)}`}>{cls.tier}</span>
            <span className="chip">{ar ? "مفصِّلات" : "elaborators"} {num(cls.m ?? 0)}{(cls.mu ?? 0) > 0 ? (ar ? ` · مثانٍ ${num(cls.mu ?? 0)}` : ` · mutual ${num(cls.mu ?? 0)}`) : ""}</span>
          </div>
        </header>

        <div className="card aya-verse">
          <p className="quran aya-verse-text" dir="rtl">{texts.get(loc)?.textUthmani ?? texts.get(loc)?.textClean ?? loc}</p>
        </div>

        <div className="card aya-facts">
          <div className="aya-fact" title={ar ? "وسمُ الشبكة الموحّدة — نسخةٌ أولى قبل موجاتِ التعميق، تُحدَّث بعدها" : "unified-network tier — first edition before the deepening waves; updates after"}>
            <span className="aya-fact-l">{ar ? "المرتبة" : "tier"}</span>
            <span className="aya-fact-v"><span className={`kl-badge ${tierCls(cls.tier)}`}>{cls.tier}</span>
              <span className="muted" style={{ marginInlineStart: 8 }}>{ar ? `مفصِّلات ${num(cls.m ?? 0)} · محاور ${num(cls.T ?? 0)} · قبل التعميق` : `m ${num(cls.m ?? 0)} · axes ${num(cls.T ?? 0)} · pre-deepening`}</span>
            </span>
          </div>
          <div className="aya-fact">
            <span className="aya-fact-l">{ar ? "المحور" : "محور"}</span>
            <span className="aya-fact-v">
              <Link to={`/mawdui/${cls.theme}`} className="aya-theme">◇ {themeName(cls.theme) || arName(loc)}</Link>
              <span className="muted" style={{ marginInlineStart: 8 }}>{ar ? `يضمّ ${num(themeSizeOf(cls.theme))} آية` : `${themeSizeOf(cls.theme)} verses`}</span>
            </span>
          </div>
          <div className="aya-fact">
            <span className="aya-fact-l">{ar ? "موضعها" : "place"}</span>
            <span className="aya-fact-v">
              {cls.tier === "كلّية" ? (
                <span>{ar ? "كلّيّةٌ — رأسُ محورها" : "a kulliyya — head of its محور"}{under.length > 0 && <span className="muted">{ar ? ` · تحتها ${under.join(" و")}` : ` · under: ${under.join(", ")}`}</span>}</span>
              ) : kulliya ? (
                <span>{ar ? "تندرجُ تحت الكلّيّة " : "under the kulliyya "}<Link to={ayaPath(kulliya)} className="aya-theme">{arName(kulliya)}</Link>
                  {cls.tier === "جامعة" && under.length > 0 && <span className="muted">{ar ? ` · وتحتها ${under.join(" و")}` : ` · under it: ${under.join(", ")}`}</span>}
                </span>
              ) : (<span className="muted">—</span>)}
            </span>
          </div>
        </div>

        <EvidencePanel location={loc} />        <WhyRank location={loc} />

        {/* folded layers — the verse across the project */}
        {neighbors.length > 0 && (
          <details className="card aya-more">
            <summary>◇ {ar ? "مثلها — الأقربُ معنًى" : "Similar — nearest in meaning"} <span className="muted">{num(neighbors.length)}</span></summary>
            <div className="aya-more-body">
              {neighbors.map((n) => (
                <VerseRow key={n.loc} loc={n.loc} texts={texts} extra={<span className="chip" style={{ flex: "none" }}>{num(Math.round(n.score * 100))}٪</span>} />
              ))}
            </div>
          </details>
        )}

        {twins.length > 0 && (
          <details className="card aya-more">
            <summary>⇄ {ar ? "فروق التنزيل — متشابهاتٌ لفظيّة" : "Furūq — near-identical verses"} <span className="muted">{num(twins.length)}</span></summary>
            <div className="aya-more-body">
              {twins.slice(0, 12).map((tw) => (
                <VerseRow key={tw.loc} loc={tw.loc} texts={texts} extra={<span className="chip" style={{ flex: "none" }}>{catLabel(tw.cat)}</span>} />
              ))}
              {twins.length > 12 && <div className="muted" style={{ fontSize: 12.5 }}>{ar ? `و${num(twins.length - 12)} أخرى` : `+${twins.length - 12} more`}</div>}
              <Link to="/furuq" className="chip link" style={{ marginTop: 6 }}>{ar ? "قارِن الفروق كلمةً كلمة ←" : "compare word-by-word ←"}</Link>
            </div>
          </details>
        )}

        {(themeHead || themeSibs.length > 0) && (
          <details className="card aya-more">
            <summary>◇ {ar ? "محورُها (تجميعٌ حسابي):" : "its axis (computed grouping):"} <span className="muted">{themeName(cls.theme)}</span></summary>
            <div className="aya-more-body">
              {themeHead && themeHead !== loc && (
                <div className="aya-more-lbl">{ar ? "أوسعُ قواعدِ المحورِ أدلةً:" : "the axis\u2019s most-evidenced rule:"}</div>
              )}
              {themeHead && themeHead !== loc && <VerseRow loc={themeHead} texts={texts} />}
              {themeSibs.length > 0 && <div className="aya-more-lbl">{ar ? "من جاراتها في المحور:" : "axis neighbours:"}</div>}
              {themeSibs.map((l) => <VerseRow key={l} loc={l} texts={texts} />)}
              <Link to={`/mawdui/${cls.theme}`} className="chip link" style={{ marginTop: 6 }}>{ar ? "كلُّ آيات المحور ←" : "all محور verses ←"}</Link>
            </div>
          </details>
        )}

        {roots.length > 0 && (
          <details className="card aya-more">
            <summary>ج {ar ? "جذورُ الآية" : "the verse's roots"} <span className="muted">{num(roots.length)}</span></summary>
            <div className="aya-more-body aya-roots">
              {roots.map((r) => (
                <span key={r} className="aya-root-pair">
                  <Link to={`/roots/${encodeURIComponent(r)}`} className="chip link" style={{ textDecoration: "none" }}><span className="quran" style={{ fontSize: 17 }}>{r}</span></Link>
                  <Link to={`/khayt?q=${encodeURIComponent(r)}`} className="aya-root-trace" title={ar ? "تتبَّعْ هذا اللفظَ عبر المصحف" : "trace across the mushaf"}>↝</Link>
                </span>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12, padding: "0 16px 6px" }}>{ar ? "↝ يتتبّعُ اللفظَ عبر المصحف (خيطٌ موضوعيّ)" : "↝ traces the word across the mushaf"}</div>
          </details>
        )}

        {kids.length > 0 && (
          <div className="card aya-kids">
            <div className="aya-kids-h">{ar ? `يندرجُ تحتها مباشرةً (${num(kids.length)})` : `directly beneath (${kids.length})`}</div>
            <div className="aya-kids-list">
              {kids.slice(0, 20).map((k) => <VerseRow key={k} loc={k} texts={texts} />)}
              {kids.length > 20 && <div className="muted" style={{ fontSize: 12.5, padding: "4px 2px" }}>{ar ? `و${num(kids.length - 20)} أخرى — تُرى في شجرة الكلّيّات` : `+${kids.length - 20} more`}</div>}
            </div>
          </div>
        )}

        <div className="aya-actions">
          <Link to={`/read/${s}/${a}`} className="chip link">{ar ? "اقرأ في المصحف ←" : "read ←"}</Link>
          <Link to={`/mawdui/${cls.theme}`} className="chip link">{ar ? "المحور ←" : "محور ←"}</Link>
          <Link to="/kulliyat" className="chip link">{ar ? "شجرة الكلّيّات ←" : "the tree ←"}</Link>
          <Link to="/about" className="chip link">{ar ? "كيف نحسب؟ ←" : "how? ←"}</Link>
        </div>
      </div>
    </div>
  );
}
