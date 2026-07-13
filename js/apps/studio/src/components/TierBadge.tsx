/**
 * The computed مرتبة chip (كلّيّة / جامعة / تفصيل) — a link to the verse's
 * بطاقة الآية (/aya/:s/:a). Navigates via onClick (not an <a>) so it can sit
 * inside a row that is itself a Link without nesting anchors.
 */
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { classOf } from "../kulliyat";
import { getUILang } from "../i18n";

const tierCls = (t?: string) => (t === "كلّية" ? "k" : t === "جامعة" ? "j" : "t");

export default function TierBadge({ loc, style }: { loc: string; style?: CSSProperties }) {
  const navigate = useNavigate();
  const cls = classOf(loc);
  if (!cls) return null;
  const ar = getUILang() === "ar";
  const go = () => navigate(`/aya/${loc.split(":")[0]}/${loc.split(":")[1]}`);
  return (
    <span
      className={`kl-badge tb-link ${tierCls(cls.tier)}`}
      role="link"
      tabIndex={0}
      title={ar ? "بطاقةُ الآية" : "the verse's card"}
      style={style}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
    >
      {cls.tier}
    </span>
  );
}
