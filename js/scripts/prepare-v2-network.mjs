/**
 * prepare-v2-network.mjs — تجهيز شبكة التفصيل الموجَّهة v2 (بلا أيّ سرب):
 *  ١) المحاور = الوحدات المؤهّلة من gates-v1.json (مقاطعُ إن وُجدت، وإلا الآية).
 *  ٢) الاسترجاع اللامتماثل لكل محور: أمامي (top-K جيران المعنى) ∪ عكسي
 *     (الآيات التي يظهر المحورُ في جيرانها هي) ∪ مشاركة الجذور النادرة لكلمات
 *     الوحدة نفسها. استبعاد: نفس السورة ±٢، وشبه المطابق (cos ≥ 0.95).
 *  ٣) إخراج دفعات الحكم + عيّنة الحكم المزدوج (kappa).
 * كلُّ المعاملات معلنة أدناه؛ الإخراج والدفعات تُودَع في provenance قبل التشغيل.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "findings", "kulliyat-v2");
const db = new DatabaseSync(join(ROOT, "quran-kg.db"), { readOnly: true });

// ── المعاملات (معلنة) ────────────────────────────────────────────────────────
const DIM = 768;
const FWD_K = 20;          // جيران أماميون
const REV_K = 12;          // عكسيون (v1.1: خُفّض ١٤→١٢ لضبط الغلاف)
const ROOT_K = 10;         // مشاركو الجذور النادرة (جذور كلمات الوحدة)
const RARE_OCC = 300;      // «نادر» = ورودُه في المصحف < 300
const CAP = 30;            // سقف مرشّحي المحور (v1.1: ٣٢→٣٠)
const COS_FLOOR = 0.55;    // أرضية القرب (v1.1: ٠٫٥٠→٠٫٥٥ — معدل الروابط تحتها ضئيل)
const NEAR_DUP = 0.95;     // شبه المطابق يُستبعد (توائم — طبقة المثاني تعالجها)
const KAPPA_PAIRS = 600;   // عيّنة الحكم المزدوج
const HUBS_PER_BATCH = 5;  // محاور لكل دفعة حكم

// ── المحاور من gates-v1 ──────────────────────────────────────────────────────
const gates = JSON.parse(readFileSync(join(OUT, "gates-v1.json"), "utf8"));
const ayahRows = db.prepare("SELECT ayah_id, location, surah_no, ayah_no, text_uthmani, word_count FROM ayah").all();
const byLoc = new Map(ayahRows.map((a) => [a.location, a]));
const byId = new Map(ayahRows.map((a) => [a.ayah_id, a]));

const WAQF = /[ۖ-ۜ]/;
const AR_LETTER = /[ء-يٱ-ۓە]/;
function clauseText(text, from, to) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const words = [];
  for (const tok of tokens) if (AR_LETTER.test(tok.replace(WAQF, ""))) words.push(tok.replace(WAQF, "").trim());
  return words.slice(from - 1, to).join(" ");
}

const hubs = [];
for (const [loc, r] of Object.entries(gates)) {
  if (!r.qualified) continue;
  const a = byLoc.get(loc);
  const clauses = r.units.filter((u) => u.unit !== "aya" && u.qualified);
  const chosen = clauses.length ? clauses : r.units.filter((u) => u.unit === "aya" && u.qualified);
  for (const u of chosen) {
    const text = u.unit === "aya" ? a.text_uthmani.replace(WAQF, "").trim() : clauseText(a.text_uthmani, u.range[0], u.range[1]);
    hubs.push({ id: `${loc}/${u.unit}`, loc, ayah_id: a.ayah_id, unit: u.unit, range: u.range, gates: u.gates, text });
  }
}
console.log(`hubs (qualified units, clauses preferred): ${hubs.length}`);

// ── التضمينات + مصفوفة الجوار الكاملة (أمامي وعكسي بالضبط) ──────────────────
const embRows = db.prepare("SELECT ayah_id, vector AS vec FROM ayah_embedding ORDER BY ayah_id").all();
const N = embRows.length;
const mat = new Float32Array(N * DIM);
const idToRow = new Map();
embRows.forEach((r, i) => {
  idToRow.set(r.ayah_id, i);
  const v = new Float32Array(r.vec.buffer, r.vec.byteOffset, DIM);
  let n = 0;
  for (let d = 0; d < DIM; d++) n += v[d] * v[d];
  n = Math.sqrt(n) || 1;
  for (let d = 0; d < DIM; d++) mat[i * DIM + d] = v[d] / n;
});
const rowToId = embRows.map((r) => r.ayah_id);

console.log("computing forward top-K for all verses…");
const topK = new Int32Array(N * FWD_K).fill(-1);
const topS = new Float32Array(N * FWD_K);
{
  const row = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const base = i * DIM;
    for (let j = 0; j < N; j++) {
      if (j === i) { row[j] = -1; continue; }
      let d = 0;
      const bj = j * DIM;
      for (let k = 0; k < DIM; k++) d += mat[base + k] * mat[bj + k];
      row[j] = d;
    }
    // top-K اختيارًا جزئيًّا
    const idx = [...row.keys()].sort((a, b) => row[b] - row[a]).slice(0, FWD_K);
    for (let k = 0; k < FWD_K; k++) { topK[i * FWD_K + k] = idx[k]; topS[i * FWD_K + k] = row[idx[k]]; }
    if (i % 800 === 0) console.log(`  …${i}/${N}`);
  }
}

// العكسي: قلب القوائم
const reverse = new Map(); // row -> [{row, score}]
for (let i = 0; i < N; i++)
  for (let k = 0; k < Math.min(REV_K, FWD_K); k++) {
    const j = topK[i * FWD_K + k];
    if (j < 0) continue;
    let arr = reverse.get(j);
    if (!arr) reverse.set(j, (arr = []));
    arr.push({ row: i, score: topS[i * FWD_K + k] });
  }

// ── الجذور النادرة لكلمات كل وحدة ────────────────────────────────────────────
const rootOcc = new Map(db.prepare("SELECT root_id, occurrences FROM root").all().map((r) => [r.root_id, r.occurrences]));
const wordRoots = db.prepare("SELECT ayah_id, word_no, root_id FROM word WHERE root_id IS NOT NULL").all();
const rootsByAyah = new Map();
const versesByRoot = new Map();
for (const w of wordRoots) {
  let m = rootsByAyah.get(w.ayah_id);
  if (!m) rootsByAyah.set(w.ayah_id, (m = []));
  m.push(w);
  if ((rootOcc.get(w.root_id) ?? 1e9) < RARE_OCC) {
    let s = versesByRoot.get(w.root_id);
    if (!s) versesByRoot.set(w.root_id, (s = new Set()));
    s.add(w.ayah_id);
  }
}

// ── بناء مرشّحي كل محور ─────────────────────────────────────────────────────
const ok = (hub, cand) => {
  const A = byId.get(hub.ayah_id), B = byId.get(cand);
  if (!B) return false;
  if (A.surah_no === B.surah_no && Math.abs(A.ayah_no - B.ayah_no) <= 2) return false;
  return true;
};
const cosOf = (r1, r2) => {
  let d = 0;
  const b1 = r1 * DIM, b2 = r2 * DIM;
  for (let k = 0; k < DIM; k++) d += mat[b1 + k] * mat[b2 + k];
  return d;
};

let pairs = 0;
for (const hub of hubs) {
  const hr = idToRow.get(hub.ayah_id);
  const cand = new Map(); // ayah_id -> {via, score}
  // أمامي
  for (let k = 0; k < FWD_K && cand.size < CAP; k++) {
    const j = topK[hr * FWD_K + k], s = topS[hr * FWD_K + k];
    if (j < 0 || s < COS_FLOOR || s >= NEAR_DUP) continue;
    const id = rowToId[j];
    if (ok(hub, id)) cand.set(id, { via: "fwd", score: s });
  }
  // عكسي
  const rev = (reverse.get(hr) ?? []).sort((a, b) => b.score - a.score);
  for (const { row, score } of rev) {
    if (cand.size >= CAP) break;
    if (score < COS_FLOOR || score >= NEAR_DUP) continue;
    const id = rowToId[row];
    if (!cand.has(id) && ok(hub, id)) cand.set(id, { via: "rev", score });
  }
  // جذور الوحدة النادرة
  const unitRoots = (rootsByAyah.get(hub.ayah_id) ?? [])
    .filter((w) => w.word_no >= hub.range[0] && w.word_no <= hub.range[1])
    .map((w) => w.root_id)
    .filter((r) => (rootOcc.get(r) ?? 1e9) < RARE_OCC);
  const share = new Map();
  for (const r of new Set(unitRoots))
    for (const id of versesByRoot.get(r) ?? [])
      if (id !== hub.ayah_id) share.set(id, (share.get(id) ?? 0) + 1);
  const shared = [...share.entries()].sort((x, y) => y[1] - x[1]).slice(0, ROOT_K * 2);
  let added = 0;
  for (const [id] of shared) {
    if (added >= ROOT_K || cand.size >= CAP) break;
    const r2 = idToRow.get(id);
    const s = cosOf(hr, r2);
    if (s >= NEAR_DUP) continue;
    if (!cand.has(id) && ok(hub, id)) { cand.set(id, { via: "root", score: s }); added++; }
  }
  hub.candidates = [...cand.entries()].map(([id, m]) => ({ loc: byId.get(id).location, via: m.via, cos: +m.score.toFixed(3) }));
  pairs += hub.candidates.length;
}
console.log(`pairs to judge: ${pairs} across ${hubs.length} hubs (avg ${(pairs / hubs.length).toFixed(1)}/hub)`);

// ── دفعات الحكم + عيّنة kappa ────────────────────────────────────────────────
const batches = [];
for (let i = 0; i < hubs.length; i += HUBS_PER_BATCH)
  batches.push(hubs.slice(i, i + HUBS_PER_BATCH).map((h) => ({
    id: h.id, unit_text: h.text, full_ayah: byId.get(h.ayah_id).text_uthmani,
    gates: h.gates, candidates: h.candidates.map((c) => ({ loc: c.loc, text: byLoc.get(c.loc).text_uthmani })),
  })));

// kappa: أزواج عشوائية حتمية (md5) تُحكَم مرتين في دفعات منفصلة
const allPairs = hubs.flatMap((h) => h.candidates.map((c) => ({ hub: h.id, loc: c.loc })));
const scored = allPairs.map((p) => ({ p, k: createHash("md5").update(p.hub + "|" + p.loc).digest().readUInt32BE(0) }));
scored.sort((a, b) => a.k - b.k);
const kappaPairs = scored.slice(0, KAPPA_PAIRS).map((x) => x.p);
const kappaByHub = new Map();
for (const p of kappaPairs) {
  let arr = kappaByHub.get(p.hub);
  if (!arr) kappaByHub.set(p.hub, (arr = []));
  arr.push(p.loc);
}
const hubById = new Map(hubs.map((h) => [h.id, h]));
const kappaBatches = [];
let cur = [];
for (const [hubId, locs] of kappaByHub) {
  const h = hubById.get(hubId);
  cur.push({ id: h.id, unit_text: h.text, full_ayah: byId.get(h.ayah_id).text_uthmani, gates: h.gates,
    candidates: locs.map((l) => ({ loc: l, text: byLoc.get(l).text_uthmani })) });
  if (cur.length >= HUBS_PER_BATCH * 2) { kappaBatches.push(cur); cur = []; }
}
if (cur.length) kappaBatches.push(cur);

mkdirSync(join(OUT, "provenance", "v2-run"), { recursive: true });
writeFileSync(join(OUT, "provenance", "v2-run", "hubs.json"), JSON.stringify(hubs.map(({ candidates, ...h }) => ({ ...h, nCand: candidates.length }))));
writeFileSync(join(OUT, "provenance", "v2-run", "judge-batches.json"), JSON.stringify(batches));
writeFileSync(join(OUT, "provenance", "v2-run", "kappa-batches.json"), JSON.stringify(kappaBatches));
// ملفُّ دفعةٍ مستقلٌّ لكلِّ وكيل (لا يقرأ الوكيل إلا دفعتَه)
const BD = join(OUT, "provenance", "v2-run", "batches");
mkdirSync(BD, { recursive: true });
batches.forEach((b, i) => writeFileSync(join(BD, `batch-${String(i).padStart(4, "0")}.json`), JSON.stringify(b)));
kappaBatches.forEach((b, i) => writeFileSync(join(BD, `kappa-${String(i).padStart(3, "0")}.json`), JSON.stringify(b)));
writeFileSync(join(OUT, "provenance", "v2-run", "retrieval-params.json"), JSON.stringify({
  FWD_K, REV_K, ROOT_K, RARE_OCC, CAP, COS_FLOOR, NEAR_DUP, KAPPA_PAIRS, HUBS_PER_BATCH,
  hubs: hubs.length, pairs, batches: batches.length, kappaBatches: kappaBatches.length, date: "2026-07-14",
}, null, 1));
console.log(`batches: ${batches.length} + kappa ${kappaBatches.length} → findings/kulliyat-v2/provenance/v2-run/`);
