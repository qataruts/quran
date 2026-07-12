/**
 * الكلّيّات والجوامع والتفصيل — the computed classification. Filter by tier
 * (كلّيّة / جامعة / تفصيل), search, and drill each verse down its tree. From the
 * Qur'an's own data (see docs/kulliyat-methodology.md).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import PageSearch from "../components/PageSearch";
import { allVerseLocs, childrenOf, classOf, kulliyatMeta, tierCounts, tierList, useKulliyat, type Tier } from "../kulliyat";
import { fuzzyMatch } from "../lib/fuzzy";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
const tierCls = (t?: Tier) => (t === "كلّية" ? "k" : t === "جامعة" ? "j" : "t");

/** One verse in the tree — drillable to the verses that gather under it. */
function Node({ loc, texts, depth }: { loc: string; texts: Map<string, AyahDoc>; depth: number }) {
  const [open, setOpen] = useState(false); // everything collapsed; open what you want
  const [kidLimit, setKidLimit] = useState(15); // ceiling on children shown at once
  const ar = getUILang() === "ar";
  const cls = classOf(loc);
  const kids = childrenOf(loc);
  const canDrill = kids.length > 0 && depth < 6;
  const [s, a] = loc.split(":");
  const toggle = () => canDrill && setOpen((v) => !v);
  return (
    <div className="kl-node">
      <div className={`kl-verse ${tierCls(cls?.tier)}`}>
        <button className="kl-drill" onClick={toggle} disabled={!canDrill} aria-label={ar ? "فتح/إغلاق" : "toggle"}>
          {canDrill ? (open ? "▾" : "▸") : "•"}
        </button>
        <Link to={`/read/${s}/${a}`} className="kl-verse-ref">{arName(loc)}</Link>
        {cls && <span className={`kl-badge ${tierCls(cls.tier)}`}>{cls.tier}</span>}
        <span className="quran kl-verse-text" onClick={toggle} style={{ cursor: canDrill ? "pointer" : "default" }}>
          {texts.get(loc)?.textClean ?? loc}
        </span>
        {canDrill && <span className="muted kl-kids">{num(kids.length)}</span>}
      </div>
      {open && canDrill && (
        <div className="kl-children">
          {kids.slice(0, kidLimit).map((k) => <Node key={k} loc={k} texts={texts} depth={depth + 1} />)}
          {kids.length > kidLimit && (
            <button className="chip kl-morekids" onClick={() => setKidLimit(kidLimit + 30)}>
              {ar ? `عرض المزيد (${num(kids.length - kidLimit)})` : `+${num(kids.length - kidLimit)}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const TIERS: Tier[] = ["كلّية", "جامعة", "تفصيل"];

export default function Kulliyat() {
  useUILang();
  const ar = getUILang() === "ar";
  const ready = useKulliyat();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [tier, setTier] = useState<Tier>("كلّية");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(30);
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);
  useEffect(() => { setLimit(30); }, [q, tier]);

  const counts = useMemo(() => (ready ? tierCounts() : { kulliya: 0, jamia: 0, tafsil: 0 }), [ready]);
  const meta = ready ? kulliyatMeta() : null;
  const byTier = useMemo(() => (ready ? tierList(tier) : []), [ready, tier]);
  const all = useMemo(() => (ready ? allVerseLocs() : []), [ready]);
  const filtered = useMemo(() => {
    const src = q.trim() ? all : byTier; // typing searches the WHOLE Qur'an, any tier
    return src.filter((loc) => fuzzyMatch(q, arName(loc), texts.get(loc)?.textClean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byTier, all, q, texts]);
  const tierN = (t: Tier) => (t === "كلّية" ? counts.kulliya : t === "جامعة" ? counts.jamia : counts.tafsil);

  if (!ready) {
    return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;
  }

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الكلّيّات والجوامع والتفصيل" : "Kulliyyāt · Jawāmiʿ · Tafṣīl"}</h1>
          <p className="jw-lead">
            {ar
              ? "تصنيفٌ محسوبٌ لآيات القرآن في مراتبَ متدرّجة، من بيانات القرآن نفسِه. اختَرِ المرتبة، وابحثْ، وانقُرِ المثلّثَ لتفتحَ ما يندرجُ تحت الآية."
              : "A computed classification of every verse. Pick a tier, search, and drill each verse down its tree."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(meta?.verses ?? 6236)}</b> {ar ? "آية" : "verses"}</span>
            <span className="chip"><b>{num(meta?.themes ?? 0)}</b> {ar ? "محورًا" : "themes"}</span>
          </div>
        </header>

        <div className="jw-filters">
          <div className="jw-chipset">
            <span className="jw-filter-lbl">{ar ? "المرتبة" : "tier"}</span>
            {TIERS.map((tt) => (
              <button key={tt} className={tier === tt ? (tt === "كلّية" ? "on gold" : "on") : ""} onClick={() => setTier(tt)}>
                {tt} <span className="muted">{num(tierN(tt))}</span>
              </button>
            ))}
          </div>
        </div>

        <PageSearch value={q} onChange={setQ} placeholder={ar ? `ابحث في ${tier === "كلّية" ? "الكلّيّات" : tier === "جامعة" ? "الجوامع" : "التفصيل"}…` : "search…"} />
        <div className="muted jw-resultcount">{num(filtered.length)} {ar ? "آية" : ""}</div>

        <div className="kl-tree">
          {filtered.slice(0, limit).map((loc) => <Node key={loc} loc={loc} texts={texts} depth={0} />)}
        </div>
        {filtered.length > limit && (
          <div style={{ textAlign: "center", margin: "18px 0" }}>
            <button onClick={() => setLimit(limit + 50)}>{ar ? `عرض المزيد (${num(filtered.length - limit)})` : "show more"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
