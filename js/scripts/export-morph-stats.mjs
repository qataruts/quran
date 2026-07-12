/**
 * الصرف والنحو والرسم بالأرقام — corpus-wide morphological statistics, computed
 * straight from the Qur'anic Arabic Corpus morphology we already ship
 * (data/quran-morphology.txt) — nothing authored, just counted.
 *
 * Output: js/apps/studio/public/morph-stats.json
 * Usage:  node scripts/export-morph-stats.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../data/quran-morphology.txt");
const OUT = path.resolve(HERE, "../apps/studio/public/morph-stats.json");

const lines = fs.readFileSync(SRC, "utf8").split("\n").filter(Boolean);

const inc = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const cls = new Map();      // stem word-class (N/V/P) → count
const vform = new Map();    // verb form 1..10
const tense = new Map();    // PERF/IMPF/IMPV
const mood = new Map();     // IND/SUBJ/JUS
const kase = new Map();     // NOM/ACC/GEN
const def = new Map();      // DET/INDEF
const voice = new Map();    // ACT/PASS (verbs)
const func = new Map();     // functional sub-POS: PRON/CONJ/REL/NEG/…
const letters = new Map();  // rasm letter frequency (diacritics stripped)

const DIAC = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // marks + tatwīl
let segCount = 0, wordCount = 0, verbCount = 0, letterTotal = 0;
const roots = new Set(), lemmas = new Set();

for (const ln of lines) {
  const [loc, text, pos, featStr = ""] = ln.split("\t");
  if (!loc) continue;
  segCount++;
  const feats = featStr.split("|");
  const has = (f) => feats.includes(f);
  const isPref = has("PREF"), isSuff = has("SUFF");
  if (loc.endsWith(":1")) wordCount++; // first segment of each word

  for (const f of feats) {
    if (f.startsWith("ROOT:")) roots.add(f.slice(5));
    else if (f.startsWith("LEM:")) lemmas.add(f.slice(4));
  }

  // word class — count STEM segments only (prefixes/suffixes aren't words)
  if (!isPref && !isSuff) inc(cls, pos);

  if (pos === "V") {
    verbCount++;
    for (const f of feats) if (f.startsWith("VF:")) inc(vform, f.slice(3));
    if (has("PERF")) inc(tense, "PERF");
    else if (has("IMPF")) inc(tense, "IMPF");
    else if (has("IMPV")) inc(tense, "IMPV");
    inc(voice, has("PASS") ? "PASS" : "ACT");
    for (const f of feats) if (f.startsWith("MOOD:")) inc(mood, f.slice(5));
  }

  // case (إعراب) on nominals
  for (const c of ["NOM", "ACC", "GEN"]) if (has(c)) inc(kase, c);
  // definiteness: DET (ال) rides the PREFIX segment; INDEF (nunation) the stem
  if (has("DET")) inc(def, "DET");
  else if (has("INDEF") && !isPref && !isSuff) inc(def, "INDEF");
  // functional word subtypes (whole-segment tags)
  for (const f of ["PRON", "CONJ", "REL", "NEG", "INTG", "COND", "DET", "ADJ", "ACT_PCPL", "PASS_PCPL", "EMPH", "PN"]) {
    if (has(f)) inc(func, f);
  }

  // rasm: base-letter frequency (strip diacritics/tatwīl, keep ʿUthmānī forms)
  for (const ch of (text || "").replace(DIAC, "")) {
    if (ch >= "ء" && ch <= "ي") { inc(letters, ch); letterTotal++; }
  }
}

const rows = (m, meta) =>
  [...m.entries()].map(([k, n]) => ({ k, n, ...(meta[k] || {}) })).sort((a, b) => b.n - a.n);

const AR = {
  cls: { N: { ar: "اسم", en: "Noun" }, V: { ar: "فعل", en: "Verb" }, P: { ar: "حرف / أداة", en: "Particle" } },
  tense: { PERF: { ar: "ماضٍ", en: "Perfect" }, IMPF: { ar: "مضارع", en: "Imperfect" }, IMPV: { ar: "أمر", en: "Imperative" } },
  voice: { ACT: { ar: "معلوم", en: "Active" }, PASS: { ar: "مجهول", en: "Passive" } },
  mood: { IND: { ar: "مرفوع", en: "Indicative" }, SUBJ: { ar: "منصوب", en: "Subjunctive" }, JUS: { ar: "مجزوم", en: "Jussive" } },
  kase: { NOM: { ar: "مرفوع", en: "Nominative" }, ACC: { ar: "منصوب", en: "Accusative" }, GEN: { ar: "مجرور", en: "Genitive" } },
  def: { DET: { ar: "معرفة (بأل)", en: "Definite" }, INDEF: { ar: "نكرة", en: "Indefinite" } },
  func: {
    PRON: { ar: "ضمير", en: "Pronoun" }, CONJ: { ar: "عطف", en: "Conjunction" },
    REL: { ar: "اسم موصول", en: "Relative" }, NEG: { ar: "نفي", en: "Negation" },
    INTG: { ar: "استفهام", en: "Interrogative" }, COND: { ar: "شرط", en: "Conditional" },
    DET: { ar: "أداة تعريف", en: "Determiner" }, ADJ: { ar: "صفة", en: "Adjective" },
    ACT_PCPL: { ar: "اسم فاعل", en: "Active participle" }, PASS_PCPL: { ar: "اسم مفعول", en: "Passive participle" },
    EMPH: { ar: "توكيد", en: "Emphasis" }, PN: { ar: "اسم علم", en: "Proper noun" },
  },
};
const VF_AR = { 1: "فَعَلَ", 2: "فَعَّلَ", 3: "فاعَلَ", 4: "أَفْعَلَ", 5: "تَفَعَّلَ", 6: "تَفاعَلَ", 7: "اِنْفَعَلَ", 8: "اِفْتَعَلَ", 9: "اِفْعَلَّ", 10: "اِسْتَفْعَلَ" };
const ORD_AR = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

const out = {
  meta: {
    segments: segCount, words: wordCount, verbs: verbCount,
    roots: roots.size, lemmas: lemmas.size, letters: letterTotal,
    source: "الوسم الصرفي — Quranic Arabic Corpus (v0.4)",
  },
  classes: rows(cls, AR.cls),
  verbForms: [...vform.entries()]
    .map(([k, n]) => ({ k: Number(k), n, ar: VF_AR[Number(k)] || String(k), en: `Form ${k} (${ORD_AR[Number(k)] || k})` }))
    .sort((a, b) => a.k - b.k),
  tense: rows(tense, AR.tense),
  voice: rows(voice, AR.voice),
  mood: rows(mood, AR.mood),
  case: rows(kase, AR.kase),
  definite: rows(def, AR.def),
  functionWords: rows(func, AR.func),
  letters: [...letters.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n),
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log(`segments ${segCount} · words ${wordCount} · verbs ${verbCount} · roots ${roots.size} · lemmas ${lemmas.size}`);
console.log("classes:", out.classes.map((r) => `${r.ar} ${r.n}`).join(" · "));
console.log("verb forms:", out.verbForms.map((r) => `${r.k}:${r.n}`).join(" "));
console.log("tense:", out.tense.map((r) => `${r.ar} ${r.n}`).join(" · "));
console.log("case:", out.case.map((r) => `${r.ar} ${r.n}`).join(" · "));
console.log("top letters:", out.letters.slice(0, 8).map((r) => `${r.k}:${r.n}`).join(" "));
