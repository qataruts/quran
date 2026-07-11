/**
 * الآيات الجوامع — the flagship view. Browse the principle-verses (محكمات) and,
 * for each, the verses that elaborate it: «نُفصِّل القرآنَ بالقرآن». Built from
 * our own three-pass, adversarially-reviewed network — no tafsīr, no ḥadīth.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  REL_INFO,
  convergenceRanked,
  elaborates,
  isRootPrinciple,
  mirrorPairs,
  relationHubs,
  tafsilOf,
  useJawami,
  type Link as JLink,
  type Rel,
} from "../jawami";
import type { Principle } from "../jawami";
import {
  ayahByLocationMap,
  ayahLocationsOfRoot,
  getRoot,
  surahNameAr,
} from "../db";
import { resolveRootReady } from "../searchForms";
import PageSearch from "../components/PageSearch";
import MushafLink from "../components/MushafLink";
import { fuzzyMatch } from "../lib/fuzzy";
import type { AyahDoc } from "../types";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";

const KINDS = ["حكم", "أخلاق", "عقيدة", "سنة", "وعد"] as const;
const REL_ORDER: Rel[] = ["بيان", "مثال", "جزاء", "توكيد"];

const arName = (loc: string) =>
  `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/** A verse row inside an expanded panel: its ref + a text preview. */
function VerseRow({
  loc,
  texts,
  rel,
}: {
  loc: string;
  texts: Map<string, AyahDoc>;
  rel?: Rel;
}) {
  const d = texts.get(loc);
  return (
    <div className="jw-verse">
      {rel && (
        <span
          className="jw-reldot"
          style={{ background: REL_INFO[rel].color }}
        />
      )}
      <span className="jw-verse-ref">{arName(loc)}</span>
      <span className="jw-verse-text quran">{d?.textClean ?? loc}</span>
      <MushafLink loc={loc} compact />
    </div>
  );
}

function TafsilPanel({
  hub,
  texts,
}: {
  hub: string;
  texts: Map<string, AyahDoc>;
}) {
  useUILang();
  const links = tafsilOf(hub);
  const back = elaborates(hub);
  const byRel = REL_ORDER.map((rel) => ({
    rel,
    items: links.filter((l) => l.rel === rel),
  })).filter((g) => g.items.length);
  return (
    <div className="jw-panel">
      {byRel.map(({ rel, items }) => (
        <div key={rel} className="jw-relgroup">
          <div className="jw-relhead" style={{ color: REL_INFO[rel].color }}>
            <span
              className="jw-reldot"
              style={{ background: REL_INFO[rel].color }}
            />
            {rel}{" "}
            <span className="muted">
              · {REL_INFO[rel].note} · {num(items.length)}
            </span>
          </div>
          {items.map((l) => (
            <VerseRow key={l.loc} loc={l.loc} texts={texts} />
          ))}
        </div>
      ))}
      {back.length > 0 && (
        <div className="jw-relgroup jw-back">
          <div className="jw-relhead muted">
            {getUILang() === "ar" ? "وهي نفسها تُفصِّل:" : "and it elaborates:"}
          </div>
          {back.map((l) => (
            <VerseRow key={l.loc} loc={l.loc} texts={texts} rel={l.rel} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  hub,
  p,
  texts,
  open,
  onToggle,
}: {
  hub: string;
  p: Principle;
  texts: Map<string, AyahDoc>;
  open: boolean;
  onToggle: () => void;
}) {
  const d = texts.get(hub);
  const deg = tafsilOf(hub).length;
  return (
    <div className={`jw-card${open ? " open" : ""}`}>
      <div className="jw-cardhead-row">
        <button className="jw-cardhead" onClick={onToggle} aria-expanded={open}>
          <span className="jw-ref">{arName(hub)}</span>
          {p.kind && <span className="chip">{p.kind}</span>}
          {p.tahrim ? <span className="chip">تحريم</span> : null}
          <span className="spacer" />
          {deg > 0 && (
            <span className="jw-deg">
              {num(deg)} {getUILang() === "ar" ? "تفصيل" : "tafsil"}
            </span>
          )}
          <span className="jw-caret">{open ? "▾" : "◂"}</span>
        </button>
        <MushafLink loc={hub} compact />
      </div>
      {/* tapping the verse opens/closes its تفصيل — never jumps to the mushaf */}
      <div
        className="jw-cardtext quran"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        style={{ cursor: deg > 0 ? "pointer" : "default" }}
      >
        {d?.textUthmani ?? hub}
        <span className="ayah-marker"> ﴿{num(hub.split(":")[1])}﴾</span>
      </div>
      {open && <TafsilPanel hub={hub} texts={texts} />}
    </div>
  );
}

/** A reusable expandable row: a verse header (ref + count) → its links below. */
function HubRow({
  hub,
  count,
  links,
  texts,
  badge,
}: {
  hub: string;
  count: number;
  links: JLink[];
  texts: Map<string, AyahDoc>;
  badge?: string;
}) {
  const [open, setOpen] = useState(false);
  const d = texts.get(hub);
  const toggle = () => setOpen((v) => !v);
  return (
    <div className={`jw-card${open ? " open" : ""}`}>
      <div className="jw-cardhead-row">
        <button className="jw-cardhead" onClick={toggle} aria-expanded={open}>
          <span className="jw-ref">{arName(hub)}</span>
          {badge && <span className="chip gold">{badge}</span>}
          <span className="spacer" />
          <span className="jw-deg">{num(count)}</span>
          <span className="jw-caret">{open ? "▾" : "◂"}</span>
        </button>
        <MushafLink loc={hub} compact />
      </div>
      <div
        className="jw-cardtext quran"
        style={{ fontSize: 19, cursor: "pointer" }}
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
      >
        {d?.textClean ?? hub}
      </div>
      {open && (
        <div className="jw-panel">
          {links.map((l) => (
            <VerseRow key={l.loc} loc={l.loc} texts={texts} rel={l.rel} />
          ))}
        </div>
      )}
    </div>
  );
}

function MoreButton({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  const ar = getUILang() === "ar";
  if (shown >= total) return null;
  return (
    <div style={{ textAlign: "center", margin: "16px 0" }}>
      <button onClick={onMore}>
        {ar
          ? `عرض المزيد (${num(total - shown)})`
          : `show more (${total - shown})`}
      </button>
    </div>
  );
}

/** عدسات العلاقة — the network sliced by relation type (توكيد/بيان/جزاء/مثال). */
function RelationLens({ texts }: { texts: Map<string, AyahDoc> }) {
  useUILang();
  const ar = getUILang() === "ar";
  const [rel, setRel] = useState<Rel>("توكيد");
  const [limit, setLimit] = useState(50);
  const hubs = useMemo(() => relationHubs(rel), [rel]);
  useEffect(() => setLimit(50), [rel]);
  return (
    <div>
      <p className="jw-lead">
        {ar
          ? "الشبكة مقسّمةً حسب نوع العلاقة: توكيدٌ (تقرير القاعدة بصياغة أخرى) · بيانٌ · جزاءٌ · مثال. لكل نوعٍ الآياتُ الأكثر ارتباطًا به في الشبكة."
          : "The network sliced by relation: restatement (توكيد), clarification, requital, instance. For each, the most-connected verses."}
      </p>
      <div
        className="jw-chipset"
        style={{ justifyContent: "center", marginBottom: 10 }}
      >
        {REL_ORDER.map((r) => (
          <button
            key={r}
            className={rel === r ? "on" : ""}
            onClick={() => setRel(r)}
            style={
              rel === r
                ? {
                    borderColor: REL_INFO[r].color,
                    color: REL_INFO[r].color,
                    background: "var(--panel-2)",
                  }
                : undefined
            }
          >
            {r} <span className="muted">· {REL_INFO[r].note}</span>
          </button>
        ))}
      </div>
      <div className="muted jw-resultcount">
        {num(hubs.reduce((s, h) => s + h.count, 0))} {ar ? "رابط" : "links"} ·{" "}
        {num(hubs.length)} {ar ? "آيةً مرتبطة" : "linked verses"}
      </div>
      <div className="jw-list">
        {hubs.slice(0, limit).map((h) => (
          <HubRow
            key={h.hub}
            hub={h.hub}
            count={h.count}
            links={h.links}
            texts={texts}
            badge={rel}
          />
        ))}
      </div>
      <MoreButton
        shown={Math.min(limit, hubs.length)}
        total={hubs.length}
        onMore={() => setLimit(limit + 60)}
      />
    </div>
  );
}

/** نقاط الالتقاء — verses that the most جوامع elaborate into (convergence). */
function Convergence({ texts }: { texts: Map<string, AyahDoc> }) {
  useUILang();
  const ar = getUILang() === "ar";
  const [limit, setLimit] = useState(50);
  const items = useMemo(() => convergenceRanked(2), []);
  return (
    <div>
      <p className="jw-lead">
        {ar
          ? "آياتٌ تلتقي عندها عدةُ آياتٍ مُفصِّلة — كلّما كثُر عددُ الآيات التي تُفصِّلها آيةٌ واحدة، كانت أشدَّ مركزيةً في نظم القرآن."
          : "Verses that several verses converge upon — the more verses elaborate one verse, the more central it is to the Quran's weave."}
      </p>
      <div className="muted jw-resultcount">
        {num(items.length)}{" "}
        {ar
          ? "نقطة التقاء (تُفصِّلها آيتان مُحكَمتان فأكثر)"
          : "convergence points (≥2 verses)"}
      </div>
      <div className="jw-list">
        {items.slice(0, limit).map((it) => (
          <HubRow
            key={it.loc}
            hub={it.loc}
            count={it.count}
            links={it.hubs}
            texts={texts}
            badge={`${ar ? "تُفصِّلها" : "elaborated by"} ${num(it.count)}`}
          />
        ))}
      </div>
      <MoreButton
        shown={Math.min(limit, items.length)}
        total={items.length}
        onMore={() => setLimit(limit + 60)}
      />
    </div>
  );
}

/** المثاني — verse pairs that elaborate each other back (mirror pillars). */
function Mathani({ texts }: { texts: Map<string, AyahDoc> }) {
  useUILang();
  const ar = getUILang() === "ar";
  const [onlyAsym, setOnlyAsym] = useState(false);
  const [limit, setLimit] = useState(50);
  const all = useMemo(() => mirrorPairs(), []);
  const pairs = onlyAsym ? all.filter((p) => p.relAB !== p.relBA) : all;
  useEffect(() => setLimit(50), [onlyAsym]);
  return (
    <div>
      <p className="jw-lead">
        {ar
          ? "﴿كِتَابًا مُتَشَابِهًا مَثَانِيَ﴾ — آيتان يُفصِّل كلٌّ منهما الأخرى تبادليًّا. تقابُلٌ في نظم القرآن يكشف عن وحدة معناه."
          : "Mathānī — verse pairs that each elaborate the other. A reciprocal weave revealing the unity of the Quran's meaning."}
      </p>
      <div
        className="jw-chipset"
        style={{ justifyContent: "center", marginBottom: 10 }}
      >
        <button
          className={!onlyAsym ? "on" : ""}
          onClick={() => setOnlyAsym(false)}
        >
          {ar ? `الكل (${num(all.length)})` : `all (${all.length})`}
        </button>
        <button
          className={onlyAsym ? "on" : ""}
          onClick={() => setOnlyAsym(true)}
        >
          {ar ? "المتقابلة المختلفة" : "asymmetric only"}
        </button>
      </div>
      <div className="jw-list">
        {pairs.slice(0, limit).map((p) => (
          <div
            key={`${p.a}|${p.b}`}
            className="jw-card"
            style={{ padding: "6px 4px" }}
          >
            <VerseRow loc={p.a} texts={texts} rel={p.relAB} />
            <div className="mathani-mid">
              <span
                className="jw-reldot"
                style={{ background: REL_INFO[p.relAB].color }}
              />
              {p.relAB === p.relBA ? p.relAB : `${p.relAB} ⇄ ${p.relBA}`}
              <span
                className="jw-reldot"
                style={{ background: REL_INFO[p.relBA].color }}
              />
            </div>
            <VerseRow loc={p.b} texts={texts} rel={p.relBA} />
          </div>
        ))}
      </div>
      <MoreButton
        shown={Math.min(limit, pairs.length)}
        total={pairs.length}
        onMore={() => setLimit(limit + 60)}
      />
    </div>
  );
}

type Lens = "relations" | "convergence" | "mathani";

export default function Jawami() {
  useUILang();
  const jw = useJawami();
  // advanced lenses are collapsed by default (progressive disclosure); the
  // browsable list is always the primary surface.
  const [lens, setLens] = useState<Lens | null>(null);
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [kind, setKind] = useState<string>("");
  // «الأصول» = the ≈108 genuine جوامع (roots); «الكل» = every linked node. Roots
  // is the default so the page is honest: a تفصيل is not shown as a جامعة.
  const [view, setView] = useState<"roots" | "all">("roots");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  // ayahs sharing the (fuzzily-resolved) root of the typed word, so «الزنى»
  // matches آيات زاني/زانية — broad letter search, no exact form needed.
  const [rootAyahs, setRootAyahs] = useState<Set<string>>(new Set());
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  // /jawami/lenses → the advanced network analytics live on their own focused
  // view (moved out of the main browse, where they only confused).
  const location = useLocation();
  const lensesMode = location.pathname.endsWith("/lenses");
  useEffect(() => {
    if (lensesMode && !lens) setLens("relations");
  }, [lensesMode, lens]);

  useEffect(() => {
    ayahByLocationMap().then(setTexts);
  }, []);

  useEffect(() => {
    let live = true;
    if (!q.trim()) {
      setRootAyahs(new Set());
      setResolvedRoot(null);
      return;
    }
    resolveRootReady(q.trim())
      .then((root) => {
        if (live) setResolvedRoot(root);
        return root ? getRoot(root) : null;
      })
      .then((rd) => {
        if (live) setRootAyahs(rd ? new Set(ayahLocationsOfRoot(rd)) : new Set());
      })
      .catch(() => {
        if (live) {
          setRootAyahs(new Set());
          setResolvedRoot(null);
        }
      });
    return () => {
      live = false;
    };
  }, [q]);

  // roots = genuine جوامع (108); the rest are تفصيل shown nested under them
  const rootCount = useMemo(
    () => (jw ? Object.keys(jw.principles).filter((l) => isRootPrinciple(l)).length : 0),
    [jw],
  );

  const rows = useMemo(() => {
    if (!jw) return [];
    const all = Object.entries(jw.principles) as [string, Principle][];
    const filtered = all.filter(([loc, p]) => {
      // default: show only the genuine جوامع (أصول) — a تفصيل is not a جامعة
      if (view === "roots" && !isRootPrinciple(loc)) return false;
      if (kind && p.kind !== kind) return false;
      // fuzzy over the verse ref + text, OR by the typed word's root (زنى →
      // آيات الزاني/الزانية) — the shared page-search behaviour
      if (q && !fuzzyMatch(q, arName(loc), texts.get(loc)?.textClean) && !rootAyahs.has(loc)) return false;
      return true;
    });
    // widest-branching first — the أوسع تفصيلًا surface at the top
    filtered.sort((a, b) => tafsilOf(b[0]).length - tafsilOf(a[0]).length);
    return filtered;
  }, [jw, view, kind, q, texts, rootAyahs]);

  useEffect(() => setLimit(60), [kind, view, q]);

  // the single widest-branching ROOT جامعة — a concrete worked example
  const example = useMemo(() => {
    if (!jw) return null;
    let best: string | null = null;
    let bestN = 0;
    for (const loc of Object.keys(jw.principles)) {
      if (!isRootPrinciple(loc)) continue;
      const n = tafsilOf(loc).length;
      if (n > bestN) {
        bestN = n;
        best = loc;
      }
    }
    return best ? { loc: best, n: bestN } : null;
  }, [jw]);

  if (!jw) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>
          {t("loading")}
        </div>
      </div>
    );
  }

  const ar = getUILang() === "ar";

  // Advanced network analytics — a focused, clearly-labelled destination of its
  // own (reached from إحصاءات), NOT mixed into the جوامع/محكمات browse.
  if (lensesMode) {
    const L: Lens = lens ?? "relations";
    const TABS: [Lens, string][] = [
      ["relations", ar ? "العلاقات" : "Relations"],
      ["convergence", ar ? "نقاط الالتقاء" : "Convergence"],
      ["mathani", ar ? "المثاني" : "Mathānī"],
    ];
    return (
      <div className="page">
        <div className="jw-wrap">
          <nav className="mw-crumb" aria-label={ar ? "مسار" : "path"}>
            <Link to="/muhkamat">{ar ? "المحكمات" : "Muḥkamāt"}</Link>
            <span className="mw-sep">›</span>
            <span className="mw-here">{ar ? "تحليلات الشبكة" : "Network analytics"}</span>
          </nav>
          <header className="jw-header">
            <h1 className="jw-title">{ar ? "تحليلات شبكة المحكمات وتفصيلها" : "Muḥkamāt-network analytics"}</h1>
            <p className="jw-lead">
              {ar
                ? "عدساتٌ للباحثين على بنية الروابط بين المحكمات وتفصيلها — تعمل على الشبكة الكاملة (كلُّ آيةٍ مُرتبطة، لا الأصول الـ٨٨ وحدها)، وليست طبقةَ بياناتٍ جديدة. اختر عدسة:"
                : "Research lenses over the link structure between principles and their تفصيل — not a new data layer, just angles on the same network."}
            </p>
          </header>
          <div className="jw-lens-tabs">
            {TABS.map(([key, title]) => (
              <button key={key} className={L === key ? "on" : ""} onClick={() => setLens(key)}>
                {title}
              </button>
            ))}
          </div>
          {L === "relations" && <RelationLens texts={texts} />}
          {L === "convergence" && <Convergence texts={texts} />}
          {L === "mathani" && <Mathani texts={texts} />}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الجوامع وتفصيلها" : "Principles & their Tafsīl"}</h1>
          <p className="jw-lead">
            {ar
              ? "الجامعة أصلٌ يجمع معنًى في القرآن. تفصيلُها: الآياتُ التي تُبيِّنه أو تُمثِّل له أو تذكر جزاءه أو تؤكِّده. والآيةُ التي تُفصِّل غيرَها هي تفصيلٌ لا جامعة — لذلك نعرض هنا الأصولَ الجامعة، وتفصيلُها تابعٌ لها بالنقر."
              : "A جامعة is a root that gathers a meaning; its تفصيل are the verses that clarify, exemplify, requite or restate it. A verse that elaborates another is تفصيل — not a جامعة — so here we show the roots, their تفصيل nested by tap."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(rootCount)}</b> {ar ? "جامعة (أصل)" : "root principles"}</span>
            <span className="chip"><b>{num(jw.meta.principles - rootCount)}</b> {ar ? "تفصيلٌ تابع" : "nested tafsīl"}</span>
            <Link
              to="/muhkamat"
              className="chip link gold"
              style={{ textDecoration: "none" }}
              title={ar ? "التنظيم الأعلى: كبرى ← محكمة ← جامعة ← تفصيل" : "the higher organization: كبرى → محكمة → جامعة → تفصيل"}
            >
              {ar ? "↑ المحكمات" : "↑ Muḥkamāt"}
            </Link>
            <Link to="/gaps" className="chip link" style={{ textDecoration: "none" }} title={ar ? "تفصيلٌ محتملٌ لم يُؤكَّد" : "possible-but-unconfirmed tafsil"}>
              {ar ? "قد يُكمله ←" : "possibly completes it →"}
            </Link>
            <Link to="/lexicon" className="chip link" style={{ textDecoration: "none" }} title={ar ? "بصمة كل نوع من الجوامع" : "each kind's fingerprint"}>
              {ar ? "معجم الجوامع ←" : "lexicon →"}
            </Link>
          </div>
          {example && (
            <div className="jw-example" aria-hidden={false}>
              <span className="jw-example-lbl">{ar ? "مثال" : "e.g."}</span>
              <span className="quran jw-example-text">
                {texts.get(example.loc)?.textClean ?? arName(example.loc)}
              </span>
              <span className="jw-example-meta">
                {arName(example.loc)} · {ar ? `جامعة ← تفصيلها ${num(example.n)} آية` : `a root → ${num(example.n)} verses`}
              </span>
            </div>
          )}
        </header>

        <PageSearch
          value={q}
          onChange={setQ}
          placeholder={ar ? "ابحث بكلمةٍ أو معنى (مثل: الزنى)…" : "search by any word…"}
        />
        <div className="jw-filters">
          <div className="jw-chipset">
            <span className="jw-filter-lbl">{ar ? "العرض" : "show"}</span>
            <button
              className={view === "roots" ? "on" : ""}
              onClick={() => setView("roots")}
              title={ar ? "الأصول الجامعة فقط (لا التفصيل)" : "root principles only"}
            >
              {ar ? `الأصول (${num(rootCount)})` : `roots (${num(rootCount)})`}
            </button>
            <button
              className={view === "all" ? "on" : ""}
              onClick={() => setView("all")}
              title={ar ? "كل الآيات المترابطة، أصولًا وتفصيلًا" : "every linked verse"}
            >
              {ar ? `الكل (${num(jw.meta.principles)})` : `all (${num(jw.meta.principles)})`}
            </button>
          </div>
          <div className="jw-chipset">
            <span className="jw-filter-lbl">{ar ? "النوع" : "kind"}</span>
            <button className={kind === "" ? "on" : ""} onClick={() => setKind("")} title={ar ? "أظهر كل الأنواع" : "show all kinds"}>
              {ar ? "الكل" : "all"}
            </button>
            {KINDS.map((k) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(kind === k ? "" : k)} title={ar ? `أظهر جوامع «${k}» فقط` : `only «${k}»`}>
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="muted jw-resultcount">
          {num(rows.length)} {ar ? "آية" : "verses"}
          {resolvedRoot && resolvedRoot !== q.trim() && (
            <span
              className="chip gold"
              style={{ marginInlineStart: 8 }}
              title={
                ar
                  ? "طابقنا كلمتك بجذرها القرآني فبحثنا في كل مشتقّاته"
                  : "matched your word to its Quranic root"
              }
            >
              {ar ? "الجذر" : "root"}: <span className="quran">{resolvedRoot}</span>
              {rootAyahs.size > 0 && (
                <> · {num(rootAyahs.size)} {ar ? "آية بالجذر" : "by root"}</>
              )}
            </span>
          )}
        </div>

        <div className="jw-list">
          {rows.slice(0, limit).map(([loc, p]) => (
            <Card
              key={loc}
              hub={loc}
              p={p}
              texts={texts}
              open={open === loc}
              onToggle={() => setOpen(open === loc ? null : loc)}
            />
          ))}
        </div>
        {rows.length > limit && (
          <div style={{ textAlign: "center", margin: "18px 0" }}>
            <button onClick={() => setLimit(limit + 100)}>
              {ar
                ? `عرض المزيد (${num(rows.length - limit)})`
                : `show more (${rows.length - limit})`}
            </button>
          </div>
        )}

        {/* the advanced network lenses live on their own page (إحصاءات →
            تحليلات الشبكة), not cluttering the browse — one quiet link. */}
        <div style={{ textAlign: "center", margin: "26px 0 4px" }}>
          <Link to="/jawami/lenses" className="chip link" style={{ textDecoration: "none" }}>
            {ar ? "تحليلاتٌ متقدّمة للشبكة (للباحثين) ←" : "advanced network analytics →"}
          </Link>
        </div>
      </div>
    </div>
  );
}
