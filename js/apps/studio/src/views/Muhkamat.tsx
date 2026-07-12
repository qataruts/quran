/**
 * المحكمات — the آيات الجوامع index. There is ONE set of ~1032 principle-verses
 * that gather the Qur'an's meanings; ~88 of them are أصولٌ محكمة (roots — they
 * gather تفصيل and hang from nothing above), the rest branch (متفرّع) or stand
 * alone (مجرّد). Search + filter across all of them by kind and grade; tap any
 * verse for its أصل (up) and تفصيل (down). From the Qur'anic text and its
 * morphology alone — نُفصِّل القرآنَ بالقرآن.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import PageSearch from "../components/PageSearch";
import MushafLink from "../components/MushafLink";
import { TafsilPanel } from "../components/TafsilChip";
import { elaborates, tafsilOf, isRootPrinciple, GRADE_INFO, useJawami, type Grade } from "../jawami";
import { fuzzyMatch } from "../lib/fuzzy";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

const GRADE_ORDER: Grade[] = ["أصل جامع", "متفرّع", "موجز", "مجرّد"];
const GRADE_COLOR: Record<Grade, string> = {
  "أصل جامع": "var(--gold)",
  "متفرّع": "var(--accent)",
  "موجز": "#7a5cc0",
  "مجرّد": "var(--ink-2)",
};

/** one آية جامعة: kind + grade/role badges · the verse · its أصل↑/تفصيل↓ on tap
 *  (the panel shows both directions). ↗ opens the mushaf. */
function PrincipleAyah({ loc, texts }: { loc: string; texts: Map<string, AyahDoc> }) {
  const [open, setOpen] = useState(false);
  const ar = getUILang() === "ar";
  const jw = useJawami();
  const p = jw?.principles[loc];
  const fwd = tafsilOf(loc).length; // تفصيل below
  const back = elaborates(loc).length; // أصل above
  const isRoot = isRootPrinciple(loc);
  const grade = p?.grade ?? null;
  const canOpen = fwd > 0 || back > 0;
  const d = texts.get(loc);
  const toggle = () => canOpen && setOpen((v) => !v);
  return (
    <div className={`jw-card${open ? " open" : ""}`}>
      <div className="mk-badges">
        {p?.kind && <span className="mk-ayah-tag" title={ar ? "نوع الآية" : "kind"}>{p.kind}</span>}
        {isRoot && (
          <span className="mk-badge mk-root" title={ar ? "أصلٌ محكمة — يتفرّع منه ولا يتفرّع" : "muḥkam root"}>
            {ar ? "محكمة" : "root"}
          </span>
        )}
        {grade && !isRoot && (
          <span className="mk-badge" style={{ color: GRADE_COLOR[grade], borderColor: GRADE_COLOR[grade] }} title={GRADE_INFO[grade].note}>
            {grade}
          </span>
        )}
      </div>
      <div className="jw-cardhead-row">
        <button className="jw-cardhead" onClick={toggle} aria-expanded={open} disabled={!canOpen}>
          <span className="jw-ref">{arName(loc)}</span>
          <span className="spacer" />
          {back > 0 && <span className="jw-deg" title={ar ? "الآيات التي هذه تفصيلٌ لها (أصلها)" : "its أصل"}>↑ {num(back)} {ar ? "أصل" : ""}</span>}
          {fwd > 0 && <span className="jw-deg" title={ar ? "تفصيلها" : "tafsīl"}>↓ {num(fwd)} {ar ? "تفصيل" : ""}</span>}
          {canOpen && <span className="jw-caret">{open ? "▾" : "◂"}</span>}
        </button>
        <MushafLink loc={loc} compact />
      </div>
      <div
        className="jw-cardtext quran"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
        style={{ cursor: canOpen ? "pointer" : "default" }}
      >
        {d?.textUthmani ?? loc}
        <span className="ayah-marker"> ﴿{num(loc.split(":")[1])}﴾</span>
      </div>
      <TafsilPanel location={loc} open={open} />
    </div>
  );
}

const KIND_NOTE: Record<string, string> = {
  "عقيدة": "التوحيد وأسماء الله وصفاته واليوم الآخر",
  "أخلاق": "أخلاق المؤمن وآدابه ومعاملاته",
  "سنة": "سنن الله في الخلق والأمم",
  "حكم": "الأحكام العمليّة",
  "وعد": "الوعد والوعيد والجزاء",
};
const gpos = (loc: string) => {
  const [s, a] = loc.split(":").map(Number);
  return s * 1000 + a;
};

/* ------- the unified home: search + scope (أصول ⟷ كل الجوامع) + kind + grade ------- */
function Index({ texts }: { texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const jw = useJawami();
  const navigate = useNavigate();
  // the kind filter lives in the URL (/muhkamat/:k) so mobile «back» returns to
  // the previous kind instead of leaving the page — each chip is a history step.
  const { k } = useParams();
  const kind = (() => { try { return k ? decodeURIComponent(k) : ""; } catch { return k ?? ""; } })();
  const setKind = (name: string) => navigate(name ? `/muhkamat/${encodeURIComponent(name)}` : "/muhkamat");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"roots" | "all">("roots"); // أصول محكمة (88) by default
  const [grade, setGrade] = useState<Grade | "">("");
  const [sort, setSort] = useState<"quran" | "tafsil">("quran"); // mushaf order by default
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [q, sort, kind, scope, grade]);

  const kindOf = (loc: string) => jw?.principles[loc]?.kind ?? "";
  const gradeOf = (loc: string) => jw?.principles[loc]?.grade ?? "";

  const rootCount = useMemo(() => (jw ? Object.keys(jw.principles).filter(isRootPrinciple).length : 0), [jw]);
  const allCount = jw ? Object.keys(jw.principles).length : 0;

  // the pool: the أصول محكمة (roots) or every جامعة; sorted مصحف / أوسع تفصيلًا
  const pool = useMemo(() => {
    if (!jw) return [];
    const base = scope === "roots" ? Object.keys(jw.principles).filter(isRootPrinciple) : Object.keys(jw.principles);
    base.sort(sort === "quran" ? (a, b) => gpos(a) - gpos(b) : (a, b) => tafsilOf(b).length - tafsilOf(a).length);
    return base;
  }, [jw, scope, sort]);

  // kinds over the current pool
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const loc of pool) { const kk = kindOf(loc) || (ar ? "أخرى" : "other"); m.set(kk, (m.get(kk) ?? 0) + 1); }
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, jw]);

  // grades over the current pool (only shown when browsing all جوامع)
  const grades = useMemo(() => {
    const m = new Map<string, number>();
    for (const loc of pool) { const g = gradeOf(loc); if (g) m.set(g, (m.get(g) ?? 0) + 1); }
    return GRADE_ORDER.filter((g) => m.has(g)).map((g) => ({ name: g, n: m.get(g)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, jw]);

  // connected تفصيل fabric — only verses joined by a تفصيل edge (research-honest)
  const networkSize = useMemo(() => {
    if (!jw) return 0;
    const s = new Set<string>();
    for (const loc of Object.keys(jw.principles)) {
      const fwd = tafsilOf(loc);
      if (fwd.length === 0) continue;
      s.add(loc);
      for (const l of fwd) s.add(l.loc);
    }
    return s.size;
  }, [jw]);

  const filtered = useMemo(
    () =>
      pool.filter(
        (loc) =>
          (!kind || kindOf(loc) === kind) &&
          (!grade || gradeOf(loc) === grade) &&
          fuzzyMatch(q, arName(loc), texts.get(loc)?.textClean, kindOf(loc)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, q, texts, kind, grade, jw],
  );

  return (
    <>
      <header className="jw-header">
        <h1 className="jw-title">{ar ? "المحكمات والجوامع" : "Muḥkamāt & Jawāmiʿ"}</h1>
        <p className="jw-lead">
          {ar
            ? "الآياتُ الجوامع: قواعدُ تجمع معاني القرآن؛ منها أصولٌ محكمةٌ تتفرّع منها، ومنها متفرّعٌ أو قائمٌ بذاته — من نصّ القرآن وصرفه وحدهما. ابحثْ وصفِّها بالنوع والدرجة، وانقر أيّ آيةٍ لترى أصلها وتفصيلها."
            : "The principle-verses that gather the Qur'an's meanings: some are muḥkam roots, others branch or stand alone — from the Qur'anic text alone. Search and filter by kind and grade; tap any verse for its أصل and تفصيل."}
        </p>
        <div className="jw-stats">
          <span className="chip"><b>{num(rootCount)}</b> {ar ? "آية محكمة (أصل)" : "muḥkam roots"}</span>
          <span className="chip"><b>{num(allCount)}</b> {ar ? "آية جامعة" : "principle verses"}</span>
          <span className="chip"><b>{num(networkSize)}</b> {ar ? "في شبكة التفصيل" : "in the tafsīl network"}</span>
          <Link to="/jawami/lenses" className="chip link" style={{ textDecoration: "none" }} title={ar ? "تحليلاتٌ متقدّمة لبنية الشبكة (للباحثين)" : "advanced network analytics"}>
            {ar ? "تحليلات الشبكة ←" : "network analytics →"}
          </Link>
        </div>
      </header>

      <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث في الآيات الجوامع وتفصيلها…" : "search…"} />

      {/* scope (الأصول ⟷ كل الجوامع) + sort */}
      <div className="jw-filters">
        <div className="jw-chipset">
          <span className="jw-filter-lbl">{ar ? "النطاق" : "scope"}</span>
          <button className={scope === "roots" ? "on" : ""} onClick={() => { setScope("roots"); setGrade(""); }} title={ar ? "الأصول المحكمة فقط — تتفرّع ولا تتفرّع" : "muḥkam roots only"}>
            {ar ? "الأصول المحكمة" : "roots"} <span className="muted">{num(rootCount)}</span>
          </button>
          <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")} title={ar ? "كل الآيات الجوامع (أصولٌ ومتفرّعٌ ومجرّد)" : "all principle verses"}>
            {ar ? "كل الجوامع" : "all"} <span className="muted">{num(allCount)}</span>
          </button>
        </div>
        <div className="jw-chipset">
          <span className="jw-filter-lbl">{ar ? "الترتيب" : "sort"}</span>
          <button className={sort === "quran" ? "on" : ""} onClick={() => setSort("quran")}>{ar ? "المصحف" : "mushaf"}</button>
          <button className={sort === "tafsil" ? "on" : ""} onClick={() => setSort("tafsil")}>{ar ? "الأوسع تفصيلًا" : "most tafsīl"}</button>
        </div>
      </div>

      {/* kind filter (+ grade filter when browsing all جوامع) */}
      <div className="jw-filters">
        <div className="jw-chipset">
          <span className="jw-filter-lbl">{ar ? "النوع" : "kind"}</span>
          <button className={kind === "" ? "on" : ""} onClick={() => setKind("")} title={ar ? "كل الأنواع" : "all kinds"}>
            {ar ? "الكل" : "all"} <span className="muted">{num(pool.length)}</span>
          </button>
          {kinds.map((kk) => (
            <button
              key={kk.name}
              className={kind === kk.name ? "on gold" : ""}
              onClick={() => setKind(kind === kk.name ? "" : kk.name)}
              title={KIND_NOTE[kk.name] ? `${kk.name} — ${KIND_NOTE[kk.name]}` : kk.name}
            >
              {kk.name} <span className="muted">{num(kk.n)}</span>
            </button>
          ))}
        </div>
        {scope === "all" && grades.length > 1 && (
          <div className="jw-chipset">
            <span className="jw-filter-lbl">{ar ? "الدرجة" : "grade"}</span>
            <button className={grade === "" ? "on" : ""} onClick={() => setGrade("")}>{ar ? "الكل" : "all"}</button>
            {grades.map((g) => (
              <button
                key={g.name}
                className={grade === g.name ? "on" : ""}
                onClick={() => setGrade(grade === g.name ? "" : (g.name as Grade))}
                title={GRADE_INFO[g.name as Grade].note}
                style={grade === g.name ? { borderColor: GRADE_COLOR[g.name as Grade], color: GRADE_COLOR[g.name as Grade] } : undefined}
              >
                {g.name} <span className="muted">{num(g.n)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="muted jw-resultcount">
        {num(filtered.length)} {ar ? "آية" : "verses"}
        {kind && KIND_NOTE[kind] && <span> · {KIND_NOTE[kind]}</span>}
      </div>
      <div className="jw-list">
        {filtered.slice(0, limit).map((loc) => (
          <PrincipleAyah key={loc} loc={loc} texts={texts} />
        ))}
      </div>
      {filtered.length > limit && (
        <div style={{ textAlign: "center", margin: "18px 0" }}>
          <button onClick={() => setLimit(limit + 100)}>{ar ? `عرض المزيد (${num(filtered.length - limit)})` : `show more`}</button>
        </div>
      )}
    </>
  );
}

export default function Muhkamat() {
  useUILang();
  const jw = useJawami();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());

  useEffect(() => {
    ayahByLocationMap().then(setTexts);
  }, []);

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
        <Index texts={texts} />
      </div>
    </div>
  );
}
