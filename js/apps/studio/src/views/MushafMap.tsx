/**
 * خريطةُ المصحف — every one of the 6236 āyāt as a small cell, in mushaf order,
 * grouped by sūra, coloured by its computed مرتبة (كلّيّة / جامعة / تفصيل). One
 * glance shows WHERE the foundational verses fall across the whole Qur'an — the
 * skeleton of the الكلّيّات mechanism. Tap a cell for the verse. Route: /shabaka.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import { allVerseLocs, classOf, kulliyatMeta, themeName, tierCounts, useKulliyat } from "../kulliyat";

const mushafKey = (loc: string) => { const [s, a] = loc.split(":").map(Number); return s * 1000 + a; };
const tierCls = (loc: string) => { const t = classOf(loc)?.tier; return t === "كلّية" ? "k" : t === "جامعة" ? "j" : "t"; };
const TIER = ["تفصيل", "جامعة", "كلّيّة"];

export default function MushafMap() {
  useUILang();
  const ar = getUILang() === "ar";
  const ready = useKulliyat();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);

  // group every classified verse by sūra, in mushaf order
  const suras = useMemo(() => {
    if (!ready) return [];
    const bySura = new Map<number, string[]>();
    for (const loc of allVerseLocs().slice().sort((a, b) => mushafKey(a) - mushafKey(b))) {
      const s = Number(loc.split(":")[0]);
      (bySura.get(s) ?? bySura.set(s, []).get(s)!).push(loc);
    }
    return [...bySura.entries()].sort((a, b) => a[0] - b[0]);
  }, [ready]);

  const counts = ready ? tierCounts() : { kulliya: 0, jamia: 0, tafsil: 0 };
  const meta = ready ? kulliyatMeta() : null;
  const selCls = sel ? classOf(sel) : null;

  if (!ready) return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "خريطةُ المصحف" : "The mushaf map"}</h1>
          <p className="jw-lead">
            {ar
              ? "كلُّ آيةٍ في القرآن خليّةٌ ملوّنةٌ بمرتبتها من ترتيبِ الجيل الأوّل الاستكشافيّ، بترتيب المصحف — فترى في نظرةٍ واحدةٍ كيف تتوزّعُ المراتبُ عبر السور. انقُرْ خليّةً لترى آيتَها، وفي بطاقتِها الدليلُ المحسوبُ الأحدث."
              : "Every verse as a cell coloured by its tier from the first-generation exploratory ordering, in mushaf order — see at a glance how the tiers fall across the sūras. Tap a cell for its verse; its card carries the newer computed evidence."}
          </p>
          <div className="mm-legend">
            <span><i className="mm-lg k" /> {ar ? "كلّيّة" : "kulliyya"} <b>{num(counts.kulliya)}</b></span>
            <span><i className="mm-lg j" /> {ar ? "جامعة" : "jāmiʿa"} <b>{num(counts.jamia)}</b></span>
            <span><i className="mm-lg t" /> {ar ? "تفصيل" : "tafṣīl"} <b>{num(counts.tafsil)}</b></span>
            <span className="muted">{num(meta?.verses ?? 6236)} {ar ? "آية" : "verses"}</span>
          </div>
        </header>

        <div className="mm-grid" onClick={(e) => { const l = (e.target as HTMLElement).dataset.loc; if (l) setSel(l); }}>
          {suras.map(([s, locs]) => (
            <div className="mm-sura" key={s}>
              <div className="mm-sura-h">{surahNameAr(s)} <span className="muted">{num(locs.length)}</span></div>
              <div className="mm-cells">
                {locs.map((loc) => (
                  <span key={loc} data-loc={loc} className={`mm-cell ${tierCls(loc)}${loc === sel ? " on" : ""}`} title={`${surahNameAr(s)} ${loc.split(":")[1]} — ${TIER[classOf(loc)?.tier === "كلّية" ? 2 : classOf(loc)?.tier === "جامعة" ? 1 : 0]}`} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {sel && selCls && (
          <div className="mm-modal" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }} role="dialog" aria-modal="true">
          <div className="mm-panel card">
            <button className="gx-close" onClick={() => setSel(null)} aria-label="close">✕</button>
            <div className="gx-panel-h">
              <Link to={`/read/${sel.split(":")[0]}/${sel.split(":")[1]}`} className="gx-root" style={{ textDecoration: "none" }}>{surahNameAr(Number(sel.split(":")[0]))} {num(sel.split(":")[1])}</Link>
              <span className={`kl-badge ${tierCls(sel)}`}>{selCls.tier}</span>
              <span className="chip">{num(Math.round(selCls.jamiya * 100))}٪</span>
            </div>
            {texts.get(sel) && <p className="gx-mean quran" dir="rtl">{texts.get(sel)!.textClean}</p>}
            {themeName(selCls.theme) && <div className="muted gx-nb-h">◇ {themeName(selCls.theme)}</div>}
            <div className="gx-links">
              <Link to={`/aya/${sel.split(":")[0]}/${sel.split(":")[1]}`} className="chip link">{ar ? "بطاقةُ الآية ←" : "verse card ←"}</Link>
              <Link to={`/read/${sel.split(":")[0]}/${sel.split(":")[1]}`} className="chip link">{ar ? "اقرأ الآية ←" : "read ←"}</Link>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
