/**
 * حاصدة سرب السياق — متعذّرةُ التكرار: تدمج نتائج تشغيلةٍ (journal.jsonl) في
 * سجلّ الأحكام الموحّد، ثم تُخرج «بوابة الجزء»: κ للدفعات المزدوجة، معدلات
 * الأحكام كليًّا ولكل دفعة (رصد انحراف)، وفجوات النقص لإعادة التشغيل.
 *
 * Usage: node scripts/siyaq-harvest.mjs <journal.jsonl>
 * Writes: findings/siyaq-swarm/verdicts.jsonl (merge by batch+run)
 *         + gate report to stdout
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "findings/siyaq-swarm");
const STORE = path.join(OUT, "verdicts.jsonl");

const journal = process.argv[2];
if (!journal) { console.error("usage: siyaq-harvest.mjs <journal.jsonl>"); process.exit(1); }

// —— الدمج المتعذّر التكرار ——
const store = new Map(); // "batch/run" -> record
if (fs.existsSync(STORE)) for (const l of fs.readFileSync(STORE, "utf-8").split("\n").filter(Boolean)) {
  const r = JSON.parse(l);
  store.set(`${r.batch}/${r.run}`, r);
}
const before = store.size;
const jl = fs.readFileSync(journal, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
for (const l of jl) {
  if (l.type !== "result") continue;
  const res = l.result ?? l.value;
  const arr = res?.results ?? (res?.verdicts ? [res] : []);
  for (const r of arr) if (r?.verdicts) store.set(`${r.batch}/${r.run ?? 1}`, { batch: r.batch, run: r.run ?? 1, verdicts: r.verdicts });
}
fs.writeFileSync(STORE, [...store.values()].sort((a, b) => a.batch - b.batch || a.run - b.run).map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`المخزن: ${before} → ${store.size} تشغيلة-دفعة`);

// —— بوابة الجزء ——
const plan = JSON.parse(fs.readFileSync(path.join(OUT, "chunk-plan.json"), "utf-8"));
const run1 = [...store.values()].filter((r) => r.run === 1);
const run2 = [...store.values()].filter((r) => r.run === 2);

// معدلات كلية ولكل دفعة
const tally = { boundary: 0, continuation: 0, unsure: 0 };
const perBatch = [];
for (const r of run1) {
  const t = { boundary: 0, continuation: 0, unsure: 0 };
  for (const v of r.verdicts) { t[v.verdict]++; tally[v.verdict]++; }
  const n = r.verdicts.length;
  perBatch.push({ batch: r.batch, n, b: +(t.boundary / n).toFixed(2), c: +(t.continuation / n).toFixed(2), u: +(t.unsure / n).toFixed(2) });
}
const N = tally.boundary + tally.continuation + tally.unsure;
console.log(`\nالأحكام (run1): n=${N} · حدّ ${(tally.boundary / N * 100).toFixed(1)}٪ · وصل ${(tally.continuation / N * 100).toFixed(1)}٪ · متردد ${(tally.unsure / N * 100).toFixed(1)}٪`);
const bs = perBatch.map((x) => x.b).sort((a, b) => a - b);
console.log(`معدل الحدّ لكل دفعة: أدنى ${bs[0]} · وسيط ${bs[Math.floor(bs.length / 2)]} · أقصى ${bs[bs.length - 1]}${bs[bs.length - 1] - bs[0] > 0.5 ? "  ⚠ تفاوت كبير — افحص الدفعات المتطرفة" : ""}`);

// كابا الثنائية على المزدوجة (حدّ مقابل غير حدّ؛ المتردد يُحسب كما هو للاتفاق الثلاثي أيضًا)
if (run2.length) {
  let n = 0, agree = 0, bothB = 0, aB = 0, bB = 0;
  const disagreements = [];
  for (const r2 of run2) {
    const r1 = store.get(`${r2.batch}/1`);
    if (!r1) continue;
    const m1 = new Map(r1.verdicts.map((v) => [v.id, v.verdict]));
    for (const v of r2.verdicts) {
      const v1 = m1.get(v.id);
      if (!v1) continue;
      n++;
      const b1 = v1 === "boundary", b2 = v.verdict === "boundary";
      if (b1 === b2) agree++; else disagreements.push(`${v.id}: ${v1}≠${v.verdict}`);
      if (b1 && b2) bothB++;
      if (b1) aB++;
      if (b2) bB++;
    }
  }
  const po = agree / n;
  const pe = (aB / n) * (bB / n) + (1 - aB / n) * (1 - bB / n);
  const kappa = (po - pe) / (1 - pe);
  console.log(`\nκ (ثنائي حدّ/غير حدّ على ${n} فجوة مزدوجة): ${kappa.toFixed(3)} (اتفاق ${(po * 100).toFixed(1)}٪) — العتبة المعلنة ≥ 0.55 ${kappa >= 0.55 ? "✓" : "✗ دون العتبة"}`);
  if (disagreements.length) console.log("خلافات الكابا:", disagreements.slice(0, 8).join(" · "), disagreements.length > 8 ? `(+${disagreements.length - 8})` : "");
}

// النقص مقابل الخطة
const done1 = new Set(run1.map((r) => r.batch));
const missing = [...Array(plan.batches).keys()].filter((b) => !done1.has(b));
console.log(`\nمكتمل run1: ${done1.size}/${plan.batches} · الناقص: ${missing.length ? missing.join(",") : "لا شيء"}`);
