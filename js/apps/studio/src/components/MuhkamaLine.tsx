/**
 * The verse's computed place in the الكلّيّات classification, as ONE small chip
 * that sits inline with the reader's other tools: «◆ كلّيّة» (gold) or a tier
 * chip «جامعة ↑ الفرقان ٥٩» linking to the كلّيّة it belongs under. From
 * kulliyat.json (see docs/kulliyat-algorithm-design.md).
 */
import { Link } from "react-router-dom";
import { surahNameAr } from "../db";
import { getUILang, num } from "../i18n";
import { classOf, kulliyaOf, useKulliyat } from "../kulliyat";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

export default function MuhkamaLine({ location }: { location: string }) {
  const ready = useKulliyat();
  const ar = getUILang() === "ar";
  if (!ready) return null;
  const cls = classOf(location);
  if (!cls) return null;

  if (cls.tier === "كلّية") {
    return (
      <Link to="/kulliyat" className="chip mk-chip k" title={ar ? "من كلّيّات القرآن المحسوبة — من أعلى الآيات جامعيّةً" : "a computed kulliyya"}>
        ◆ {ar ? "كلّيّة" : "kulliyya"}
      </Link>
    );
  }
  const k = kulliyaOf(location);
  const to = k ? `/read/${k.split(":")[0]}/${k.split(":")[1]}` : "/kulliyat";
  return (
    <Link to={to} className={`chip mk-chip ${cls.tier === "جامعة" ? "j" : "t"}`} title={ar ? "المرتبةُ المحسوبة، والكلّيّةُ التي تندرجُ تحتها" : "computed tier + the kulliyya it belongs under"}>
      {cls.tier}{k && <span className="mk-up"> ↑ {arName(k)}</span>}
    </Link>
  );
}
