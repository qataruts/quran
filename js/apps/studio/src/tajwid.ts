/**
 * تلوين التجويد — a rule engine that computes the main tajwīd rules from our own
 * Uthmani text (harakāt + waqf marks already present); no external data. Colors
 * follow the internationally-recognised colour-coded muṣḥaf scheme:
 *   أحمر مدّ · أخضر غنّة/إخفاء/إقلاب/إدغام بغنّة · رمادي إدغام بلا غنّة · أزرق قلقلة
 * Verified against known ayahs (waqf qalqalah, cross-word idghām/ikhfā/iqlāb).
 */
export type TajwidRule = "madd" | "ghunnah" | "ikhfa" | "iqlab" | "idghamG" | "idgham" | "qalqalah";
export interface TajwidSpan {
  text: string;
  rule: TajwidRule | null;
}

const SHADDA = "ّ", SUKOON = "ْ", MADDAH = "ٓ", ALEF_MADDA = "آ"; // ّ ْ ٓ آ
const TANWIN = "ًٌٍ"; // ً ٌ ٍ
const QALQ = "قطبجد";
const IKHFA = "تثجدذزسشصضطظفقك";
const IDGHAM_GH = "ينمو"; // إدغام بغنّة
const IDGHAM_NO = "لر"; // إدغام بلا غنّة
const SILENT = "ٱاىٰ"; // silent connectors/carriers
const NOON = "ن", MEEM = "م", BA = "ب";

const isMark = (c: string) => /[ؐ-ًؚ-ٰٟۖ-ۭـ]/.test(c);
const isSpace = (c: string) => c === " " || c === " ";
const has = (s: string, set: string) => [...s].some((ch) => set.includes(ch));

interface Unit {
  base?: string;
  marks: string;
  space?: boolean;
  start: number;
  len: number;
}

function parseUnits(text: string): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (isSpace(c)) {
      units.push({ space: true, marks: "", start: i, len: 1 });
      i++;
      continue;
    }
    if (!isMark(c)) {
      const start = i;
      let marks = "";
      i++;
      while (i < text.length && isMark(text[i])) {
        marks += text[i];
        i++;
      }
      units.push({ base: c, marks, start, len: i - start });
    } else {
      i++; // stray mark
    }
  }
  return units;
}

function classify(units: Unit[]): (TajwidRule | null)[] {
  const rules: (TajwidRule | null)[] = new Array(units.length).fill(null);
  const nextCons = (i: number): string => {
    for (let j = i + 1; j < units.length; j++) {
      const u = units[j];
      if (!u.base || SILENT.includes(u.base)) continue;
      return u.base;
    }
    return "";
  };
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.base) continue;
    const shadda = u.marks.includes(SHADDA);
    const sukoon = u.marks.includes(SUKOON);
    const tanwin = has(u.marks, TANWIN);
    const maddah = u.marks.includes(MADDAH);
    // غنّة — نّ / مّ
    if ((u.base === NOON || u.base === MEEM) && shadda) { rules[i] = "ghunnah"; continue; }
    // قلقلة — ق ط ب ج د ساكنة
    if (QALQ.includes(u.base) && sukoon) { rules[i] = "qalqalah"; continue; }
    // نون ساكنة / تنوين
    if ((u.base === NOON && sukoon) || tanwin) {
      const nb = nextCons(i);
      if (nb === "") { if (QALQ.includes(u.base)) rules[i] = "qalqalah"; } // وقف
      else if (nb === BA) rules[i] = "iqlab";
      else if (IDGHAM_GH.includes(nb)) rules[i] = "idghamG";
      else if (IDGHAM_NO.includes(nb)) rules[i] = "idgham";
      else if (IKHFA.includes(nb)) rules[i] = "ikhfa";
      // إظهار → بلا لون
      continue;
    }
    // ميم ساكنة — إخفاء شفوي (ب) / إدغام صغير (م)
    if (u.base === MEEM && sukoon) {
      const nb = nextCons(i);
      if (nb === BA || nb === MEEM) rules[i] = "ikhfa";
      continue;
    }
    // مدّ — علامة المدّ (ٓ) أو ألف المدّ (آ)
    if (maddah || u.base === ALEF_MADDA) { rules[i] = "madd"; continue; }
  }
  return rules;
}

/** Segment an Uthmani ayah into coloured tajwīd runs. */
export function tajwidSpans(text: string): TajwidSpan[] {
  const units = parseUnits(text);
  const rules = classify(units);
  const out: TajwidSpan[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const seg = text.substr(u.start, u.len);
    const rule = u.space ? null : rules[i];
    const last = out[out.length - 1];
    if (last && last.rule === rule) last.text += seg;
    else out.push({ text: seg, rule });
  }
  return out;
}

/** Per-word tajwīd colouring: rules are computed on the whole ayah (so cross-word
 *  rules stay correct) then split back to each word — every word remains a
 *  clickable unit AND is coloured. Returns one span list per input word. */
export function tajwidWords(words: string[]): TajwidSpan[][] {
  const joined = words.join(" ");
  const rules: (TajwidRule | null)[] = [];
  for (const s of tajwidSpans(joined)) for (let i = 0; i < s.text.length; i++) rules.push(s.rule);
  const out: TajwidSpan[][] = [];
  let pos = 0;
  for (const w of words) {
    const wordSpans: TajwidSpan[] = [];
    for (let i = 0; i < w.length; i++) {
      const r = rules[pos++] ?? null;
      const last = wordSpans[wordSpans.length - 1];
      if (last && last.rule === r) last.text += w[i];
      else wordSpans.push({ text: w[i], rule: r });
    }
    out.push(wordSpans);
    pos++; // skip the space between words
  }
  return out;
}

/** Rule → Arabic name + colour class (standard colour-coded muṣḥaf scheme). */
export const TAJWID: Record<TajwidRule, { ar: string; cls: string }> = {
  madd: { ar: "مدّ", cls: "tj-red" },
  ghunnah: { ar: "غنّة", cls: "tj-green" },
  ikhfa: { ar: "إخفاء", cls: "tj-green" },
  iqlab: { ar: "إقلاب", cls: "tj-green" },
  idghamG: { ar: "إدغام بغنّة", cls: "tj-green" },
  idgham: { ar: "إدغام", cls: "tj-grey" },
  qalqalah: { ar: "قلقلة", cls: "tj-blue" },
};

/** Colour legend grouped by class (for the settings key). */
export const TAJWID_LEGEND: { cls: string; ar: string; en: string }[] = [
  { cls: "tj-red", ar: "المدّ", en: "madd" },
  { cls: "tj-green", ar: "الغنّة والإخفاء والإقلاب والإدغام بغنّة", en: "ghunnah · ikhfā · iqlāb" },
  { cls: "tj-grey", ar: "الإدغام (بلا غنّة)", en: "idghām (no ghunnah)" },
  { cls: "tj-blue", ar: "القلقلة", en: "qalqalah" },
];
