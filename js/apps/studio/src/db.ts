/**
 * Data layer for Quran Studio — loads quran-app.db (monlite format) into the
 * browser via sql.js WASM (FTS5-enabled build) and exposes typed queries.
 *
 * All views go through this module; no view talks to monlite directly.
 */
// @ts-expect-error no type declarations for the bundle entry
import initSqlJs from "fts5-sql-bundle/dist/sql-wasm.js";
import sqlWasmUrl from "fts5-sql-bundle/dist/sql-wasm.wasm?url";
import { createDb } from "@monlite/core";
import { fts } from "@monlite/fts";
import { wasmDriver } from "@monlite/wasm";
import { SCHEMAS } from "../../../shared/monlite-schemas.mjs";
import type { AyahDoc, RootDoc, RootEdgeDoc, SurahDoc, WordDoc } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Monlite = any;

let db: Monlite = null;
let initPromise: Promise<void> | null = null;

function coll(name: string) {
  const schema = (SCHEMAS as Record<string, unknown>)[name];
  return db.collection(name, schema ? { schema } : undefined);
}

/** Fetch the database with byte-level progress, then boot monlite over it. */
export function initDb(onProgress: (loaded: number, total: number) => void): Promise<void> {
  if (db) return Promise.resolve();
  initPromise ??= doInit(onProgress).catch((e) => {
    initPromise = null;
    throw e;
  });
  return initPromise;
}

async function doInit(onProgress: (loaded: number, total: number) => void): Promise<void> {
  const [SQL, bytes] = await Promise.all([
    initSqlJs({ locateFile: () => sqlWasmUrl }),
    fetchWithProgress(`${import.meta.env.BASE_URL}quran-app.db?v=${__DATA_VERSION__}`, onProgress),
  ]);
  db = createDb(":memory:", {
    driver: wasmDriver(SQL, { data: bytes }),
    plugins: [fts({ ayahs: ["textClean"] })],
  });
}

async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load database: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Queries (each returns plain typed docs; results are safe to cache by views)
// ---------------------------------------------------------------------------

let surahCache: SurahDoc[] | null = null;
const surahNames = new Map<number, string>();

export async function listSurahs(): Promise<SurahDoc[]> {
  if (!surahCache) {
    surahCache = (await coll("surahs").findMany({ orderBy: { surahNo: "asc" } })) as SurahDoc[];
    for (const s of surahCache) surahNames.set(s.surahNo, s.nameAr);
  }
  return surahCache;
}

/** Synchronous Arabic surah name (primed by the boot sequence). */
export const surahNameAr = (no: number): string => surahNames.get(no) ?? String(no);

export async function getSurah(surahNo: number): Promise<SurahDoc | undefined> {
  return (await listSurahs()).find((s) => s.surahNo === surahNo);
}

export async function listAyahs(surahNo: number): Promise<AyahDoc[]> {
  return (await coll("ayahs").findMany({
    where: { surahNo },
    orderBy: { ayahNo: "asc" },
  })) as AyahDoc[];
}

export async function getAyah(surahNo: number, ayahNo: number): Promise<AyahDoc | null> {
  return (await coll("ayahs").findFirst({ where: { surahNo, ayahNo } })) as AyahDoc | null;
}

export async function getAyahByLocation(location: string): Promise<AyahDoc | null> {
  const [s, a] = location.split(":").map(Number);
  return getAyah(s, a);
}

/** Words of one surah, ordered; group by ayahNo in the view. */
export async function listWords(surahNo: number): Promise<WordDoc[]> {
  return (await coll("words").findMany({
    where: { surahNo },
    orderBy: { wordNo: "asc" },
  })) as WordDoc[];
}

export async function wordsOfAyah(surahNo: number, ayahNo: number): Promise<WordDoc[]> {
  const ws = (await coll("words").findMany({
    where: { surahNo, ayahNo },
  })) as WordDoc[];
  return ws.sort((a, b) => a.wordNo - b.wordNo);
}

export async function getWord(location: string): Promise<WordDoc | null> {
  return (await coll("words").findFirst({ where: { location } })) as WordDoc | null;
}

export async function wordsByRoot(root: string, limit = 2000): Promise<WordDoc[]> {
  return (await coll("words").findMany({ where: { root }, take: limit })) as WordDoc[];
}

export async function wordsByLemma(lemma: string, limit = 2000): Promise<WordDoc[]> {
  return (await coll("words").findMany({ where: { lemma }, take: limit })) as WordDoc[];
}

export async function getRoot(root: string): Promise<RootDoc | null> {
  return (await coll("roots").findFirst({ where: { root } })) as RootDoc | null;
}

export async function topRoots(limit = 100): Promise<RootDoc[]> {
  return (await coll("roots").findMany({
    orderBy: { occurrences: "desc" },
    take: limit,
  })) as RootDoc[];
}

export async function searchRoots(prefix: string, limit = 50): Promise<RootDoc[]> {
  return (await coll("roots").findMany({
    where: { root: { startsWith: prefix } },
    orderBy: { occurrences: "desc" },
    take: limit,
  })) as RootDoc[];
}

/** Full-text search over ayah clean text (FTS5, ranked). */
export async function searchAyahs(query: string): Promise<AyahDoc[]> {
  return (await coll("ayahs").search(query)) as AyahDoc[];
}

/** Precomputed root co-occurrence edges touching `root` (strongest first). */
export async function rootEdges(root: string, limit = 60): Promise<RootEdgeDoc[]> {
  const [asA, asB] = await Promise.all([
    coll("rootEdges").findMany({ where: { a: root }, orderBy: { w: "desc" }, take: limit }),
    coll("rootEdges").findMany({ where: { b: root }, orderBy: { w: "desc" }, take: limit }),
  ]);
  return [...(asA as RootEdgeDoc[]), ...(asB as RootEdgeDoc[])]
    .sort((x, y) => y.w - x.w)
    .slice(0, limit);
}

/** Edges among a set of roots (for drawing the local network). */
export async function edgesAmong(roots: string[]): Promise<RootEdgeDoc[]> {
  const edges = (await coll("rootEdges").findMany({
    where: { a: { in: roots }, b: { in: roots } },
  })) as RootEdgeDoc[];
  return edges;
}

/** Global precomputed stats document (letter frequencies, top lists, counts). */
export async function getStats(): Promise<Record<string, unknown> | null> {
  return await coll("meta").findFirst({ where: { key: "stats" } });
}

export interface NeighborRoot {
  root: string;
  w: number;
}

/** Strongest co-occurring roots of `root`, deduped, strongest first. */
export async function neighborsOfRoot(root: string, limit = 25): Promise<NeighborRoot[]> {
  const edges = await rootEdges(root, limit * 2);
  const best = new Map<string, number>();
  for (const e of edges) {
    const other = e.a === root ? e.b : e.a;
    if (other === root) continue;
    best.set(other, Math.max(best.get(other) ?? 0, e.w));
  }
  return [...best.entries()]
    .map(([r, w]) => ({ root: r, w }))
    .sort((x, y) => y.w - x.w)
    .slice(0, limit);
}

let _pageJuz: Map<number, number> | null = null;
/** page (1..604) -> juz. Cached; one query. */
export async function pageJuzMap(): Promise<Map<number, number>> {
  if (_pageJuz) return _pageJuz;
  const rows = (await coll("ayahs").findMany({})) as AyahDoc[];
  const m = new Map<number, number>();
  for (const a of rows) if (!m.has(a.page)) m.set(a.page, a.juz);
  _pageJuz = m;
  return m;
}

/** First ayah location ("s:a") of a juz or Madani page. */
export async function firstAyahOf(kind: "juz" | "page", n: number): Promise<string | null> {
  const docs = (await coll("ayahs").findMany({ where: { [kind]: n } })) as AyahDoc[];
  if (docs.length === 0) return null;
  let best = docs[0];
  for (const d of docs) {
    if (Number(d._id.slice(1)) < Number(best._id.slice(1))) best = d;
  }
  return best.location;
}

/** Resolve an ayah by its global number (1..6236) via the surah list. */
const globalAyahCache = new Map<number, AyahDoc | null>();
export async function getAyahByGlobalNo(no: number): Promise<AyahDoc | null> {
  if (globalAyahCache.has(no)) return globalAyahCache.get(no)!;
  const surahs = await listSurahs();
  let acc = 0;
  for (const s of surahs) {
    if (no <= acc + s.ayahCount) {
      const doc = await getAyah(s.surahNo, no - acc);
      globalAyahCache.set(no, doc);
      return doc;
    }
    acc += s.ayahCount;
  }
  return null;
}

/** Distinct ayah locations ("s:a") for a root, in mushaf order. */
export function ayahLocationsOfRoot(rootDoc: RootDoc): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const loc of rootDoc.locations) {
    const [s, a] = loc.split(":");
    const key = `${s}:${a}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
