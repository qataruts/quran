/**
 * «قد يُكمله» — the open layer. During the refutational review (Pass C), besides
 * refuting weak links the review also SUGGESTED missing tafsil: verses that
 * might complete a جامعة but were never confirmed. We surface those 866
 * suggestions honestly, unverified — the reader judges. From jawami.json.
 */
import { useEffect, useMemo, useState } from "react";
import { useJawami, type Principle } from "../jawami";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import PageSearch from "../components/PageSearch";
import MushafLink from "../components/MushafLink";
import { fuzzyMatch } from "../lib/fuzzy";

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
      <div className="jw-cardhead-row">
        <button className="jw-cardhead" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="jw-ref">{arName(hub)}</span>
          {p?.kind && <span className="chip">{p.kind}</span>}
          <span className="spacer" />
          <span className="jw-deg">{num(cands.length)} {ar ? "اقتراح" : "suggested"}</span>
          <span className="jw-caret">{open ? "▾" : "◂"}</span>
        </button>
        <MushafLink loc={hub} compact />
      </div>
      <div
        className="jw-cardtext quran"
        onClick={() => setOpen(!open)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(!open))}
        style={{ cursor: "pointer" }}
      >
        {d?.textUthmani ?? hub}
        <span className="ayah-marker"> ﴿{num(hub.split(":")[1])}﴾</span>
      </div>
      {open && (
        <div className="jw-panel">
          <div className="muted" style={{ marginBottom: 6, fontSize: 13 }}>
            {ar ? "اقتراحاتٌ لم تُؤكَّد — قد تُكمِّل هذه الجامعة:" : "unconfirmed suggestions — may complete this principle:"}
          </div>
          {cands.map((loc) => (
            <div key={loc} className="jw-verse">
              <span className="jw-verse-ref">{arName(loc)}</span>
              <span className="jw-verse-text quran">{texts.get(loc)?.textClean ?? loc}</span>
              <MushafLink loc={loc} compact />
            </div>
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
  const [q, setQ] = useState("");
  const ar = getUILang() === "ar";

  useEffect(() => {
    ayahByLocationMap().then(setTexts);
  }, []);
  useEffect(() => setLimit(50), [q]);

  const rows = useMemo(() => {
    if (!jw) return [] as [string, string[]][];
    return (Object.entries(jw.gaps) as [string, string[]][])
      .filter(([hub, cands]) => fuzzyMatch(q, arName(hub), texts.get(hub)?.textClean, ...cands.map(arName)))
      .sort((a, b) => b[1].length - a[1].length);
  }, [jw, q, texts]);
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
              ? "في أثناء المراجعة التفنيديّة للجوامع، وبعد نقض الروابط الضعيفة، رُصد تفصيلٌ محتملٌ لم يُؤكَّد: آياتٌ قد تُكمِّل جامعةً دون أن يثبت ذلك. نعرضها بصراحةٍ كطبقةٍ مفتوحة."
              : "During the refutational review, after refuting weak links, potential-but-unconfirmed tafsil was flagged — verses that might complete a principle without that being established. Shown openly, unverified."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(rows.length)}</b> {ar ? "جامعة" : "principles"}</span>
            <span className="chip"><b>{num(total)}</b> {ar ? "اقتراحًا مفتوحًا" : "open suggestions"}</span>
          </div>
        </header>

        <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث بموضع الجامعة أو الآية…" : "search by ref…"} />

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
