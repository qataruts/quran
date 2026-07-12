/**
 * MuhkamaLine — «تندرجُ تحت» — shows, right under a verse, the root محكمات it
 * belongs to (nearest in meaning among the roots it's linked to). If the verse
 * is itself a root, it says so. Renders nothing outside the network.
 */
import { Link } from "react-router-dom";
import { surahNameAr } from "../db";
import { getUILang, num } from "../i18n";
import { isMuhkamaRoot, muhkamatOf, useMuhkama } from "../muhkama";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

export default function MuhkamaLine({ location }: { location: string }) {
  const ready = useMuhkama();
  const ar = getUILang() === "ar";
  if (!ready) return null;

  if (isMuhkamaRoot(location)) {
    return (
      <div className="mk-line mk-line-root" title={ar ? "آيةٌ محكمة — أصلٌ جامعٌ يجمع معاني القرآن وتحته تفصيلُه" : "a muḥkam root"}>
        ◆ {ar ? "هذه آيةٌ محكمة (أصلٌ جامع)" : "This is a muḥkam root"}
      </div>
    );
  }

  const mk = muhkamatOf(location);
  if (!mk.length) return null;
  return (
    <div className="mk-line" title={ar ? "أقربُ الآياتِ المحكمة (الأصول الجامعة) إلى معناها ممّا تتّصل به في الشبكة" : "the muḥkam roots nearest in meaning that this verse links to"}>
      <span className="mk-line-lbl">{ar ? "تندرجُ تحت:" : "belongs under:"}</span>
      {mk.map((m) => (
        <Link key={m.loc} to={`/read/${m.loc.split(":")[0]}/${m.loc.split(":")[1]}`} className="mk-line-chip quran">
          {arName(m.loc)}
        </Link>
      ))}
    </div>
  );
}
