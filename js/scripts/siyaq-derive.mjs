/**
 * تجميع التقسيم المرشح لوحدات السياق: حدود البذرة الواثقة + أحكام السرب على
 * الرمادية (متردد السرب → سياسة تُعايَر على نصف الضبط حصرًا). المحجوب لا يُمسّ —
 * يُفحص لاحقًا بإذن المالك مرةً واحدة.
 *
 * Writes: findings/siyaq-swarm/units-computed.json (المرشح النهائي)
 * Usage: node scripts/siyaq-derive.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SW = path.join(ROOT, "findings/siyaq-swarm");

const gaps = fs.readFileSync(path.join(ROOT, "findings/siyaq-seed/gaps.jsonl"), "utf-8").split("\n").filter(Boolean).map(JSON.parse);
const verdicts = new Map();
for (const l of fs.readFileSync(path.join(SW, "verdicts.jsonl"), "utf-8").split("\n").filter(Boolean)) {
  const r = JSON.parse(l);
  if (r.run !== 1) continue;
  for (const v of r.verdicts) verdicts.set(v.id, v.verdict);
}
console.log(`أحكام السرب: ${verdicts.size}`);

const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const AC = new Map(db.prepare("SELECT surah_no n, ayah_count c FROM surah").all().map((r) => [r.n, r.c]));
db.close();

/** يجمع الحدود بسياسة متردد معيّنة: "cont" (وصل) أو "seed" (إشارة البذرة) */
function boundaries(unsurePolicy) {
  const B = new Set();
  let unsure = 0;
  for (const g of gaps) {
    const id = `${g.s}:${g.a}`;
    let isB;
    if (g.cls === "boundary") isB = true;
    else if (g.cls === "continuation") isB = false;
    else {
      const v = verdicts.get(id);
      if (v === "boundary") isB = true;
      else if (v === "continuation") isB = false;
      else { unsure++; isB = unsurePolicy === "seed" ? g.score >= 0 : false; }
    }
    if (isB) B.add(id);
  }
  return { B, unsure };
}

// —— المعايرة على نصف الضبط حصرًا ——
const frozen = JSON.parse(fs.readFileSync(path.join(SW, "frozen-sample.json"), "utf-8")).sample;
const tune = frozen.filter((x) => x.half === "tune");
console.log(`نصف الضبط: ${tune.filter((x) => x.kind === "boundary").length} حدًّا + ${tune.filter((x) => x.kind === "counter").length} ضدًّا (المحجوب مغلق: ${frozen.length - tune.length})`);

for (const pol of ["cont", "seed"]) {
  const { B, unsure } = boundaries(pol);
  const tb = tune.filter((x) => x.kind === "boundary");
  const tc = tune.filter((x) => x.kind === "counter");
  const rec = tb.filter((x) => B.has(x.id)).length;
  const rej = tc.filter((x) => !B.has(x.id)).length;
  console.log(`سياسة متردد=${pol}: حدود ${B.size} · وحدات ${B.size + 114} · استعادة الضبط ${rec}/${tb.length} · رفض الضد ${rej}/${tc.length} (متردد ${unsure})`);
}

// السياسة المختارة تُكتب في المخرج النهائي بعد المفاضلة أعلاه (الافتراضي: cont —
// الأكثر تحفظًا؛ إن تعادلتا على الضبط بقي الأكثر تحفظًا)
const { B } = boundaries("cont");
const units = [];
for (let s = 1; s <= 114; s++) {
  let a1 = 1;
  for (let a = 1; a <= AC.get(s); a++) {
    if (a < AC.get(s) && B.has(`${s}:${a}`)) { units.push({ s, a1, a2: a }); a1 = a + 1; }
    else if (a === AC.get(s)) units.push({ s, a1, a2: a });
  }
}
const sizes = units.map((u) => u.a2 - u.a1 + 1).sort((x, y) => x - y);
const q = (p) => sizes[Math.floor(p * (sizes.length - 1))];
console.log(`\nالوحدات المرشحة: ${units.length} · وسيط ${q(0.5)} · p90 ${q(0.9)} · أقصى ${sizes[sizes.length - 1]}`);

// توافق وصفي مع المراجع
const tafsil = JSON.parse(fs.readFileSync(path.join(ROOT, "js/data/tafsil/units.json"), "utf-8")).units;
const tStarts = new Set(tafsil.map((u) => `${u.s}:${u.a1}`));
const ours = units.filter((u) => u.a1 > 1);
const inT = ours.filter((u) => tStarts.has(`${u.s}:${u.a1}`)).length;
console.log(`بداياتنا الموافقة للتفصيل: ${inT}/${ours.length} (${Math.round((inT / ours.length) * 100)}٪)`);

fs.writeFileSync(path.join(SW, "units-computed.json"), JSON.stringify({
  meta: { date: "2026-07-15", status: "CANDIDATE — pending holdout exam (owner gate)", unsurePolicy: "cont", units: units.length, kappa: 0.864, swarmJudged: verdicts.size },
  units,
}, null, 1));
console.log("→ findings/siyaq-swarm/units-computed.json (مرشح — بانتظار امتحان المحجوب)");
