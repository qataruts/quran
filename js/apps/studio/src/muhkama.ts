/**
 * muhkama-of — for any āyah, the root محكمات it belongs under. Because the raw
 * محكم→تفصيل graph is too densely linked to yield one clean parent (a verse
 * traces up to ~half the 88 roots, with cycles), we derive this offline
 * (js/scripts/derive-muhkama.mjs): among the roots a verse is graph-linked to,
 * the ones CLOSEST to it in meaning (Gemini embeddings). Loaded once, on demand.
 */
import { useEffect, useState } from "react";

export interface MuhkamaRef {
  loc: string;
  sim: number;
}
interface Entry {
  self?: true; // this verse IS a محكمة (root)
  muhkamat?: MuhkamaRef[];
}

let data: Record<string, Entry> | null = null;
let loading: Promise<Record<string, Entry>> | null = null;

export function loadMuhkama(): Promise<Record<string, Entry>> {
  if (data) return Promise.resolve(data);
  loading ??= fetch(`${import.meta.env.BASE_URL}muhkama-of.json?v=${__DATA_VERSION__}`)
    .then((r) => {
      if (!r.ok) throw new Error(`muhkama-of.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((d: Record<string, Entry>) => {
      data = d;
      return d;
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** React hook: re-renders once the map is loaded. */
export function useMuhkama(): boolean {
  const [ready, setReady] = useState(data !== null);
  useEffect(() => {
    let live = true;
    loadMuhkama()
      .then(() => live && setReady(true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/** The root محكمات this āyah belongs under (nearest in meaning), or []. */
export const muhkamatOf = (loc: string): MuhkamaRef[] => data?.[loc]?.muhkamat ?? [];
/** Is this āyah itself a محكمة (root)? */
export const isMuhkamaRoot = (loc: string): boolean => !!data?.[loc]?.self;
