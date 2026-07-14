/**
 * أطلس الفواصل — the Qur'an's verse-ending rhyme, computed from the text alone:
 * the روي (final letter) of each ayah's last word, overall and per surah. No
 * external prosody source — just the letters. Writes public/fawasil.json.
 *   node scripts/export-fawasil.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "js/apps/studio/public/fawasil.json");

const db = new DatabaseSync(path.join(ROOT, "quran-app.db"), { readOnly: true });
const ayahs = db.prepare("SELECT data FROM ayahs").all().map((r) => JSON.parse(r.data));
db.close();
// أسماء السور من قاعدة المعرفة — surahs.data في quran-app لا يحمل الاسم أصلًا
// (كانت الشبكة تعرض الأرقام بدل الأسماء)
const kg = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const nameRows = kg.prepare("SELECT surah_no, name_ar FROM surah").all();
kg.close();

const stripMarks = (s) => (s || "").replace(/[ً-ٰٟۖ-ۭـ]/g, "");
const roeyaOf = (t) => {
  const words = stripMarks(t).trim().split(/\s+/).filter(Boolean);
  const last = [...(words[words.length - 1] || "")];
  return last[last.length - 1] || "";
};
const end2Of = (t) => {
  const words = stripMarks(t).trim().split(/\s+/).filter(Boolean);
  return [...(words[words.length - 1] || "")].slice(-2).join("");
};

const letters = {};
const endings = {};
const bySurah = new Map(); // surahNo → { [roeya]: n }
for (const a of ayahs) {
  const r = roeyaOf(a.textClean);
  const e = end2Of(a.textClean);
  letters[r] = (letters[r] || 0) + 1;
  endings[e] = (endings[e] || 0) + 1;
  const m = bySurah.get(a.surahNo) ?? {};
  m[r] = (m[r] || 0) + 1;
  bySurah.set(a.surahNo, m);
}

const nameOf = new Map(nameRows.map((s) => [s.surah_no, s.name_ar]));
const total = ayahs.length;
const lettersArr = Object.entries(letters)
  .map(([letter, count]) => ({ letter, count, pct: +((count / total) * 100).toFixed(1) }))
  .sort((a, b) => b.count - a.count);
const endingsArr = Object.entries(endings)
  .map(([end, count]) => ({ end, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 24);
const surahs = [...bySurah.entries()]
  .map(([no, m]) => {
    const n = Object.values(m).reduce((s, x) => s + x, 0);
    const [dom, domN] = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    return { no, name: nameOf.get(no) ?? String(no), dom, domPct: +((domN / n) * 100).toFixed(0), ayahs: n };
  })
  .sort((a, b) => a.no - b.no);

const out = { meta: { ayahs: total, letters: lettersArr.length }, letters: lettersArr, endings: endingsArr, surahs };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`fawasil.json: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB · روي: ${lettersArr.slice(0, 4).map((l) => `${l.letter} ${l.pct}%`).join(" · ")}`);
