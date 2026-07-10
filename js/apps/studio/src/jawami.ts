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
  loading ??= fetch(`${import.meta.env.BASE_URL}jawami.json?v=${__DATA_VERSION__}`)
    .then((r) => {
      if (!r.ok) throw new Error(`jawami.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((p: Payload) => {
      data = p;
      reverse = new Map();
      for (const [hub, links] of Object.entries(p.tafsil)) {
        for (const [loc, rel] of links) {
          const list = reverse.get(loc) ?? [];
          list.push({ loc: hub, rel });
          reverse.set(loc, list);
        }
      }
      return p;
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** React hook: null until the network is loaded, then the full payload. */
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

/** Reviewer-suggested missing تفصيل for a hub (may be empty). */
export function gapsOf(loc: string): string[] {
  return data?.gaps[loc] ?? [];
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
