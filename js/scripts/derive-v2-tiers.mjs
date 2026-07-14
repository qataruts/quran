/**
 * derive-v2-tiers.mjs — اشتقاق طبقات v2 من بنية الشبكة الموجَّهة (حتمي، بلا سرب).
 *
 * المدخلات: judge-results-raw.jsonl (709 دفعة، 11,773 رابطًا) + kappa-results-raw.jsonl
 *          + hubs.json (الوحدات المؤهّلة وبواباتها) + kulliyat.json (قسمة الـ90 محورًا)
 *          + sample.json (العيّنة المجمَّدة: ضبط/محجوب) + gates-v1.json
 *
 * الخطوات:
 *  ١) κ (كوهين) بين الحاكمَين على أزواج الحكم المزدوج.
 *  ٢) لكل وحدةٍ مؤهّلة: عددُ المفصِّلات المتميّزة + انتشارُها عبر المحاور.
 *  ٣) القاعدة: كلّية = مؤهّلة وانتشار ≥ T · جامعة = مؤهّلة ومفصِّلات ≥ m · وإلا تفصيل.
 *     ضبط T وm بشبكة بحثٍ على مجاميع نصف الضبط حصرًا (قاعدة معلنة سلفًا:
 *     الأمثل = مجموع الاستعادة والرفض؛ التعادل → الأصغر T ثم m).
 *  ٤) حساسية T±1 وm±1: نسبة الآيات المتنقّلة بين الطبقات.
 *  ٥) نموذج عدمي: إعادة توصيل تحفظ الدرجات ×20 — دلالة الانتشار.
 *  ٦) تقرير المحجوب: تشغيلة واحدة بالقيم المثبتة، يُنشر كما يخرج.
 * الإخراج: findings/kulliyat-v2/derived-v2.json + DERIVATION-REPORT.md (يُلحق يدويًا)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const RUN = join(ROOT, "findings", "kulliyat-v2", "provenance", "v2-run");
const OUT = join(ROOT, "findings", "kulliyat-v2");

// ── تحميل ────────────────────────────────────────────────────────────────────
const raw = readFileSync(join(RUN, "judge-results-raw.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const kappaRaw = readFileSync(join(RUN, "kappa-results-raw.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const hubs = JSON.parse(readFileSync(join(RUN, "hubs.json"), "utf8"));
const kul = JSON.parse(readFileSync(join(ROOT, "js", "apps", "studio", "public", "kulliyat.json"), "utf8"));
const sample = JSON.parse(readFileSync(join(OUT, "sample.json"), "utf8"));

const themeOf = (loc) => kul.verses[loc]?.theme ?? -1;

// شبكة: hubId -> Map(loc -> rel)
const net = new Map();
for (const b of raw)
  for (const j of b.judgments) {
    let m = net.get(j.id);
    if (!m) net.set(j.id, (m = new Map()));
    for (const l of j.links ?? []) if (!m.has(l.loc)) m.set(l.loc, l.rel);
  }

// ── ١) كوهين κ على أزواج الحكم المزدوج ──────────────────────────────────────
{
  // أزواج kappa: (hubId, loc) → الحكمان
  const second = new Map();
  for (const b of kappaRaw)
    for (const j of b.judgments) {
      // الدفعات المزدوجة تحوي مرشّحين محدَّدين — أعِد بناء أزواجها من ملف الدفعة
    }
  // الأدق: أعِد قراءة ملفات kappa-batches لتعريف الأزواج المطلوبة
  const kb = JSON.parse(readFileSync(join(RUN, "kappa-batches.json"), "utf8"));
  const pairs = [];
  for (const batch of kb)
    for (const h of batch)
      for (const c of h.candidates) pairs.push([h.id, c.loc]);
  const secondV = new Map();
  for (const b of kappaRaw)
    for (const j of b.judgments) {
      for (const l of j.links ?? []) secondV.set(j.id + "|" + l.loc, l.rel);
    }
  // ملء none للأزواج المزدوجة غير المروية في kappa
  let bothLink = 0, bothNone = 0, disagree = 0, relAgree = 0, relBoth = 0;
  for (const [hid, loc] of pairs) {
    const v1 = net.get(hid)?.get(loc) ?? null; // الحكم الرئيس
    const v2 = secondV.get(hid + "|" + loc) ?? null; // الحكم الثاني
    if (v1 && v2) { bothLink++; relBoth++; if (v1 === v2) relAgree++; }
    else if (!v1 && !v2) bothNone++;
    else disagree++;
  }
  const n = pairs.length;
  const po = (bothLink + bothNone) / n;
  const p1 = (bothLink + disagree / 2) / n; // تقدير هامشي متوسط
  const pe = p1 * p1 + (1 - p1) * (1 - p1);
  const kappa = (po - pe) / (1 - pe);
  console.log(`κ: أزواج=${n} · اتفاق ربط=${bothLink} · اتفاق لا-ربط=${bothNone} · اختلاف=${disagree}`);
  console.log(`κ (ثنائي) = ${kappa.toFixed(3)} · اتفاق العلاقة عند الربط المشترك: ${relAgree}/${relBoth} = ${(100 * relAgree / Math.max(1, relBoth)).toFixed(0)}%`);
  writeFileSync(join(OUT, "kappa-stats.json"), JSON.stringify({ n, bothLink, bothNone, disagree, kappa: +kappa.toFixed(4), relAgree, relBoth }, null, 1));
}

// ── ٢) مقاييس كل وحدة ────────────────────────────────────────────────────────
const units = []; // {id, loc, unit, gates, nElab, spread, rels}
for (const h of hubs) {
  const links = net.get(h.id) ?? new Map();
  const elabVerses = new Set([...links.keys()]);
  const themes = new Set([...elabVerses].map(themeOf).filter((t) => t >= 0));
  units.push({ id: h.id, loc: h.loc, unit: h.unit, gates: h.gates, nElab: elabVerses.size, spread: themes.size });
}
// آية → أفضل وحدة
const byVerse = new Map();
for (const u of units) {
  const cur = byVerse.get(u.loc);
  if (!cur || u.spread > cur.spread || (u.spread === cur.spread && u.nElab > cur.nElab)) byVerse.set(u.loc, u);
}
console.log(`وحدات: ${units.length} · آيات لها وحدة: ${byVerse.size}`);
console.log(`توزيع الانتشار: p50=${pct(units.map((u) => u.spread), 50)} p90=${pct(units.map((u) => u.spread), 90)} p99=${pct(units.map((u) => u.spread), 99)} max=${Math.max(...units.map((u) => u.spread))}`);
function pct(arr, p) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor((p / 100) * (s.length - 1))]; }

// ── ٣) الطبقة + الضبط على نصف الضبط ─────────────────────────────────────────
const tierOf = (loc, T, M) => {
  const u = byVerse.get(loc);
  if (!u) return "تفصيل";
  if (u.spread >= T) return "كلّية";
  if (u.nElab >= M) return "جامعة";
  return "تفصيل";
};
const expand = (refs) => {
  const m = refs.match(/^(\d+):(\d+)(?:-(\d+))?$/);
  const L = [];
  for (let a = Number(m[2]); a <= Number(m[3] ?? m[2]); a++) L.push(`${m[1]}:${a}`);
  return L;
};
function scoreHalf(half, T, M, detail = false) {
  let rHit = 0, rTot = 0, cHit = 0, cTot = 0;
  const misses = [], leaks = [];
  for (const it of sample.items) {
    if (it.half !== half) continue;
    const tiers = expand(it.refs).map((l) => tierOf(l, T, M));
    const best = tiers.includes("كلّية") ? "كلّية" : tiers.includes("جامعة") ? "جامعة" : "تفصيل";
    if (it.expected === "tafsil") {
      cTot++;
      if (best === "تفصيل") cHit++;
      else leaks.push(`#${it.id} ${it.refs} → ${best}`);
    } else if (it.expected === "rule-bab") {
      rTot++;
      if (best === "جامعة") rHit++;
      else misses.push(`#${it.id} ${it.refs} → ${best} (متوقع جامعة)`);
    } else {
      rTot++;
      if (best !== "تفصيل") rHit++;
      else misses.push(`#${it.id} ${it.refs} → تفصيل`);
    }
  }
  return { rHit, rTot, cHit, cTot, score: rHit + cHit, misses, leaks };
}
// شبكة البحث المعلنة
let best = null;
for (let T = 3; T <= 12; T++)
  for (let M = 2; M <= 8; M++) {
    const s = scoreHalf("tune", T, M);
    if (!best || s.score > best.s.score || (s.score === best.s.score && (T + M < best.T + best.M)))
      if (!best || s.score > best.s.score || (s.score === best.s.score && T + M < best.T + best.M)) best = { T, M, s };
  }
console.log(`\nالضبط (نصف الضبط): T=${best.T} انتشارًا · m=${best.M} مفصِّلات`);
console.log(`  استعادة القواعد: ${best.s.rHit}/${best.s.rTot} · رفض الضدّ: ${best.s.cHit}/${best.s.cTot}`);
const tuneDetail = scoreHalf("tune", best.T, best.M, true);
if (tuneDetail.misses.length) console.log("  فوات:", tuneDetail.misses.join(" · "));
if (tuneDetail.leaks.length) console.log("  تسرب:", tuneDetail.leaks.join(" · "));

// ── ٤) حساسية T±1 / m±1 ────────────────────────────────────────────────────
{
  const baseTiers = new Map();
  for (const loc of Object.keys(kul.verses)) baseTiers.set(loc, tierOf(loc, best.T, best.M));
  const flips = (T, M) => {
    let f = 0;
    for (const loc of baseTiers.keys()) if (tierOf(loc, T, M) !== baseTiers.get(loc)) f++;
    return f;
  };
  console.log(`\nحساسية العتبات (تنقّلات من ٦٢٣٦):`);
  for (const [T, M] of [[best.T - 1, best.M], [best.T + 1, best.M], [best.T, best.M - 1], [best.T, best.M + 1]])
    console.log(`  T=${T},m=${M}: ${flips(T, M)} تنقّلًا (${(100 * flips(T, M) / 6236).toFixed(1)}%)`);
}

// ── ٥) النموذج العدمي: إعادة توصيل تحفظ درجات المحاور والمقاصد ──────────────
{
  const allTargets = [];
  for (const u of units) {
    const links = net.get(u.id) ?? new Map();
    for (const loc of links.keys()) allTargets.push(loc);
  }
  const realTop = units.filter((u) => u.spread >= best.T).length;
  let nullTops = [];
  let seed = 123456789;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let iter = 0; iter < 20; iter++) {
    // خلط المقاصد مع حفظ عدد روابط كل محور
    const shuffled = [...allTargets];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    let k = 0, top = 0;
    for (const u of units) {
      const n = (net.get(u.id) ?? new Map()).size;
      const th = new Set();
      for (let x = 0; x < n; x++) th.add(themeOf(shuffled[k++]));
      th.delete(-1);
      if (th.size >= best.T) top++;
    }
    nullTops.push(top);
  }
  const meanNull = nullTops.reduce((a, b) => a + b, 0) / nullTops.length;
  console.log(`\nالعدمي: كلّيات فعلية=${realTop} مقابل عدمي متوسط=${meanNull.toFixed(1)} (min=${Math.min(...nullTops)}, max=${Math.max(...nullTops)})`);
}

// ── ٦) تقرير المحجوب — تشغيلة واحدة ─────────────────────────────────────────
const hold = scoreHalf("holdout", best.T, best.M, true);
console.log(`\n═══ تقرير المحجوب (تشغيلة واحدة، T=${best.T}, m=${best.M}) ═══`);
console.log(`استعادة القواعد: ${hold.rHit}/${hold.rTot} = ${(100 * hold.rHit / hold.rTot).toFixed(0)}%`);
console.log(`رفض الضدّ:       ${hold.cHit}/${hold.cTot} = ${(100 * hold.cHit / hold.cTot).toFixed(0)}%`);
if (hold.misses.length) console.log("فوات:", hold.misses.join(" · "));
if (hold.leaks.length) console.log("تسرب:", hold.leaks.join(" · "));

// ── الإخراج والتوزيع النهائي ─────────────────────────────────────────────────
const dist = { "كلّية": 0, "جامعة": 0, "تفصيل": 0 };
const verdicts = {};
for (const loc of Object.keys(kul.verses)) { const t = tierOf(loc, best.T, best.M); dist[t]++; verdicts[loc] = t; }
console.log(`\nالتوزيع النهائي: كلّية ${dist["كلّية"]} · جامعة ${dist["جامعة"]} · تفصيل ${dist["تفصيل"]}`);
// أعلى ٢٠ كلية بالانتشار
const top20 = units.filter((u) => u.spread >= best.T).sort((a, b) => b.spread - a.spread || b.nElab - a.nElab).slice(0, 20);
console.log(`\nأعلى الكلّيّات انتشارًا:`);
for (const u of top20) console.log(`  ${u.loc}/${u.unit} — انتشار ${u.spread} محورًا · ${u.nElab} مفصِّلة · [${u.gates.join(",")}]`);

writeFileSync(join(OUT, "derived-v2.json"), JSON.stringify({
  params: { T: best.T, M: best.M, K: 90, date: "2026-07-14" },
  tune: { rules: `${best.s.rHit}/${best.s.rTot}`, counters: `${best.s.cHit}/${best.s.cTot}` },
  holdout: { rules: `${hold.rHit}/${hold.rTot}`, counters: `${hold.cHit}/${hold.cTot}`, misses: hold.misses, leaks: hold.leaks },
  dist,
  units: units.map((u) => ({ id: u.id, loc: u.loc, unit: u.unit, gates: u.gates, nElab: u.nElab, spread: u.spread })),
  verdicts,
}));
console.log("\n→ derived-v2.json");
