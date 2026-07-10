/**
 * Export the محكم→تفصيل network as a compact static JSON the studio loads once
 * (no monlite query needed): every جامعة (p=2) with its facets, and every
 * SURVIVING تفصيل link (Pass C: review!='reject', reweights applied). The app
 * builds the reverse map (which hubs an āyah elaborates) client-side.
 *
 * Writes apps/studio/public/jawami.json. Small (~11k links). Idempotent.
 * Usage: node scripts/export-jawami-app.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.resolve(HERE, "../../quran-kg.db");
const OUT = path.resolve(HERE, "../apps/studio/public/jawami.json");

const db = new DatabaseSync(DB, { readOnly: true });
const loc = new Map(db.prepare("SELECT ayah_id, location FROM ayah").all().map((r) => [r.ayah_id, r.location]));

// principles (p=2) with computed facets
const principles = {};
for (const r of db.prepare(
  "SELECT ayah_id, kind, tahrim, hasr, amr_nahy, grade FROM ayah_principle WHERE p=2 ORDER BY ayah_id",
).iterate()) {
  const l = loc.get(r.ayah_id);
  if (!l) continue;
  principles[l] = {
    kind: r.kind ?? null,
    grade: r.grade ?? null,
    ...(r.tahrim ? { tahrim: 1 } : {}),
    ...(r.hasr ? { hasr: 1 } : {}),
    ...(r.amr_nahy ? { amr: 1 } : {}),
  };
}

// surviving tafsil links, effective relation (reweight applied), grouped by hub
const hasReview = db.prepare("SELECT COUNT(*) n FROM pragma_table_info('ayah_tafsil') WHERE name='review'").get().n;
const relExpr = hasReview ? "COALESCE(review_rel, rel)" : "rel";
const where = hasReview ? "WHERE review IS NULL OR review!='reject'" : "";
const tafsil = {};
let linkCount = 0;
for (const r of db.prepare(
  `SELECT hub_ayah_id h, tafsil_ayah_id t, ${relExpr} rel FROM ayah_tafsil ${where} ORDER BY hub_ayah_id, rel`,
).iterate()) {
  const h = loc.get(r.h), tl = loc.get(r.t);
  if (!h || !tl) continue;
  (tafsil[h] ??= []).push([tl, r.rel]);
  linkCount++;
}

// gaps (reviewer-suggested missing تفصيل) — optional, for a "قد يكمله" hint
const gaps = {};
if (db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='ayah_tafsil_gap'").get().n) {
  for (const r of db.prepare("SELECT hub_ayah_id h, tafsil_ayah_id t FROM ayah_tafsil_gap").iterate()) {
    const h = loc.get(r.h), tl = loc.get(r.t);
    if (h && tl) (gaps[h] ??= []).push(tl);
  }
}

const payload = {
  meta: {
    principles: Object.keys(principles).length,
    hubs: Object.keys(tafsil).length,
    links: linkCount,
    rels: ["بيان", "مثال", "جزاء", "توكيد"],
    grades: ["أصل جامع", "متفرّع", "موجز", "مجرّد"],
  },
  principles,
  tafsil,
  gaps,
};
fs.writeFileSync(OUT, JSON.stringify(payload));
db.close();
console.log(
  `jawami.json → ${Object.keys(principles).length} principles · ${Object.keys(tafsil).length} hubs · ${linkCount} links · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`,
);
