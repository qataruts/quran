/**
 * فروق التنزيل — the Qur'an's near-identical verses.
 *  · «تطابق» (identical): a phrase like «الم» recurs in six suras → shown ONCE
 *    as one family of six, not fifteen redundant pairs.
 *  · every other kind is a clear TWO-verse comparison, aligned word by word with
 *    exactly what differs highlighted.
 * Computed from the text + roots alone; the reader judges. Composite («مركّب»)
 * pairs are dropped — no single verdict can be read from them.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import { CAT_INFO, CAT_ORDER, sides, useFuruq, type Furq } from "../furuq";
import PageSearch from "../components/PageSearch";
import { fuzzyMatch } from "../lib/fuzzy";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
const gpos = (loc: string) => {
  const [s, a] = loc.split(":").map(Number);
  return s * 1000 + a;
};

type Family = { kind: "family"; cat: string; text: string; verses: string[] };
type Pair = { kind: "pair"; f: Furq };
type Item = Family | Pair;
const itemPos = (it: Item) => (it.kind === "family" ? gpos(it.verses[0]) : gpos(it.f.a));

/** one verse row of a two-verse comparison, its unique words highlighted */
function VerseLine({ segs, side }: { segs: { text: string; diff: boolean }[]; side: "a" | "b" }) {
  return (
    <div className="fr-line quran">
      <span className="fr-tag">{side === "a" ? "أ" : "ب"}</span>
      {segs.map((s, i) => (
        <span key={i} className={s.diff ? `fr-diff fr-diff-${side}` : undefined}>{s.text}{" "}</span>
      ))}
    </div>
  );
}

function PairCard({ f }: { f: Furq }) {
  const { a, b } = useMemo(() => sides(f.ops), [f]);
  return (
    <div className="fr-card">
      <div className="fr-head">
        <Link to={readPathOf(f.a)} className="fr-ref">{arName(f.a)}</Link>
        <span className="fr-vs">↔</span>
        <Link to={readPathOf(f.b)} className="fr-ref">{arName(f.b)}</Link>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="chip gold" title={CAT_INFO[f.cat]?.note}>{f.cat}</span>
      </div>
      <VerseLine segs={a} side="a" />
      <VerseLine segs={b} side="b" />
    </div>
  );
}

/** «تطابق»: identical text shown once, with every place it occurs listed */
function FamilyCard({ fam }: { fam: Family }) {
  const ar = getUILang() === "ar";
  return (
    <div className="fr-card">
      <div className="fr-head">
        <Link to={readPathOf(fam.verses[0])} className="fr-ref">{arName(fam.verses[0])}</Link>
        <span className="fr-vs">↔ {num(fam.verses.length)} {ar ? "مواضع" : "places"}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="chip gold" title={CAT_INFO["تطابق"]?.note}>{ar ? "متطابقة" : "identical"}</span>
      </div>
      <div className="fr-line quran"><span className="fr-tag">≡</span> {fam.text}</div>
      <div className="fr-refs">
        {fam.verses.map((loc) => (
          <Link key={loc} to={readPathOf(loc)} className="fr-ref-sm">{arName(loc)}</Link>
        ))}
      </div>
    </div>
  );
}

export default function Furuq() {
  useUILang();
  const data = useFuruq();
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const ar = getUILang() === "ar";

  const base = useMemo<Furq[]>(() => (data ? data.furuq.filter((f) => f.cat !== "مركّب") : []), [data]);
  const locText = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of base) {
      const { a, b } = sides(f.ops);
      if (!m.has(f.a)) m.set(f.a, a.map((s) => s.text).join(" "));
      if (!m.has(f.b)) m.set(f.b, b.map((s) => s.text).join(" "));
    }
    return m;
  }, [base]);

  // تطابق → families by identical text; everything else → clean two-verse pairs
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const groups = new Map<string, Set<string>>();
    for (const f of base) {
      if (f.cat !== "تطابق") {
        out.push({ kind: "pair", f });
        continue;
      }
      const key = locText.get(f.a) ?? f.a;
      const g = groups.get(key) ?? groups.set(key, new Set()).get(key)!;
      g.add(f.a);
      g.add(f.b);
    }
    for (const [text, set] of groups)
      out.push({ kind: "family", cat: "تطابق", text, verses: [...set].sort((x, y) => gpos(x) - gpos(y)) });
    return out.sort((x, y) => itemPos(x) - itemPos(y));
  }, [base, locText]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) {
      const k = it.kind === "family" ? it.cat : it.f.cat;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const rows = useMemo(() => {
    return items.filter((it) => {
      const k = it.kind === "family" ? it.cat : it.f.cat;
      if (cat && k !== cat) return false;
      const locs = it.kind === "family" ? it.verses : [it.f.a, it.f.b];
      return fuzzyMatch(q, ...locs.map(arName), ...locs.map((l) => locText.get(l) ?? ""));
    });
  }, [items, cat, q, locText]);

  useEffect(() => setLimit(40), [cat, q]);

  if (!data) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "فروق التنزيل" : "Furūq al-Tanzīl"}</h1>
          <p className="jw-lead">
            {ar
              ? "المتشابهات اللفظية في القرآن: المتطابقةُ تُجمع في موضعٍ واحد، والمختلفةُ تُحاذى آيتين كلمةً بكلمة لنرى ما تغيّر — من نصّ القرآن وصرفه وحدهما."
              : "The Qur'an's near-identical verses: identical phrases gathered into one place, differing ones aligned two-by-two to show exactly what changed — from the text and its morphology alone."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(items.length)}</b> {ar ? "بطاقة" : "cards"}</span>
            <span className="chip"><b>{num(base.length)}</b> {ar ? "زوجًا واضحًا" : "clean pairs"}</span>
            <span className="chip"><b>{num(CAT_ORDER.length - 1)}</b> {ar ? "أنواع فروق" : "difference types"}</span>
          </div>
        </header>

        <PageSearch
          value={q}
          onChange={setQ}
          placeholder={ar ? "ابحث في الفروق: سورة · موضع · كلمة…" : "search the furūq: surah · ref · word…"}
        />
        <div className="jw-filters">
          <div className="jw-chipset">
            <button className={cat === "" ? "on" : ""} onClick={() => setCat("")} title={ar ? "كل الأنواع" : "all"}>
              {ar ? "الكل" : "all"} <span className="muted">· {num(items.length)}</span>
            </button>
            {CAT_ORDER.filter((c) => c !== "مركّب").map((c) => (
              <button
                key={c}
                className={cat === c ? "on" : ""}
                onClick={() => setCat(cat === c ? "" : c)}
                title={CAT_INFO[c]?.note}
              >
                {c === "تطابق" ? (ar ? "متطابقة" : "identical") : c} <span className="muted">· {num(catCounts[c] ?? 0)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="muted jw-resultcount">
          {num(rows.length)} {ar ? "بطاقة" : "cards"}
          {cat && CAT_INFO[cat] && <span> · {ar ? CAT_INFO[cat].note : CAT_INFO[cat].en}</span>}
        </div>

        <div className="fr-list">
          {rows.slice(0, limit).map((it, i) =>
            it.kind === "family" ? (
              <FamilyCard key={`f${it.verses[0]}${i}`} fam={it} />
            ) : (
              <PairCard key={`p${it.f.a}|${it.f.b}|${i}`} f={it.f} />
            ),
          )}
        </div>
        {rows.length > limit && (
          <div style={{ textAlign: "center", margin: "18px 0" }}>
            <button onClick={() => setLimit(limit + 60)}>
              {ar ? `عرض المزيد (${num(rows.length - limit)})` : `show more (${rows.length - limit})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
