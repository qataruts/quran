/**
 * المواضيع — the Quran's topic layer, computed. The whole muṣḥaf falls into 90
 * محاور (spherical k-means over the meaning-vectors); every āya belongs to exactly
 * one, so the layer covers the book with no gaps and no editorial hand. Two levels:
 *   /mawdui        → the 90 محاور (foundational first, searchable)
 *   /mawdui/:t     → one محور → its آيات ordered by جامعية (tap → reader)
 * One computed layer, not a picked index. No tafsīr.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { classOf, themeHeadOf, themeName, themesList, themeVerses, useKulliyat } from "../kulliyat";
import { loadSiyaq, type SiyaqUnit } from "../siyaq";
import { loadTabwib, unitsOfAxis } from "../tabwib";
import TierBadge from "../components/TierBadge";
import TopicLayerToggle from "../components/TopicLayerToggle";
import type { AyahDoc } from "../types";
import { ayahsCount, getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import PageSearch from "../components/PageSearch";
import { fuzzyMatch } from "../lib/fuzzy";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/* ---------- level 0: the 90 محاور ---------- */
function Themes() {
  const ar = getUILang() === "ar";
  const [q, setQ] = useState("");
  const themes = useMemo(() => themesList(), []);
  const shown = useMemo(
    () => (q.trim() === "" ? themes : themes.filter((th) => fuzzyMatch(q, th.name, th.head ?? ""))),
    [q, themes],
  );
  return (
    <>
      <header className="mw-head">
        <h1 className="mw-title">{ar ? "محاور القرآن" : "Axes of the Qur'an"}</h1>
        <p className="mw-lead">
          {ar
            ? "موضوعاتُ القرآن كما انبثقت من صلاته المفحوصة: مئتا محورٍ وستّةٌ انعقدت فيها قواعدُ المصحف بصلاتها الموحّدة (كلُّ صلةٍ فُحصت بمقطعَي سياقِها) — لا انتقاءَ بالرأي ولا قائمةَ موضوعاتٍ جاهزة. اخترْ محورًا لترى قواعدَه وآياتِها. نسخةٌ أولى قبل موجاتِ التعميق، تُحدَّثُ بعدها."
            : "The Qur'an's topics as they emerged from its examined links: 206 axes in which the muṣḥaf's rules cluster through the unified network — no editorial pick, no preset topic list. First edition before the deepening waves; it updates after."}
        </p>
        <div className="muted" style={{ fontSize: 13 }}>{num(themes.length)} {ar ? "محورًا منبثقًا" : "emergent axes"}</div>
        <div className="mw-onenote" title={ar ? "المحاور عناقيدُ شبكةِ القواعد الموحّدة — خوارزميةٌ معلنةٌ بثبات ٩٩٫٦٪؛ وتغطيةُ المصحف كلِّه بوحدات السياق المسمّاة في التبويب الموضوعي" : "axes are communities of the unified rule network — published algorithm, 99.6% stability; full-muṣḥaf coverage lives in the topical tabwīb over the named context units"}>
          ◆ {ar ? "منبثقةٌ من صلاتِ الكتابِ نفسِه — حسبنا وعرضنا، والقارئُ يتدبّر." : "Emergent from the Book's own links — computed and shown; the reader reflects."}
        </div>
      </header>
      <TopicLayerToggle />
      <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث في المحاور…" : "search محاور…"} />
      <div className="mw-topics">
        {shown.map((th) => (
          <Link key={th.theme} to={`/mawdui/${th.theme}`} className="mw-topic-card" title={ar ? `يمثّله: ${arName(th.head!)}` : arName(th.head!)}>
            <span className="mw-topic-name">{th.name || arName(th.head!)}</span>
            <span className="mw-topic-count">{arName(th.head!)} · {ayahsCount(th.size)}</span>
          </Link>
        ))}
        {shown.length === 0 && (
          <div className="muted" style={{ padding: "24px 4px", gridColumn: "1/-1" }}>{ar ? "لا نتائج." : "No matches."}</div>
        )}
      </div>
    </>
  );
}

/* ---------- level 1: one محور → its verses ---------- */
function ThemeView({ theme, texts }: { theme: number; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const name = themeName(theme);
  const head = themeHeadOf(theme);
  const verses = useMemo(() => themeVerses(theme), [theme]);
  const [units, setUnits] = useState<{ unit: SiyaqUnit; approx: boolean }[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([loadSiyaq(), loadTabwib()]).then(([sy]) => {
      if (!live || !sy) return;
      const all = unitsOfAxis(theme)
        .map(({ u, approx }) => ({ unit: (sy as { units: SiyaqUnit[] }).units[u], approx }))
        .filter((x) => x.unit);
      setUnits(all);
    });
    return () => { live = false; };
  }, [theme]);
  if (!head) return <p className="muted">{t("notFound")}</p>;
  return (
    <>
      <nav className="mw-crumb" aria-label="مسار">
        <Link to="/mawdui" title={ar ? "كل المحاور" : "all محاور"}>{ar ? "المحاور" : "Axes"}</Link>
        <span className="mw-sep">›</span>
        <span className="mw-here">{name || arName(head)}</span>
      </nav>
      <header className="mw-head">
        <h1 className="mw-title">{name || arName(head)}</h1>
        <p className="mw-lead" title={ar ? "الآيةُ الأعمقُ جامعيّةً في هذا المحور" : "the most foundational verse of this محور"}>
          {ar ? "أصلُه: " : "root verse: "}<Link to={readPathOf(head)} style={{ textDecoration: "none" }}>{arName(head)}</Link>
        </p>
        <div className="muted" style={{ fontSize: 13 }}>{ayahsCount(verses.length)} · {ar ? "محورٌ محسوب" : "computed محور"}</div>
      </header>
      {units.length > 0 && (
        <section style={{ marginBlockEnd: 18 }}>
          <div className="mw-onenote" style={{ marginBlockEnd: 8 }} title={ar ? "التبويب الموضوعي المحسوب: وحداتُ السياق المسمّاة المسندةُ لهذا المحور بصلات آياتها المفحوصة (أو بتقارب المعنى حيث يُذكر)" : "the computed topical tabwīb: named context units assigned to this axis by their verses' examined links (or by meaning-proximity where marked)"}>
            ◆ {ar ? `مقاطعُ هذا المحور في المصحف — ${num(units.length)} وحدة` : `this axis's passages across the muṣḥaf — ${num(units.length)} units`}
          </div>
          <div className="mw-verses">
            {units.map(({ unit, approx }) => (
              <Link key={unit.i} to={`/read/${unit.s}/${unit.a1}`} className="mw-verse" title={ar ? "افتح الوحدة في المصحف" : "open the unit in the reader"}>
                <span className="mw-verse-ref">{surahNameAr(unit.s)} {num(unit.a1)}–{num(unit.a2)}</span>
                {approx && <span className="chip" style={{ flex: "none", fontSize: 11 }}>{ar ? "بتقارب المعنى" : "by proximity"}</span>}
                <span className="mw-verse-text">{unit.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="mw-onenote" style={{ marginBlockEnd: 8 }}>
        ◆ {ar ? "قواعدُ المحور وآياتُه" : "the axis's rules and verses"}
      </div>
      <div className="mw-verses">
        {verses.map((loc) => (
          <Link key={loc} to={readPathOf(loc)} className={`mw-verse${loc === head ? " rep" : ""}`} title={ar ? "افتح في المصحف" : "open in the reader"}>
            <span className="mw-verse-ref">{arName(loc)}</span>
            <TierBadge loc={loc} style={{ flex: "none" }} />
            <span className="mw-verse-text quran">{texts.get(loc)?.textUthmani ?? loc}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

const MAWDUI_LAST = "quran-studio:mawdui-last";

export default function Mawdui() {
  useUILang();
  const ready = useKulliyat();
  const params = useParams<{ t?: string }>();
  const tIdx = params.t != null ? Number(params.t) : null;
  const ar = getUILang() === "ar";
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);

  // remember the last المواضيع position so the nav resumes here
  useEffect(() => {
    localStorage.setItem(MAWDUI_LAST, `/mawdui${tIdx != null ? `/${tIdx}` : ""}`);
  }, [tIdx]);

  if (!ready) {
    return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;
  }
  return (
    <div className="page">
      <div className="mw-wrap">
        {tIdx != null && (
          <Link to="/mawdui" className="mw-back" title={ar ? "كل المحاور" : "all محاور"}>
            <span aria-hidden="true">{ar ? "→" : "←"}</span> {ar ? "رجوع" : "Back"}
          </Link>
        )}
        {tIdx == null ? <Themes /> : <ThemeView theme={tIdx} texts={texts} />}
      </div>
    </div>
  );
}
