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

// ---------- tunables (stage 2) ----------
const WEIGHTS = { struct: 0.28, cent: 0.24, norm: 0.18, particLow: 0.16, breadth: 0.14 };
const THEMES = 90;                 // number of semantic clusters (finer = tighter themes)
const JAMIA_FRACTION = 0.15;       // top 15% of a theme = جوامع, rest = تفصيل
const GLOBAL_KULLIYA_BAR = 0.90;   // a theme-head is a كلّية ONLY if its جامعية clears this global percentile

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
// particularity: proper-noun density
const pnPer = new Map();
for (const r of db.prepare("SELECT ayah_id, COUNT(*) c FROM word WHERE stem_pos='PN' GROUP BY ayah_id").iterate()) pnPer.set(r.ayah_id, r.c);
// establishing force: imperative (aspect IMPV) + prohibition/restriction/certainty particles + legislative lemmas
const impv = new Map(), part = new Map();
for (const r of db.prepare("SELECT ayah_id, COUNT(*) c FROM segment WHERE aspect='IMPV' GROUP BY ayah_id").iterate()) impv.set(r.ayah_id, r.c);
for (const r of db.prepare("SELECT ayah_id, pos, COUNT(*) c FROM segment WHERE pos IN ('PRO','RES','EXP','EXL','CERT') GROUP BY ayah_id, pos").iterate()) {
  const o = part.get(r.ayah_id) || {}; o[r.pos] = r.c; part.set(r.ayah_id, o);
}

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

// centrality: weighted indegree from neighbors.bin
const nb = fs.readFileSync(`${PUB}/quran-neighbors.bin`);
const nab = nb.buffer.slice(nb.byteOffset, nb.byteOffset + nb.byteLength);
const nhl = new DataView(nab).getUint32(0, true);
const K = JSON.parse(new TextDecoder().decode(new Uint8Array(nab, 4, nhl))).k;
const nbytes = new Uint8Array(nab, 4 + nhl);
const indeg = new Float64Array(N);
for (let u = 0; u < N; u++) {
  const base = u * K * 3;
  for (let i = 0; i < K; i++) { const off = base + i * 3; const id = nbytes[off] | (nbytes[off + 1] << 8); if (!id) break; indeg[id - 1] += nbytes[off + 2] / 100; }
}

// structural universality (text markers)
const norm = (t) => (" " + (t || "") + " ").replace(/[ً-ْٰ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
function structural(text) {
  const t = norm(text), has = (re) => (t.match(re) || []).length; let s = 0;
  s += 4 * has(/ كل شيء | بكل شيء | على كل شيء /g);
  s += 3 * has(/ لا اله الا | ليس كمثله /g);
  s += 3 * has(/ كل نفس | كل امه | كل انسان | لكل /g);
  s += 3 * has(/ الناس | الانسان | العالمين | للعالمين /g);
  s += 2 * has(/ كل | جميع | كلما /g);
  s += 2 * has(/ السماوات والارض | ما في السماوات | له ملك /g);
  s += 2 * has(/ ان الله | ان ربك | كتب ربكم | ان في /g);
  s += 0.5 * has(/ الذين | الذي | التي /g);
  return s;
}

// ---------- stage 1: raw signals ----------
const rows = ayahs.map((a, i) => {
  const p = part.get(a.ayah_id) || {};
  const norml = 2 * (impv.get(a.ayah_id) || 0) + 2 * (p.PRO || 0) + 1.5 * (p.RES || 0) + 1 * ((p.EXP || 0) + (p.EXL || 0)) + 1 * (p.CERT || 0);
  return {
    a, i,
    struct: structural(a.text_clean),
    cent: indeg[i],
    norm: norml,
    partic: (pnPer.get(a.ayah_id) || 0) / Math.max(1, a.word_count),
    breadth: rootsPer.get(a.ayah_id)?.size || 0,
  };
});
function pct(key) {
  const s = [...rows].sort((x, y) => x[key] - y[key]);
  s.forEach((r, i) => (r[key + "P"] = i / (N - 1)));
}
["struct", "cent", "norm", "partic", "breadth"].forEach(pct);

// ---------- stage 1: themes (weight-independent, farthest-point sampling) ----------
const seeds = [idIndex.get(db.prepare("SELECT ayah_id FROM ayah WHERE location='2:255'").get().ayah_id)]; // آية الكرسي as first anchor
const minD = new Float32Array(N).fill(2);
for (let s = 0; s < THEMES; s++) {
  const seed = seeds[s];
  for (let j = 0; j < N; j++) { const d = 1 - cos(seed, j); if (d < minD[j]) minD[j] = d; }
  if (s + 1 < THEMES) { let far = 0, fd = -1; for (let j = 0; j < N; j++) if (minD[j] > fd) { fd = minD[j]; far = j; } seeds.push(far); }
}
const cluster = new Int16Array(N);
for (let j = 0; j < N; j++) { let best = 0, bs = -2; for (let s = 0; s < seeds.length; s++) { const c = cos(seeds[s], j); if (c > bs) { bs = c; best = s; } } cluster[j] = best; }

// ---------- stage 2: جامعية + tiers ----------
for (const r of rows) r.jamiya = WEIGHTS.struct * r.structP + WEIGHTS.cent * r.centP + WEIGHTS.norm * r.normP + WEIGHTS.particLow * (1 - r.particP) + WEIGHTS.breadth * r.breadthP;
// global جامعية percentile — the كلّية bar is read against ALL verses, not just the theme
const gp = new Map();
[...rows].sort((x, y) => x.jamiya - y.jamiya).forEach((r, i) => gp.set(r.i, i / (N - 1)));
const byCluster = Array.from({ length: seeds.length }, () => []);
for (const r of rows) byCluster[cluster[r.i]].push(r);
const tier = new Map();
for (const members of byCluster) {
  members.sort((x, y) => y.jamiya - x.jamiya);
  const nJam = Math.max(1, Math.round(members.length * JAMIA_FRACTION));
  members.forEach((r, rank) => {
    // كلّية = the theme's head AND globally among the most جامعة; else a strong verse is جامعة
    const t = (rank === 0 && gp.get(r.i) >= GLOBAL_KULLIYA_BAR) ? "كلّية"
      : (rank < nJam) ? "جامعة" : "تفصيل";
    tier.set(r.i, t);
  });
}

// edges: nearest higher-tier verse in the same theme
const order = { "كلّية": 0, "جامعة": 1, "تفصيل": 2 };
const parent = new Map();
for (const members of byCluster) {
  for (const r of members) {
    if (tier.get(r.i) === "كلّية") continue;
    let best = null, bs = -2;
    for (const o of members) if (o !== r && order[tier.get(o.i)] < order[tier.get(r.i)]) { const c = cos(r.i, o.i); if (c > bs) { bs = c; best = o; } }
    if (best) parent.set(r.i, best.a.location);
  }
}

// ---------- output + report ----------
const out = { meta: { verses: N, themes: seeds.length, weights: WEIGHTS }, verses: {} };
for (const r of rows) out.verses[r.a.location] = {
  tier: tier.get(r.i), jamiya: Math.round(r.jamiya * 1000) / 1000, theme: cluster[r.i], parent: parent.get(r.i) || null,
  sig: { struct: +r.structP.toFixed(2), cent: +r.centP.toFixed(2), norm: +r.normP.toFixed(2), particLow: +(1 - r.particP).toFixed(2), breadth: +r.breadthP.toFixed(2) },
};
fs.writeFileSync(`${PUB}/kulliyat.json`, JSON.stringify(out));

const counts = { "كلّية": 0, "جامعة": 0, "تفصيل": 0 };
for (const t of tier.values()) counts[t]++;
console.log(`verses ${N} · themes ${seeds.length} · كلّيات ${counts["كلّية"]} · جوامع ${counts["جامعة"]} · تفصيل ${counts["تفصيل"]}  (100% covered)`);
console.log("top كلّيات (theme heads), by جامعية:");
[...rows].filter((r) => tier.get(r.i) === "كلّية").sort((a, b) => b.jamiya - a.jamiya).slice(0, 12)
  .forEach((r) => console.log(`   ${nm(r.a).padEnd(13)} ج=${r.jamiya.toFixed(2)}  ${r.a.text_clean.slice(0, 60)}`));

// one theme end-to-end
const bigTheme = byCluster.map((m, s) => [s, m.length]).sort((a, b) => b[1] - a[1])[3][0];
const T = byCluster[bigTheme];
console.log(`\n=== one theme (#${bigTheme}, ${T.length} verses) ===`);
const kull = T.find((r) => tier.get(r.i) === "كلّية");
console.log(`كلّية:  ${nm(kull.a)}  ${kull.a.text_clean.slice(0, 66)}`);
console.log("جوامع:");
T.filter((r) => tier.get(r.i) === "جامعة").slice(0, 6).forEach((r) => console.log(`   ${nm(r.a).padEnd(13)} ← ${r.a.text_clean.slice(0, 56)}`));
console.log("تفصيل (sample):");
T.filter((r) => tier.get(r.i) === "تفصيل").slice(0, 5).forEach((r) => console.log(`   ${nm(r.a).padEnd(13)} → ${(parent.get(r.i) || "").padEnd(8)}  ${r.a.text_clean.slice(0, 46)}`));
