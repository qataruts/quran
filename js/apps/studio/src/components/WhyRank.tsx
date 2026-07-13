/**
 * «لماذا هذه المرتبة؟» — the exact, reproducible arithmetic behind a verse's
 * جامعية: each of the six computed factors, its percentile value, its weight, and
 * its contribution (value × weight). The contributions sum to the score — so the
 * rank is shown, not asserted. «نحسب ونعرض». (see docs/kulliyat-algorithm-design.md)
 */
import { classOf, kulliyatWeights, type Signals } from "../kulliyat";
import { getUILang, num } from "../i18n";

const FACTORS: { key: keyof Signals; ar: string; en: string }[] = [
  { key: "tawhid", ar: "قُربُ التوحيد", en: "tawhid proximity" },
  { key: "selfstand", ar: "الاستقلالُ النحويّ", en: "self-standing" },
  { key: "gen", ar: "عمومُ المفردات", en: "lexical generality" },
  { key: "cent", ar: "المعنى المركزيّ", en: "central meaning" },
  { key: "norm", ar: "صِيَغُ التقرير والأمر", en: "assertive/imperative forms" },
  { key: "breadth", ar: "السَّعةُ المفهوميّة", en: "breadth" },
];

export default function WhyRank({ location }: { location: string }) {
  const cls = classOf(location);
  if (!cls) return null;
  const ar = getUILang() === "ar";
  const w = kulliyatWeights();
  const pc = (v: number) => Math.round(v * 100);

  return (
    <div className="why">
      <div className="why-head">
        <span>{ar ? "لماذا هذه المرتبة؟" : "Why this tier?"}</span>
        <span className="why-score">{num(pc(cls.jamiya))}<small>٪</small></span>
      </div>
      <p className="why-note">
        {ar
          ? "هذه أوصافٌ بنيويّةٌ لعمومِ الدلالة: أهي أصلٌ جامعٌ أم تفصيل."
          : "These describe the breadth of a verse's meaning: a gathering principle vs a detail."}
      </p>
      <div className="why-rows">
        {FACTORS.map(({ key, ar: la, en }) => {
          const val = cls.sig[key] ?? 0;
          const wt = w[key] ?? 0;
          return (
            <div className="why-row" key={key}>
              <span className="why-name">{ar ? la : en}</span>
              <span className="why-track"><span className="why-fill" style={{ inlineSize: `${pc(val)}%` }} /></span>
              <span className="why-val">{num(pc(val))}</span>
              <span className="why-wt">×{num(pc(wt))}٪</span>
              <span className="why-contrib">{num(Math.round(val * wt * 100))}</span>
            </div>
          );
        })}
      </div>
      <div className="why-foot">
        {ar
          ? "كلُّ عاملٍ مئويّةٌ على المصحف كلِّه؛ الإسهامُ = القيمة × الوزن، ومجموعُها هو المؤشّر. محسوبٌ من بيانات القرآن، يُعادُ في كلّ مرّة."
          : "Each factor is a whole-Qur'an percentile; contribution = value × weight, summing to the index. Computed, recomputable."}
      </div>
    </div>
  );
}
