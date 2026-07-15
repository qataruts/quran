/**
 * التفصيل الموضوعي — طبقة وحدات السياق المنقولة (١٢٨١ مقطعًا متصلًا يطبّق المصحف
 * كلَّه، في سبعة موضوعات ملوّنة). البيانات من مصحف التفصيل الموضوعي (مطبَّعةً على
 * العدّ الكوفي — انظر scripts/build-tafsil-units.mjs)، ومتجهاتُ المقاطع بنفس صيغة
 * متجهات الآيات (tafsil-embeddings.bin) فتُقرأ بنفس الشيفرة.
 *
 * الاستعمالان: unitOf(loc) — مقطعُ السياق الحاوي لأي آية؛ searchUnits(query) —
 * بحثٌ بالمعنى يعيد مقاطعَ كاملةً لا آياتٍ مبتورة.
 */
import { embedQuery } from "./semantic";

export interface TafsilTopic { id: number; name: string; short: string; rgb: [number, number, number] }
export interface TafsilUnit { i: number; s: number; a1: number; a2: number; t: number }

interface TafsilData { topics: TafsilTopic[]; units: TafsilUnit[] }
let data: TafsilData | null = null;
let loading: Promise<TafsilData | null> | null = null;

export function loadTafsil(): Promise<TafsilData | null> {
  if (data) return Promise.resolve(data);
  loading ??= fetch(`${import.meta.env.BASE_URL}tafsil-units.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return null;
      data = {
        topics: j.topics,
        units: (j.units as [number, number, number, number][]).map((u, i) => ({ i, s: u[0], a1: u[1], a2: u[2], t: u[3] })),
      };
      return data;
    })
    .catch(() => null);
  return loading;
}

/** مقطعُ السياق الحاوي للموضع "س:آ" — null إن لم تُحمّل البيانات بعد */
export function unitOf(loc: string): TafsilUnit | null {
  if (!data) return null;
  const [s, a] = loc.split(":").map(Number);
  // بحث ثنائي على وحدات السورة (الوحدات مرتبة مصحفيًّا)
  let lo = 0, hi = data.units.length - 1, found: TafsilUnit | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const u = data.units[mid];
    if (u.s < s || (u.s === s && u.a2 < a)) lo = mid + 1;
    else if (u.s > s || (u.s === s && u.a1 > a)) hi = mid - 1;
    else { found = u; break; }
  }
  return found;
}

export const topicOf = (t: number): TafsilTopic | undefined => data?.topics.find((x) => x.id === t);

// —— متجهات المقاطع (نفس صيغة quran-embeddings.bin) ————————————————
let vec: { dim: number; count: number; scales: Float32Array; data: Int8Array } | null = null;
let vecLoading: Promise<void> | null = null;

export function loadTafsilVectors(): Promise<void> {
  if (vec) return Promise.resolve();
  vecLoading ??= (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}tafsil-embeddings.bin?v=${__DATA_VERSION__}`);
    if (!res.ok) throw new Error(`tafsil embeddings: HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const headerLen = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)));
    const { dim, count } = header;
    const scalesOff = 4 + headerLen;
    vec = {
      dim,
      count,
      scales: new Float32Array(buf.slice(scalesOff, scalesOff + count * 4)),
      data: new Int8Array(buf, scalesOff + count * 4, count * dim),
    };
  })();
  return vecLoading;
}

export interface UnitHit { unit: TafsilUnit; score: number }

/** بحثٌ بالمعنى في مقاطع السياق — يعيد أفضل k مقاطعَ كاملة */
export async function searchUnits(query: string, k = 6): Promise<UnitHit[]> {
  await Promise.all([loadTafsil(), loadTafsilVectors()]);
  if (!data || !vec) return [];
  const q = await embedQuery(query);
  const { dim, count, scales, data: d } = vec;
  const hits: UnitHit[] = [];
  for (let r = 0; r < count; r++) {
    let dot = 0;
    const off = r * dim;
    for (let i = 0; i < dim; i++) dot += q[i] * d[off + i];
    const score = dot * scales[r];
    if (hits.length < k) {
      hits.push({ unit: data.units[r], score });
      hits.sort((a, b) => a.score - b.score);
    } else if (score > hits[0].score) {
      hits[0] = { unit: data.units[r], score };
      hits.sort((a, b) => a.score - b.score);
    }
  }
  return hits.reverse();
}
