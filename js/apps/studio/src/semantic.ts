/**
 * Meaning search — client-side semantic retrieval.
 *
 * The 6,236 ayah vectors (Gemini gemini-embedding-001, 768-dim, int8-quantized,
 * ~4.8 MB) ship with the app and load lazily on first use. Ranking is a local
 * cosine scan (<10 ms). Only the typed QUERY needs one embedding call:
 *
 *   1. a configured endpoint (default /api/embed — the Vercel function in
 *      this repo, which holds GEMINI_API_KEY server-side), or
 *   2. the user's own Gemini key (stored only in this browser).
 */

const MODEL = "gemini-embedding-001";
const ENDPOINT_KEY = "quran-studio:embed-endpoint";
const GEMINI_KEY = "quran-studio:gemini-key";

export interface SemanticHit {
  /** global ayah number 1..6236 (== ayah_id) */
  ayahId: number;
  score: number;
}

// --- settings ---------------------------------------------------------------

export const getEndpoint = (): string =>
  localStorage.getItem(ENDPOINT_KEY) ?? "/api/embed";
export const setEndpoint = (url: string) => localStorage.setItem(ENDPOINT_KEY, url);
export const getUserKey = (): string | null => localStorage.getItem(GEMINI_KEY);
export const setUserKey = (k: string) =>
  k ? localStorage.setItem(GEMINI_KEY, k) : localStorage.removeItem(GEMINI_KEY);

// --- vector store (lazy singleton) -------------------------------------------

let store: { dim: number; count: number; scales: Float32Array; data: Int8Array } | null = null;
let loading: Promise<void> | null = null;

export function loadVectors(onProgress?: (pct: number) => void): Promise<void> {
  if (store) return Promise.resolve();
  loading ??= (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}quran-embeddings.bin?v=${__DATA_VERSION__}`);
    if (!res.ok) throw new Error(`embeddings not found (HTTP ${res.status}) — run export-embeddings.mjs`);
    const total = Number(res.headers.get("content-length") ?? 0);
    let buf: ArrayBuffer;
    if (res.body && total) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onProgress?.(Math.round((got / total) * 100));
      }
      const all = new Uint8Array(got);
      let off = 0;
      for (const c of chunks) {
        all.set(c, off);
        off += c.length;
      }
      buf = all.buffer;
    } else {
      buf = await res.arrayBuffer();
    }
    const headerLen = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)));
    if (header.magic !== "qkg-emb-1") throw new Error("bad embeddings file");
    const { dim, count } = header as { dim: number; count: number };
    const scalesOff = 4 + headerLen;
    store = {
      dim,
      count,
      scales: new Float32Array(buf.slice(scalesOff, scalesOff + count * 4)),
      data: new Int8Array(buf, scalesOff + count * 4, count * dim),
    };
  })().catch((e) => {
    loading = null; // one transient failure must not poison every retry
    throw e;
  });
  return loading;
}

export const vectorsReady = (): boolean => store !== null;

// --- query embedding ----------------------------------------------------------

const queryCache = new Map<string, Float32Array>();

async function embedQuery(text: string): Promise<Float32Array> {
  const cached = queryCache.get(text);
  if (cached) return cached;

  const dim = store?.dim ?? 768;
  let values: number[] | null = null;

  // 1) endpoint (same-origin /api/embed on Vercel, or a custom URL)
  try {
    const res = await fetch(getEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) values = (await res.json()).vector;
  } catch {
    /* endpoint unreachable — fall through */
  }

  // 2) user's own key, direct to Google (stays in this browser)
  if (!values) {
    const key = getUserKey();
    if (!key) throw new Error("no-embedder");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: dim,
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini: HTTP ${res.status}`);
    values = (await res.json()).embedding.values;
  }

  const q = Float32Array.from(values!);
  let n = 0;
  for (const v of q) n += v * v;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < q.length; i++) q[i] /= n;
  queryCache.set(text, q);
  return q;
}

// --- search --------------------------------------------------------------------

export async function meaningSearch(text: string, topK = 20): Promise<SemanticHit[]> {
  await loadVectors();
  const q = await embedQuery(text);
  const { dim, count, scales, data } = store!;
  const hits: SemanticHit[] = [];
  for (let r = 0; r < count; r++) {
    let dot = 0;
    const base = r * dim;
    for (let i = 0; i < dim; i++) dot += data[base + i] * q[i];
    const score = dot * scales[r];
    if (hits.length < topK) {
      hits.push({ ayahId: r + 1, score });
      if (hits.length === topK) hits.sort((a, b) => a.score - b.score);
    } else if (score > hits[0].score) {
      hits[0] = { ayahId: r + 1, score };
      let i = 0;
      while (i + 1 < topK && hits[i].score > hits[i + 1].score) {
        [hits[i], hits[i + 1]] = [hits[i + 1], hits[i]];
        i++;
      }
    }
  }
  return hits.reverse();
}
