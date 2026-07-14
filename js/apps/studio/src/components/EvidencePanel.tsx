/**
 * EvidencePanel — لوحةُ الدليل بالشارتين (قرار ب، 2026-07-14): تعرض لآيةٍ ما
 * ثبت لها فعلًا: «صيغةُ قاعدة» (بواباتُها الصرفية بأسمائها) و«ثبت تفرُّعُه»
 * (صِلاتُها الثابتة بعلاقاتها الأربع + مثانيها) — الادّعاءُ على قدر الدليل،
 * ولا رتبةَ فوقَه.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { surahNameAr } from "../db";
import { getUILang, num, useUILang } from "../i18n";
import { readPathOf } from "../types";
import { type EvUnit, REL_ORDER, evidenceOf, gateLabel, loadEvidence } from "../v2evidence";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
const REL_HINT: Record<string, string> = {
  "بيان": "تفصّل شروطَ القاعدة وتطبيقَها",
  "مثال": "وقائعُ محكومةٌ بالقاعدة",
  "جزاء": "ما وعدت به القاعدةُ أو توعّدت",
  "توكيد": "تقريرُ القاعدةِ بصياغةٍ أخرى",
};

export default function EvidencePanel({ location }: { location: string }) {
  useUILang();
  const ar = getUILang() === "ar";
  const [units, setUnits] = useState<EvUnit[] | null>(null);
  useEffect(() => {
    let live = true;
    loadEvidence().then(() => live && setUnits(evidenceOf(location)));
    return () => { live = false; };
  }, [location]);
  if (!units || units.length === 0) return null;
  // أفضل وحدة للعرض الموجز: الأغنى دليلًا
  const best = [...units].sort((a, b) => (b.ne + (b.tw ?? 0)) - (a.ne + (a.tw ?? 0)))[0];
  const gates = [...new Set(units.flatMap((u) => u.g))];
  const links: Record<string, string[]> = {};
  for (const u of units)
    for (const [rel, locs] of Object.entries(u.links ?? {}))
      links[rel] = [...new Set([...(links[rel] ?? []), ...locs])];
  const nLinks = Object.values(links).reduce((n, a) => n + a.length, 0);
  const nTw = Math.max(...units.map((u) => u.tw ?? 0));

  return (
    <div className="card ev-panel">
      <div className="ev-h">{ar ? "الدليل المحسوب" : "Computed evidence"}</div>
      <div className="ev-badges">
        <span className="ev-badge ev-rule" title={ar ? "اجتازت بواباتِ العموم الصرفية — صياغةُ قاعدةٍ عامة" : "passed the deterministic generality gates"}>
          ◆ {ar ? "صيغةُ قاعدة" : "Rule form"}
        </span>
        {nLinks > 0 && (
          <span className="ev-badge ev-net" title={ar ? "له صِلاتُ معنًى ثبتت بعد فحصٍ مستقلٍّ لوصفها" : "meaning-relations established by independent examination"}>
            ⤷ {ar ? "ثبت تفرُّعُه" : "Proven elaboration"} <b>{num(nLinks)}</b>
          </span>
        )}
        {nTw > 0 && (
          <span className="ev-badge ev-tw" title={ar ? "مواضعُ تعيد صياغتَه — المثاني، محسوبةً بتطابق تسلسل الكلم" : "restated elsewhere (mathānī)"}>
            ↺ {ar ? "مثانٍ" : "Twins"} <b>{num(nTw)}</b>
          </span>
        )}
      </div>
      <div className="ev-gates">
        {gates.map((g) => (
          <span key={g} className="chip" title={ar ? "بوابةٌ صرفيةٌ اجتازتها الآية" : "gate passed"}>{gateLabel(g)}</span>
        ))}
      </div>
      {nLinks > 0 && (
        <div className="ev-rels">
          {REL_ORDER.filter((rel) => links[rel]?.length).map((rel) => (
            <div key={rel} className="ev-rel">
              <span className="ev-rel-h" title={REL_HINT[rel]}>{rel} <span className="muted">{num(links[rel].length)}</span></span>
              <span className="ev-rel-locs">
                {links[rel].slice(0, 6).map((l) => (
                  <Link key={l} to={readPathOf(l)} className="chip link">{arName(l)}</Link>
                ))}
                {links[rel].length > 6 && <span className="muted">+{num(links[rel].length - 6)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="ev-foot muted">
        {ar
          ? "شارتان لا رتبة: العلاماتُ من صرف القرآن حسابًا محضًا، والصِّلاتُ فُحص وصفُها فحصًا مستقلًّا (المنهجية في «عن المشروع»)."
          : "Two evidence badges, no rank: markers are pure morphology; relations passed independent examination of our description."}
      </div>
    </div>
  );
}
