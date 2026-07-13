/**
 * الكلّيّات والجوامع والتفصيل — the computed classification of every āyah, loaded
 * once from kulliyat.json (built by js/scripts/derive-kulliyat.mjs; see
 * docs/kulliyat-methodology.md). Every verse has a tier, a theme, its parent in
 * the theme tree, and its five signal-scores.
 */
import { useEffect, useState } from "react";

export type Tier = "كلّية" | "جامعة" | "تفصيل";
export interface Signals {
  tawhid: number;    // القربُ من محور التوحيد «لا إله إلا»
  cent: number;      // المعنى المركزيّ
  gen: number;       // عمومُ المفردات
  selfstand: number; // الاستقلالُ النحويّ
  norm: number;      // قوّةُ الإنشاء والتقرير
  breadth: number;   // السَّعةُ المفهوميّة
}
export interface VerseClass {
  tier: Tier;
  jamiya: number;    // 0..1
  theme: number;     // theme index
  parent: string | null; // nearest higher-tier verse in the theme (loc), or null for a theme head
  sig: Signals;
}
interface Payload {
  meta: { verses: number; themes: number; cfg: Record<string, unknown>; themeNames?: string[][]; themeLabels?: string[] };
  verses: Record<string, VerseClass>;
}

let data: Payload | null = null;
let loading: Promise<Payload> | null = null;
/** theme index -> its كلّية loc (built once) */
let heads: Map<number, string> | null = null;
/** loc -> child locs (reverse of parent, built once) */
let children: Map<string, string[]> | null = null;
/** theme index -> its representative (highest-جامعية) verse loc + its size */
let themeHead: Map<number, string> | null = null;
let themeSize: Map<number, number> | null = null;

export function loadKulliyat(): Promise<Payload> {
  if (data) return Promise.resolve(data);
  loading ??= fetch(`${import.meta.env.BASE_URL}kulliyat.json?v=${__DATA_VERSION__}`)
    .then((r) => {
      if (!r.ok) throw new Error(`kulliyat.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((p: Payload) => {
      data = p;
      heads = new Map();
      children = new Map();
      themeHead = new Map();
      themeSize = new Map();
      for (const [loc, v] of Object.entries(p.verses)) {
        if (v.tier === "كلّية") heads.set(v.theme, loc);
        themeSize.set(v.theme, (themeSize.get(v.theme) ?? 0) + 1);
        const cur = themeHead.get(v.theme);
        if (cur === undefined || v.jamiya > p.verses[cur].jamiya) themeHead.set(v.theme, loc);
        if (v.parent) {
          const list = children.get(v.parent) ?? [];
          list.push(loc);
          children.set(v.parent, list);
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

export function useKulliyat(): boolean {
  const [ready, setReady] = useState(data !== null);
  useEffect(() => {
    let live = true;
    loadKulliyat()
      .then(() => live && setReady(true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

export const classOf = (loc: string): VerseClass | null => data?.verses[loc] ?? null;
/** The كلّيّة (theme head) of the verse's theme. */
export const kulliyaOfTheme = (theme: number): string | null => heads?.get(theme) ?? null;
/** Direct children of a verse in the theme tree. */
export const childrenOf = (loc: string): string[] => children?.get(loc) ?? [];
/** All verses of a theme, grouped by tier. */
export function themeMembers(theme: number): { kulliya: string | null; jawami: string[]; tafsil: string[] } {
  const jawami: string[] = [];
  const tafsil: string[] = [];
  if (data) {
    for (const [loc, v] of Object.entries(data.verses)) {
      if (v.theme !== theme) continue;
      if (v.tier === "جامعة") jawami.push(loc);
      else if (v.tier === "تفصيل") tafsil.push(loc);
    }
  }
  const byJamiya = (a: string, b: string) => (classOf(b)?.jamiya ?? 0) - (classOf(a)?.jamiya ?? 0);
  return { kulliya: kulliyaOfTheme(theme), jawami: jawami.sort(byJamiya), tafsil: tafsil.sort(byJamiya) };
}
export const kulliyatMeta = (): Payload["meta"] | null => data?.meta ?? null;
/** The actual factor weights used to compute جامعية (from the run's config). */
export function kulliyatWeights(): Record<string, number> {
  const w = (data?.meta.cfg as { weights?: unknown })?.weights;
  return (w && typeof w === "object" ? w : {}) as Record<string, number>;
}

/** The theme's scholarly name (falls back to its distinctive roots). */
export function themeName(theme: number): string {
  const label = data?.meta.themeLabels?.[theme];
  if (label) return label;
  const tn = data?.meta.themeNames?.[theme];
  return tn && tn.length ? tn.join(" ") : "";
}
/** The theme's representative verse (its highest-جامعية member) and its size. */
export const themeHeadOf = (theme: number): string | null => themeHead?.get(theme) ?? null;
export const themeSizeOf = (theme: number): number => themeSize?.get(theme) ?? 0;
/** Count of جوامع and تفصيل verses anywhere below this verse in its tree. */
export function subtreeCounts(loc: string): { jamia: number; tafsil: number } {
  let jamia = 0, tafsil = 0;
  const walk = (l: string) => {
    for (const c of childrenOf(l)) {
      const t = classOf(c)?.tier;
      if (t === "جامعة") jamia++; else if (t === "تفصيل") tafsil++;
      walk(c);
    }
  };
  walk(loc);
  return { jamia, tafsil };
}

/** The كلّيّة this verse belongs under — walk the parent chain up to a كلّيّة. */
export function kulliyaOf(loc: string): string | null {
  let cur = loc;
  for (let guard = 0; guard < 25; guard++) {
    const v: VerseClass | undefined = data?.verses[cur];
    if (!v) return null;
    if (v.tier === "كلّية") return cur;
    if (!v.parent) return null;
    cur = v.parent;
  }
  return null;
}

/** All كلّيّات (theme heads), each with its theme size, sorted by جامعية. */
export function kulliyatList(): { loc: string; theme: number; jamiya: number; size: number }[] {
  if (!data) return [];
  const sizes = new Map<number, number>();
  for (const v of Object.values(data.verses)) sizes.set(v.theme, (sizes.get(v.theme) ?? 0) + 1);
  const out: { loc: string; theme: number; jamiya: number; size: number }[] = [];
  for (const [loc, v] of Object.entries(data.verses)) if (v.tier === "كلّية") out.push({ loc, theme: v.theme, jamiya: v.jamiya, size: sizes.get(v.theme) ?? 0 });
  return out.sort((a, b) => b.jamiya - a.jamiya);
}
/** Every classified verse loc, sorted by جامعية (desc) — for whole-Qur'an search. */
export function allVerseLocs(): string[] {
  if (!data) return [];
  return Object.keys(data.verses).sort((a, b) => data!.verses[b].jamiya - data!.verses[a].jamiya);
}
/** All locs of a given tier, sorted by جامعية (desc). */
export function tierList(tier: Tier): string[] {
  if (!data) return [];
  const out: string[] = [];
  for (const [loc, v] of Object.entries(data.verses)) if (v.tier === tier) out.push(loc);
  return out.sort((a, b) => (data!.verses[b].jamiya) - (data!.verses[a].jamiya));
}
/** Tier counts across the whole Qur'an. */
export function tierCounts(): { kulliya: number; jamia: number; tafsil: number } {
  const c = { kulliya: 0, jamia: 0, tafsil: 0 };
  if (data) for (const v of Object.values(data.verses)) v.tier === "كلّية" ? c.kulliya++ : v.tier === "جامعة" ? c.jamia++ : c.tafsil++;
  return c;
}
