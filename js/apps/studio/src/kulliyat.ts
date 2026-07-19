/**
 * الكلّيّات والجوامع والتفصيل — v3 (2026-07-19): الوسم من الشبكة الموحدة
 * المفحوصة بالسياق (٩٬٤٩٤ صلة موجهة + ١٬٣١٢ توكيدًا متبادلًا) والمحاور
 * المنبثقة (٢٠٦ بثبات ٩٩٫٦٪). نسخة أولى قبل موجات التعميق — تقرير المعايرة
 * وامتحان العينة المصونة منشوران في findings/unified/TUNE-REPORT.md.
 * الواجهة البرمجية القديمة أُبقيت كما هي؛ الميزان الموزون القديم أُزيل نهائيًّا.
 */
import { useEffect, useState } from "react";

export type Tier = "كلّية" | "جامعة" | "تفصيل";
export interface Signals {
  tawhid: number;
  cent: number;
  gen: number;
  selfstand: number;
  norm: number;
  breadth: number;
}
export interface VerseClass {
  tier: Tier;
  jamiya: number; // 0..1 — ترتيب عرضٍ مشتق من (م، ت، مثانٍ) لا «درجة ميزان»
  theme: number;
  parent: string | null;
  sig: Signals;
  /** أدلة v3 المعلنة */
  m?: number; // عدد المفصلات الموجهة
  T?: number; // اتساع المحاور
  mu?: number; // شركاء التوكيد المتبادل
  rels?: Record<string, string[]>; // العلاقات الأربع بمواضعها
  mutual?: string[]; // شركاء التوكيد المتبادل بمواضعهم
  gates?: string[];
}
interface Payload {
  meta: { verses: number; themes: number; cfg: Record<string, unknown>; themeNames?: string[][]; themeLabels?: string[] };
  verses: Record<string, VerseClass>;
}

const ZERO_SIG: Signals = { tawhid: 0, cent: 0, gen: 0, selfstand: 0, norm: 0, breadth: 0 };

let data: Payload | null = null;
let loading: Promise<Payload> | null = null;
let heads: Map<number, string> | null = null;
let children: Map<string, string[]> | null = null;
let themeHead: Map<number, string> | null = null;
let themeSize: Map<number, number> | null = null;

interface EvUnit { u: string; g?: string[]; links?: Record<string, string[]> }
interface Evidence { meta: Record<string, unknown>; verses: Record<string, EvUnit[]>; mutual?: Record<string, string[]>; ax?: Record<string, number> }
interface Ranks { meta: { thresholds: Record<string, number> }; ranks: Record<string, { r: string; m: number; T: number; mu: number }> }
interface Axes { meta: Record<string, unknown>; axes: { id: number; size: number; topLocs: string[]; label: string }[] }

export function loadKulliyat(): Promise<Payload> {
  if (data) return Promise.resolve(data);
  const v = `?v=${__DATA_VERSION__}`;
  loading ??= Promise.all([
    fetch(`${import.meta.env.BASE_URL}v3-evidence.json${v}`).then((r) => r.json() as Promise<Evidence>),
    fetch(`${import.meta.env.BASE_URL}ranks-v1.json${v}`).then((r) => r.json() as Promise<Ranks>),
    fetch(`${import.meta.env.BASE_URL}axes-v1.json${v}`).then((r) => r.json() as Promise<Axes>),
  ])
    .then(([ev, ranks, axes]) => {
      const axisHead = new Map<number, string>();
      const themeLabels: string[] = [];
      let maxAxis = 0;
      for (const a of axes.axes) {
        axisHead.set(a.id, a.topLocs[0]);
        themeLabels[a.id] = a.label;
        if (a.id > maxAxis) maxAxis = a.id;
      }
      const verses: Record<string, VerseClass> = {};
      for (const [loc, units] of Object.entries(ev.verses)) {
        const rels: Record<string, string[]> = {};
        let m = 0;
        const gates = new Set<string>();
        for (const u of units) {
          for (const g of u.g ?? []) gates.add(g);
          for (const [rel, locs] of Object.entries(u.links ?? {})) {
            rels[rel] = [...new Set([...(rels[rel] ?? []), ...locs])];
          }
        }
        for (const locs of Object.values(rels)) m += locs.length;
        const rk = ranks.ranks[loc];
        const mu = (ev.mutual?.[loc] ?? []).length;
        const T = rk?.T ?? 0;
        const tier: Tier = rk?.r === "كلية" ? "كلّية" : rk?.r === "جامعة" ? "جامعة" : "تفصيل";
        const theme = ev.ax?.[loc] ?? -1;
        verses[loc] = {
          tier,
          jamiya: Math.min(1, (m * 2 + T * 4 + mu * 2) / 60),
          theme,
          parent: null,
          sig: ZERO_SIG,
          m, T, mu,
          rels,
          mutual: ev.mutual?.[loc] ?? [],
          gates: [...gates],
        };
      }
      data = {
        meta: {
          verses: Object.keys(verses).length,
          themes: maxAxis + 1,
          cfg: {
            model: "unified-context-network v3",
            note: "نسخة أولى قبل موجات التعميق — كل صلة فُحصت بنوافذ وحدات السياق؛ التقارير منشورة",
          },
          themeLabels,
        },
        verses,
      };
      // الأبوة من الصلات المفحوصة وحدها (جرد 2026-07-19): الأب قاعدةٌ ثبت
      // أن هذه الآية تفصّلها؛ يقدَّم أبٌ كليةٌ ثم الأوسع أدلةً — لا أبوة بعضوية محور.
      const examinedParents = new Map<string, string[]>();
      for (const [ploc, pv] of Object.entries(verses)) {
        if (pv.tier === "تفصيل") continue;
        for (const locs of Object.values(pv.rels ?? {})) for (const c of locs) {
          if (c === ploc || !verses[c]) continue;
          const list = examinedParents.get(c) ?? [];
          list.push(ploc);
          examinedParents.set(c, list);
        }
      }
      for (const [loc, vc] of Object.entries(verses)) {
        const ps = examinedParents.get(loc);
        if (!ps?.length) continue;
        ps.sort((a, b) => {
          const ka = verses[a].tier === "كلّية" ? 0 : 1;
          const kb = verses[b].tier === "كلّية" ? 0 : 1;
          return ka - kb || (verses[b].m ?? 0) - (verses[a].m ?? 0) || (a < b ? -1 : 1);
        });
        vc.parent = ps[0];
      }
      heads = new Map();
      children = new Map();
      themeHead = new Map();
      themeSize = new Map();
      for (const [loc, vc] of Object.entries(verses)) {
        if (vc.theme >= 0) {
          themeSize.set(vc.theme, (themeSize.get(vc.theme) ?? 0) + 1);
          const cur = themeHead.get(vc.theme);
          if (cur === undefined || vc.jamiya > verses[cur].jamiya) themeHead.set(vc.theme, loc);
          if (vc.tier === "كلّية" && !heads.has(vc.theme)) heads.set(vc.theme, loc);
        }
        if (vc.parent && verses[vc.parent]) {
          const list = children.get(vc.parent) ?? [];
          list.push(loc);
          children.set(vc.parent, list);
        }
      }
      // محور بلا كلّية: رأسه أعلى أعضائه
      for (const [t, h] of themeHead) if (!heads.has(t)) heads.set(t, h);
      return data;
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
export const kulliyaOfTheme = (theme: number): string | null => heads?.get(theme) ?? null;
export const childrenOf = (loc: string): string[] => children?.get(loc) ?? [];
export function themeMembers(theme: number): { kulliya: string | null; jawami: string[]; tafsil: string[] } {
  const jawami: string[] = [];
  const tafsil: string[] = [];
  const head = kulliyaOfTheme(theme);
  if (data) {
    for (const [loc, v] of Object.entries(data.verses)) {
      if (v.theme !== theme || loc === head) continue;
      if (v.tier === "جامعة" || v.tier === "كلّية") jawami.push(loc);
      else tafsil.push(loc);
    }
  }
  const byJamiya = (a: string, b: string) => (classOf(b)?.jamiya ?? 0) - (classOf(a)?.jamiya ?? 0);
  return { kulliya: head, jawami: jawami.sort(byJamiya), tafsil: tafsil.sort(byJamiya) };
}
export const kulliyatMeta = (): Payload["meta"] | null => data?.meta ?? null;
export function kulliyatWeights(): Record<string, number> {
  return {};
}

export function themeName(theme: number): string {
  return data?.meta.themeLabels?.[theme] ?? "";
}
export const themeHeadOf = (theme: number): string | null => themeHead?.get(theme) ?? null;
export const themeSizeOf = (theme: number): number => themeSize?.get(theme) ?? 0;

export function themesList(): { theme: number; name: string; head: string | null; size: number; jamiya: number }[] {
  if (!data) return [];
  const out: { theme: number; name: string; head: string | null; size: number; jamiya: number }[] = [];
  for (let t = 0; t < data.meta.themes; t++) {
    const head = themeHeadOf(t);
    if (!head) continue;
    out.push({ theme: t, name: themeName(t), head, size: themeSizeOf(t), jamiya: classOf(head)?.jamiya ?? 0 });
  }
  return out.sort((a, b) => b.size - a.size || b.jamiya - a.jamiya);
}
export function themeVerses(theme: number): string[] {
  if (!data) return [];
  const out: string[] = [];
  for (const [loc, v] of Object.entries(data.verses)) if (v.theme === theme) out.push(loc);
  return out.sort((a, b) => (data!.verses[b].jamiya) - (data!.verses[a].jamiya));
}
export function subtreeCounts(loc: string): { jamia: number; tafsil: number } {
  let jamia = 0, tafsil = 0;
  for (const c of childrenOf(loc)) {
    const t = classOf(c)?.tier;
    if (t === "جامعة") jamia++;
    else if (t === "تفصيل") tafsil++;
  }
  return { jamia, tafsil };
}

/** الكلّيّة التي تنتسب إليها الآية عبر سلسلة النسب المفحوص وحدها —
 *  لا ادعاء برأس المحور (جرد 2026-07-19). */
export function kulliyaOf(loc: string): string | null {
  let cur = loc;
  for (let guard = 0; guard < 12; guard++) {
    const v = data?.verses[cur];
    if (!v) return null;
    if (v.tier === "كلّية") return cur;
    if (!v.parent) return null;
    cur = v.parent;
  }
  return null;
}

export function kulliyatList(): { loc: string; theme: number; jamiya: number; size: number }[] {
  if (!data) return [];
  const out: { loc: string; theme: number; jamiya: number; size: number }[] = [];
  for (const [loc, v] of Object.entries(data.verses)) if (v.tier === "كلّية") out.push({ loc, theme: v.theme, jamiya: v.jamiya, size: v.theme >= 0 ? themeSizeOf(v.theme) : 0 });
  return out.sort((a, b) => b.jamiya - a.jamiya);
}
export function allVerseLocs(): string[] {
  if (!data) return [];
  return Object.keys(data.verses).sort((a, b) => data!.verses[b].jamiya - data!.verses[a].jamiya);
}
export function tierList(tier: Tier): string[] {
  if (!data) return [];
  const out: string[] = [];
  for (const [loc, v] of Object.entries(data.verses)) if (v.tier === tier) out.push(loc);
  return out.sort((a, b) => (data!.verses[b].jamiya) - (data!.verses[a].jamiya));
}
export function tierCounts(): { kulliya: number; jamia: number; tafsil: number } {
  const c = { kulliya: 0, jamia: 0, tafsil: 0 };
  if (data) for (const v of Object.values(data.verses)) v.tier === "كلّية" ? c.kulliya++ : v.tier === "جامعة" ? c.jamia++ : c.tafsil++;
  return c;
}
