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

  // every tier opens the verse's own clear classification page — not the general list
  const to = `/aya/${location.split(":")[0]}/${location.split(":")[1]}`;

  if (cls.tier === "كلّية") {
    return (
      <Link to={to} className="chip mk-chip k" title={ar ? "بطاقةُ هذه الآية في الميزان — من أعلى الآيات جامعيّةً" : "this verse's card in the balance"}>
        ◆ {ar ? "كلّيّة" : "kulliyya"}
      </Link>
    );
  }
  const k = kulliyaOf(location);
  return (
    <Link to={to} className={`chip mk-chip ${cls.tier === "جامعة" ? "j" : "t"}`} title={ar ? "بطاقةُ هذه الآية في الميزان: مرتبتُها ومحورُها وموضعُها في الشجرة" : "this verse's card: its tier, محور and place in the tree"}>
      {cls.tier}{k && <span className="mk-up"> ↑ {arName(k)}</span>}
    </Link>
  );
}
