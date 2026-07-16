/**
 * امتحان المحجوب — يُفتح مرةً واحدة بإذن المالك (2026-07-15).
 * المرشح: findings/siyaq-swarm/units-computed.json (مجمّد قبل هذا الامتحان)
 * العتبات المعلنة (قفل 04b9312): استعادة ≥٨٠٪ · رفض ≥٩٠٪
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SW = path.join(ROOT, "findings/siyaq-swarm");
const frozen = JSON.parse(fs.readFileSync(path.join(SW, "frozen-sample.json"), "utf-8")).sample;
const units = JSON.parse(fs.readFileSync(path.join(SW, "units-computed.json"), "utf-8")).units;
const B = new Set();
for (const u of units) if (u.a1 > 1) B.add(`${u.s}:${u.a1 - 1}`);
const hold = frozen.filter((x) => x.half === "holdout");
const hb = hold.filter((x) => x.kind === "boundary");
const hc = hold.filter((x) => x.kind === "counter");
const rec = hb.filter((x) => B.has(x.id));
const rej = hc.filter((x) => !B.has(x.id));
const recPct = rec.length / hb.length, rejPct = rej.length / hc.length;
console.log(`المحجوب: ${hb.length} حدًّا + ${hc.length} ضدًّا`);
console.log(`الاستعادة: ${rec.length}/${hb.length} = ${(recPct * 100).toFixed(1)}٪ (العتبة ≥٨٠٪) ${recPct >= 0.8 ? "✓" : "✗"}`);
console.log(`رفض الضد:  ${rej.length}/${hc.length} = ${(rejPct * 100).toFixed(1)}٪ (العتبة ≥٩٠٪) ${rejPct >= 0.9 ? "✓" : "✗"}`);
const missB = hb.filter((x) => !B.has(x.id)).map((x) => x.id);
const missC = hc.filter((x) => B.has(x.id)).map((x) => x.id);
if (missB.length) console.log("حدود فائتة:", missB.join(" · "));
if (missC.length) console.log("أضداد مرفوعة خطأ:", missC.join(" · "));
console.log(`\nالحكم: ${recPct >= 0.8 && rejPct >= 0.9 ? "★ اجتاز المحجوب — يُعتمد" : "✗ لم يجتز — يُنشر الإخفاق ويُشخَّص"}`);
