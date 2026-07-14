/**
 * derive-v2_1.mjs — اشتقاق v2.1: «المتماثلُ يُحسَب، واللامتماثلُ يُحكَم».
 *
 * الجديد على v2.0:
 *  ١) إشارة المثاني الحتمية على مستوى الوحدة: توائمُ الوحدة = الآياتُ الأخرى التي
 *     تحوي تسلسلَ lemmas الوحدةِ متّصلًا (وحدات ≤ 12 lemma: التسلسل كاملًا؛
 *     الأطول: أي مدًى مشترك متصل ≥ 12) — «كتابًا متشابهًا مثاني» يقاس مباشرة.
 *     استبعاد: الآية المضيفة و±2 في سورتها.
 *  ٢) قاعدة الطبقة: كلّية = مؤهّلة ∧ (انتشار المفصّلات ≥ T ∨ انتشار المثاني ≥ T₂)
 *                جامعة = مؤهّلة ∧ (مفصّلات ≥ m ∨ مثانٍ ≥ m₂) — الضبط على نصف الضبط الأصلي.
 *  ٣) كيان الصيغة: مقطعٌ ≤ 5 كلمات وتوائمه ≥ 8 = «صيغة مثانية» — يُسجَّل ولا يرقّي آيته.
 *  ٤) التقييم: نصف الضبط (ضبط) → محجوب v2.0 (نظرة ثانية، قيمتها الاستدلالية أضعف)
 *     → الملحق الجديد (الدليل الأول، تشغيلة واحدة).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const RUN = join(ROOT, "findings", "kulliyat-v2", "provenance", "v2-run");
const OUT = join(ROOT, "findings", "kulliyat-v2");
const db = new DatabaseSync(join(ROOT, "quran-kg.db"), { readOnly: true });

// ── بيانات ───────────────────────────────────────────────────────────────────
const raw = readFileSync(join(RUN, "judge-results-raw.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const hubs = JSON.parse(readFileSync(join(RUN, "hubs.json"), "utf8"));
const kul = JSON.parse(readFileSync(join(ROOT, "js", "apps", "studio", "public", "kulliyat.json"), "utf8"));
const sample = JSON.parse(readFileSync(join(OUT, "sample.json"), "utf8"));
const themeOf = (loc) => kul.verses[loc]?.theme ?? -1;

const net = new Map();
for (const b of raw)
  for (const j of b.judgments) {
    let m = net.get(j.id);
    if (!m) net.set(j.id, (m = new Map()));
    for (const l of j.links ?? []) if (!m.has(l.loc)) m.set(l.loc, l.rel);
  }

// تسلسل tokens لكل آية: lemma_id إن وجد وإلا النص المطبَّع (يشمل الأدوات)
const strip = (t) => (t || "").normalize("NFC").replace(/[ً-ْٰـ]/g, "");
const rows = db.prepare(`SELECT w.ayah_id, w.word_no, w.lemma_id, w.text_clean, a.location, a.surah_no, a.ayah_no
  FROM word w JOIN ayah a ON a.ayah_id=w.ayah_id ORDER BY w.ayah_id, w.word_no`).all();
const seqByLoc = new Map(); // loc -> [token]
const metaByLoc = new Map();
for (const r of rows) {
  let s = seqByLoc.get(r.location);
  if (!s) { seqByLoc.set(r.location, (s = [])); metaByLoc.set(r.location, { surah: r.surah_no, ayah: r.ayah_no }); }
  s.push(r.lemma_id != null ? "L" + r.lemma_id : "T" + strip(r.text_clean));
}

// فهرس 4-غرام → مواضع
const gramIdx = new Map();
for (const [loc, seq] of seqByLoc) {
  for (let i = 0; i + 4 <= seq.length; i++) {
    const g = seq.slice(i, i + 4).join("|");
    let arr = gramIdx.get(g);
    if (!arr) gramIdx.set(g, (arr = []));
    arr.push(loc);
  }
}

// هل تحوي seq المتتالية sub متّصلة؟
function containsRun(seq, sub) {
  outer: for (let i = 0; i + sub.length <= seq.length; i++) {
    for (let k = 0; k < sub.length; k++) if (seq[i + k] !== sub[k]) continue outer;
    return true;
  }
  return false;
}
// أطول مدى مشترك متصل بين تسلسلين (للوحدات الطويلة)
function longestCommonRun(a, b) {
  const pos = new Map();
  b.forEach((t, i) => { let arr = pos.get(t); if (!arr) pos.set(t, (arr = [])); arr.push(i); });
  let best = 0;
  for (let i = 0; i < a.length; i++)
    for (const j of pos.get(a[i]) ?? []) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  return best;
}

// ── مثاني كل وحدة ────────────────────────────────────────────────────────────
const MIN_FULL = 4;      // أدنى طول تسلسلٍ يُعتدّ بمطابقته كاملًا
const LONG_RUN = 12;     // الوحدات الأطول من 12: يكفي مدى مشترك ≥ 12
console.log("حساب مثاني الوحدات…");
const units = [];
for (const h of hubs) {
  const seq = (seqByLoc.get(h.loc) ?? []).slice(h.range[0] - 1, h.range[1]);
  const links = net.get(h.id) ?? new Map();
  const elab = new Set([...links.keys()]);
  const eThemes = new Set([...elab].map(themeOf).filter((t) => t >= 0));
  // مرشّحو التوائم من فهرس الغرامات
  const twins = new Set();
  if (seq.length >= MIN_FULL) {
    const meta = metaByLoc.get(h.loc);
    const cand = new Set();
    for (let i = 0; i + 4 <= seq.length; i++)
      for (const loc of gramIdx.get(seq.slice(i, i + 4).join("|")) ?? []) cand.add(loc);
    cand.delete(h.loc);
    for (const loc of cand) {
      const m2 = metaByLoc.get(loc);
      if (m2.surah === meta.surah && Math.abs(m2.ayah - meta.ayah) <= 2) continue;
      const other = seqByLoc.get(loc);
      const ok = seq.length <= LONG_RUN ? containsRun(other, seq) : longestCommonRun(seq, other) >= LONG_RUN;
      if (ok) twins.add(loc);
    }
  }
  const tThemes = new Set([...twins].map(themeOf).filter((t) => t >= 0));
  const isFormula = h.unit !== "aya" && seq.length <= 5 && twins.size >= 8;
  units.push({ id: h.id, loc: h.loc, unit: h.unit, gates: h.gates, len: seq.length,
    nElab: elab.size, spread: eThemes.size, nTwins: twins.size, twinSpread: tThemes.size, isFormula });
}
const formulas = units.filter((u) => u.isFormula);
console.log(`وحدات: ${units.length} · صيغ مثانية معزولة: ${formulas.length}`);
console.log(`مثاني: p50=${pct(units.map((u) => u.nTwins), 50)} p90=${pct(units.map((u) => u.nTwins), 90)} max=${Math.max(...units.map((u) => u.nTwins))}`);
function pct(arr, p) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor((p / 100) * (s.length - 1))]; }

// آية → أفضل وحدة غير صيغية
const byVerse = new Map();
for (const u of units) {
  if (u.isFormula) continue;
  const cur = byVerse.get(u.loc);
  const key = (x) => Math.max(x.spread, x.twinSpread) * 100 + x.nElab + x.nTwins;
  if (!cur || key(u) > key(cur)) byVerse.set(u.loc, u);
}

// ── الطبقة + الضبط ───────────────────────────────────────────────────────────
const tierOf = (loc, T, M, T2, M2) => {
  const u = byVerse.get(loc);
  if (!u) return "تفصيل";
  if (u.spread >= T || u.twinSpread >= T2) return "كلّية";
  if (u.nElab >= M || u.nTwins >= M2) return "جامعة";
  return "تفصيل";
};
const expand = (refs) => {
  const m = refs.match(/^(\d+):(\d+)(?:-(\d+))?$/);
  const L = [];
  for (let a = Number(m[2]); a <= Number(m[3] ?? m[2]); a++) L.push(`${m[1]}:${a}`);
  return L;
};
function scoreItems(items, T, M, T2, M2) {
  let rHit = 0, rTot = 0, cHit = 0, cTot = 0;
  const misses = [], leaks = [];
  for (const it of items) {
    const tiers = expand(it.refs).map((l) => tierOf(l, T, M, T2, M2));
    const best = tiers.includes("كلّية") ? "كلّية" : tiers.includes("جامعة") ? "جامعة" : "تفصيل";
    if (it.expected === "tafsil") { cTot++; if (best === "تفصيل") cHit++; else leaks.push(`#${it.id} ${it.refs}→${best}`); }
    else if (it.expected === "rule-bab") { rTot++; if (best === "جامعة") rHit++; else misses.push(`#${it.id} ${it.refs}→${best}`); }
    else { rTot++; if (best !== "تفصيل") rHit++; else misses.push(`#${it.id} ${it.refs}→تفصيل`); }
  }
  return { rHit, rTot, cHit, cTot, score: rHit + cHit, misses, leaks };
}
const tuneItems = sample.items.filter((i) => i.half === "tune");
let best = null;
for (let T = 3; T <= 9; T++) for (let M = 2; M <= 5; M++)
  for (let T2 = 3; T2 <= 9; T2++) for (let M2 = 2; M2 <= 5; M2++) {
    const s = scoreItems(tuneItems, T, M, T2, M2);
    const sum = T + M + T2 + M2;
    if (!best || s.score > best.s.score || (s.score === best.s.score && sum > best.sum)) best = { T, M, T2, M2, s, sum };
  }
// قاعدة التعادل المعلنة: عند تساوي الدرجة نفضّل الأكثرَ تحفّظًا (أكبر مجموع عتبات)
console.log(`\nالضبط: T=${best.T} m=${best.M} T₂=${best.T2} m₂=${best.M2}`);
console.log(`  نصف الضبط: قواعد ${best.s.rHit}/${best.s.rTot} · ضد ${best.s.cHit}/${best.s.cTot}`);
if (best.s.misses.length) console.log("  فوات:", best.s.misses.join(" · "));
if (best.s.leaks.length) console.log("  تسرب:", best.s.leaks.join(" · "));

// ── حساسية ───────────────────────────────────────────────────────────────────
{
  const baseT = new Map();
  for (const loc of Object.keys(kul.verses)) baseT.set(loc, tierOf(loc, best.T, best.M, best.T2, best.M2));
  const flips = (T, M, T2, M2) => { let f = 0; for (const [loc, t0] of baseT) if (tierOf(loc, T, M, T2, M2) !== t0) f++; return f; };
  console.log("\nحساسية ±1:");
  const v = [[best.T + 1, best.M, best.T2, best.M2], [best.T - 1, best.M, best.T2, best.M2],
             [best.T, best.M, best.T2 + 1, best.M2], [best.T, best.M, best.T2 - 1, best.M2],
             [best.T, best.M + 1, best.T2, best.M2], [best.T, best.M, best.T2, best.M2 + 1]];
  for (const [a, b, c, d] of v) console.log(`  T=${a},m=${b},T₂=${c},m₂=${d}: ${flips(a, b, c, d)} (${(100 * flips(a, b, c, d) / 6236).toFixed(1)}%)`);
}

// ── التقييم النهائي ──────────────────────────────────────────────────────────
const holdV20 = scoreItems(sample.items.filter((i) => i.half === "holdout"), best.T, best.M, best.T2, best.M2);
console.log(`\n— محجوب v2.0 (نظرة ثانية، استدلال أضعف): قواعد ${holdV20.rHit}/${holdV20.rTot} · ضد ${holdV20.cHit}/${holdV20.cTot}`);
if (holdV20.misses.length) console.log("  فوات:", holdV20.misses.join(" · "));
if (holdV20.leaks.length) console.log("  تسرب:", holdV20.leaks.join(" · "));

// الملحق الجديد — الدليل الأول
const SUPP = [
  ["S1", "2:110", "rule"], ["S2", "3:92", "rule"], ["S3", "4:36", "rule"], ["S4", "16:125", "rule"],
  ["S5", "5:8", "rule"], ["S6", "39:10", "rule"], ["S7", "40:60", "rule"], ["S8", "29:69", "rule"],
  ["S9", "7:96", "rule"], ["S10", "17:7", "rule"], ["S11", "42:40", "rule"], ["S12", "2:152", "rule"],
  ["S13", "16:128", "rule"], ["S14", "13:28", "rule"], ["S15", "35:28", "rule"], ["S16", "24:52", "rule"],
  ["S17", "12:70", "tafsil"], ["S18", "18:79", "tafsil"], ["S19", "28:76", "tafsil"], ["S20", "20:10", "tafsil"],
  ["S21", "3:121", "tafsil"], ["S22", "24:11", "tafsil"], ["S23", "38:34", "tafsil"], ["S24", "12:25", "tafsil"],
].map(([id, refs, expected]) => ({ id, refs, expected }));
const supp = scoreItems(SUPP, best.T, best.M, best.T2, best.M2);
console.log(`\n═══ الملحق المحجوب الجديد (الدليل الأول، تشغيلة واحدة) ═══`);
console.log(`قواعد: ${supp.rHit}/${supp.rTot} = ${(100 * supp.rHit / supp.rTot).toFixed(0)}% · ضد: ${supp.cHit}/${supp.cTot} = ${(100 * supp.cHit / supp.cTot).toFixed(0)}%`);
if (supp.misses.length) console.log("فوات:", supp.misses.join(" · "));
if (supp.leaks.length) console.log("تسرب:", supp.leaks.join(" · "));

// ── التوزيع والإخراج ─────────────────────────────────────────────────────────
const dist = { "كلّية": 0, "جامعة": 0, "تفصيل": 0 };
const verdicts = {};
for (const loc of Object.keys(kul.verses)) { const t = tierOf(loc, best.T, best.M, best.T2, best.M2); dist[t]++; verdicts[loc] = t; }
console.log(`\nالتوزيع: كلّية ${dist["كلّية"]} · جامعة ${dist["جامعة"]} · تفصيل ${dist["تفصيل"]}`);
const tops = [...byVerse.values()].filter((u) => u.spread >= best.T || u.twinSpread >= best.T2)
  .sort((a, b) => Math.max(b.spread, b.twinSpread) - Math.max(a.spread, a.twinSpread)).slice(0, 15);
console.log("\nأعلى الكلّيّات:");
for (const u of tops) console.log(`  ${u.loc}/${u.unit} — مفصّلات:${u.nElab}(انتشار ${u.spread}) مثانٍ:${u.nTwins}(انتشار ${u.twinSpread})`);
console.log("\nعينة صيغ مثانية معزولة:", formulas.slice(0, 6).map((f) => f.loc + "/" + f.unit).join(" · "));

writeFileSync(join(OUT, "derived-v2.1.json"), JSON.stringify({
  params: { ...{ T: best.T, M: best.M, T2: best.T2, M2: best.M2 }, K: 90, date: "2026-07-14" },
  tune: { rules: `${best.s.rHit}/${best.s.rTot}`, counters: `${best.s.cHit}/${best.s.cTot}` },
  holdoutV20_secondLook: { rules: `${holdV20.rHit}/${holdV20.rTot}`, counters: `${holdV20.cHit}/${holdV20.cTot}` },
  supplement_primary: { rules: `${supp.rHit}/${supp.rTot}`, counters: `${supp.cHit}/${supp.cTot}`, misses: supp.misses, leaks: supp.leaks },
  dist, formulas: formulas.map((f) => ({ id: f.id, nTwins: f.nTwins })),
  units: units.map((u) => ({ id: u.id, loc: u.loc, unit: u.unit, gates: u.gates, nElab: u.nElab, spread: u.spread, nTwins: u.nTwins, twinSpread: u.twinSpread, isFormula: u.isFormula })),
  verdicts,
}));
console.log("→ derived-v2.1.json");
