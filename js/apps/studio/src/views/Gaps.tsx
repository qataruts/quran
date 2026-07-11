/**
 * «قد يُكمله» — the open layer. During the adversarial review (Pass C) the
 * swarm was asked not only to refute weak links but to SUGGEST missing tafsil:
 * verses that might complete a جامعة but were never confirmed. We surface those
 * 866 suggestions honestly, unverified — the reader judges. From jawami.json.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useJawami, type Principle } from "../jawami";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import type { AyahDoc } from "../types";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

function GapCard({
  hub,
  cands,
  p,
  texts,
}: {
  hub: string;
  cands: string[];
  p: Principle | undefined;
  texts: Map<string, AyahDoc>;
}) {
  const [open, setOpen] = useState(false);
  const d = texts.get(hub);
  const ar = getUILang() === "ar";
  return (
    <div className={`jw-card${open ? " open" : ""}`}>
      <button className="jw-cardhead" onClick={() => setOpen(!open)}>
        <span className="jw-ref">{arName(hub)}</span>
        {p?.kind && <span className="chip">{p.kind}</span>}
        {p?.grade && <span className="chip gold">{p.grade}</span>}
        <span className="spacer" />
        <span className="jw-deg">{num(cands.length)} {ar ? "اقتراح" : "suggested"}</span>
        <span className="jw-caret">{open ? "▾" : "◂"}</span>
      </button>
      <Link to={readPathOf(hub)} className="jw-cardtext quran">
        {d?.textUthmani ?? hub}
        <span className="ayah-marker"> ﴿{num(hub.split(":")[1])}﴾</span>
      </Link>
      {open && (
        <div className="jw-panel">
          <div className="muted" style={{ marginBottom: 6, fontSize: 13 }}>
            {ar ? "اقتراحاتٌ لم تُؤكَّد — قد تُكمِّل هذه الجامعة:" : "unconfirmed suggestions — may complete this principle:"}
          </div>
          {cands.map((loc) => (
            <Link key={loc} to={readPathOf(loc)} className="jw-verse">
              <span className="jw-verse-ref">{arName(loc)}</span>
              <span className="jw-verse-text quran">{texts.get(loc)?.textClean ?? loc}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Gaps() {
  useUILang();
  const jw = useJawami();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [limit, setLimit] = useState(50);
  const ar = getUILang() === "ar";

  useEffect(() => {
    ayahByLocationMap().then(setTexts);
  }, []);

  const rows = useMemo(
    () => (jw ? (Object.entries(jw.gaps) as [string, string[]][]).sort((a, b) => b[1].length - a[1].length) : []),
    [jw],
  );
  const total = useMemo(() => rows.reduce((s, [, c]) => s + c.length, 0), [rows]);

  if (!jw) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "قد يُكمله" : "Possibly completes it"}</h1>
          <p className="jw-lead">
            {ar
              ? "أثناء المراجعة العدائية للجوامع، طُلب من السرب — بعد نقض الروابط الضعيفة — أن يقترح تفصيلًا مفقودًا: آياتٍ قد تُكمِّل جامعةً لكنها لم تُؤكَّد. نعرضها بصراحةٍ كطبقةٍ مفتوحة، والقارئ يحكم."
              : "During the adversarial review, after refuting weak links the swarm was asked to suggest missing tafsil — verses that might complete a principle but were never confirmed. Shown openly, unverified; the reader judges."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(rows.length)}</b> {ar ? "جامعة" : "principles"}</span>
            <span className="chip"><b>{num(total)}</b> {ar ? "اقتراحًا مفتوحًا" : "open suggestions"}</span>
          </div>
        </header>

        <div className="jw-list">
          {rows.slice(0, limit).map(([hub, cands]) => (
            <GapCard key={hub} hub={hub} cands={cands} p={jw.principles[hub]} texts={texts} />
          ))}
        </div>
        {rows.length > limit && (
          <div style={{ textAlign: "center", margin: "18px 0" }}>
            <button onClick={() => setLimit(limit + 80)}>
              {ar ? `عرض المزيد (${num(rows.length - limit)})` : `show more (${rows.length - limit})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
