/**
 * الآيةُ في الميزان — a clear, single-verse classification page. Reached by tapping
 * a verse's tier chip in the reader (تفصيل / جامعة / كلّيّة). Shows the verse in
 * full, its computed مرتبة and جامعية, its محور, its place in the tree (the كلّيّة
 * it sits under, and what gathers directly beneath it), and the reproducible
 * six-factor arithmetic (WhyRank). Route: /aya/:s/:a. «نحسب ونعرض».
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import WhyRank from "../components/WhyRank";
import {
  childrenOf, classOf, kulliyaOf, subtreeCounts, themeName, themeSizeOf, useKulliyat,
} from "../kulliyat";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
const tierCls = (t?: string) => (t === "كلّية" ? "k" : t === "جامعة" ? "j" : "t");

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
          <h1 className="jw-title" style={{ marginBottom: 6 }}>{ar ? "الآيةُ في الميزان" : "The verse in the balance"}</h1>
          <div className="aya-head-badges">
            <Link to={`/read/${s}/${a}`} className="kl-verse-ref" style={{ fontSize: 15 }}>{arName(loc)}</Link>
            <span className={`kl-badge ${tierCls(cls.tier)}`}>{cls.tier}</span>
            <span className="chip">{ar ? "جامعيّة" : "jāmiʿiyya"} {num(Math.round(cls.jamiya * 100))}٪</span>
          </div>
        </header>

        {/* the verse, complete */}
        <div className="card aya-verse">
          <p className="quran aya-verse-text" dir="rtl">{texts.get(loc)?.textUthmani ?? texts.get(loc)?.textClean ?? loc}</p>
        </div>

        {/* where it sits */}
        <div className="card aya-facts">
          <div className="aya-fact">
            <span className="aya-fact-l">{ar ? "المرتبة" : "tier"}</span>
            <span className="aya-fact-v"><span className={`kl-badge ${tierCls(cls.tier)}`}>{cls.tier}</span>
              <span className="muted" style={{ marginInlineStart: 8 }}>{ar ? "مؤشّرُ الجامعيّة" : "index"} {num(Math.round(cls.jamiya * 100))}٪</span>
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
                <span>{ar ? "تندرجُ تحت الكلّيّة " : "under the kulliyya "}<Link to={`/aya/${kulliya.split(":")[0]}/${kulliya.split(":")[1]}`} className="aya-theme">{arName(kulliya)}</Link>
                  {cls.tier === "جامعة" && under.length > 0 && <span className="muted">{ar ? ` · وتحتها ${under.join(" و")}` : ` · under it: ${under.join(", ")}`}</span>}
                </span>
              ) : (
                <span className="muted">{ar ? "—" : "—"}</span>
              )}
            </span>
          </div>
        </div>

        {/* the reproducible arithmetic */}
        <WhyRank location={loc} />

        {/* what gathers directly beneath (for كلّيّة / جامعة) */}
        {kids.length > 0 && (
          <div className="card aya-kids">
            <div className="aya-kids-h">{ar ? `يندرجُ تحتها مباشرةً (${num(kids.length)})` : `directly beneath (${kids.length})`}</div>
            <div className="aya-kids-list">
              {kids.slice(0, 20).map((k) => (
                <Link key={k} to={`/aya/${k.split(":")[0]}/${k.split(":")[1]}`} className="aya-kid">
                  <span className="kl-verse-ref">{arName(k)}</span>
                  <span className={`kl-badge ${tierCls(classOf(k)?.tier)}`}>{classOf(k)?.tier}</span>
                  <span className="quran aya-kid-text">{texts.get(k)?.textClean ?? k}</span>
                </Link>
              ))}
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
