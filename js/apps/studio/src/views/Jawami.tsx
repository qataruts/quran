/**
 * الآيات الجوامع — the flagship view. Browse the principle-verses (محكمات) and,
 * for each, the verses that elaborate it: «نُفصِّل القرآنَ بالقرآن». Built from
 * our own three-pass, adversarially-reviewed network — no tafsīr, no ḥadīth.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  GRADE_INFO,
  REL_INFO,
  convergenceRanked,
  elaborates,
  indegreeOf,
  mirrorPairs,
  relationHubs,
  tafsilOf,
  useJawami,
  type Grade,
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
import type { AyahDoc } from "../types";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";

const KINDS = ["حكم", "أخلاق", "عقيدة", "سنة", "وعد"] as const;
const GRADES: Grade[] = ["أصل جامع", "متفرّع", "موجز", "مجرّد"];
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
    <Link to={readPathOf(loc)} className="jw-verse">
      {rel && (
        <span
          className="jw-reldot"
          style={{ background: REL_INFO[rel].color }}
        />
      )}
      <span className="jw-verse-ref">{arName(loc)}</span>
      <span className="jw-verse-text quran">{d?.textClean ?? loc}</span>
    </Link>
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
      <button className="jw-cardhead" onClick={onToggle}>
        <span className="jw-ref">{arName(hub)}</span>
        {p.kind && <span className="chip">{p.kind}</span>}
        {p.grade && (
          <span className="chip gold" title={GRADE_INFO[p.grade]?.note}>
            {p.grade}
          </span>
        )}
        {p.tahrim ? <span className="chip">تحريم</span> : null}
        <span className="spacer" />
        {deg > 0 && (
          <span className="jw-deg">
            {num(deg)} {getUILang() === "ar" ? "تفصيل" : "tafsil"}
          </span>
        )}
        <span className="jw-caret">{open ? "▾" : "◂"}</span>
      </button>
      <Link to={readPathOf(hub)} className="jw-cardtext quran">
        {d?.textUthmani ?? hub}
        <span className="ayah-marker"> ﴿{num(hub.split(":")[1])}﴾</span>
      </Link>
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
  return (
    <div className={`jw-card${open ? " open" : ""}`}>
      <button className="jw-cardhead" onClick={() => setOpen(!open)}>
        <span className="jw-ref">{arName(hub)}</span>
        {badge && <span className="chip gold">{badge}</span>}
        <span className="spacer" />
        <span className="jw-deg">{num(count)}</span>
        <span className="jw-caret">{open ? "▾" : "◂"}</span>
      </button>
      <div className="jw-cardtext quran" style={{ fontSize: 19 }}>
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
          ? "الشبكة مقسّمةً حسب نوع العلاقة: توكيدٌ (تقرير القاعدة بصياغة أخرى) · بيانٌ · جزاءٌ · مثال. لكل نوعٍ الجوامعُ الأكثر ارتباطًا به."
          : "The network sliced by relation: restatement (توكيد), clarification, requital, instance. For each, the most-connected principles."}
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
        {num(hubs.length)} {ar ? "جامعة" : "principles"}
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
          ? "آياتٌ تلتقي عندها عدةُ قواعدَ جامعة — كلّما كثُر عددُ الجوامع التي تُفصِّلها الآية، كانت أشدَّ مركزيةً في نظم القرآن."
          : "Verses where several principles converge — the more جوامع elaborate a verse, the more central it is to the Quran's weave."}
      </p>
      <div className="muted jw-resultcount">
        {num(items.length)}{" "}
        {ar
          ? "نقطة التقاء (تُفصِّلها جامعتان فأكثر)"
          : "convergence points (≥2 principles)"}
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

type Tab = "list" | "relations" | "convergence" | "mathani";

export default function Jawami() {
  useUILang();
  const jw = useJawami();
  const [tab, setTab] = useState<Tab>("list");
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [kind, setKind] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  // ayahs sharing the (fuzzily-resolved) root of the typed word, so «الزنى»
  // matches آيات زاني/زانية — broad letter search, no exact form needed.
  const [rootAyahs, setRootAyahs] = useState<Set<string>>(new Set());
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);

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

  const rows = useMemo(() => {
    if (!jw) return [];
    const all = Object.entries(jw.principles) as [string, Principle][];
    const filtered = all.filter(([loc, p]) => {
      if (kind && p.kind !== kind) return false;
      if (grade && p.grade !== grade) return false;
      if (q) {
        const d = texts.get(loc);
        const hay = `${arName(loc)} ${d?.textClean ?? ""}`;
        // match by text OR by the typed word's root (زنى → آيات الزاني/الزانية)
        if (!hay.includes(q) && !rootAyahs.has(loc)) return false;
      }
      return true;
    });
    // widest-branching first — the أصول جوامع surface at the top
    filtered.sort((a, b) => tafsilOf(b[0]).length - tafsilOf(a[0]).length);
    return filtered;
  }, [jw, kind, grade, q, texts, rootAyahs]);

  useEffect(() => setLimit(60), [kind, grade, q]);

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
  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">
            {ar ? "الآيات الجوامع" : "The Principle Verses"}
          </h1>
          <p className="jw-lead">
            {ar
              ? "نُفصِّل القرآنَ بالقرآن — لكل آية جامعة، الآياتُ التي تُبيِّنها أو تُمثِّل لها أو تُفصِّل جزاءها أو تؤكِّدها. من نصّ القرآن وصرفه وحدهما."
              : "Explaining the Qur'an by the Qur'an — for each principle verse, the verses that clarify, exemplify, requite, or restate it. From the Qur'anic text and its morphology alone."}
          </p>
          <div className="jw-stats">
            <span className="chip">
              <b>{num(jw.meta.principles)}</b> {ar ? "آية جامعة" : "principles"}
            </span>
            <span className="chip">
              <b>{num(jw.meta.hubs)}</b> {ar ? "لها تفصيل" : "with tafsil"}
            </span>
            <span className="chip">
              <b>{num(jw.meta.links)}</b>{" "}
              {ar ? "رابط مُراجَع" : "reviewed links"}
            </span>
            <Link to="/muhkamat" className="chip link gold" style={{ textDecoration: "none" }}>
              {ar ? "↑ المحكمات الجامعة" : "↑ governing principles"}
            </Link>
            <Link to="/gaps" className="chip link" style={{ textDecoration: "none" }}>
              {ar ? "قد يُكمله ←" : "possibly completes it →"}
            </Link>
            <Link to="/lexicon" className="chip link" style={{ textDecoration: "none" }}>
              {ar ? "معجم الجوامع ←" : "lexicon →"}
            </Link>
          </div>
        </header>

        <div className="jw-tabs">
          {(
            [
              [
                "list",
                ar ? "الجوامع" : "Principles",
                ar
                  ? "كل الآيات الجوامع، الأوسع تفصيلًا أولًا"
                  : "all principle verses",
              ],
              [
                "relations",
                ar ? "العلاقات" : "Relations",
                ar
                  ? "الشبكة مقسّمةً حسب نوع العلاقة: توكيد/بيان/جزاء/مثال"
                  : "network by relation type",
              ],
              [
                "convergence",
                ar ? "نقاط الالتقاء" : "Convergence",
                ar
                  ? "آياتٌ تلتقي عندها عدةُ جوامع تُفصِّلها"
                  : "verses many principles elaborate",
              ],
              [
                "mathani",
                ar ? "المثاني" : "Mathānī",
                ar
                  ? "آيتان يُفصِّل كلٌّ منهما الأخرى"
                  : "verse pairs that elaborate each other",
              ],
            ] as [Tab, string, string][]
          ).map(([key, lbl, tip]) => (
            <button
              key={key}
              className={tab === key ? "on" : ""}
              onClick={() => setTab(key)}
              title={tip}
            >
              {lbl}
            </button>
          ))}
        </div>

        {tab === "list" && (
          <>
            <div className="jw-filters">
              <input
                placeholder={
                  ar
                    ? "ابحث بكلمة أو معنى (مثل: الزنى)…"
                    : "Search by any word…"
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                title={
                  ar
                    ? "ابحث بالنصّ أو باسم السورة أو بأيّ كلمة (تُطابَق بجذرها)"
                    : "text, surah, or any word (matched by root)"
                }
              />
              <div className="jw-chipset">
                <button
                  className={kind === "" ? "on" : ""}
                  onClick={() => setKind("")}
                  title={
                    ar
                      ? "فلتر النوع: أظهر كل الأنواع"
                      : "filter: show all kinds"
                  }
                >
                  {ar ? "كل الأنواع" : "all kinds"}
                </button>
                {KINDS.map((k) => (
                  <button
                    key={k}
                    className={kind === k ? "on" : ""}
                    onClick={() => setKind(kind === k ? "" : k)}
                    title={
                      ar
                        ? `فلتر النوع: أظهر جوامع «${k}» فقط`
                        : `filter: show only «${k}» principles`
                    }
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="jw-chipset">
                <button
                  className={grade === "" ? "on" : ""}
                  onClick={() => setGrade("")}
                  title={
                    ar
                      ? "فلتر الدرجة: أظهر كل الدرجات"
                      : "filter: show all grades"
                  }
                >
                  {ar ? "كل الدرجات" : "all grades"}
                </button>
                {GRADES.map((g) => (
                  <button
                    key={g}
                    className={grade === g ? "on gold" : "gold"}
                    onClick={() => setGrade(grade === g ? "" : g)}
                    title={
                      ar
                        ? `فلتر الدرجة: أظهر «${g}» فقط`
                        : `filter: show only grade «${g}»`
                    }
                  >
                    {g}
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
                  {ar ? "الجذر" : "root"}:{" "}
                  <span className="quran">{resolvedRoot}</span>
                  {rootAyahs.size > 0 && (
                    <>
                      {" "}
                      · {num(rootAyahs.size)} {ar ? "آية بالجذر" : "by root"}
                    </>
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
          </>
        )}

        {tab === "relations" && <RelationLens texts={texts} />}
        {tab === "convergence" && <Convergence texts={texts} />}
        {tab === "mathani" && <Mathani texts={texts} />}
      </div>
    </div>
  );
}
