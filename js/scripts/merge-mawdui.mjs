/**
 * Consolidate the مصحف الموضوعي swarm output: the 90 independently-audited
 * clusters over-split into ~400 topics (incl. 1–2 verse fragments pulled out of
 * their story). This absorbs every fragment into the nearest substantial topic
 * by embedding similarity — no verse is lost, and thematically-scattered
 * fragments rejoin their home. Then re-picks each topic's representative.
 *
 * Reads the swarm journal + quran-kg.db (embeddings). Writes
 * findings/mawdui-topics.json (the consolidated topic list). Usage:
 *   node scripts/merge-mawdui.mjs [journal.jsonl] [MIN]
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const JOURNAL = process.argv[2] ??
  "/Users/emad/.claude/projects/-Volumes-data-new-projects-quran/762c865b-b6d5-4d4f-8fad-46cbaa8a28f2/subagents/workflows/wf_a238cb04-116/journal.jsonl";
const MIN = Number(process.argv[3] ?? 5); // topics smaller than this are dissolved
const OUT = path.join(ROOT, "findings/mawdui-topics.json");

// embeddings + text
const db = new DatabaseSync(path.join(ROOT, "quran-kg.db"), { readOnly: true });
const loc = new Map(db.prepare("SELECT ayah_id, location FROM ayah").all().map((r) => [r.ayah_id, r.location]));
const textOf = new Map(db.prepare("SELECT location, text_clean FROM ayah").all().map((r) => [r.location, r.text_clean]));
const vec = new Map();
for (const r of db.prepare("SELECT ayah_id, dim, vector FROM ayah_embedding").iterate()) {
  const l = loc.get(r.ayah_id); if (!l) continue;
  const v = new Float32Array(r.vector.buffer, r.vector.byteOffset, r.dim);
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1;
  const u = new Float32Array(v.length); for (let i = 0; i < v.length; i++) u[i] = v[i] / n;
  vec.set(l, u);
}
db.close();
const D = [...vec.values()][0].length;
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const centroid = (locs) => {
  const c = new Float32Array(D);
  for (const l of locs) { const v = vec.get(l); if (v) for (let i = 0; i < D; i++) c[i] += v[i]; }
  let n = 0; for (let i = 0; i < D; i++) n += c[i] * c[i]; n = Math.sqrt(n) || 1;
  for (let i = 0; i < D; i++) c[i] /= n; return c;
};

// collect all topics from the swarm
const raw = [];
for (const line of fs.readFileSync(JOURNAL, "utf-8").split("\n")) {
  if (!line.trim()) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const r = e.result ?? e.output ?? e;
  if (r && typeof r === "object" && Array.isArray(r.topics)) {
    for (const t of r.topics) {
      const members = (t.members ?? []).filter((l) => vec.has(l));
      if (members.length) raw.push({ title: t.title, theme: t.theme, rep: t.rep, members });
    }
  }
}
// dedup any accidental cross-topic member repeats (keep first)
const seen = new Set();
for (const t of raw) t.members = t.members.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
const rawCount = raw.length;
const covered = seen.size;

// anchors vs fragments
let anchors = raw.filter((t) => t.members.length >= MIN);
const fragments = raw.filter((t) => t.members.length < MIN);
let anchorCen = anchors.map((t) => centroid(t.members));
// reassign every fragment verse to the nearest anchor
let moved = 0;
for (const f of fragments) {
  for (const l of f.members) {
    const v = vec.get(l); let best = 0, bs = -2;
    for (let i = 0; i < anchors.length; i++) { const s = dot(v, anchorCen[i]); if (s > bs) { bs = s; best = i; } }
    anchors[best].members.push(l); moved++;
  }
}
// dedup: merge near-IDENTICAL topics (independent clusters produced the same
// topic, e.g. two «وصف الجنة»). Union-find on the ORIGINAL centroids (no
// recompute → no cascading), high threshold so only true duplicates merge.
const THRESH = Number(process.env.THRESH ?? 0.98); // conservative: single-linkage chains below this
anchorCen = anchors.map((t) => centroid(t.members));
// diagnostic: how many pairs at several thresholds
for (const th of [0.95, 0.96, 0.965, 0.97, 0.98]) {
  let p = 0;
  for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) if (dot(anchorCen[i], anchorCen[j]) > th) p++;
  process.stdout.write(`  pairs>${th}: ${p}`);
}
process.stdout.write("\n");
const par = anchors.map((_, i) => i);
const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++)
  if (dot(anchorCen[i], anchorCen[j]) > THRESH) { const a = find(i), b = find(j); if (a !== b) par[a] = b; }
const groups = new Map();
for (let i = 0; i < anchors.length; i++) { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)).push(i); }
const merged = [];
for (const idxs of groups.values()) {
  idxs.sort((a, b) => anchors[b].members.length - anchors[a].members.length); // largest keeps title
  const base = { ...anchors[idxs[0]], members: [...anchors[idxs[0]].members] };
  for (const k of idxs.slice(1)) base.members.push(...anchors[k].members);
  merged.push(base);
}
console.log(`dedup: ${anchors.length} → ${merged.length} topics (merged ${anchors.length - merged.length}, cosine>${THRESH})`);
anchors = merged;

// recompute centroids + representative (nearest to centroid), sort by size
for (let i = 0; i < anchors.length; i++) {
  const cen = centroid(anchors[i].members);
  let rep = anchors[i].members[0], rs = -2;
  for (const l of anchors[i].members) { const s = dot(vec.get(l), cen); if (s > rs) { rs = s; rep = l; } }
  anchors[i].rep = rep;
  anchors[i].cohesion = +(anchors[i].members.reduce((s, l) => s + dot(vec.get(l), cen), 0) / anchors[i].members.length).toFixed(3);
}
anchors.sort((a, b) => b.members.length - a.members.length);

const totalMembers = anchors.reduce((s, t) => s + t.members.length, 0);
console.log(`raw topics: ${rawCount} · covered verses: ${covered}`);
console.log(`anchors (≥${MIN}): ${anchors.length} · fragments dissolved: ${fragments.length} (${moved} verses reassigned)`);
console.log(`final topics: ${anchors.length} · verses in topics: ${totalMembers} / 6236`);
console.log(`\nأكبر ١٥ موضوعًا:`);
for (const t of anchors.slice(0, 15)) console.log(`  ×${String(t.members.length).padStart(3)}  ${t.title}`);

const payload = {
  meta: { rawTopics: rawCount, topics: anchors.length, verses: totalMembers, min: MIN },
  topics: anchors.map((t) => ({
    title: t.title, theme: t.theme, rep: t.rep, cohesion: t.cohesion,
    size: t.members.length,
    members: t.members.sort((a, b) => { const [s1, a1] = a.split(":").map(Number), [s2, a2] = b.split(":").map(Number); return s1 - s2 || a1 - a2; }),
  })),
};
fs.writeFileSync(OUT, JSON.stringify(payload));
console.log(`\n→ findings/mawdui-topics.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
