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
  principleOf,
  tafsilOf,
  useJawami,
  type Rel,
} from "../jawami";
import { ayahByLocationMap, surahNameAr } from "../db";
import type { AyahDoc } from "../types";
import { getUILang, num } from "../i18n";
import { useSettings } from "../settings";

const REL_ORDER: Rel[] = ["بيان", "مثال", "جزاء", "توكيد"];
const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

function Verse({ loc, texts, rel }: { loc: string; texts: Map<string, AyahDoc>; rel?: Rel }) {
  return (
    <Link to={`/read/${loc.split(":")[0]}/${loc.split(":")[1]}`} className="jw-verse">
      {rel && <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />}
      <span className="jw-verse-ref">{arName(loc)}</span>
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
      </div>
      {p?.kind && (
        <div className="muted" style={{ marginBottom: 6 }}>
          {p.kind}
          {p.grade ? ` · ${p.grade}` : ""}
          {fwd.length ? ` · ${num(fwd.length)} ${ar ? "تفصيل" : "tafsil"}` : ""}
        </div>
      )}
      <div className="jw-panel" style={{ background: "transparent", border: "none", padding: 0 }}>
        {byRel.map(({ rel, items }) => (
          <div key={rel} className="jw-relgroup">
            <div className="jw-relhead" style={{ color: REL_INFO[rel].color }}>
              <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />
              {rel} <span className="muted">· {num(items.length)}</span>
            </div>
            {items.map((l) => (
              <Verse key={l.loc} loc={l.loc} texts={texts} />
            ))}
          </div>
        ))}
        {back.length > 0 && (
          <div className="jw-relgroup jw-back">
            <div className="jw-relhead muted">{ar ? "تُفصِّل:" : "it elaborates:"}</div>
            {back.map((l) => (
              <Verse key={l.loc} loc={l.loc} texts={texts} rel={l.rel} />
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <Link to="/jawami" className="chip link">
          {ar ? "الجوامع ←" : "all principles →"}
        </Link>
      </div>
    </div>
  );
}
