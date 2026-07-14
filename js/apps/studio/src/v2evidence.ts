/**
 * v2evidence — نموذج الشارتين (قرار ب): دليلُ كل آية كما هو، بلا رتبةٍ تدّعي فوقه.
 *   «صيغة قاعدة»  = بوابات صرفية حتمية اجتازتها وحدةٌ من الآية (استعادة ٩٦٪/رفض ١٠٠٪).
 *   «ثبت تفرّعه» = صِلاتُ شبكة v2 المفحوصةُ فحصًا مستقلًّا (11,773 رابطًا، κ=0.585) + المثاني.
 * البيانات: public/v2-evidence.json (كسولة، ~0.4MB).
 */
export interface EvUnit {
  u: string; // "aya" | "cN"
  r: [number, number] | null; // مدى الكلمات
  g: string[]; // البوابات المجتازة
  links?: Record<string, string[]>; // rel -> locs
  tw?: number; // عدد المثاني
  tws?: number; // انتشار المثاني
  f?: 1; // صيغة مثانية معزولة
  ne: number; sp: number;
}
interface EvData { meta: Record<string, unknown>; verses: Record<string, EvUnit[]> }

let data: EvData | null = null;
let loading: Promise<EvData | null> | null = null;
export function loadEvidence(): Promise<EvData | null> {
  if (data) return Promise.resolve(data);
  loading ??= fetch(`${import.meta.env.BASE_URL}v2-evidence.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: EvData | null) => (data = d))
    .catch(() => null);
  return loading;
}
/** وحدات الدليل لآية (بعد اكتمال التحميل) — [] إن لا دليل. */
export function evidenceOf(loc: string): EvUnit[] {
  return data?.verses[loc] ?? [];
}
/** أوجز أسماء البوابات للعرض (يسقط البادئة G1x:) */
export const gateLabel = (g: string): string => g.replace(/^G\d[a-z]?:/, "");
export const REL_ORDER = ["بيان", "مثال", "جزاء", "توكيد"] as const;
