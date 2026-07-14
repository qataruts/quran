/**
 * The covenant's classical معاجم, root-keyed, shown (lazily) in the word card:
 *   المفردات في غريب القرآن — الراغب  ·  مقاييس اللغة — ابن فارس
 * Cited sources, separate from the computed layers. A tiny index decides which
 * lexicons have an entry for a root (no big load); each full text is fetched only
 * when the reader opens it.
 */
export interface Lexicon { id: string; label: string; author: string }
export const LEXICONS: Lexicon[] = [
  { id: "mufradat", label: "المفردات في غريب القرآن", author: "الراغب الأصفهاني" },
  { id: "maqayis", label: "مقاييس اللغة", author: "ابن فارس" },
];

const normRoot = (r: string): string =>
  (r || "")
    .normalize("NFC")
    .replace(/[ً-ْـٰ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "");

let index: Record<string, Set<string>> | null = null;
let indexLoading: Promise<Record<string, Set<string>>> | null = null;
export function loadLexiconIndex(): Promise<Record<string, Set<string>>> {
  if (index) return Promise.resolve(index);
  indexLoading ??= fetch(`${import.meta.env.BASE_URL}lexicon-index.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((raw: Record<string, string[]>) => {
      index = Object.fromEntries(Object.entries(raw).map(([id, arr]) => [id, new Set(arr)]));
      return index;
    })
    .catch(() => (index = {}));
  return indexLoading;
}

/** Which lexicons have an entry for this root (index must be loaded first). */
export function availableLexicons(root: string): Lexicon[] {
  if (!index) return [];
  const n = normRoot(root);
  return LEXICONS.filter((l) => index![l.id]?.has(n));
}

const full = new Map<string, Record<string, string>>();
const fullLoading = new Map<string, Promise<Record<string, string>>>();
function loadFull(id: string): Promise<Record<string, string>> {
  const done = full.get(id);
  if (done) return Promise.resolve(done);
  const inflight = fullLoading.get(id);
  if (inflight) return inflight;
  const p = fetch(`${import.meta.env.BASE_URL}${id}.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((m: Record<string, string>) => { full.set(id, m); return m; })
    .catch(() => { const m = {}; full.set(id, m); return m; })
    .finally(() => fullLoading.delete(id));
  fullLoading.set(id, p);
  return p;
}

/** A lexicon's full entry for a root (loads that lexicon's file once, on demand). */
export async function lexiconText(id: string, root: string): Promise<string | null> {
  const m = await loadFull(id);
  return m[normRoot(root)] ?? null;
}
