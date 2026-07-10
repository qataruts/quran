/**
 * TafsilChip — surfaces the محكم→تفصيل layer inline in the Reader. If the ayah
 * is a جامعة (or elaborates one), it shows a chip; expanding reveals the verses
 * that clarify / exemplify / requite / restate it, each linked. Loads the
 * network lazily (jawami.json) and only renders for participating ayahs.
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

const REL_ORDER: Rel[] = ["بيان", "مثال", "جزاء", "توكيد"];
const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

function VerseLine({ loc, texts, rel }: { loc: string; texts: Map<string, AyahDoc>; rel?: Rel }) {
  return (
    <Link to={`/read/${loc.split(":")[0]}/${loc.split(":")[1]}`} className="jw-verse">
      {rel && <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />}
      <span className="jw-verse-ref">{arName(loc)}</span>
      <span className="jw-verse-text quran">{texts.get(loc)?.textClean ?? loc}</span>
    </Link>
  );
}

export default function TafsilChip({ location }: { location: string }) {
  const jw = useJawami();
  const [open, setOpen] = useState(false);
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());

  useEffect(() => {
    if (open && texts.size === 0) ayahByLocationMap().then(setTexts);
  }, [open, texts.size]);

  if (!jw) return null;
  const p = principleOf(location);
  const fwd = tafsilOf(location);
  const back = elaborates(location);
  if (!p && back.length === 0) return null; // this ayah is outside the network

  const ar = getUILang() === "ar";
  const byRel = REL_ORDER.map((rel) => ({ rel, items: fwd.filter((l) => l.rel === rel) })).filter(
    (g) => g.items.length,
  );

  return (
    <>
      <button
        className={`chip gold${open ? " on" : ""}`}
        onClick={() => setOpen(!open)}
        style={{ border: "none", cursor: "pointer" }}
        title={ar ? "المحكم والتفصيل" : "principle & elaboration"}
      >
        {p ? (
          <>
            ◆ {ar ? "جامعة" : "principle"}
            {fwd.length > 0 && <> · {num(fwd.length)} {ar ? "تفصيل" : "tafsil"}</>}
          </>
        ) : (
          <>↗ {num(back.length)} {ar ? "تُفصِّلها" : "elaborates"}</>
        )}
      </button>

      {open && (
        <div className="jw-panel" style={{ flexBasis: "100%", borderRadius: 10, marginTop: 6 }}>
          {p?.kind && (
            <div className="muted" style={{ marginBottom: 6 }}>
              {p.kind}
              {p.grade ? ` · ${p.grade}` : ""}
            </div>
          )}
          {byRel.map(({ rel, items }) => (
            <div key={rel} className="jw-relgroup">
              <div className="jw-relhead" style={{ color: REL_INFO[rel].color }}>
                <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />
                {rel} <span className="muted">· {REL_INFO[rel].note} · {num(items.length)}</span>
              </div>
              {items.map((l) => (
                <VerseLine key={l.loc} loc={l.loc} texts={texts} />
              ))}
            </div>
          ))}
          {back.length > 0 && (
            <div className="jw-relgroup jw-back">
              <div className="jw-relhead muted">{ar ? "تُفصِّل:" : "it elaborates:"}</div>
              {back.map((l) => (
                <VerseLine key={l.loc} loc={l.loc} texts={texts} rel={l.rel} />
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link to="/jawami" className="chip link">
              {ar ? "استكشف الجوامع ←" : "explore all principles →"}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
