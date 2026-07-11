/**
 * المحكمات الجامعة — browse the pyramid's apex. Level 1: the 40 كبرى (major
 * principles). Level 2: one كبرى → its verified محكمات, each shown with its
 * «أمّ» (mother principle-verse) illuminated and its جوامع beneath. From
 * muhkamat.json; the reader climbs from the great root down to the detail.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import { jawamiCount, useMuhkamat, type Kubra, type Muhkama } from "../muhkamat";
import PageSearch from "../components/PageSearch";
import MushafLink from "../components/MushafLink";
import { TafsilPanel } from "../components/TafsilChip";
import { tafsilOf, isRootPrinciple, useJawami } from "../jawami";
import { fuzzyMatch } from "../lib/fuzzy";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/** the جوامع under a محكمة — collapsed to a count, expands to clickable refs. */
function Members({ m, texts }: { m: Muhkama; texts: Map<string, AyahDoc> }) {
  const [open, setOpen] = useState(false);
  const ar = getUILang() === "ar";
  const others = m.members.filter((loc) => loc !== m.umm);
  if (others.length === 0) return null;
  return (
    <div className="mk-members">
      <button className="mk-members-btn" onClick={() => setOpen(!open)}>
        {open ? "▾" : "◂"} {ar ? "الجوامع المندرجة" : "principle-verses under it"}{" "}
        <span className="muted">· {num(others.length)}</span>
      </button>
      {open && (
        <div className="mk-members-list">
          {others.map((loc) => (
            <div key={loc} className="mk-verse">
              <span className="mk-verse-ref">{arName(loc)}</span>
              <span className="mk-verse-text quran">{texts.get(loc)?.textClean ?? loc}</span>
              <MushafLink loc={loc} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** one محكمة: title · theme · the illuminated أمّ verse · its جوامع. */
function MuhkamaCard({ m, texts }: { m: Muhkama; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const umm = texts.get(m.umm);
  return (
    <div className="mk-card">
      <h3 className="mk-title">{m.title}</h3>
      {m.theme && <p className="mk-theme">{m.theme}</p>}
      <div className="mk-umm">
        <div className="mk-umm-head">
          <span className="mk-umm-lbl">{ar ? "الأمّ" : "root verse"} · {arName(m.umm)}</span>
          <MushafLink loc={m.umm} compact />
        </div>
        <span className="mk-umm-text quran">{umm?.textUthmani ?? m.umm}</span>
      </div>
      <Members m={m} texts={texts} />
    </div>
  );
}

/* --------------------------------- level 2 --------------------------------- */
function KubraView({ kb, texts }: { kb: Kubra; texts: Map<string, AyahDoc> }) {
  useUILang();
  const ar = getUILang() === "ar";
  return (
    <>
      <nav className="mw-crumb" aria-label={ar ? "مسار" : "path"}>
        <Link to="/muhkamat">{ar ? "المحكمات" : "Muhkamat"}</Link>
        <span className="mw-sep">›</span>
        <span className="mw-here">{kb.title}</span>
      </nav>
      <header className="jw-header">
        <h1 className="jw-title">{kb.title}</h1>
        <p className="jw-lead">
          {ar
            ? `أصلٌ كبرى يضمّ ${num(kb.muhkamat.length)} محكمةً متجانسة، و${num(jawamiCount(kb))} آيةً جامعة.`
            : `A major principle holding ${num(kb.muhkamat.length)} coherent muhkamāt and ${num(jawamiCount(kb))} principle-verses.`}
        </p>
      </header>
      <div className="mk-cards">
        {kb.muhkamat.map((m, i) => (
          <MuhkamaCard key={i} m={m} texts={texts} />
        ))}
      </div>
      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <Link to="/muhkamat" className="chip link" style={{ textDecoration: "none" }}>
          ← {ar ? "كل الأصول" : "all principles"}
        </Link>
      </div>
    </>
  );
}

/** one آية محكمة (root) in the flat «آيات» view: its عنوان tag · the verse ·
 *  its تفصيل on tap. Tapping the verse opens تفصيل; ↗ opens the mushaf. */
function RootAyah({ loc, kubraTitle, texts }: { loc: string; kubraTitle: string | null; texts: Map<string, AyahDoc> }) {
  const [open, setOpen] = useState(false);
  const ar = getUILang() === "ar";
  const deg = tafsilOf(loc).length;
  const d = texts.get(loc);
  const toggle = () => deg > 0 && setOpen((v) => !v);
  return (
    <div className={`jw-card${open ? " open" : ""}`}>
      {kubraTitle && <div className="mk-ayah-tag" title={ar ? "العنوان (القسم) التابع له" : "its section"}>{kubraTitle}</div>}
      <div className="jw-cardhead-row">
        <button className="jw-cardhead" onClick={toggle} aria-expanded={open}>
          <span className="jw-ref">{arName(loc)}</span>
          <span className="spacer" />
          {deg > 0 && <span className="jw-deg">{num(deg)} {ar ? "تفصيل" : "tafsil"}</span>}
          <span className="jw-caret">{open ? "▾" : "◂"}</span>
        </button>
        <MushafLink loc={loc} compact />
      </div>
      <div
        className="jw-cardtext quran"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
        style={{ cursor: deg > 0 ? "pointer" : "default" }}
      >
        {d?.textUthmani ?? loc}
        <span className="ayah-marker"> ﴿{num(loc.split(":")[1])}﴾</span>
      </div>
      <TafsilPanel location={loc} open={open} />
    </div>
  );
}

/* --------- the one unified home: عناوين (40 sections) OR آيات (108 roots) ------ */
function Index({ data, texts }: { data: NonNullable<ReturnType<typeof useMuhkamat>>; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const jw = useJawami();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"titles" | "ayat">("titles");
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [q, view]);

  // loc → its عنوان (كبرى) title, so each آية shows the section it belongs to
  const locToKubra = useMemo(() => {
    const map = new Map<string, string>();
    for (const kb of data.kubra)
      for (const m of kb.muhkamat) {
        map.set(m.umm, kb.title);
        for (const loc of m.members) if (!map.has(loc)) map.set(loc, kb.title);
      }
    return map;
  }, [data]);

  // the 108 آيات محكمة (roots), widest تفصيل first
  const roots = useMemo(() => {
    if (!jw) return [];
    return Object.keys(jw.principles)
      .filter((l) => isRootPrinciple(l))
      .sort((a, b) => tafsilOf(b).length - tafsilOf(a).length);
  }, [jw]);
  const totalTafsil = useMemo(() => roots.reduce((s, l) => s + tafsilOf(l).length, 0), [roots]);

  const filteredRoots = useMemo(
    () => roots.filter((loc) => fuzzyMatch(q, arName(loc), texts.get(loc)?.textClean, locToKubra.get(loc))),
    [roots, q, texts, locToKubra],
  );
  const kubra = data.kubra
    .map((kb, i) => [kb, i] as const)
    .filter(
      ([kb]) =>
        kb.muhkamat.length > 0 &&
        fuzzyMatch(q, kb.title, ...kb.muhkamat.map((m) => m.title), ...kb.muhkamat.map((m) => m.theme ?? "")),
    );

  return (
    <>
      <header className="jw-header">
        <h1 className="jw-title">{ar ? "المحكمات" : "Muḥkamāt"}</h1>
        <p className="jw-lead">
          {ar
            ? "الآياتُ المحكمة: أصولٌ تجمع معاني القرآن، وتحتها تفصيلُها من نصّ القرآن وصرفه وحدهما. تصفّحها مُجمَّعةً في عناوين، أو آيةً آية مع تفصيل كلٍّ منها."
            : "The muḥkam verses: roots that gather the Qur'an's meanings, each with its تفصيل — from the Qur'anic text alone. Browse them grouped into sections, or one verse at a time with its تفصيل."}
        </p>
        <div className="jw-stats">
          <span className="chip"><b>{num(data.meta.kubra)}</b> {ar ? "عنوان" : "sections"}</span>
          <span className="chip"><b>{num(roots.length)}</b> {ar ? "آية محكمة" : "muḥkam verses"}</span>
          <span className="chip"><b>{num(totalTafsil)}</b> {ar ? "تفصيل" : "tafsīl"}</span>
          <Link to="/jawami/lenses" className="chip link" style={{ textDecoration: "none" }} title={ar ? "تحليلاتٌ متقدّمة لبنية الشبكة (للباحثين)" : "advanced network analytics"}>
            {ar ? "تحليلات الشبكة ←" : "network analytics →"}
          </Link>
        </div>
      </header>

      <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث في المحكمات وتفصيلها…" : "search…"} />

      {/* the one toggle — mushaf-style: عناوين (كروت) أو آيات */}
      <div className="jw-filters">
        <div className="jw-chipset" style={{ justifyContent: "center" }}>
          <span className="jw-filter-lbl">{ar ? "العرض" : "view"}</span>
          <button className={view === "titles" ? "on" : ""} onClick={() => setView("titles")}>
            {ar ? `عناوين (${num(data.meta.kubra)})` : `sections (${num(data.meta.kubra)})`}
          </button>
          <button className={view === "ayat" ? "on" : ""} onClick={() => setView("ayat")}>
            {ar ? `آيات (${num(roots.length)})` : `verses (${num(roots.length)})`}
          </button>
        </div>
      </div>

      {view === "titles" ? (
        <div className="mk-kubra-grid">
          {kubra.map(([kb, i]) => (
            <Link key={i} to={`/muhkamat/${i}`} className="mk-kubra-card" title={kb.title}>
              <span className="mk-kubra-title">{kb.title}</span>
              <span className="mk-kubra-preview">{kb.muhkamat.map((m) => m.title).slice(0, 3).join(" · ")}</span>
              <span className="mk-kubra-meta">
                {num(kb.muhkamat.length)} {ar ? "محكمة" : "muhkamāt"} · {num(jawamiCount(kb))} {ar ? "آية" : "verses"}
              </span>
            </Link>
          ))}
          {kubra.length === 0 && (
            <div className="muted" style={{ padding: "24px 4px", gridColumn: "1/-1" }}>{ar ? "لا نتائج." : "No matches."}</div>
          )}
        </div>
      ) : (
        <>
          <div className="muted jw-resultcount">{num(filteredRoots.length)} {ar ? "آية محكمة" : "verses"}</div>
          <div className="jw-list">
            {filteredRoots.slice(0, limit).map((loc) => (
              <RootAyah key={loc} loc={loc} kubraTitle={locToKubra.get(loc) ?? null} texts={texts} />
            ))}
          </div>
          {filteredRoots.length > limit && (
            <div style={{ textAlign: "center", margin: "18px 0" }}>
              <button onClick={() => setLimit(limit + 100)}>{ar ? `عرض المزيد (${num(filteredRoots.length - limit)})` : `show more`}</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function Muhkamat() {
  useUILang();
  const params = useParams<{ k?: string }>();
  const data = useMuhkamat();
  const jw = useJawami();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());

  useEffect(() => {
    ayahByLocationMap().then(setTexts);
  }, []);

  const kIdx = params.k != null ? Number(params.k) : null;
  const kb = useMemo(() => (data && kIdx != null ? data.kubra[kIdx] : null), [data, kIdx]);

  if (!data || !jw) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="jw-wrap">
        {kb ? <KubraView kb={kb} texts={texts} /> : <Index data={data} texts={texts} />}
      </div>
    </div>
  );
}
