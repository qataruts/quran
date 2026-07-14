/**
 * أمثال القرآن — the Qur'an's own parables and similitudes, gathered straight
 * from the text (roots ض-ر-ب + م-ث-ل for «ضرب مثلاً», and the marker «كمثل») —
 * not from any tafsīr. Data: public/amthal.json (see scripts/export-amthal.mjs).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import type { AyahDoc } from "../types";
import PageSearch from "../components/PageSearch";
import { highlightVerse } from "../highlight";
import { fuzzyMatch } from "../lib/fuzzy";
import { bookTextAt } from "../books";

interface AmthalData {
  meta: { parables: number; similes: number; total: number };
  parables: string[];
  similes: string[];
}

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/** بطاقةُ مثلٍ: الآية + «المضرِب» عند الطلب — شرحُ الميسّر بالمرجع، كسولًا منسوبًا. */
function AmthalCard({ loc, q, texts }: { loc: string; q: string; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const [open, setOpen] = useState(false);
  const [tafsir, setTafsir] = useState<string | null | undefined>(undefined);
  const toggle = () => {
    setOpen((v) => !v);
    if (tafsir === undefined) bookTextAt("muyassar", loc).then((t2) => setTafsir(t2)).catch(() => setTafsir(null));
  };
  return (
    <div className="fr-card am-card" style={{ cursor: "pointer" }} onClick={toggle}>
      <span className="fr-ref am-ref">
        {arName(loc)}
        <Link to={readPathOf(loc)} className="chip" style={{ marginInlineStart: 8 }} onClick={(e) => e.stopPropagation()}>
          {ar ? "المصحف" : "read"}
        </Link>
      </span>
      <span className="quran am-text">{highlightVerse(texts.get(loc)?.textUthmani ?? loc, q)}</span>
      {open && (
        <span className="am-madrib" onClick={(e) => e.stopPropagation()}>
          <span className="am-madrib-src">◆ {ar ? "المضرِب — التفسير الميسّر" : "al-Muyassar"}</span>{" "}
          {tafsir === undefined ? "…" : tafsir ?? (ar ? "لا شرح لهذه الآية في المصدر." : "no entry")}
        </span>
      )}
    </div>
  );
}

export default function Amthal() {
  useUILang();
  const [data, setData] = useState<AmthalData | null>(null);
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "parables" | "similes">("all");
  const ar = getUILang() === "ar";

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}amthal.json?v=${__DATA_VERSION__}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
    ayahByLocationMap().then(setTexts);
  }, []);

  if (!data) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  const group = (title: string, note: string, all: string[]) => {
    const locs = all.filter((loc) => fuzzyMatch(q, arName(loc), texts.get(loc)?.textClean));
    if (locs.length === 0) return null;
    // تجميعٌ بالسور — بدل رصّةٍ واحدةٍ من مئات البطاقات
    const bySurah = new Map<number, string[]>();
    for (const loc of locs) {
      const s = Number(loc.split(":")[0]);
      let arr = bySurah.get(s);
      if (!arr) bySurah.set(s, (arr = []));
      arr.push(loc);
    }
    return (
      <section style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-quran)", color: "var(--accent)", fontSize: 22 }}>{title}</h2>
          <span className="muted">{num(locs.length)}</span>
        </div>
        <p className="muted" style={{ margin: "0 0 12px" }}>{note}</p>
        {[...bySurah.entries()].map(([s, sLocs]) => (
          <div key={s}>
            <div className="am-surah-h quran">{surahNameAr(s)} <span className="muted">{num(sLocs.length)}</span></div>
            <div className="fr-list">
              {sLocs.map((loc) => <AmthalCard key={loc} loc={loc} q={q} texts={texts} />)}
            </div>
          </div>
        ))}
      </section>
    );
  };

  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "أمثال القرآن" : "Parables of the Qur'an"}</h1>
          <p className="jw-lead">
            {ar
              ? "الأمثال التي ضربها الله في كتابه، والتشبيهات القرآنية التي تُقرِّب المعنى — مُلتقَطةً من نصّ القرآن وحده (الجذران «ضرب» و«مثل»، وأداة التشبيه «كمثل»)، لا من تفسير."
              : "The parables God strikes in His Book, and the Qur'anic similitudes — gathered from the text alone (the roots ḍ-r-b + m-th-l, and the marker «kamathal»), not from tafsīr."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(data.meta.total)}</b> {ar ? "موضعًا" : "verses"}</span>
            <span className="chip"><b>{num(data.meta.parables)}</b> {ar ? "مضروبة" : "struck"}</span>
            <span className="chip"><b>{num(data.meta.similes)}</b> {ar ? "تشبيهًا" : "similitudes"}</span>
          </div>
        </header>
        <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث في الأمثال…" : "search parables…"} />
        <div className="jw-filters">
          <div className="jw-chipset">
            <span className="jw-filter-lbl">{ar ? "النوع" : "kind"}</span>
            <button className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>
              {ar ? `الكل (${num(data.meta.total)})` : `all (${num(data.meta.total)})`}
            </button>
            <button className={kind === "parables" ? "on" : ""} onClick={() => setKind("parables")}>
              {ar ? `مضروبة (${num(data.meta.parables)})` : `struck (${num(data.meta.parables)})`}
            </button>
            <button className={kind === "similes" ? "on" : ""} onClick={() => setKind("similes")}>
              {ar ? `تشبيهات (${num(data.meta.similes)})` : `similitudes (${num(data.meta.similes)})`}
            </button>
          </div>
        </div>
        {kind !== "similes" && group(
          ar ? "أمثالٌ مضروبة" : "Struck parables",
          ar ? "﴿ضَرَبَ اللَّهُ مَثَلًا﴾ — تصويرُ معنًى غائبٍ بمشهدٍ محسوس." : "«God strikes a parable» — an abstract meaning cast as a vivid scene.",
          data.parables,
        )}
        {kind !== "parables" && group(
          ar ? "تشبيهاتٌ قرآنية" : "Similitudes",
          ar ? "﴿كَمَثَلِ …﴾ — تشبيهٌ يُقرِّب المعنى بنظيرٍ محسوس." : "«like the likeness of …» — a comparison that brings the meaning near.",
          data.similes,
        )}
        {(() => {
          const pool =
            kind === "parables" ? data.parables : kind === "similes" ? data.similes : [...data.parables, ...data.similes];
          const none = pool.every((loc) => !fuzzyMatch(q, arName(loc), texts.get(loc)?.textClean));
          return none ? (
            <div className="muted" style={{ padding: "24px 4px" }}>{ar ? "لا نتائج." : "No matches."}</div>
          ) : null;
        })()}
      </div>
    </div>
  );
}
