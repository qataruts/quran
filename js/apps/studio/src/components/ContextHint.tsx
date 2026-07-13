/**
 * طبقةُ السياق — the computed answer to "does this āyah need its context?" The
 * الاستقلال النحويّ factor (from the الكلّيّات ميزان) measures how much a verse
 * leans on what surrounds it: dense in pronouns / demonstratives / conditionals /
 * reported speech → context-bound; a self-standing proposition → complete alone.
 * We surface it as a gentle reading hint. (see docs/mechanism-roadmap.md)
 */
import { classOf, useKulliyat } from "../kulliyat";
import { getUILang } from "../i18n";

export default function ContextHint({ location }: { location: string | null }) {
  const ready = useKulliyat();
  const ar = getUILang() === "ar";
  if (!location || !ready) return null;
  const c = classOf(location);
  if (!c) return null;
  // The ميزان's «الاستقلال» excludes pronouns (so توحيد verses aren't penalised),
  // so it detects narrative / named / conditional context-dependence reliably but
  // not pure-pronoun boundness. We therefore make ONLY the confident claim — flag
  // the clearly context-bound verses — and stay silent otherwise (no false «self-
  // standing» on a pronoun-bound verse).
  if (c.sig.selfstand > 0.3) return null;
  return (
    <span className="chip ctx-chip" title={ar ? "محسوبٌ من صرف الآية: تكثُر فيها القرائنُ المتّكئةُ على السياق (سردٌ/أعلامٌ/شرط) — يتمُّ معناها فيما حولَها" : "computed — leans on the surrounding verses to complete its meaning"}>
      ⇄ {ar ? "تُقرأ في سياقها" : "in context"}
    </span>
  );
}
