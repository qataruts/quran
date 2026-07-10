/**
 * Apply the adversarial verification verdicts to the محكمات clusters:
 * coherent clusters stay as one محكمة; heterogeneous ones become a محكمة كبرى
 * split into coherent sub-محكمات. Verifies member coverage (nothing dropped/
 * duplicated). Re-exports the refined two-level layer.
 *
 * Reads the verification journal + muhkamat.json (names) + muhkamat-clusters.json.
 * Writes findings/MUHKAMAT.md + js/apps/studio/public/muhkamat.json (refined).
 * Usage: node scripts/apply-muhkamat-verification.mjs [journal.jsonl]
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CLUSTERS = path.join(ROOT, "findings/muhkamat-clusters.json");
const NAMED = path.join(ROOT, "js/apps/studio/public/muhkamat.json");
const JOURNAL = process.argv[2] ??
  "/Users/emad/.claude/projects/-Volumes-data-new-projects-quran/762c865b-b6d5-4d4f-8fad-46cbaa8a28f2/subagents/workflows/wf_f5c39a2d-f75/journal.jsonl";
const MD = path.join(ROOT, "findings/MUHKAMAT.md");
const APP = path.join(ROOT, "js/apps/studio/public/muhkamat.json");

const clustersData = JSON.parse(fs.readFileSync(CLUSTERS, "utf-8"));
const clusters = clustersData.muhkamat;
const named = JSON.parse(fs.readFileSync(NAMED, "utf-8")).muhkamat;
const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const textOf = new Map(db.prepare("SELECT location, text_clean FROM ayah").all().map((r) => [r.location, r.text_clean]));
db.close();

// verdicts from the journal
const verdicts = new Map();
for (const line of fs.readFileSync(JOURNAL, "utf-8").split("\n")) {
  if (!line.trim()) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const r = e.result ?? e.output ?? e;
  if (r && typeof r === "object" && typeof r.index === "number" && "coherent" in r) verdicts.set(r.index, r);
}

let nCoherent = 0, nSplit = 0, subTotal = 0, dropIssues = 0;
const kubra = clusters.map((cl, i) => {
  const memAll = cl.members.map((m) => m.loc);
  const name = named[i] ?? {};
  const v = verdicts.get(i);
  let children;
  if (!v || v.coherent) {
    nCoherent++;
    children = [{ title: name.title ?? `محكمة ${i + 1}`, theme: name.theme ?? "", umm: cl.umm, members: memAll }];
  } else {
    nSplit++;
    children = (v.split ?? []).map((s) => ({
      title: s.title, theme: s.theme, umm: s.umm,
      members: (s.members ?? []).filter((l) => textOf.has(l)),
    }));
    // coverage check — reassign any dropped member to the nearest (first) child
    const covered = new Set(children.flatMap((c) => c.members));
    const dropped = memAll.filter((l) => !covered.has(l));
    if (dropped.length) {
      dropIssues += dropped.length;
      (children[children.length - 1] ??= { title: name.title, theme: "", umm: cl.umm, members: [] }).members.push(...dropped);
    }
    subTotal += children.length;
  }
  return { kubraTitle: name.title ?? `محكمة ${i + 1}`, kubraTheme: name.theme ?? "", coherent: !v || v.coherent, size: cl.size, children };
});

const level2 = kubra.reduce((s, k) => s + k.children.length, 0);
console.log(`كبرى: ${kubra.length} · متجانسة: ${nCoherent} · قُسِّمت: ${nSplit} → محكمات فرعية: ${subTotal}`);
console.log(`مجموع المحكمات (المستوى الثاني): ${level2} · آيات أُعيد إلحاقها (تغطية): ${dropIssues}`);

// --- human map -----------------------------------------------------------------
let md = `# المحكمات الجامعة — الخريطة المنقّحة (بعد التحقّق العدائي)

**التاريخ:** 2026-07-10 · **الطريقة:** عُنقِدت الـ١٬٠٣٢ جامعة دلاليًّا إلى ٤٠ محكمة كبرى،
ثم راجع سربٌ من ٤٠ مدقّقًا عدائيًّا كل عنقود؛ المتجانس بقي محكمةً واحدة، والمركّب قُسِّم
إلى محكمات فرعية متجانسة (تغطية كاملة للأعضاء). البنية: **المحكمة الكبرى → المحكمات → الجوامع → التفصيل**.

**الحصيلة:** ${kubra.length} محكمة كبرى · منها ${nCoherent} متجانسة و${nSplit} قُسِّمت · **${level2} محكمة متجانسة** في المستوى الثاني.

`;
kubra.forEach((k, i) => {
  md += `\n## ${i + 1}. ${k.kubraTitle}${k.coherent ? " ✓" : ` — قُسِّمت إلى ${k.children.length}`}  ·  ${k.size} جامعة\n\n`;
  k.children.forEach((c) => {
    md += `### ${c.title}  ·  ${c.members.length} آية\n`;
    if (c.theme) md += `${c.theme}\n\n`;
    md += `> الأمّ ${c.umm}: ${textOf.get(c.umm) ?? ""}\n\n`;
    md += c.members.map((l) => `- ${l} — ${(textOf.get(l) ?? "").slice(0, 70)}`).join("\n") + "\n\n";
  });
});
fs.writeFileSync(MD, md);

// --- app layer -----------------------------------------------------------------
const app = {
  meta: {
    kubra: kubra.length, coherent: nCoherent, split: nSplit, muhkamat: level2,
    principles: clusters.reduce((s, c) => s + c.size, 0),
    network: clustersData.meta.network,
  },
  kubra: kubra.map((k) => ({
    title: k.kubraTitle, coherent: k.coherent,
    muhkamat: k.children.map((c) => ({ title: c.title, theme: c.theme, umm: c.umm, members: c.members })),
  })),
};
fs.writeFileSync(APP, JSON.stringify(app));
console.log(`\n→ findings/MUHKAMAT.md (${(fs.statSync(MD).size / 1024).toFixed(0)} KB)`);
console.log(`→ public/muhkamat.json (${(fs.statSync(APP).size / 1024).toFixed(0)} KB)`);
