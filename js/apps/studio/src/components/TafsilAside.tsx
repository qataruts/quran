/**
 * TafsilAside — always-open محكم→تفصيل panel for the currently selected ayah,
 * shown in the Reader's side column (works in every mode, incl. the QCF mushaf
 * page: tap an ayah → see its تفصيل). Renders nothing when the ayah is outside
 * the network or the layer is off.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  REL_INFO,
  elaborates,
  indegreeOf,
  isRootPrinciple,
  principleOf,
  tafsilOf,
  useJawami,
  type Rel,
} from "../jawami";
import { ayahByLocationMap, surahNameAr } from "../db";
import type { AyahDoc } from "../types";
import { getUILang, num } from "../i18n";
import { useSettings } from "../settings";
import MuhkamaLine from "./MuhkamaLine";

const REL_ORDER: Rel[] = ["بيان", "مثال", "جزاء", "توكيد"];
const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

function Verse({ loc, texts, rel, showRole }: { loc: string; texts: Map<string, AyahDoc>; rel?: Rel; showRole?: boolean }) {
  const ar = getUILang() === "ar";
  const isRoot = showRole && isRootPrinciple(loc);
  return (
    <Link to={`/read/${loc.split(":")[0]}/${loc.split(":")[1]}`} className="jw-verse">
      {rel && <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />}
      <span className="jw-verse-ref">{arName(loc)}</span>
      {showRole && (isRoot
        ? <span className="jw-roottag" title={ar ? "أصلٌ محكمة — لا أصلَ فوقه" : "muḥkam root — nothing above it"}>★ {ar ? "محكمة" : "root"}</span>
        : <span className="jw-uptag" title={ar ? "فوقها أصلٌ آخر — انقُرْها لتصعد" : "has an أصل above — tap to go up"}>↑ {ar ? "متفرّع" : "branch"}</span>)}
      <span className="jw-verse-text quran">{texts.get(loc)?.textClean ?? loc}</span>
    </Link>
  );
}

export default function TafsilAside({ location }: { location: string | null }) {
  const { layers } = useSettings();
  const jw = useJawami();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());

  useEffect(() => {
    if (location && texts.size === 0) ayahByLocationMap().then(setTexts);
  }, [location, texts.size]);

  if (!location || !layers.jawami || !jw) return null;
  const p = principleOf(location);
  const fwd = tafsilOf(location);
  const back = elaborates(location);
  if (!p && back.length === 0) return null;

  const ar = getUILang() === "ar";
  const byRel = REL_ORDER.map((rel) => ({ rel, items: fwd.filter((l) => l.rel === rel) })).filter(
    (g) => g.items.length,
  );

  return (
    <div className="tafsil-aside">
      <div className="tafsil-aside-head">
        <span className="jw-ref">{arName(location)}</span>
        {p ? (
          <span className="chip gold">◆ {ar ? "جامعة" : "principle"}</span>
        ) : (
          <span className="chip">↗ {ar ? "تفصيل" : "elaboration"}</span>
        )}
        {indegreeOf(location) >= 3 && (
          <span className="chip" title={ar ? "تلتقي عندها عدة جوامع" : "several principles converge here"}>
            ◈ {ar ? "نقطة التقاء" : "convergence"} {num(indegreeOf(location))}
          </span>
        )}
      </div>
      {p?.kind && (
        <div className="muted" style={{ marginBottom: 6 }}>
          {p.kind}
          {p.grade ? ` · ${p.grade}` : ""}
          {fwd.length ? ` · ${num(fwd.length)} ${ar ? "تفصيل" : "tafsil"}` : ""}
        </div>
      )}
      <MuhkamaLine location={location} />
      <div className="jw-panel" style={{ background: "transparent", border: "none", padding: 0 }}>
        {/* أصلها first — the جامعة(s) this verse is a تفصيل of (what it «تُفصِّل») */}
        {back.length > 0 && (
          <div className="jw-relgroup jw-asl">
            <div className="jw-relhead jw-aslhead">
              ↑ {ar ? (back.length > 1 ? "أصولُها الجامعة (تُفصِّلها هذه الآية)" : "أصلُها الجامع (تُفصِّلها هذه الآية)") : "its أصل (it elaborates)"}
            </div>
            {back.map((l) => (
              <Verse key={l.loc} loc={l.loc} texts={texts} rel={l.rel} showRole />
            ))}
          </div>
        )}
        {byRel.map(({ rel, items }) => (
          <div key={rel} className="jw-relgroup">
            <div className="jw-relhead" style={{ color: REL_INFO[rel].color }}>
              <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />
              {rel} <span className="muted">{num(items.length)}</span>
            </div>
            {items.map((l) => (
              <Verse key={l.loc} loc={l.loc} texts={texts} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <Link to="/jawami" className="chip link">
          {ar ? "الجوامع ←" : "all principles →"}
        </Link>
      </div>
    </div>
  );
}
