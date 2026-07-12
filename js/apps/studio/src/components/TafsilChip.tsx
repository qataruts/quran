/**
 * TafsilChip — surfaces the محكم→تفصيل layer inline in the Reader. If the ayah
 * is a جامعة (or elaborates one), it shows a chip; expanding reveals the verses
 * that clarify / exemplify / requite / restate it, each linked.
 *
 * The chip lives in the ayah's toolbar, but the expanded panel is rendered
 * *after* the verse text (see <TafsilPanel/>), so the reading order stays
 * natural: chip → the آية → its تفصيل. Rendering the panel between the toolbar
 * and the verse would push the verse itself far below its own elaboration.
 */
import { useEffect, useState } from "react";
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
import MushafLink from "./MushafLink";

const REL_ORDER: Rel[] = ["بيان", "مثال", "جزاء", "توكيد"];
const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/** does this ayah participate in the جوامع network at all? */
function useParticipation(location: string) {
  const { layers } = useSettings();
  const jw = useJawami();
  if (!layers.jawami || !jw) return null;
  const p = principleOf(location);
  const fwd = tafsilOf(location);
  const back = elaborates(location);
  if (!p && back.length === 0) return null; // outside the network
  return { p, fwd, back };
}

/** A تفصيل verse. If it *itself* elaborates further verses, it can be opened to
 *  reveal its own تفصيل — so the whole network unfolds level by level on tap
 *  (depth-capped against the network's cycles). */
function VerseLine({
  loc,
  texts,
  rel,
  depth = 0,
}: {
  loc: string;
  texts: Map<string, AyahDoc>;
  rel?: Rel;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ar = getUILang() === "ar";
  const sub = tafsilOf(loc);
  const canDrill = sub.length > 0 && depth < 3;
  return (
    <div className="jw-subwrap">
      <div className="jw-verse">
        {rel && <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />}
        <span className="jw-verse-ref">{arName(loc)}</span>
        <span
          className="jw-verse-text quran"
          onClick={canDrill ? () => setOpen((v) => !v) : undefined}
          style={{ cursor: canDrill ? "pointer" : "default" }}
        >
          {texts.get(loc)?.textClean ?? loc}
        </span>
        {canDrill && (
          <button
            className="chip gold jw-subtoggle"
            onClick={() => setOpen((v) => !v)}
            title={ar ? "افتح تفصيلَ هذه الآية" : "open its تفصيل"}
          >
            {num(sub.length)} {ar ? "تفصيل" : ""} {open ? "▾" : "◂"}
          </button>
        )}
        <MushafLink loc={loc} compact />
      </div>
      {open && canDrill && (
        <div className="jw-subtafsil">
          {sub.map((l) => (
            <VerseLine key={l.loc} loc={l.loc} texts={texts} rel={l.rel} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The toolbar chip. Controlled: the Reader owns which ayah's panel is open so
 *  the panel can render in a separate slot beneath the verse. */
export default function TafsilChip({
  location,
  open,
  onToggle,
}: {
  location: string;
  open: boolean;
  onToggle: () => void;
}) {
  const part = useParticipation(location);
  if (!part) return null;
  const { p, fwd, back } = part;
  const ar = getUILang() === "ar";
  return (
    <button
      className={`chip gold${open ? " on" : ""}`}
      onClick={onToggle}
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
  );
}

/** The expanded network for the ayah — rendered beneath the verse, not inline
 *  in the toolbar, so opening it never displaces the آية itself. */
export function TafsilPanel({ location, open }: { location: string; open: boolean }) {
  const part = useParticipation(location);
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());

  useEffect(() => {
    if (open && texts.size === 0) ayahByLocationMap().then(setTexts);
  }, [open, texts.size]);

  if (!open || !part) return null;
  const { p, fwd, back } = part;
  const ar = getUILang() === "ar";
  const byRel = REL_ORDER.map((rel) => ({ rel, items: fwd.filter((l) => l.rel === rel) })).filter(
    (g) => g.items.length,
  );

  return (
    <div className="jw-panel jw-panel-tafsil">
      {p?.kind && (
        <div className="muted" style={{ marginBottom: 6 }}>
          {p.kind}
          {p.grade ? ` · ${p.grade}` : ""}
        </div>
      )}
      {back.length > 0 && (
        <div className="jw-relgroup jw-asl">
          <div className="jw-relhead jw-aslhead">
            ↑ {ar ? (back.length > 1 ? "أصولُها الجامعة (تُفصِّلها هذه الآية)" : "أصلُها الجامع (تُفصِّلها هذه الآية)") : "its أصل (it elaborates)"}
          </div>
          {back.map((l) => (
            <VerseLine key={l.loc} loc={l.loc} texts={texts} rel={l.rel} />
          ))}
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
    </div>
  );
}
