/**
 * المواضيع — browse the whole Quran by theme, with progressive disclosure:
 *   /mawdui              → the 12 أقسام (calm cards)
 *   /mawdui/:s           → one قسم → its موضوعات
 *   /mawdui/:s/:t        → one موضوع → its آيات (tap → reader)
 * Simple surface, depth on demand. Tooltips on every card/link explain it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMawdui, type MSection } from "../mawdui";
import { ayahByLocationMap, surahNameAr } from "../db";
import type { AyahDoc } from "../types";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import PageSearch from "../components/PageSearch";
import { fuzzyMatch } from "../lib/fuzzy";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

function Crumb({ section, topic }: { section?: { i: number; title: string }; topic?: string }) {
  const ar = getUILang() === "ar";
  return (
    <nav className="mw-crumb" aria-label="مسار">
      <Link to="/mawdui" title={ar ? "كل الأقسام" : "all sections"}>{ar ? "المواضيع" : "Topics"}</Link>
      {section && (
        <>
          <span className="mw-sep">›</span>
          {topic ? (
            <Link to={`/mawdui/${section.i}`} title={section.title}>{section.title}</Link>
          ) : (
            <span className="mw-here">{section.title}</span>
          )}
        </>
      )}
      {topic && (<><span className="mw-sep">›</span><span className="mw-here">{topic}</span></>)}
    </nav>
  );
}

/* ---------- level 0: the 12 sections ---------- */
function Sections({ sections }: { sections: MSection[] }) {
  const ar = getUILang() === "ar";
  const [q, setQ] = useState("");

  // when searching, flatten every topic across every section and jump straight to it
  const hits =
    q.trim() === ""
      ? null
      : sections.flatMap((s, si) =>
          s.topics
            .map((tp, ti) => ({ tp, ti, si, sTitle: s.title }))
            .filter(({ tp, sTitle }) => fuzzyMatch(q, tp.title, tp.theme, sTitle)),
        );

  return (
    <>
      <header className="mw-head">
        <h1 className="mw-title">{ar ? "المواضيع" : "Topics of the Qur'an"}</h1>
        <p className="mw-lead">
          {ar
            ? "تصفّح القرآن كلَّه بحسب موضوعه — كلُّ آيةٍ في موضعها. اختر قِسمًا لتتعمّق."
            : "Browse the whole Qur'an by subject — every verse in its place. Pick a section to go deeper."}
        </p>
      </header>
      <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث في المواضيع…" : "search topics…"} />
      {hits && (
        <div className="mw-topics">
          {hits.map(({ tp, ti, si, sTitle }) => (
            <Link key={`${si}/${ti}`} to={`/mawdui/${si}/${ti}`} className="mw-topic-card" title={tp.theme}>
              <span className="mw-topic-name">{tp.title}</span>
              <span className="mw-topic-count">{sTitle} · {num(tp.members.length)}</span>
            </Link>
          ))}
          {hits.length === 0 && (
            <div className="muted" style={{ padding: "24px 4px", gridColumn: "1/-1" }}>
              {ar ? "لا نتائج." : "No matches."}
            </div>
          )}
        </div>
      )}
      {!hits && (
      <div className="mw-sections">
        {sections.map((s, i) => (
          <Link
            key={i}
            to={`/mawdui/${i}`}
            className="mw-sec-card"
            title={s.theme}
          >
            <span className="mw-sec-name">{s.title}</span>
            <span className="mw-sec-meta">
              {num(s.topics.length)} {ar ? "موضوعًا" : "topics"} · {num(s.verses)} {ar ? "آية" : "verses"}
            </span>
            <span className="mw-sec-preview">
              {s.topics.slice(0, 3).map((tp) => tp.title).join(" · ")}
            </span>
          </Link>
        ))}
      </div>
      )}
    </>
  );
}

/* ---------- level 1: one section → its topics ---------- */
function Section({ section, idx }: { section: MSection; idx: number }) {
  const ar = getUILang() === "ar";
  return (
    <>
      <Crumb section={{ i: idx, title: section.title }} />
      <header className="mw-head">
        <h1 className="mw-title">{section.title}</h1>
        <p className="mw-lead">{section.theme}</p>
        <div className="muted" style={{ fontSize: 13 }}>
          {num(section.topics.length)} {ar ? "موضوعًا" : "topics"} · {num(section.verses)} {ar ? "آية" : "verses"}
        </div>
      </header>
      <div className="mw-topics">
        {section.topics.map((tp, ti) => (
          <Link
            key={ti}
            to={`/mawdui/${idx}/${ti}`}
            className="mw-topic-card"
            title={tp.theme}
          >
            <span className="mw-topic-name">{tp.title}</span>
            <span className="mw-topic-count">{num(tp.members.length)} {ar ? "آية" : ""}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

/* ---------- level 2: one topic → its verses ---------- */
function Topic({ section, idx, topicIdx }: { section: MSection; idx: number; topicIdx: number }) {
  const ar = getUILang() === "ar";
  const topic = section.topics[topicIdx];
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);
  if (!topic) return <p className="muted">{t("notFound")}</p>;
  return (
    <>
      <Crumb section={{ i: idx, title: section.title }} topic={topic.title} />
      <header className="mw-head">
        <h1 className="mw-title">{topic.title}</h1>
        <p className="mw-lead">{topic.theme}</p>
        <div className="muted" style={{ fontSize: 13 }}>{num(topic.members.length)} {ar ? "آية" : "verses"}</div>
      </header>
      <div className="mw-verses">
        {topic.members.map((loc) => (
          <Link
            key={loc}
            to={readPathOf(loc)}
            className={`mw-verse${loc === topic.rep ? " rep" : ""}`}
            title={ar ? "افتح في المصحف" : "open in the reader"}
          >
            <span className="mw-verse-ref">{arName(loc)}</span>
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
  const jw = useMawdui();
  const params = useParams<{ s?: string; t?: string }>();
  const s = params.s != null ? Number(params.s) : null;
  const tIdx = params.t != null ? Number(params.t) : null;
  const ar = getUILang() === "ar";

  const section = useMemo(() => (jw && s != null ? jw.sections[s] : null), [jw, s]);

  // remember the last المواضيع position so the nav resumes here
  useEffect(() => {
    const p = `/mawdui${s != null ? `/${s}` : ""}${tIdx != null ? `/${tIdx}` : ""}`;
    localStorage.setItem(MAWDUI_LAST, p);
  }, [s, tIdx]);

  if (!jw) {
    return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;
  }
  const backTo = tIdx != null ? `/mawdui/${s}` : s != null ? "/mawdui" : null;
  return (
    <div className="page">
      <div className="mw-wrap">
        {backTo && (
          <Link to={backTo} className="mw-back" title={ar ? "الرجوع للمستوى الأعلى" : "back one level"}>
            <span aria-hidden="true">{ar ? "→" : "←"}</span> {ar ? "رجوع" : "Back"}
          </Link>
        )}
        {s == null ? (
          <Sections sections={jw.sections} />
        ) : !section ? (
          <p className="muted">{t("notFound")}</p>
        ) : tIdx == null ? (
          <Section section={section} idx={s} />
        ) : (
          <Topic section={section} idx={s} topicIdx={tIdx} />
        )}
      </div>
    </div>
  );
}
