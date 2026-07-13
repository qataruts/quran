/**
 * derive-kulliyat.mjs — classify every āyah into كلّيّة / جامعة / تفصيل by a
 * computed «جامعية» score (5 transparent signals), organised into semantic
 * themes with a clean tree per theme. See docs/kulliyat-methodology.md.
 *
 * Two stages so weight-tuning is cheap:
 *   Stage 1 (weight-INDEPENDENT): the 5 raw signals + percentiles + the themes.
 *   Stage 2 (weight-DEPENDENT):   apply WEIGHTS → جامعية → tiers → tree.
 * Re-running with new WEIGHTS only redoes stage 2.
 *
 * Reads quran-kg.db + embeddings + neighbors. Writes public/kulliyat.json.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PUB = path.resolve(HERE, "../apps/studio/public");

// ========================================================================
//  ALL TUNABLES IN ONE PLACE — nothing is hardcoded below this block.
//  Tweak, re-run, find the balance. (weights + bars = the fast stage.)
// ========================================================================
const CFG = {
  // the 6 reproducible factors — how much each counts toward جامعية (sum = 1).
  // التوحيدُ أصلُ الأصول: مِرساةٌ مُعلَنةٌ واحدة (القربُ من فضاء «لا إله إلا»)،
  // مع العموم اللفظيّ والاستقلال النحويّ. (see docs/kulliyat-algorithm-design.md)
  weights: { tawhid: 0.24, selfstand: 0.22, gen: 0.20, norm: 0.12, cent: 0.12, breadth: 0.10 },
  themes: 90,          // number of semantic clusters (organisation + the tree)
  kulliyaBar: 0.985,   // global جامعية percentile → كلّيّات (top ~1.5%)
  jamiaBar: 0.85,      // → جوامع (down to top ~15%); the rest = تفصيل
  distinct: 0.90,      // two كلّيّات closer than this (cosine) = same meaning → one head
  // (3) الاستقلال النحويّ — context-load = (PN + dem·DEM + narr·«قال»)/طول + cond·[COND?]
  context: { dem: 1, cond: 0.12, narr: 2 },
  // (4) قوّة الإنشاء — establishing devices by grammatical category (presence)
  norm: { impv: 2, pro: 2, res: 1.5, exp: 1, cert: 1 },
};

// ---------- load ----------
const db = new DatabaseSync(`${ROOT}/quran-kg.db`, { readOnly: true });
const ayahs = db.prepare("SELECT ayah_id, location, surah_no, ayah_no, text_clean, word_count FROM ayah ORDER BY ayah_id").all();
const N = ayahs.length;
const idIndex = new Map(ayahs.map((a, i) => [a.ayah_id, i]));
const sName = new Map(db.prepare("SELECT surah_no, name_ar FROM surah").all().map((r) => [r.surah_no, r.name_ar]));
const nm = (a) => `${sName.get(a.surah_no) ?? a.surah_no} ${a.ayah_no}`;

// breadth: distinct content roots
const rootsPer = new Map();
for (const r of db.prepare("SELECT ayah_id, root_id FROM word WHERE root_id IS NOT NULL").iterate()) {
  let s = rootsPer.get(r.ayah_id); if (!s) rootsPer.set(r.ayah_id, (s = new Set())); s.add(r.root_id);
}
// lexical generality: corpus document-frequency of each root (# verses that use it)
const df = new Map();
for (const s of rootsPer.values()) for (const rid of s) df.set(rid, (df.get(rid) || 0) + 1);
// particularity: proper-noun density — but a proper noun marks particularity only
// when it names a PERSON/PLACE (موسى، فرعون، مصر). The divine name (الله and its
// proclitic forms, الرحمن) is the opposite of particular, so it must NOT count.
const pnPer = new Map();
const isDivine = (t) => /لله$/.test(t) || t === "الرحمن" || t === "الرحمٰن";
for (const r of db.prepare("SELECT ayah_id, text_clean FROM word WHERE stem_pos='PN'").iterate()) {
  if (isDivine(r.text_clean)) continue;
  pnPer.set(r.ayah_id, (pnPer.get(r.ayah_id) || 0) + 1);
}
// establishing force: imperative (aspect IMPV) + prohibition/restriction/certainty particles + legislative lemmas
const impv = new Map(), part = new Map();
for (const r of db.prepare("SELECT ayah_id, COUNT(*) c FROM segment WHERE aspect='IMPV' GROUP BY ayah_id").iterate()) impv.set(r.ayah_id, r.c);
for (const r of db.prepare("SELECT ayah_id, pos, COUNT(*) c FROM segment WHERE pos IN ('PRO','RES','EXP','EXL','CERT') GROUP BY ayah_id, pos").iterate()) {
  const o = part.get(r.ayah_id) || {}; o[r.pos] = r.c; part.set(r.ayah_id, o);
}
// context-dependence (reproducible from QAC morphology): a conditional ruling
// (COND) or a demonstrative back-reference (DEM) means the verse leans on its
// setting — it is less self-standing, hence more particular (تخصيص).
const cond = new Map(), dem = new Map();
for (const r of db.prepare("SELECT ayah_id, COUNT(*) c FROM segment WHERE pos='COND' GROUP BY ayah_id").iterate()) cond.set(r.ayah_id, r.c);
for (const r of db.prepare("SELECT ayah_id, COUNT(*) c FROM segment WHERE pos='DEM' GROUP BY ayah_id").iterate()) dem.set(r.ayah_id, r.c);

// ---------- embeddings (normalized) ----------
const eb = fs.readFileSync(`${PUB}/quran-embeddings.bin`);
const eab = eb.buffer.slice(eb.byteOffset, eb.byteOffset + eb.byteLength);
const ehl = new DataView(eab).getUint32(0, true);
const ehdr = JSON.parse(new TextDecoder().decode(new Uint8Array(eab, 4, ehl)));
const DIM = ehdr.dim, eOff = 4 + ehl;
const escales = new Float32Array(eab.slice(eOff, eOff + ehdr.count * 4));
const edata = new Int8Array(eab, eOff + ehdr.count * 4, ehdr.count * DIM);
const V = new Float32Array(N * DIM); // normalized vectors, row = ayah index (ayah_id-1)
for (let r = 0; r < N; r++) {
  let n = 0; const b = r * DIM;
  for (let i = 0; i < DIM; i++) { const x = edata[b + i] * escales[r]; V[b + i] = x; n += x * x; }
  n = Math.sqrt(n) || 1; for (let i = 0; i < DIM; i++) V[b + i] /= n;
}
const cos = (i, j) => { let d = 0; const a = i * DIM, b = j * DIM; for (let k = 0; k < DIM; k++) d += V[a + k] * V[b + k]; return d; };

// (1) central meaning — cosine proximity to the centroid of ALL verse meanings.
// NOT kNN-indegree: that rewards verses with many near-duplicates (formulaic
// phrasings) and penalises verses whose meaning is distinctive; proximity to the
// centre of the Qur'an's meaning-space separates the universal from the narrative.
const CEN = new Float32Array(DIM);
for (let r = 0; r < N; r++) { const b = r * DIM; for (let i = 0; i < DIM; i++) CEN[i] += V[b + i]; }
{ let n = 0; for (let i = 0; i < DIM; i++) n += CEN[i] * CEN[i]; n = Math.sqrt(n) || 1; for (let i = 0; i < DIM; i++) CEN[i] /= n; }
const prox = new Float32Array(N);
for (let r = 0; r < N; r++) { let d = 0; const b = r * DIM; for (let i = 0; i < DIM; i++) d += V[b + i] * CEN[i]; prox[r] = d; }

// (6) التوحيد — ONE declared, transparent, reproducible seed: the embedding
// centroid of every verse that states «لا إله إلا» (the core توحيد formula), then
// each verse's cosine proximity to that axis. It encodes the one thing surface
// statistics cannot see — that God's oneness and attributes are foundational —
// WITHOUT naming any single verse. Recomputes identically every run.
const nrm = (t) => (" " + (t || "") + " ").replace(/[إأآ]/g, "ا");
const seedRows = ayahs.filter((a) => / لا اله الا /.test(nrm(a.text_clean))).map((a) => idIndex.get(a.ayah_id));
const TAW = new Float32Array(DIM);
for (const r of seedRows) { const b = r * DIM; for (let i = 0; i < DIM; i++) TAW[i] += V[b + i]; }
{ let n = 0; for (let i = 0; i < DIM; i++) n += TAW[i] * TAW[i]; n = Math.sqrt(n) || 1; for (let i = 0; i < DIM; i++) TAW[i] /= n; }
const tawhid = new Float32Array(N);
for (let r = 0; r < N; r++) { let d = 0; const b = r * DIM; for (let i = 0; i < DIM; i++) d += V[b + i] * TAW[i]; tawhid[r] = d; }
console.log(`توحيد seed: ${seedRows.length} آية «لا إله إلا»`);

// No hand-picked markers. Universality is measured by general, reproducible
// factors: semantic centrality (embeddings), lexical generality (corpus
// root-frequency), grammatical self-containment (QAC POS), establishing force
// (QAC POS), and conceptual breadth. See docs/kulliyat-algorithm-design.md.

// reported past speech (قال/قالوا…, NOT the universal imperative «قل») — a verse
// quoting a speaker is bound to its narrative context. A grammatical category
// (like COND/DEM), not a universality marker; deterministic on the clean text.
const narr = (t) => ((" " + (t || "") + " ").match(/ قال | قالوا | قالت | قالا | قالتا | فقال | فقالوا | وقال | وقالوا | قلنا | يقول | يقولون /g) || []).length;

// ---------- stage 1: raw signals (all reproducible; no marker lists) ----------
const rows = ayahs.map((a, i) => {
  const p = part.get(a.ayah_id) || {}, w = CFG.norm, cap = (x) => Math.min(1, x || 0);
  // (4) establishing force — presence per grammatical device (variety, not repetition)
  const norml = w.impv * cap(impv.get(a.ayah_id)) + w.pro * cap(p.PRO) + w.res * cap(p.RES) + w.exp * cap((p.EXP || 0) + (p.EXL || 0)) + w.cert * cap(p.CERT);
  // (2) lexical generality — mean log(corpus-frequency) of the verse's roots
  const roots = rootsPer.get(a.ayah_id);
  const gen = roots && roots.size ? [...roots].reduce((s, rid) => s + Math.log(df.get(rid) || 1), 0) / roots.size : 0;
  // (3) context-load — proper-nouns + demonstratives (density) + a conditional ruling (flat)
  const ctx = ((pnPer.get(a.ayah_id) || 0) + CFG.context.dem * (dem.get(a.ayah_id) || 0) + CFG.context.narr * narr(a.text_clean)) / Math.max(1, a.word_count) + CFG.context.cond * Math.min(1, cond.get(a.ayah_id) || 0);
  return {
    a, i,
    cent: prox[i],             // central meaning (centroid proximity)
    gen,                       // lexical generality
    ctx,                       // context-load → selfstand = 1 − pct
    norm: norml,               // establishing force
    breadth: roots?.size || 0, // conceptual breadth
    tawhid: tawhid[i],         // توحيد — proximity to «لا إله إلا» axis
  };
});
function pct(key) {
  const s = [...rows].sort((x, y) => x[key] - y[key]);
  s.forEach((r, i) => (r[key + "P"] = i / (N - 1)));
}
["cent", "gen", "ctx", "norm", "breadth", "tawhid"].forEach(pct);

// ---------- stage 1: themes (weight-independent, farthest-point sampling) ----------
const seeds = [idIndex.get(db.prepare("SELECT ayah_id FROM ayah WHERE location='2:255'").get().ayah_id)]; // آية الكرسي as first anchor
const minD = new Float32Array(N).fill(2);
for (let s = 0; s < CFG.themes; s++) {
  const seed = seeds[s];
  for (let j = 0; j < N; j++) { const d = 1 - cos(seed, j); if (d < minD[j]) minD[j] = d; }
  if (s + 1 < CFG.themes) { let far = 0, fd = -1; for (let j = 0; j < N; j++) if (minD[j] > fd) { fd = minD[j]; far = j; } seeds.push(far); }
}
const cluster = new Int16Array(N);
for (let j = 0; j < N; j++) { let best = 0, bs = -2; for (let s = 0; s < seeds.length; s++) { const c = cos(seeds[s], j); if (c > bs) { bs = c; best = s; } } cluster[j] = best; }

// ---------- stage 2: جامعية + tiers ----------
for (const r of rows) r.jamiya = CFG.weights.tawhid * r.tawhidP + CFG.weights.cent * r.centP + CFG.weights.gen * r.genP + CFG.weights.selfstand * (1 - r.ctxP) + CFG.weights.norm * r.normP + CFG.weights.breadth * r.breadthP;
// tiers are GLOBAL — a verse's rank is read against the whole Qur'an, not its theme,
// so the greatest verses are كلّيّات wherever they fall (a rich sūra gets several).
const gp = new Map();
[...rows].sort((x, y) => x.jamiya - y.jamiya).forEach((r, i) => gp.set(r.i, i / (N - 1)));
const tier = new Map();
for (const r of rows) {
  const p = gp.get(r.i);
  tier.set(r.i, p >= CFG.kulliyaBar ? "كلّية" : p >= CFG.jamiaBar ? "جامعة" : "تفصيل");
}
// distinct كلّيّات: no two heads may carry the SAME meaning. If two كلّيّات are
// near-duplicates in the embedding, keep the higher-جامعية one; the other folds
// to جامعة and gathers under a head (sisters follow one head — owner's rule).
{
  const heads = rows.filter((r) => tier.get(r.i) === "كلّية").sort((a, b) => b.jamiya - a.jamiya);
  let merged = 0;
  for (let x = 0; x < heads.length; x++) {
    if (tier.get(heads[x].i) !== "كلّية") continue;
    for (let y = x + 1; y < heads.length; y++) {
      if (tier.get(heads[y].i) !== "كلّية") continue;
      if (cos(heads[x].i, heads[y].i) > CFG.distinct) { tier.set(heads[y].i, "جامعة"); merged++; }
    }
  }
  console.log(`كلّيّات متطابقة المعنى → جامعة: ${merged}`);
}
const byCluster = Array.from({ length: seeds.length }, () => []);
for (const r of rows) byCluster[cluster[r.i]].push(r);

// edges: nearest higher-tier verse in its theme; if the theme has none higher,
// fall back to the nearest كلّية anywhere — so every verse reaches a كلّية (no orphans).
const order = { "كلّية": 0, "جامعة": 1, "تفصيل": 2 };
const kulliyat = rows.filter((r) => tier.get(r.i) === "كلّية");
const parent = new Map();
for (const r of rows) {
  const rt = tier.get(r.i);
  if (rt === "كلّية") continue;
  const members = byCluster[cluster[r.i]];
  const want = rt === "تفصيل" ? "جامعة" : "كلّية"; // attach to the tier immediately above (layered tree)
  let best = null, bs = -2;
  for (const o of members) if (tier.get(o.i) === want) { const c = cos(r.i, o.i); if (c > bs) { bs = c; best = o; } }
  if (!best) for (const o of members) if (o !== r && order[tier.get(o.i)] < order[rt]) { const c = cos(r.i, o.i); if (c > bs) { bs = c; best = o; } }
  if (!best) for (const o of kulliyat) { const c = cos(r.i, o.i); if (c > bs) { bs = c; best = o; } }
  if (best) parent.set(r.i, best.a.location);
}

// the tree rule (owner): a جامعة MUST gather ≥1 verse — else it is a leaf in
// disguise → demote to تفصيل (it still follows its own parent above it). Single
// pass is sound: demoted verses keep their parent and were nobody's parent, so
// no surviving جامعة is left childless.
const childOf = new Map();
for (const r of rows) { const pl = parent.get(r.i); if (pl) childOf.set(pl, (childOf.get(pl) || 0) + 1); }
let demoted = 0;
for (const r of rows) if (tier.get(r.i) === "جامعة" && !childOf.get(r.a.location)) { tier.set(r.i, "تفصيل"); demoted++; }
console.log(`جوامع بلا تفصيل → تفصيل: ${demoted}`);

// ---------- theme names: the roots most distinctive of each theme ----------
const rootAr = new Map(db.prepare("SELECT root_id, root_ar FROM root").all().map((r) => [r.root_id, r.root_ar]));
const overallDF = new Map(); // root -> # of verses (anywhere) that contain it
for (const s of rootsPer.values()) for (const rid of s) overallDF.set(rid, (overallDF.get(rid) || 0) + 1);
const themeNames = [];
for (let th = 0; th < seeds.length; th++) {
  const df = new Map();
  for (const r of byCluster[th]) { const s = rootsPer.get(r.a.ayah_id); if (s) for (const rid of s) df.set(rid, (df.get(rid) || 0) + 1); }
  // distinctive = frequent in this theme but not everywhere (TF ÷ √overall)
  const scored = [...df.entries()].map(([rid, c]) => [rid, c / Math.sqrt(overallDF.get(rid) || 1)]).sort((a, b) => b[1] - a[1]);
  themeNames[th] = scored.slice(0, 3).map(([rid]) => rootAr.get(rid)).filter(Boolean);
}

// ---------- output + report ----------
const out = { meta: { verses: N, themes: seeds.length, cfg: CFG, themeNames }, verses: {} };
for (const r of rows) out.verses[r.a.location] = {
  tier: tier.get(r.i), jamiya: Math.round(r.jamiya * 1000) / 1000, theme: cluster[r.i], parent: parent.get(r.i) || null,
  sig: { tawhid: +r.tawhidP.toFixed(2), cent: +r.centP.toFixed(2), gen: +r.genP.toFixed(2), selfstand: +(1 - r.ctxP).toFixed(2), norm: +r.normP.toFixed(2), breadth: +r.breadthP.toFixed(2) },
};
fs.writeFileSync(`${PUB}/kulliyat.json`, JSON.stringify(out));

const counts = { "كلّية": 0, "جامعة": 0, "تفصيل": 0 };
for (const t of tier.values()) counts[t]++;
console.log(`verses ${N} · themes ${seeds.length} · كلّيات ${counts["كلّية"]} · جوامع ${counts["جامعة"]} · تفصيل ${counts["تفصيل"]}  (100% covered)`);
console.log("top كلّيات (globally most جامعة):");
[...rows].filter((r) => tier.get(r.i) === "كلّية").sort((a, b) => b.jamiya - a.jamiya).slice(0, 12)
  .forEach((r) => console.log(`   ${nm(r.a).padEnd(13)} ج=${r.jamiya.toFixed(2)}  ${r.a.text_clean.slice(0, 58)}`));

// the two checks the owner raised
console.log("\nالبقرة — كلّيّاتها (يجب ألّا تكون فارغة):");
[...rows].filter((r) => r.a.surah_no === 2 && tier.get(r.i) === "كلّية").sort((a, b) => b.jamiya - a.jamiya)
  .forEach((r) => console.log(`   ${nm(r.a).padEnd(11)} ج=${r.jamiya.toFixed(2)}  ${r.a.text_clean.slice(0, 50)}`));
const nl = rows[idIndex.get(db.prepare("SELECT ayah_id FROM ayah WHERE location='27:41'").get().ayah_id)];
console.log(`\nالنمل ٤١ «قال نكّروا…» → ${tier.get(nl.i)}  ج=${nl.jamiya.toFixed(2)}  (الاستقلال = ${(1 - nl.ctxP).toFixed(2)})`);
