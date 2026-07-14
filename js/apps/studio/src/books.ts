/**
 * نِبراس's book/tafsir search — BROWSER-side, on demand, no server RAG.
 *
 * Each book ships as `rag-<source>.bin` (int8 vectors, same format as the āyāt's
 * quran-embeddings.bin) + `rag-<source>.json` ([{ref,text}]). A book is lazy-loaded
 * the first time نِبراس uses it (then cached), and searched by a local cosine scan —
 * exactly like مثلها/meaning-search. Only the QUERY embedding touches the server
 * (`/api/embed`), which already exists. Heavy tafsirs stay for the desktop/server path.
 */
import { embedQuery } from "./semantic";

export type Genre = "tafsir" | "asbab" | "gharib" | "i3rab" | "qiraat" | "lexicon";
export interface BookSource { id: string; label: string; genre: Genre; author?: string; embedded?: boolean }

/**
 * Registered browser books. Each ships as public/rag-<id>.json ([{ref,text[,refEnd]}])
 * for by-ref display; `embedded` ones also ship rag-<id>.bin (int8) for نِبراس's
 * semantic search. Heavy classical tafsirs stay out of the browser on purpose
 * (PHASE-2, server/desktop) — see js/data/README.
 */
export const BOOK_SOURCES: BookSource[] = [
  { id: "muyassar", label: "التفسير الميسّر", genre: "tafsir", embedded: true },
  { id: "jalalayn", label: "تفسير الجلالين", genre: "tafsir", embedded: true },
  { id: "mukhtasar", label: "المختصر في التفسير", genre: "tafsir", author: "مركز تفسير", embedded: true },
  { id: "saadi", label: "تيسير الكريم الرحمن", genre: "tafsir", author: "السعدي", embedded: true },
  { id: "aysar", label: "أيسر التفاسير", genre: "tafsir", author: "أبو بكر الجزائري" },
  { id: "gharibmuyassar", label: "الميسّر في غريب القرآن", genre: "gharib", embedded: true },
  { id: "seraj", label: "السراج في غريب القرآن", genre: "gharib", author: "الخضيري", embedded: true },
  { id: "i3rabmuyassar", label: "الإعراب الميسّر", genre: "i3rab" },
  { id: "nashr", label: "النشر في القراءات العشر", genre: "qiraat", author: "ابن الجزري" },
  { id: "qiraat", label: "الموسوعة القرآنية للقراءات", genre: "qiraat" },
  { id: "wahidi", label: "أسباب نزول القرآن", genre: "asbab", author: "الواحدي", embedded: true },
  { id: "muharrar", label: "المحرَّر في أسباب النزول", genre: "asbab", author: "المزيني", embedded: true },
  // root-keyed معاجم — نِبراس-only (shown in the word card, not the verse-anchored تفاسير section)
  { id: "mufradat", label: "المفردات في غريب القرآن", genre: "lexicon", author: "الراغب الأصفهاني", embedded: true },
  { id: "maqayis", label: "مقاييس اللغة", genre: "lexicon", author: "ابن فارس", embedded: true },
];
export const EMBEDDED_SOURCES = BOOK_SOURCES.filter((s) => s.embedded);
export const TAFSIR_SOURCES = BOOK_SOURCES.filter((s) => s.genre === "tafsir");
export const bookById = (id: string): BookSource | undefined => BOOK_SOURCES.find((s) => s.id === id);
export const bookLabel = (id: string): string => bookById(id)?.label ?? id;

export const GENRE_LABELS: Record<Genre, string> = {
  tafsir: "التفاسير", asbab: "أسباب النزول", gharib: "غريب القرآن", i3rab: "إعراب القرآن", qiraat: "القراءات", lexicon: "المعاجم",
};
// lexicon (root-keyed) is intentionally excluded — the تفاسير section is verse-anchored
const GENRE_ORDER: Genre[] = ["tafsir", "asbab", "gharib", "i3rab", "qiraat"];
/** Books grouped by genre (registry order), for the تفاسير section. */
export function booksByGenre(): { genre: Genre; label: string; books: BookSource[] }[] {
  return GENRE_ORDER
    .map((g) => ({ genre: g, label: GENRE_LABELS[g], books: BOOK_SOURCES.filter((s) => s.genre === g) }))
    .filter((x) => x.books.length > 0);
}

interface Book {
  dim: number;
  count: number;
  scales: Float32Array;
  data: Int8Array;
  meta: { ref: string; text: string }[];
}

const loaded = new Map<string, Book | null>();
const loading = new Map<string, Promise<Book | null>>();

function loadBook(source: string): Promise<Book | null> {
  const done = loaded.get(source);
  if (done !== undefined) return Promise.resolve(done);
  const inflight = loading.get(source);
  if (inflight) return inflight;
  const p = (async (): Promise<Book | null> => {
    try {
      const base = import.meta.env.BASE_URL;
      const [binRes, jsonRes] = await Promise.all([
        fetch(`${base}rag-${source}.bin?v=${__DATA_VERSION__}`),
        fetch(`${base}rag-${source}.json?v=${__DATA_VERSION__}`),
      ]);
      if (!binRes.ok || !jsonRes.ok) { loaded.set(source, null); return null; }
      const buf = await binRes.arrayBuffer();
      const headerLen = new DataView(buf).getUint32(0, true);
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)));
      const { dim, count } = header as { dim: number; count: number };
      const scalesOff = 4 + headerLen;
      const book: Book = {
        dim, count,
        scales: new Float32Array(buf.slice(scalesOff, scalesOff + count * 4)),
        data: new Int8Array(buf, scalesOff + count * 4, count * dim),
        meta: await jsonRes.json(),
      };
      loaded.set(source, book);
      return book;
    } catch {
      loaded.set(source, null);
      return null;
    } finally {
      loading.delete(source);
    }
  })();
  loading.set(source, p);
  return p;
}

export interface BookHit { ref: string; text: string; source: string; score: number }

/** Top passages of one book for an already-embedded (L2-normed) query vector. */
export async function searchBook(source: string, q: Float32Array, topK: number): Promise<BookHit[]> {
  const b = await loadBook(source);
  if (!b) return [];
  const { dim, count, scales, data, meta } = b;
  const scored: { r: number; s: number }[] = new Array(count);
  for (let r = 0; r < count; r++) {
    let dot = 0;
    const base = r * dim;
    for (let i = 0; i < dim; i++) dot += data[base + i] * q[i];
    scored[r] = { r, s: dot * scales[r] };
  }
  scored.sort((a, c) => c.s - a.s);
  return scored.slice(0, topK).map(({ r, s }) => ({ ref: meta[r].ref, text: meta[r].text, source, score: s }));
}

/** Embed the query once, then search the given sources; merged, top-scored first. */
export async function searchBooks(query: string, sources: string[], topK: number): Promise<BookHit[]> {
  const q = await embedQuery(query);
  const per = Math.max(3, Math.ceil(topK / Math.max(1, sources.length)) + 1);
  const all = (await Promise.all(sources.map((s) => searchBook(s, q, per)))).flat();
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, topK);
}

// ── books BY REF (verse-anchored) — direct lookup, no vectors ─────────────────
// The reader's «تفسير» button and the تفاسير section need a book's text AT a verse,
// not a semantic search. We load only the source's .json (grouped {ref,text[,refEnd]})
// and resolve ranges: an entry may cover a span of āyāt (ref..refEnd).
export interface BookEntry { ref: string; refEnd?: string; text: string; s: number; e: number }
const refNum = (ref: string): number => {
  const [su, ay] = ref.split(":").map(Number);
  return su * 1000 + ay;
};

const entryLists = new Map<string, BookEntry[] | null>();
const entryLoading = new Map<string, Promise<BookEntry[] | null>>();

/** One book's entries, sorted by start ref (range-expanded numerics attached). */
export function loadBookEntries(source: string): Promise<BookEntry[] | null> {
  const done = entryLists.get(source);
  if (done !== undefined) return Promise.resolve(done);
  const inflight = entryLoading.get(source);
  if (inflight) return inflight;
  const p = (async (): Promise<BookEntry[] | null> => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}rag-${source}.json?v=${__DATA_VERSION__}`);
      if (!res.ok) { entryLists.set(source, null); return null; }
      const arr = (await res.json()) as { ref: string; refEnd?: string; text: string }[];
      const list: BookEntry[] = arr.map((x) => ({
        ref: x.ref, refEnd: x.refEnd, text: x.text, s: refNum(x.ref), e: refNum(x.refEnd ?? x.ref),
      }));
      list.sort((a, b) => a.s - b.s);
      entryLists.set(source, list);
      return list;
    } catch {
      entryLists.set(source, null);
      return null;
    } finally {
      entryLoading.delete(source);
    }
  })();
  entryLoading.set(source, p);
  return p;
}

/** The entry of `source` covering `loc` (handles ref..refEnd ranges); null if none. */
function entryAt(list: BookEntry[], loc: string): BookEntry | null {
  const n = refNum(loc);
  // last entry whose start ≤ n, then check it spans n (entries are sorted, non-overlapping)
  let lo = 0, hi = list.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].s <= n) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (found < 0) return null;
  const e = list[found];
  return n <= e.e ? e : null;
}

/** One book's text at a verse (loc "s:a"), range-aware. null if the book has none. */
export async function bookTextAt(source: string, loc: string): Promise<string | null> {
  const list = await loadBookEntries(source);
  if (!list) return null;
  return entryAt(list, loc)?.text ?? null;
}

/** All TAFSIR-genre books' text for one āyah, in registry order (for the «تفسير» button). */
export async function tafsirFor(loc: string): Promise<{ source: string; label: string; text: string }[]> {
  const out: { source: string; label: string; text: string }[] = [];
  for (const s of TAFSIR_SOURCES) {
    const text = await bookTextAt(s.id, loc);
    if (text) out.push({ source: s.id, label: s.label, text });
  }
  return out;
}

// ── أسباب النزول ──────────────────────────────────────────────────────────────
export const ASBAB_SOURCES = BOOK_SOURCES.filter((s) => s.genre === "asbab");

/** Tiny index (sorted [start,end] ref-num ranges) of verses that HAVE a sabab, so
 *  the reader shows the «سبب النزول» chip only where one exists — no big load. */
let asbabIdx: [number, number][] | null = null;
let asbabIdxLoading: Promise<[number, number][]> | null = null;
export function loadAsbabIndex(): Promise<[number, number][]> {
  if (asbabIdx) return Promise.resolve(asbabIdx);
  asbabIdxLoading ??= fetch(`${import.meta.env.BASE_URL}asbab-index.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : []))
    .then((d: [number, number][]) => (asbabIdx = d))
    .catch(() => (asbabIdx = []));
  return asbabIdxLoading;
}
/** Does `loc` have a recorded sabab? (index must be loaded — see loadAsbabIndex.) */
export function hasAsbab(loc: string): boolean {
  if (!asbabIdx) return false;
  const n = refNum(loc);
  return asbabIdx.some(([s, e]) => n >= s && n <= e);
}

/** All أسباب-النزول books' text for one āyah, range-aware (for the «سبب النزول» chip). */
export async function asbabFor(loc: string): Promise<{ source: string; label: string; text: string }[]> {
  const out: { source: string; label: string; text: string }[] = [];
  for (const s of ASBAB_SOURCES) {
    const text = await bookTextAt(s.id, loc);
    if (text) out.push({ source: s.id, label: s.label, text });
  }
  return out;
}
