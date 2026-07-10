/**
 * Merge the swarm's محكمة names with the computed clusters and export the
 * third layer — المحكمة → الجوامع → التفصيل:
 *   findings/MUHKAMAT.md              human-readable map of the 40 محكمات
 *   js/apps/studio/public/muhkamat.json  compact app layer (title/theme/members)
 *
 * Usage: node scripts/export-muhkamat.mjs [journal.jsonl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CLUSTERS = path.join(ROOT, "findings/muhkamat-clusters.json");
const JOURNAL = process.argv[2] ??
  "/Users/emad/.claude/projects/-Volumes-data-new-projects-quran/762c865b-b6d5-4d4f-8fad-46cbaa8a28f2/subagents/workflows/wf_4fc7bfc9-f0f/journal.jsonl";
const MD = path.join(ROOT, "findings/MUHKAMAT.md");
const APP = path.join(ROOT, "js/apps/studio/public/muhkamat.json");

const clusters = JSON.parse(fs.readFileSync(CLUSTERS, "utf-8")).muhkamat;

// collect the named results from the workflow journal (one per agent)
const names = new Map();
for (const line of fs.readFileSync(JOURNAL, "utf-8").split("\n")) {
  if (!line.trim()) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const r = e.result ?? e.output ?? e;
  if (r && typeof r === "object" && typeof r.index === "number" && r.title) names.set(r.index, r);
}
console.log(`named results: ${names.size} / ${clusters.length}`);

const surahAr = JSON.parse(fs.readFileSync(path.join(ROOT, "quran-principles.json"), "utf-8"))
  ? null : null; // (surah names not needed here; refs use s:a)

const merged = clusters.map((cl, i) => {
  const n = names.get(i) ?? {};
  return {
    title: n.title ?? `محكمة ${i + 1}`,
    theme: n.theme ?? "",
    umm: n.umm && cl.members.some((m) => m.loc === n.umm) ? n.umm : cl.umm,
    keywords: n.keywords ?? [],
    note: n.note ?? "",
    size: cl.size,
    members: cl.members, // [{loc, text}]
  };
}).sort((a, b) => b.size - a.size);

// --- human map -----------------------------------------------------------------
let md = `# المحكمات الجامعة — خريطة أصول القرآن (الطبقة الثالثة)

**التاريخ:** 2026-07-10 · **الطريقة:** عُنقِدت الـ١٬٠٣٢ آية جامعة (p=2) بمتجهاتها
الدلالية (Gemini) إلى **${merged.length} محكمة**، ثم سمّى سربٌ من ${merged.length} وكيلًا كل
محكمة وحدّد «أمّها» من نصّ القرآن وحده. البنية: **المحكمة → الجوامع → التفصيل**.

**الشبكة الموحّدة:** ٩٨٫٩٧٪ من الآيات المترابطة شبكةٌ واحدة، بمتوسط ٥٫٢٥ خطوة بين أي آيتين.

`;
merged.forEach((m, i) => {
  const umm = m.members.find((x) => x.loc === m.umm);
  md += `\n## ${i + 1}. ${m.title}  ·  ${m.size} جامعة\n\n`;
  md += `> **الأمّ ${m.umm}:** ${umm?.text ?? ""}\n\n`;
  md += `${m.theme}\n\n`;
  if (m.keywords.length) md += `**مفاتيح:** ${m.keywords.join(" · ")}\n\n`;
  if (m.note) md += `> ⚠️ ${m.note}\n\n`;
  md += m.members.map((x) => `- ${x.loc} — ${x.text}`).join("\n") + "\n";
});
fs.writeFileSync(MD, md);

// --- compact app layer ---------------------------------------------------------
const app = {
  meta: { muhkamat: merged.length, principles: merged.reduce((s, m) => s + m.size, 0),
    network: JSON.parse(fs.readFileSync(CLUSTERS, "utf-8")).meta.network },
  muhkamat: merged.map((m) => ({
    title: m.title, theme: m.theme, umm: m.umm, keywords: m.keywords,
    members: m.members.map((x) => x.loc),
  })),
};
fs.writeFileSync(APP, JSON.stringify(app));
console.log(`→ findings/MUHKAMAT.md (${(fs.statSync(MD).size / 1024).toFixed(0)} KB)`);
console.log(`→ public/muhkamat.json (${(fs.statSync(APP).size / 1024).toFixed(0)} KB)`);
console.log(`\nالمحكمات (${merged.length}):`);
merged.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m.title.padEnd(30)} ${m.umm.padEnd(7)} ×${m.size}`));
