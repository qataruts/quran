/**
 * التبويب الموضوعي المحسوب — وحدات السياق × المحاور المنبثقة (tabwib-v1.json).
 * كل وحدةٍ مسندة لمحورٍ بإسنادٍ شبكي (صلات آياتها المفحوصة) أو تقريبي (تقارب
 * المعنى ≥0.55) — فالمصحف كله مبوَّب بوحداته المسماة، من حسابنا وتسميتنا.
 */

interface TabwibEntry { ax: number[]; mode: "evidence" | "approx" | "outside"; cos?: number }
interface TabwibData { meta: Record<string, unknown>; units: TabwibEntry[] }

let data: TabwibData | null = null;
let loading: Promise<TabwibData | null> | null = null;
/** axisId -> [{unit index, approx?}] */
let byAxis: Map<number, { u: number; approx: boolean }[]> | null = null;

export function loadTabwib(): Promise<TabwibData | null> {
  if (data) return Promise.resolve(data);
  loading ??= fetch(`${import.meta.env.BASE_URL}tabwib-v1.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? (r.json() as Promise<TabwibData>) : null))
    .then((d) => {
      if (!d) return null;
      data = d;
      byAxis = new Map();
      d.units.forEach((e, u) => {
        for (const ax of e.ax) {
          const list = byAxis!.get(ax) ?? [];
          list.push({ u, approx: e.mode === "approx" });
          byAxis!.set(ax, list);
        }
      });
      return d;
    })
    .catch(() => null);
  return loading;
}

export function unitsOfAxis(axisId: number): { u: number; approx: boolean }[] {
  return byAxis?.get(axisId) ?? [];
}
