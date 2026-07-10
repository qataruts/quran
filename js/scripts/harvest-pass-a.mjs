/**
 * محكم Pass A — harvester. Reads the swarm workflow journal and persists every
 * completed batch's classifications into quran-kg.db (table ayah_principle),
 * so progress survives session limits. Idempotent; run any time. Prints which
 * ayah-id ranges are still missing (re-run only those in a follow-up swarm).
 *
 * Usage: node scripts/harvest-pass-a.mjs [journal.jsonl path]
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.resolve(HERE, "../../quran-kg.db");
const DEFAULT_JOURNAL =
  "/Users/emad/.claude/projects/-Volumes-data-new-projects-quran/762c865b-b6d5-4d4f-8fad-46cbaa8a28f2/subagents/workflows/wf_473184f8-4d2/journal.jsonl";

const journalPath = process.argv[2] ?? DEFAULT_JOURNAL;
if (!fs.existsSync(journalPath)) {
  console.error(`journal not found: ${journalPath}`);
  process.exit(1);
}

const db = new DatabaseSync(DB);
db.exec(`
  CREATE TABLE IF NOT EXISTS ayah_principle (
    ayah_id INTEGER PRIMARY KEY REFERENCES ayah(ayah_id),
    p       INTEGER NOT NULL CHECK (p IN (0,1,2)),
    kind    TEXT,
    source  TEXT NOT NULL DEFAULT 'claude-swarm-pass-a'
  );
`);
const insert = db.prepare("INSERT OR REPLACE INTO ayah_principle (ayah_id, p, kind) VALUES (?,?,?)");

let harvested = 0;
for (const line of fs.readFileSync(journalPath, "utf-8").split("\n")) {
  if (!line.trim()) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  if (e.type !== "result" || !e.result?.items) continue;
  db.exec("BEGIN");
  for (const it of e.result.items) {
    if (typeof it.id === "number" && it.id >= 1 && it.id <= 6236 && [0, 1, 2].includes(it.p)) {
      insert.run(it.id, it.p, it.p > 0 ? (it.kind ?? it.k ?? null) : null);
      harvested++;
    }
  }
  db.exec("COMMIT");
}

const total = db.prepare("SELECT COUNT(*) n FROM ayah_principle").get().n;
const p2 = db.prepare("SELECT COUNT(*) n FROM ayah_principle WHERE p=2").get().n;
const p1 = db.prepare("SELECT COUNT(*) n FROM ayah_principle WHERE p=1").get().n;
console.log(`harvested ${harvested} judgments this run; table now ${total}/6236 (p2=${p2}, p1=${p1})`);

// missing ranges (for re-running only the gaps)
const have = new Set(db.prepare("SELECT ayah_id FROM ayah_principle").all().map((r) => r.ayah_id));
const gaps = [];
let start = null;
for (let i = 1; i <= 6236; i++) {
  if (!have.has(i)) {
    if (start == null) start = i;
  } else if (start != null) {
    gaps.push([start, i - 1]);
    start = null;
  }
}
if (start != null) gaps.push([start, 6236]);
console.log(gaps.length ? `missing ranges: ${JSON.stringify(gaps)}` : "COMPLETE — no gaps");
db.close();
