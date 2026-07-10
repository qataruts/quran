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
  elaborates,
  tafsilOf,
  useJawami,
  type Grade,
  type Rel,
} from "../jawami";
import type { Principle } from "../jawami";
import { ayahByLocationMap, surahNameAr } from "../db";
import type { AyahDoc } from "../types";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";

const KINDS = ["حكم", "أخلاق", "عقيدة", "سنة", "وعد"] as const;
const GRADES: Grade[] = ["أصل جامع", "متفرّع", "موجز", "مجرّد"];
const REL_ORDER: Rel[] = ["بيان", "مثال", "جزاء", "توكيد"];

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/** A verse row inside an expanded panel: its ref + a text preview. */
function VerseRow({ loc, texts, rel }: { loc: string; texts: Map<string, AyahDoc>; rel?: Rel }) {
  const d = texts.get(loc);
  return (
    <Link to={readPathOf(loc)} className="jw-verse">
      {rel && <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />}
      <span className="jw-verse-ref">{arName(loc)}</span>
      <span className="jw-verse-text quran">{d?.textClean ?? loc}</span>
    </Link>
  );
}

function TafsilPanel({ hub, texts }: { hub: string; texts: Map<string, AyahDoc> }) {
  useUILang();
  const links = tafsilOf(hub);
  const back = elaborates(hub);
  const byRel = REL_ORDER.map((rel) => ({ rel, items: links.filter((l) => l.rel === rel) })).filter(
    (g) => g.items.length,
  );
  return (
    <div className="jw-panel">
      {byRel.map(({ rel, items }) => (
        <div key={rel} className="jw-relgroup">
          <div className="jw-relhead" style={{ color: REL_INFO[rel].color }}>
            <span className="jw-reldot" style={{ background: REL_INFO[rel].color }} />
            {rel} <span className="muted">· {REL_INFO[rel].note} · {num(items.length)}</span>
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

export default function Jawami() {
  useUILang();
  const jw = useJawami();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [kind, setKind] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    ayahByLocationMap().then(setTexts);
  }, []);

  const rows = useMemo(() => {
    if (!jw) return [];
    const all = Object.entries(jw.principles) as [string, Principle][];
    const filtered = all.filter(([loc, p]) => {
      if (kind && p.kind !== kind) return false;
      if (grade && p.grade !== grade) return false;
      if (q) {
        const d = texts.get(loc);
        const hay = `${arName(loc)} ${d?.textClean ?? ""}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // widest-branching first — the أصول جوامع surface at the top
    filtered.sort((a, b) => tafsilOf(b[0]).length - tafsilOf(a[0]).length);
    return filtered;
  }, [jw, kind, grade, q, texts]);

  useEffect(() => setLimit(60), [kind, grade, q]);

  if (!jw) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  const ar = getUILang() === "ar";
  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الآيات الجوامع" : "The Principle Verses"}</h1>
          <p className="jw-lead">
            {ar
              ? "نُفصِّل القرآنَ بالقرآن — لكل آية جامعة، الآياتُ التي تُبيِّنها أو تُمثِّل لها أو تُفصِّل جزاءها أو تؤكِّدها. من نصّ القرآن وصرفه وحدهما."
              : "Explaining the Qur'an by the Qur'an — for each principle verse, the verses that clarify, exemplify, requite, or restate it. From the Qur'anic text and its morphology alone."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(jw.meta.principles)}</b> {ar ? "آية جامعة" : "principles"}</span>
            <span className="chip"><b>{num(jw.meta.hubs)}</b> {ar ? "لها تفصيل" : "with tafsil"}</span>
            <span className="chip"><b>{num(jw.meta.links)}</b> {ar ? "رابط مُراجَع" : "reviewed links"}</span>
          </div>
        </header>

        <div className="jw-filters">
          <input
            placeholder={ar ? "ابحث في الجوامع…" : "Search principles…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="jw-chipset">
            <button className={kind === "" ? "on" : ""} onClick={() => setKind("")}>
              {ar ? "كل الأنواع" : "all kinds"}
            </button>
            {KINDS.map((k) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(kind === k ? "" : k)}>
                {k}
              </button>
            ))}
          </div>
          <div className="jw-chipset">
            <button className={grade === "" ? "on" : ""} onClick={() => setGrade("")}>
              {ar ? "كل الدرجات" : "all grades"}
            </button>
            {GRADES.map((g) => (
              <button key={g} className={grade === g ? "on gold" : "gold"} onClick={() => setGrade(grade === g ? "" : g)}>
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="muted jw-resultcount">
          {num(rows.length)} {ar ? "آية" : "verses"}
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
              {ar ? `عرض المزيد (${num(rows.length - limit)})` : `show more (${rows.length - limit})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
