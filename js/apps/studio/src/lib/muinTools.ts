/**
 * المُعين's local tools — pure on-device retrieval over our own data (no tokens).
 * The planner (/api/chat) picks one; these run it and return the material.
 */
import { fuzzyRoots, getAyahByGlobalNo, getAyahByLocation, getRoot } from "../db";
import { loadVectors, meaningSearch } from "../semantic";
import type { ChatAyah, ChatRoot } from "../chat";
import type { RootDoc } from "../types";

const deNoise = (s: string) => s.replace(/\[[^\]]*\]/g, " ").replace(/[﴿﴾]/g, "").replace(/\s+/g, " ").trim();
const glossOf = (doc: RootDoc | null): string => {
  const m = doc?.meanings?.find((x) => x.key === "maqayis") || doc?.meanings?.[0];
  return m ? deNoise(m.text).slice(0, 260) : "";
};

/** Find verses by meaning (semantic embedding search, on-device). */
export async function toolSearchMeaning(query: string, k = 8): Promise<ChatAyah[]> {
  await loadVectors();
  const hits = (await meaningSearch(query, Math.max(k, 12))).slice().sort((a, b) => b.score - a.score).slice(0, k);
  const out: ChatAyah[] = [];
  for (const h of hits) {
    const a = await getAyahByGlobalNo(h.ayahId);
    if (a) out.push({ ref: a.location, text: a.textUthmani || a.textClean, score: Math.round(h.score * 100) / 100 });
  }
  return out;
}

/** A root's meaning + a few of its verses (resolves the nearest root to the query). */
export async function toolRootInfo(query: string): Promise<{ roots: ChatRoot[]; ayahs: ChatAyah[] }> {
  let doc = await getRoot(query.trim());
  if (!doc) {
    const f = await fuzzyRoots(query.trim(), 1);
    doc = f[0]?.doc ?? null;
  }
  if (!doc) return { roots: [], ayahs: [] };
  const roots: ChatRoot[] = [{ root: doc.root, occ: doc.occurrences, gloss: glossOf(doc) }];
  const seen = new Set<string>();
  const ayahs: ChatAyah[] = [];
  for (const loc of doc.locations ?? []) {
    const [s, a] = String(loc).split(":");
    const ref = `${s}:${a}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const ay = await getAyahByLocation(ref);
    if (ay) ayahs.push({ ref: ay.location, text: ay.textUthmani || ay.textClean });
    if (ayahs.length >= 6) break;
  }
  return { roots, ayahs };
}
