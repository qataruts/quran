/**
 * المواضيع — the Qur'an's TRADITIONAL thematic index (متوارث, not computed). The
 * retained hand-organized tree: 12 أبواب → topics → verses. It sits in its own
 * section beside the computed المحاور (/mawdui), clearly labelled as curated, and
 * never mixed into the computed graph. Two levels:
 *   /mawadi        → the 12 أبواب
 *   /mawadi/:sec   → one باب → its topics (accordion) → verses (tap → reader)
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { tradSection, tradSections, useVerseIndex } from "../mawdui";
import { classOf, themeName, themeHeadOf, useKulliyat } from "../kulliyat";
import TierBadge from "../components/TierBadge";
import TopicLayerToggle from "../components/TopicLayerToggle";
import type { AyahDoc } from "../types";
import { ayahsCount, getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/* ---------- level 0: the 12 أبواب ---------- */
function Sections() {
  const ar = getUILang() === "ar";
  const sections = useMemo(() => tradSections(), []);
  const totalVerses = useMemo(() => sections.reduce((n, s) => n + s.verses, 0), [sections]);
  return (
    <>
      <header className="mw-head">
        <h1 className="mw-title">{ar ? "مواضيع القرآن" : "Topics of the Qur'an"}</h1>
        <p className="mw-lead">
          {ar
            ? "تصنيفٌ موضوعيٌّ متوارَث: اثنا عشرَ بابًا كبيرًا تنتظمُ تحتها موضوعاتُ القرآن كما رتّبها أهلُ العلم — طريقةُ التصفّح المألوفة. وهو تصنيفٌ منقولٌ لا محسوب؛ للطبقة المحسوبة انظُر «المحاور»."
            : "A traditional thematic index: twelve chapters under which the Qur'an's themes are arranged as scholars organized them — the familiar way to browse. This layer is curated, not computed; for the computed layer see «Axes»."}
        </p>
        <div className="muted" style={{ fontSize: 13 }}>{num(sections.length)} {ar ? "بابًا" : "chapters"} · {ayahsCount(totalVerses)}</div>
        <div className="mw-onenote trad-note" title={ar ? "تصنيفٌ منقولٌ عن أهل العلم، يُعرَض كما هو" : "a curated classification, shown as-is"}>
          ◆ {ar ? "تصنيفٌ متوارَثٌ منقول — يُعرَض كما هو، لا يُحسَب." : "A traditional, curated classification — shown as-is, not computed."}
        </div>
      </header>
      <TopicLayerToggle />
      <div className="mw-topics">
        {sections.map((s) => (
          <Link key={s.idx} to={`/mawadi/${s.idx}`} className="mw-topic-card">
            <span className="mw-topic-name">{s.title}</span>
            <span className="mw-topic-count">{num(s.topics)} {ar ? "موضوعًا" : "topics"} · {ayahsCount(s.verses)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

/* ---------- level 1: one باب → topics (accordion) → verses ---------- */
function SectionView({ sec, texts }: { sec: number; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const data = useMemo(() => tradSection(sec), [sec]);
  const kReady = useKulliyat();
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  // BRIDGE: which computed محاور do this باب's verses fall into? (top overlaps)
  const bridge = useMemo(() => {
    if (!kReady || !data) return [];
    const tally = new Map<number, number>();
    for (const tp of data.topics)
      for (const loc of tp.verses) {
        const th = classOf(loc)?.theme;
        if (th != null) tally.set(th, (tally.get(th) ?? 0) + 1);
      }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([theme, count]) => ({ theme, count, name: themeName(theme) || (themeHeadOf(theme) ? arName(themeHeadOf(theme)!) : "") }));
  }, [kReady, data]);
  if (!data) return <p className="muted">{t("notFound")}</p>;
  const totalVerses = data.topics.reduce((n, tp) => n + tp.verses.length, 0);
  const toggle = (id: number) =>
    setOpen((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <>
      <nav className="mw-crumb" aria-label="مسار">
        <Link to="/mawadi" title={ar ? "كل الأبواب" : "all chapters"}>{ar ? "المواضيع" : "Topics"}</Link>
        <span className="mw-sep">›</span>
        <span className="mw-here">{data.title}</span>
      </nav>
      <header className="mw-head">
        <h1 className="mw-title">{data.title}</h1>
        <div className="muted" style={{ fontSize: 13 }}>{num(data.topics.length)} {ar ? "موضوعًا" : "topics"} · {ayahsCount(totalVerses)} · {ar ? "تصنيفٌ متوارَث" : "traditional"}</div>
      </header>
      {bridge.length > 0 && (
        <div className="tf-bridge" title={ar ? "الطبقةُ المحسوبة التي تُقاطع هذا الباب المتوارَث" : "the computed layer overlapping this traditional chapter"}>
          <span className="tf-bridge-h"><span className="ai-spark" aria-hidden /> {ar ? "محاورُ محسوبةٌ تُقاطع هذا الباب:" : "computed axes overlapping this chapter:"}</span>
          {bridge.map((b) => (
            <Link key={b.theme} to={`/mawdui/${b.theme}`} className="tf-bridge-chip">
              {b.name} <span className="tf-bridge-n">{num(b.count)}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="trad-topics">
        {data.topics.map((tp) => {
          const isOpen = open.has(tp.id);
          return (
            <div key={tp.id} className="trad-topic">
              <button className="trad-topic-h" onClick={() => toggle(tp.id)} aria-expanded={isOpen}>
                <span className="trad-topic-name">{tp.title}</span>
                <span className="trad-topic-count">{ayahsCount(tp.verses.length)} <span aria-hidden>{isOpen ? "▾" : "▸"}</span></span>
              </button>
              {isOpen && (
                <div className="trad-topic-body">
                  <div className="mw-verses">
                    {tp.verses.map((loc) => (
                      <Link key={loc} to={readPathOf(loc)} className="mw-verse" title={ar ? "افتح في المصحف" : "open in the reader"}>
                        <span className="mw-verse-ref">{arName(loc)}</span>
                        <TierBadge loc={loc} style={{ flex: "none" }} />
                        <span className="mw-verse-text quran">{texts.get(loc)?.textUthmani ?? loc}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

const MAWADI_LAST = "quran-studio:mawadi-last";

export default function Mawadi() {
  useUILang();
  const ready = useVerseIndex();
  const params = useParams<{ sec?: string }>();
  const sec = params.sec != null ? Number(params.sec) : null;
  const ar = getUILang() === "ar";
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);
  useEffect(() => {
    localStorage.setItem(MAWADI_LAST, `/mawadi${sec != null ? `/${sec}` : ""}`);
  }, [sec]);

  if (!ready) {
    return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;
  }
  return (
    <div className="page">
      <div className="mw-wrap">
        {sec != null && (
          <Link to="/mawadi" className="mw-back" title={ar ? "كل الأبواب" : "all chapters"}>
            <span aria-hidden="true">{ar ? "→" : "←"}</span> {ar ? "رجوع" : "Back"}
          </Link>
        )}
        {sec == null ? <Sections /> : <SectionView sec={sec} texts={texts} />}
      </div>
    </div>
  );
}
