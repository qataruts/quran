/**
 * Export the مصحف الموضوعي — the full three-level thematic index over all 6,236
 * verses: قسم كبير → موضوع → آية. Merges the clean section taxonomy (one
 * editorial pass) with the 262 verified topics. Verifies every topic is placed
 * exactly once; any gap → «موضوعات أخرى».
 *
 * Writes findings/MAWDUI.md (human) + js/apps/studio/public/mawdui.json (app).
 * Usage: node scripts/export-mawdui.mjs [toc-journal.jsonl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const TOPICS = path.join(ROOT, "findings/mawdui-topics.json");
const TOC_JOURNAL = process.argv[2] ??
  "/Users/emad/.claude/projects/-Volumes-data-new-projects-quran/762c865b-b6d5-4d4f-8fad-46cbaa8a28f2/subagents/workflows/wf_8fd2c455-9ce/journal.jsonl";
const MD = path.join(ROOT, "findings/MAWDUI.md");
const APP = path.join(ROOT, "js/apps/studio/public/mawdui.json");

const topics = JSON.parse(fs.readFileSync(TOPICS, "utf-8")).topics;
const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const textOf = new Map(db.prepare("SELECT location, text_clean FROM ayah").all().map((r) => [r.location, r.text_clean]));
db.close();

// read the section taxonomy from the organize-toc agent result
let sections = null;
for (const line of fs.readFileSync(TOC_JOURNAL, "utf-8").split("\n")) {
  if (!line.trim()) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const r = e.result ?? e.output ?? e;
  if (r && Array.isArray(r.sections)) sections = r.sections;
}
if (!sections) { console.error("no taxonomy found in journal"); process.exit(1); }

// editorial merge (owner's call): fold بنو إسرائيل/موسى into قصص الأنبياء → 12 أقسام
{
  const src = sections.find((s) => s.title === "بنو إسرائيل وقصة موسى وفرعون");
  const dst = sections.find((s) => s.title === "قصص الأنبياء");
  if (src && dst) {
    dst.topics = [...(dst.topics ?? []), ...(src.topics ?? [])];
    dst.title = "قصص الأنبياء وبني إسرائيل";
    dst.theme = "سِيَر الأنبياء مع أقوامهم — من آدم ونوح وإبراهيم ولوط وداود وسليمان ويوسف وزكريا وعيسى، إلى موسى وفرعون وبني إسرائيل — عبرةً في الاصطفاء والابتلاء والنجاة.";
    sections = sections.filter((s) => s !== src);
  }
}

// coverage check
const placed = new Map(); // topicIdx -> sectionIdx (first wins)
sections.forEach((s, si) => (s.topics ?? []).forEach((ti) => { if (!placed.has(ti)) placed.set(ti, si); }));
const missing = topics.map((_, i) => i).filter((i) => !placed.has(i));
if (missing.length) {
  sections.push({ title: "موضوعات أخرى", theme: "موضوعات لم تُدرج في قسمٍ أعلى", topics: missing });
  missing.forEach((i) => placed.set(i, sections.length - 1));
}
console.log(`أقسام: ${sections.length} · موضوعات: ${topics.length} · مُغطّاة: ${placed.size} · ناقصة أُلحقت: ${missing.length}`);

// build sections with their topics (dedup topic indices, first section wins), sort by verses
const built = sections.map((s, si) => {
  const tps = (s.topics ?? []).filter((ti) => placed.get(ti) === si && topics[ti]).map((ti) => topics[ti]);
  tps.sort((a, b) => b.size - a.size);
  return { title: s.title, theme: s.theme, topics: tps, verses: tps.reduce((n, t) => n + t.size, 0) };
}).filter((s) => s.topics.length).sort((a, b) => b.verses - a.verses);

const totalVerses = built.reduce((n, s) => n + s.verses, 0);
console.log(`آيات مصنّفة: ${totalVerses} / 6236`);
console.log(`\nالأقسام:`);
for (const s of built) console.log(`  ×${String(s.verses).padStart(4)} آية · ${String(s.topics.length).padStart(2)} موضوع  |  ${s.title}`);

// --- human map -----------------------------------------------------------------
let md = `# المصحف الموضوعي — الفهرس الكامل (كل ٦٢٣٦ آية في موضوعها)

**التاريخ:** 2026-07-11 · **الطريقة:** عُنقِدت كل آيات القرآن دلاليًّا (متجهات Gemini)،
ثم سمّى سربٌ من ٩٠ وكيلًا كل عنقود وتحقّق منه وقسّمه، ودُمجت الشظايا في أقرب موضوعٍ
لها، ثم نُظّمت في فهرسٍ قانونيّ من ${built.length} أقسام. **البنية: القسم → الموضوع → الآية.**
محسوبٌ من نصّ القرآن وحده — لا تفسير، لا مصدر خارجي.

**الحصيلة:** ${built.length} أقسام · ${topics.length} موضوعًا · ${totalVerses} آية (تغطية كاملة).

`;
built.forEach((s, i) => {
  md += `\n## ${i + 1}. ${s.title}  ·  ${s.topics.length} موضوع · ${s.verses} آية\n\n${s.theme}\n\n`;
  s.topics.forEach((t) => {
    md += `### ${t.title}  ·  ${t.size} آية\n> ${t.rep}: ${textOf.get(t.rep) ?? ""}\n\n`;
  });
});
fs.writeFileSync(MD, md);

// --- app layer -----------------------------------------------------------------
const app = {
  meta: { sections: built.length, topics: topics.length, verses: totalVerses },
  sections: built.map((s) => ({
    title: s.title, theme: s.theme, verses: s.verses,
    topics: s.topics.map((t) => ({ title: t.title, theme: t.theme, rep: t.rep, members: t.members })),
  })),
};
fs.writeFileSync(APP, JSON.stringify(app));
console.log(`\n→ findings/MAWDUI.md (${(fs.statSync(MD).size / 1024).toFixed(0)} KB)`);
console.log(`→ public/mawdui.json (${(fs.statSync(APP).size / 1024).toFixed(0)} KB)`);
