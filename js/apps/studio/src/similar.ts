/**
 * آيات قريبة المعنى — precomputed semantic neighbors (quran-neighbors.bin,
 * ~150 KB, lazy-loaded once). No API calls: reading the meaning-web is free.
 */

interface Neighbor {
  ayahId: number; // global 1..6236
  score: number; // 0..1
}

let table: { count: number; k: number; bytes: Uint8Array } | null = null;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  if (table) return;
  loading ??= (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}quran-neighbors.bin?v=${__DATA_VERSION__}`);
    if (!res.ok) throw new Error(`neighbors not found (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();
    const headerLen = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)));
    if (header.magic !== "qkg-nb-1") throw new Error("bad neighbors file");
    table = { count: header.count, k: header.k, bytes: new Uint8Array(buf, 4 + headerLen) };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Top semantic neighbors of a global ayah number (empty if unavailable). */
export async function similarOf(globalAyahNo: number): Promise<Neighbor[]> {
  try {
    await load();
  } catch {
    return [];
  }
  const { count, k, bytes } = table!;
  if (globalAyahNo < 1 || globalAyahNo > count) return [];
  const out: Neighbor[] = [];
  const base = (globalAyahNo - 1) * k * 3;
  for (let i = 0; i < k; i++) {
    const off = base + i * 3;
    const id = bytes[off] | (bytes[off + 1] << 8);
    if (id === 0) break;
    out.push({ ayahId: id, score: bytes[off + 2] / 100 });
  }
  return out;
}
