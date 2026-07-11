/**
 * Word→root resolver for search. Loads search-forms.json once and resolves any
 * derived word (or its ال-stripped form) to its Arabic root, so the reader can
 * search «شقي» and reach root «شقو», or «الزنى» and reach «زني». The normalizer
 * MUST match scripts/export-search-forms.mjs exactly.
 */
import { useEffect, useState } from "react";
import { fuzzyRoots } from "./db";

const stripDiac = (s: string) => s.replace(/[ؐ-ًؚ-ْٰـۖ-ۭ]/g, "");
export const norm = (s: string) =>
  stripDiac(s).replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ة/g, "ه");
const stripAl = (s: string) => s.replace(/^(?:[وفبكل])?ال/, "");

let forms: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;

export function loadForms(): Promise<Record<string, string>> {
  if (forms) return Promise.resolve(forms);
  loading ??= fetch(`${import.meta.env.BASE_URL}search-forms.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`search-forms: ${r.status}`))))
    .then((d: Record<string, string>) => (forms = d))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function useSearchForms(): boolean {
  const [ready, setReady] = useState<boolean>(!!forms);
  useEffect(() => {
    let live = true;
    loadForms().then(() => live && setReady(true)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/** The root a query word derives from (null before load or if unknown). */
export function resolveRoot(query: string): string | null {
  if (!forms) return null;
  const q = query.trim();
  if (!q) return null;
  return forms[norm(q)] ?? forms[norm(stripAl(q))] ?? null;
}

/** Resolve a typed word to a root by FUZZY letter-closeness over the roots in
 *  the (always-loaded) DB — broad, not exact: any word/partial/misspelling maps
 *  to the nearest root by its letters (شقي→شقو, الزنى→زني). No separate fetch. */
export async function resolveRootReady(query: string): Promise<string | null> {
  const hits = await fuzzyRoots(query, 1).catch(() => []);
  return hits[0]?.doc.root ?? null;
}
