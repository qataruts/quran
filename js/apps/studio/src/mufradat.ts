/**
 * المفردات في غريب القرآن (الراغب الأصفهاني) — root-keyed classical lexicon, shown
 * (lazily, on demand) in the word card beside مشكاة's own root gloss. A cited source,
 * separate from the computed layers. The tiny index decides whether a root has an
 * entry (no big load); the full text is fetched only when the user opens it.
 */
const normRoot = (r: string): string =>
  (r || "")
    .normalize("NFC")
    .replace(/[ً-ْـٰ]/g, "") // harakat, tatweel, dagger-alef
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "");

let idx: Set<string> | null = null;
let idxLoading: Promise<Set<string>> | null = null;
export function loadMufradatIndex(): Promise<Set<string>> {
  if (idx) return Promise.resolve(idx);
  idxLoading ??= fetch(`${import.meta.env.BASE_URL}mufradat-roots.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : []))
    .then((a: string[]) => (idx = new Set(a)))
    .catch(() => (idx = new Set()));
  return idxLoading;
}
/** Does الراغب have an entry for this root? (index must be loaded first.) */
export function hasMufradat(root: string): boolean {
  return !!idx && idx.has(normRoot(root));
}

let full: Record<string, string> | null = null;
let fullLoading: Promise<Record<string, string>> | null = null;
function loadMufradat(): Promise<Record<string, string>> {
  if (full) return Promise.resolve(full);
  fullLoading ??= fetch(`${import.meta.env.BASE_URL}mufradat.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((m: Record<string, string>) => (full = m))
    .catch(() => (full = {}));
  return fullLoading;
}
/** الراغب's full entry for a root (loads the 3 MB text once, on demand). null if none. */
export async function mufradatFor(root: string): Promise<string | null> {
  const m = await loadMufradat();
  return m[normRoot(root)] ?? null;
}
