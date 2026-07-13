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
import type { AyahDoc } from "../types";
import { ayahsCount, getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import PageSearch from "../components/PageSearch";
import { fuzzyMatch } from "../lib/fuzzy";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
const tierCls = (loc: string) => { const tr = classOf(loc)?.tier; return tr === "كلّية" ? "k" : tr === "جامعة" ? "j" : "t"; };

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
        <h1 className="mw-title">{ar ? "مواضيع القرآن" : "Topics of the Qur'an"}</h1>
        <p className="mw-lead">
          {ar
            ? "موضوعاتُ القرآن كما تنشأُ حسابيًّا: تسعونَ محورًا يُجمَعُ إليها كلُّ آيةٍ بتقاربِ المعنى، فتُغطّي المصحفَ كلَّه — كلُّ آيةٍ في محورٍ واحد، لا انتقاءَ بالرأي. اختَرْ محورًا لترى آياتِه (الأعمقُ أوّلًا)."
            : "The Qur'an's topics as they emerge by computation: ninety محاور that gather every āya by meaning-proximity, covering the whole muṣḥaf — each verse in exactly one, no editorial hand. Pick a محور to see its verses (the deepest first)."}
        </p>
        <div className="muted" style={{ fontSize: 13 }}>{num(themes.length)} {ar ? "محورًا" : "محاور"} · {num(6236)} {ar ? "آية" : "verses"}</div>
      </header>
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
  if (!head) return <p className="muted">{t("notFound")}</p>;
  return (
    <>
      <nav className="mw-crumb" aria-label="مسار">
        <Link to="/mawdui" title={ar ? "كل المحاور" : "all محاور"}>{ar ? "المواضيع" : "Topics"}</Link>
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
      <div className="mw-verses">
        {verses.map((loc) => (
          <Link key={loc} to={readPathOf(loc)} className={`mw-verse${loc === head ? " rep" : ""}`} title={ar ? "افتح في المصحف" : "open in the reader"}>
            <span className="mw-verse-ref">{arName(loc)}</span>
            <span className={`kl-badge ${tierCls(loc)}`} style={{ flex: "none" }}>{classOf(loc)?.tier}</span>
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
