/**
 * فروق التنزيل — the diff engine's output (public/furuq.json, ~2.5 MB, lazy):
 * near-identical verse pairs and, word by word, exactly what differs. Computed
 * from the Qur'anic text + its roots alone (LCS alignment + rule-based
 * classification) — no tafsīr, no «ملاك التأويل». See findings/FURUQ.md.
 */
import { useEffect, useState } from "react";

/** an alignment op: a shared word (string), or a word only in A (["-",w]) /
 *  only in B (["+",w]). */
export type Op = string | ["-" | "+", string];

export interface Furq {
  a: string; // location "s:a" of the first verse
  b: string; // location "s:a" of the second verse
  tier: "exact" | "near" | "phrase";
  cat: string; // تطابق · تقديم وتأخير · اختلاف صيغة · إبدال · زيادة/نقص · مركّب
  ops: Op[];
}

export interface FuruqData {
  meta: { pairs: number; categories: Record<string, number> };
  furuq: Furq[];
}

/** display order + a short note for each category. */
export const CAT_INFO: Record<string, { note: string; en: string; label?: string }> = {
  "تطابق": { note: "الآيتان متطابقتان لفظًا", en: "word-identical" },
  "تقديم وتأخير": { note: "الكلمات نفسها بترتيبٍ مختلف", en: "reordering" },
  "اختلاف صيغة": { note: "الجذر نفسه بصيغةٍ مختلفة", en: "same root, other form" },
  "إبدال": { note: "كلمةٌ مكان أخرى بجذرٍ مختلف", en: "lexical substitution" },
  // internal id keeps its old key; shown to readers as «زيادة وإيجاز» (إيجاز, a
  // balāgha virtue — not «نقص», which is unfitting for the Qur'an).
  "زيادة/نقص": { note: "زيادةٌ في إحداهما وإيجازٌ في الأخرى", en: "addition / concision", label: "زيادة وإيجاز" },
  "مركّب": { note: "أكثر من نوع فرقٍ معًا", en: "composite" },
};
/** reader-facing label for a category id (defaults to the id itself) */
export const catLabel = (cat: string): string => CAT_INFO[cat]?.label ?? cat;
export const CAT_ORDER = ["تطابق", "تقديم وتأخير", "اختلاف صيغة", "إبدال", "زيادة/نقص", "مركّب"];

let cache: FuruqData | null = null;
let loading: Promise<FuruqData> | null = null;

export function loadFuruq(): Promise<FuruqData> {
  if (cache) return Promise.resolve(cache);
  loading ??= fetch(`${import.meta.env.BASE_URL}furuq.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`furuq: ${r.status}`))))
    .then((d: FuruqData) => (cache = d))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function useFuruq(): FuruqData | null {
  const [data, setData] = useState<FuruqData | null>(cache);
  useEffect(() => {
    let live = true;
    loadFuruq().then((d) => live && setData(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return data;
}

export interface Seg { text: string; diff: boolean }
/** Reconstruct the two aligned word rows from the ops: each side's own words,
 *  with the ones unique to that side marked `diff`. */
export function sides(ops: Op[]): { a: Seg[]; b: Seg[] } {
  const a: Seg[] = [];
  const b: Seg[] = [];
  for (const op of ops) {
    if (typeof op === "string") {
      a.push({ text: op, diff: false });
      b.push({ text: op, diff: false });
    } else if (op[0] === "-") {
      a.push({ text: op[1], diff: true });
    } else {
      b.push({ text: op[1], diff: true });
    }
  }
  return { a, b };
}
