/**
 * المحكمات الجامعة — the third layer above محكم→تفصيل. The 1032 principle-verses
 * were clustered into 40 major «كبرى», then each cluster was adversarially
 * verified and split until only one meaning binds it — 129 محكمات. From
 * muhkamat.json; no tafsīr. Hierarchy: كبرى ← محكمة ← جوامع ← تفصيل.
 */
import { useEffect, useState } from "react";

export interface Muhkama {
  title: string;
  theme: string;
  umm: string; // the mother principle-verse "s:a"
  members: string[]; // the جوامع under it (includes umm)
}
export interface Kubra {
  title: string;
  coherent: boolean;
  muhkamat: Muhkama[];
}
export interface MuhkamatData {
  meta: {
    kubra: number;
    muhkamat: number;
    principles: number;
    network: { nodes: number; giantPct: number; avgHops: number };
  };
  kubra: Kubra[];
}

let cache: MuhkamatData | null = null;
let loading: Promise<MuhkamatData> | null = null;

export function loadMuhkamat(): Promise<MuhkamatData> {
  if (cache) return Promise.resolve(cache);
  loading ??= fetch(`${import.meta.env.BASE_URL}muhkamat.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`muhkamat: ${r.status}`))))
    .then((d: MuhkamatData) => (cache = d))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function useMuhkamat(): MuhkamatData | null {
  const [data, setData] = useState<MuhkamatData | null>(cache);
  useEffect(() => {
    let live = true;
    loadMuhkamat().then((d) => live && setData(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return data;
}

/** جوامع count across a كبرى's محكمات. */
export const jawamiCount = (kb: Kubra): number =>
  (kb.muhkamat ?? []).reduce((s, m) => s + (m.members?.length ?? 0), 0);
