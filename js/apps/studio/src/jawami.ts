/**
 * The محكم→تفصيل layer for the app: loads the compact network (jawami.json)
 * once and exposes it both ways — a جامعة → its تفصيل set, and any āyah → the
 * جوامع it elaborates. This is the flagship layer: «نُفصِّل القرآنَ بالقرآن».
 *
 * Data provenance: Pass A (classify) → Pass B (attach) → Pass C (adversarial
 * review). Only surviving links (review ≠ reject, reweights applied) are here.
 */
import { useEffect, useState } from "react";

export type Rel = "بيان" | "مثال" | "جزاء" | "توكيد";
export type Grade = "أصل جامع" | "متفرّع" | "موجز" | "مجرّد";

export interface Principle {
  kind: string | null;
  grade: Grade | null;
  tahrim?: 1;
  hasr?: 1;
  amr?: 1;
}
export interface Link {
  loc: string;
  rel: Rel;
}
interface Payload {
  meta: {
    principles: number;
    hubs: number;
    links: number;
    rels: Rel[];
    grades: Grade[];
  };
  principles: Record<string, Principle>;
  tafsil: Record<string, [string, Rel][]>;
  gaps: Record<string, string[]>;
}

let data: Payload | null = null;
let loading: Promise<Payload> | null = null;
/** loc → hubs it elaborates (reverse index, built once). */
let reverse: Map<string, Link[]> | null = null;

export function loadJawami(): Promise<Payload> {
  if (data) return Promise.resolve(data);
  // v3 (2026-07-19): الطبقة تُركّب من الشبكة الموحدة المفحوصة بالسياق —
  // ملف الجيل الأول jawami.json لم يعد يُقرأ (أرشيف).
  const v = `?v=${__DATA_VERSION__}`;
  loading ??= Promise.all([
    fetch(`${import.meta.env.BASE_URL}v3-evidence.json${v}`).then((r) => r.json()),
    fetch(`${import.meta.env.BASE_URL}ranks-v1.json${v}`).then((r) => r.json()),
  ])
    .then(([ev, ranks]: [{ verses: Record<string, { u: string; g?: string[]; links?: Record<string, string[]> }[]> }, { ranks: Record<string, { r: string }> }]) => {
      const principles: Record<string, Principle> = {};
      const tafsil: Record<string, [string, Rel][]> = {};
      let links = 0;
      for (const [loc, units] of Object.entries(ev.verses)) {
        const out: [string, Rel][] = [];
        const seen = new Set<string>();
        for (const u of units) {
          for (const [rel, locs] of Object.entries(u.links ?? {})) {
            for (const c of locs) {
              if (seen.has(c)) continue;
              seen.add(c);
              out.push([c, rel as Rel]);
            }
          }
        }
        if (out.length) {
          tafsil[loc] = out;
          links += out.length;
        }
        const rk = ranks.ranks[loc]?.r;
        if (out.length || rk === "كلية" || rk === "جامعة") {
          principles[loc] = {
            kind: rk === "كلية" ? "كلّية" : rk === "جامعة" ? "جامعة" : "قاعدة مؤهّلة",
            grade: rk === "كلية" ? "أصل جامع" : rk === "جامعة" ? "متفرّع" : null,
          };
        }
      }
      data = {
        meta: { principles: Object.keys(principles).length, hubs: Object.keys(tafsil).length, links, rels: ["بيان", "مثال", "جزاء", "توكيد"], grades: ["أصل جامع", "متفرّع", "موجز", "مجرّد"] },
        principles,
        tafsil,
        gaps: {},
      };
      reverse = new Map();
      for (const [hub, list] of Object.entries(data.tafsil)) {
        for (const [loc, rel] of list) {
          const arr = reverse.get(loc) ?? [];
          arr.push({ loc: hub, rel });
          reverse.set(loc, arr);
        }
      }
      return data;
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function useJawami(): Payload | null {
  const [p, setP] = useState<Payload | null>(data);
  useEffect(() => {
    let live = true;
    loadJawami()
      .then((d) => live && setP(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return p;
}

export const isPrinciple = (loc: string): boolean => !!data?.principles[loc];
export const principleOf = (loc: string): Principle | null => data?.principles[loc] ?? null;

/** What this جامعة elaborates into (forward). Empty if it has no تفصيل. */
export function tafsilOf(loc: string): Link[] {
  return (data?.tafsil[loc] ?? []).map(([l, rel]) => ({ loc: l, rel }));
}

/** Which جوامع this āyah elaborates (reverse). Empty if none. */
export function elaborates(loc: string): Link[] {
  return reverse?.get(loc) ?? [];
}

/**
 * A **جامعة (أصل)** in the strict, clear sense: a principle-verse that (a) has
 * its own تفصيل, and (b) is NOT itself a تفصيل of any other principle. Both
 * conditions matter — a verse that gathers nothing isn't a جامعة, and one that
 * elaborates another is تفصيل, not a root. This is the honest criterion behind
 * the الجوامع page (≈88 genuine roots).
 */
export function isRootPrinciple(loc: string): boolean {
  return (
    !!data?.principles[loc] &&
    (reverse?.get(loc)?.length ?? 0) === 0 &&
    (data?.tafsil[loc]?.length ?? 0) > 0
  );
}

/** Reviewer-suggested missing تفصيل for a hub (may be empty). */
export function gapsOf(loc: string): string[] {
  return data?.gaps[loc] ?? [];
}

/** How many جوامع cite this verse as their تفصيل (convergence indegree). */
export const indegreeOf = (loc: string): number => reverse?.get(loc)?.length ?? 0;

/** نقاط الالتقاء — verses ranked by how many distinct جوامع elaborate into them. */
export function convergenceRanked(min = 2): { loc: string; count: number; hubs: Link[] }[] {
  if (!reverse) return [];
  const out: { loc: string; count: number; hubs: Link[] }[] = [];
  for (const [loc, hubs] of reverse) if (hubs.length >= min) out.push({ loc, count: hubs.length, hubs });
  return out.sort((a, b) => b.count - a.count);
}

/** عدسة العلاقة — hubs ranked by how many links of one relation they carry. */
export function relationHubs(rel: Rel): { hub: string; count: number; links: Link[] }[] {
  if (!data) return [];
  const out: { hub: string; count: number; links: Link[] }[] = [];
  for (const [hub, links] of Object.entries(data.tafsil)) {
    const ls = links.filter(([, r]) => r === rel).map(([l, r]) => ({ loc: l, rel: r }));
    if (ls.length) out.push({ hub, count: ls.length, links: ls });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** الركائز المتقابلة — verse pairs that cite each other back (mirror pillars). */
export function mirrorPairs(): { a: string; b: string; relAB: Rel; relBA: Rel }[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: { a: string; b: string; relAB: Rel; relBA: Rel }[] = [];
  for (const [hub, links] of Object.entries(data.tafsil)) {
    for (const [t, rel] of links) {
      const back = data.tafsil[t]?.find(([bt]) => bt === hub);
      if (!back) continue;
      const key = [hub, t].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: hub, b: t, relAB: rel, relBA: back[1] });
    }
  }
  return out;
}

export const REL_INFO: Record<Rel, { en: string; note: string; color: string }> = {
  بيان: { en: "clarifies", note: "يفصّل الحكم وشروطه", color: "var(--accent)" },
  مثال: { en: "instance", note: "واقعة محكومة بالقاعدة", color: "var(--gold)" },
  جزاء: { en: "requital", note: "تفصيل الثواب أو العقاب", color: "#7a5cc0" },
  توكيد: { en: "restates", note: "تقرير القاعدة بصياغة أخرى", color: "var(--ink-2)" },
};

export const GRADE_INFO: Record<Grade, { note: string }> = {
  "أصل جامع": { note: "أصلٌ يتفرّع منه تفصيلٌ واسع" },
  "متفرّع": { note: "قاعدة تُفصِّل وتُفصَّل" },
  "موجز": { note: "قاعدة لها تفصيل يسير" },
  "مجرّد": { note: "قاعدة قائمة بذاتها" },
};
