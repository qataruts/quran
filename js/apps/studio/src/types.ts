/** Shared types for Quran Studio (documents in quran-app.db, monlite). */

export interface SurahDoc {
  _id: string;
  surahNo: number;
  nameAr: string;
  nameTranslit: string;
  nameEn: string;
  revelation: "Meccan" | "Medinan";
  chronoOrder: number;
  ayahCount: number;
  rukuCount: number;
  hasBismillah: boolean;
  wordCount: number;
  letterCount: number;
}

export interface AyahDoc {
  _id: string; // "a<ayahId>"
  location: string; // "s:a"
  surahNo: number;
  ayahNo: number;
  textUthmani: string;
  textClean: string;
  juz: number;
  hizb: number;
  rub: number;
  ruku: number;
  page: number;
  manzil: number;
  sajdaType: string | null;
  wordCount: number;
  letterCount: number;
  /** Translations by language code (e.g. { en: "..." }); present when built. */
  translations?: Record<string, string>;
}

export interface SegmentDoc {
  text: string;
  role: "prefix" | "stem" | "suffix";
  pos: string;
  posEn: string;
  posAr: string;
  root?: string;
  lemma?: string;
  verbForm?: number;
  aspect?: "PERF" | "IMPF" | "IMPV";
  mood?: "IND" | "SUBJ" | "JUS";
  voice?: "ACT" | "PASS";
  caseMark?: "NOM" | "ACC" | "GEN";
  state?: "INDEF";
  person?: 1 | 2 | 3;
  gender?: "M" | "F";
  number?: "S" | "D" | "P";
  derivation?: "ACT_PCPL" | "PASS_PCPL" | "VN";
  family?: string;
}

export interface WordDoc {
  _id: string; // "w<wordId>"
  location: string; // "s:a:w"
  surahNo: number;
  ayahNo: number;
  wordNo: number;
  textUthmani: string;
  textClean: string;
  root: string | null;
  lemma: string | null;
  stemPos: string | null;
  segments: SegmentDoc[];
}

export interface RootDoc {
  _id: string; // "r<rootId>"
  root: string;
  occurrences: number;
  lemmas: { lemma: string; occurrences: number }[];
  /** every word location "s:a:w" where the root appears */
  locations: string[];
  /** classical lexicon meanings (Mufradat, Maqayis) — present when built */
  meanings?: { key: string; title: string; text: string }[];
}

/** Root co-occurrence edge (precomputed at convert time). */
export interface RootEdgeDoc {
  a: string; // root text (a < b lexically not guaranteed; a is rootA)
  b: string;
  w: number; // number of shared ayahs
}

/** A user collection of ayahs, persisted locally in the browser. */
export interface AyahCollection {
  id: string;
  name: string;
  description?: string;
  /** why these ayahs belong together, e.g. { kind: "root", value: "رحم" } */
  criteria?: { kind: "root" | "lemma" | "search" | "manual"; value: string }[];
  /** ayah locations "s:a" in insertion order */
  ayahs: string[];
  createdAt: number;
  updatedAt: number;
}

import { getUILang } from "./i18n";

export const VERB_FORM_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const VERB_FORM_AR = [
  "فَعَلَ", "فَعَّلَ", "فَاعَلَ", "أَفْعَلَ", "تَفَعَّلَ", "تَفَاعَلَ",
  "اِنْفَعَلَ", "اِفْتَعَلَ", "اِفْعَلَّ", "اِسْتَفْعَلَ", "اِفْعَالَّ", "اِفْعَوْعَلَ",
];

/** Verb form label: the Arabic وزن in Arabic UI, "Form X" in English. */
export const labelVerbForm = (n: number): string =>
  getUILang() === "ar"
    ? (VERB_FORM_AR[n - 1] ?? String(n))
    : `Form ${VERB_FORM_ROMAN[n - 1] ?? n}`;

/** Human labels (Arabic + English) for morphology feature values. */
export const FEATURE_LABELS: Record<string, string> = {
  PERF: "ماضٍ · perfect",
  IMPF: "مضارع · imperfect",
  IMPV: "أمر · imperative",
  IND: "مرفوع · indicative",
  SUBJ: "منصوب · subjunctive",
  JUS: "مجزوم · jussive",
  ACT: "مبني للمعلوم · active",
  PASS: "مبني للمجهول · passive",
  NOM: "مرفوع · nominative",
  ACC: "منصوب · accusative",
  GEN: "مجرور · genitive",
  INDEF: "نكرة · indefinite",
  M: "مذكر · masculine",
  F: "مؤنث · feminine",
  S: "مفرد · singular",
  D: "مثنى · dual",
  P: "جمع · plural",
  "1": "متكلم · 1st person",
  "2": "مخاطب · 2nd person",
  "3": "غائب · 3rd person",
  ACT_PCPL: "اسم فاعل · active participle",
  PASS_PCPL: "اسم مفعول · passive participle",
  VN: "مصدر · verbal noun",
  prefix: "سابقة · prefix",
  stem: "جذع · stem",
  suffix: "لاحقة · suffix",
};

/** Feature label in the UI language only (values are "العربية · english"). */
export const label = (v: string | number | null | undefined): string => {
  if (v == null) return "";
  const s = FEATURE_LABELS[String(v)] ?? String(v);
  const parts = s.split(" · ");
  if (parts.length < 2) return s;
  return getUILang() === "ar" ? parts[0] : parts[1];
};

/**
 * الإعراب — the corpus-style syntactic parse of one segment, composed in the UI
 * language from the features we already carry (POS + case/aspect/mood/voice),
 * mirroring corpus.quran.com's «اسم مرفوع / فعل ماضٍ / حرف جر …».
 */
export const i3rab = (g: SegmentDoc): string => {
  const ar = getUILang() === "ar";
  const pos = (ar ? g.posAr : g.posEn) || "";
  const parts: string[] = [];
  if (g.pos === "V") {
    parts.push(pos || (ar ? "فعل" : "verb"));
    if (g.aspect) parts.push(label(g.aspect)); // ماضٍ / مضارع / أمر
    if (g.aspect === "IMPF" && g.mood) parts.push(label(g.mood)); // مرفوع / منصوب / مجزوم
    if (g.voice === "PASS") parts.push(label(g.voice)); // mark passive only (active is default)
  } else if (g.caseMark) {
    parts.push(pos || (ar ? "اسم" : "noun")); // اسم / صفة / ضمير / اسم إشارة …
    parts.push(label(g.caseMark)); // مرفوع / منصوب / مجرور
    if (g.state === "INDEF") parts.push(ar ? "نكرة" : "indefinite");
  } else if (g.pos === "PRON" && g.role === "suffix") {
    parts.push(ar ? "ضمير متصل" : "attached pronoun");
  } else {
    parts.push(pos); // حرف جر / حرف نفي / أداة التعريف … ("" for rare particles)
  }
  return parts.filter(Boolean).join(" ");
};

/** Route to the Reader for an ayah ("s:a") or word ("s:a:w") location. */
export const readPathOf = (location: string): string => {
  const [s, a] = location.split(":");
  return a ? `/read/${s}/${a}` : `/read/${s}`;
};
