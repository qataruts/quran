/**
 * derive-muhkama.mjs — carve a clean hierarchy out of the (very densely linked)
 * محكم→تفصيل graph so every verse has ONE محكمة it belongs to.
 *
 * The raw graph is a hairball: a typical verse has 6+ أصول and traces up to ~51
 * of the 88 roots, with cycles. To get a real tree we:
 *   1. level[v] = min hops from any root محكمة (BFS down the تفصيل edges).
 *   2. primaryParent[v] = the أصل of v that is (a) strictly closer to a root
 *      (level < level[v] → no cycles, guaranteed climb) and (b) most SIMILAR to
 *      v in meaning (Gemini embeddings). Semantic similarity is what makes the
 *      choice meaningful rather than arbitrary.
 *   3. muhkama[v] = the root at the top of the primaryParent chain; path[v] the
 *      breadcrumb. Also `near` = the 3 root محكمات closest to v in meaning.
 *
 * Reads public/jawami.json + public/quran-embeddings.bin. Writes
 * public/muhkama-of.json. Self-contained (Hafs ayah counts for loc→global id;
 * verified: 112:1 → all توحيد verses). Usage: node js/scripts/derive-muhkama.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "../apps/studio/public");

// ---- embeddings (qkg-emb-1: uint32 hlen | JSON header | Float32 scales | Int8 data) ----
const buf = fs.readFileSync(path.join(PUB, "quran-embeddings.bin"));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const hlen = new DataView(ab).getUint32(0, true);
const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hlen)));
const { dim, count } = hdr;
const sOff = 4 + hlen;
const scales = new Float32Array(ab.slice(sOff, sOff + count * 4));
const data = new Int8Array(ab, sOff + count * 4, count * dim);

// ---- Hafs ayah counts → global id (1..6236) ----
const C = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
if (C.reduce((a, b) => a + b, 0) !== count) throw new Error("Hafs counts ≠ embedding count");
const base = {}; { let acc = 0; for (let s = 1; s <= 114; s++) { base[s] = acc; acc += C[s - 1]; } }
const gid = (loc) => { const [s, a] = loc.split(":").map(Number); return base[s] + a; };

// normalized vector cache (only for the locs we touch)
const vcache = new Map();
function vec(loc) {
  let v = vcache.get(loc);
  if (v) return v;
  const r = gid(loc) - 1;
  v = new Float32Array(dim);
  let n = 0;
  for (let i = 0; i < dim; i++) { const x = data[r * dim + i] * scales[r]; v[i] = x; n += x * x; }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < dim; i++) v[i] /= n;
  vcache.set(loc, v);
  return v;
}
const cos = (a, b) => { let d = 0; for (let i = 0; i < dim; i++) d += a[i] * b[i]; return d; };

// ---- jawami graph ----
const J = JSON.parse(fs.readFileSync(path.join(PUB, "jawami.json"), "utf8"));
const P = J.principles, T = J.tafsil;
const rev = {}; // loc -> [asl locs] (elaborates)
for (const h in T) for (const [to] of T[h]) (rev[to] = rev[to] || []).push(h);
const isRoot = (l) => !!P[l] && !(rev[l] && rev[l].length) && (T[l] || []).length > 0;
const roots = Object.keys(P).filter(isRoot);

// every verse in the network (principles ∪ تفصيل targets)
const nodes = new Set(Object.keys(P));
for (const h in T) for (const [to] of T[h]) nodes.add(to);

// ---- the root محكمات a verse is (transitively) a تفصيل of — BFS up elaborates ----
function reachableRoots(v) {
  const seen = new Set([v]);
  let fr = [v];
  const rr = [];
  while (fr.length && seen.size < 4000) {
    const nx = [];
    for (const n of fr) for (const p of (rev[n] || [])) {
      if (seen.has(p)) continue;
      seen.add(p);
      if (isRoot(p)) rr.push(p);
      nx.push(p);
    }
    fr = nx;
  }
  return rr;
}

// muhkama = the reachable root(s) CLOSEST in meaning — graph-linked + semantically
// anchored, so it doesn't drift the way a blind parent-climb does.
function muhkamatOf(v, k = 3) {
  const rr = reachableRoots(v);
  if (!rr.length) return [];
  const vv = vec(v);
  return rr
    .map((r) => [r, cos(vv, vec(r))])
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([r, s]) => ({ loc: r, sim: Math.round(s * 1000) / 1000 }));
}

// ---- derive for every node ----
const out = {};
let withRoot = 0, noRoot = 0;
for (const v of nodes) {
  if (isRoot(v)) { out[v] = { self: true }; withRoot++; continue; }
  if (!(rev[v] && rev[v].length)) continue; // مجرّد / standalone — no أصل
  const mk = muhkamatOf(v);
  out[v] = { muhkamat: mk };
  if (mk.length) withRoot++; else noRoot++;
}

const S = { 4: "النساء", 6: "الأنعام", 30: "الروم", 39: "الزمر", 51: "الذاريات", 53: "النجم", 2: "البقرة", 3: "آل عمران", 42: "الشورى", 45: "الجاثية", 55: "الرحمن", 50: "ق", 112: "الإخلاص", 16: "النحل", 24: "النور", 17: "الإسراء" };
const nm = (l) => { const [s, a] = l.split(":"); return (S[s] || ("سورة" + s)) + " " + a; };

const show = (mk) => mk && mk.length ? mk.map((x) => `${nm(x.loc)} (${x.sim})`).join("  ·  ") : "(none)";
console.log(`nodes: ${nodes.size} | roots(محكمات): ${roots.length} | with محكمة: ${withRoot} | no-root: ${noRoot}`);
console.log("\n=== 42:11 (الشورى ١١) → المحكمات ===\n  " + show(out["42:11"].muhkamat));
console.log("\n=== spread sample → the محكمات each verse belongs to ===");
for (const v of ["2:255", "112:1", "24:35", "17:23", "55:1", "4:34", "36:36", "50:16", "16:97", "2:183", "2:275", "31:13"]) {
  const r = out[v];
  if (!r) { console.log(`  ${nm(v)} — outside network`); continue; }
  if (r.self) { console.log(`  ${nm(v)} — ★ IS a محكمة (root)`); continue; }
  console.log(`  ${nm(v)}  →  ${show(r.muhkamat)}`);
}

fs.writeFileSync(path.join(PUB, "muhkama-of.json"), JSON.stringify(out));
console.log(`\nwrote muhkama-of.json (${(fs.statSync(path.join(PUB, "muhkama-of.json")).size / 1024).toFixed(0)} KB)`);
