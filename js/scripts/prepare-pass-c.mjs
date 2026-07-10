/**
 * Pass C prep — package every جامعة + its verified تفصيل (with texts and the
 * assigned relation) for adversarial review. Emits pass-c-batches.json.
 *
 * Usage: node scripts/prepare-pass-c.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.resolve(HERE, "../../quran-kg.db");
const OUT = path.resolve(HERE, "../../pass-c-batches.json");

const db = new DatabaseSync(DB, { readOnly: true });
const text = new Map(db.prepare("SELECT ayah_id, location, text_clean FROM ayah").all().map((r) => [r.location, r.text_clean]));
const locOf = new Map(db.prepare("SELECT ayah_id, location FROM ayah").all().map((r) => [r.ayah_id, r.location]));

const hubs = db.prepare("SELECT hub_ayah_id FROM ayah_tafsil_hubs_seen ORDER BY hub_ayah_id").all().map((r) => r.hub_ayah_id);
const links = db.prepare("SELECT tafsil_ayah_id t, rel FROM ayah_tafsil WHERE hub_ayah_id=? ORDER BY rel");
const kindOf = db.prepare("SELECT kind FROM ayah_principle WHERE ayah_id=?");

const items = [];
for (const h of hubs) {
  const hubLoc = locOf.get(h);
  const tafsil = links.all(h).map((l) => ({ loc: locOf.get(l.t), rel: l.rel, text: text.get(locOf.get(l.t)) }));
  if (tafsil.length === 0) continue; // nothing to review for empty hubs
  items.push({ hub: hubLoc, kind: kindOf.get(h)?.kind ?? null, hubText: text.get(hubLoc), tafsil });
}
db.close();

// batch by ~8 hubs (review is heavier per-hub than Pass B)
const batches = [];
for (let i = 0; i < items.length; i += 8) batches.push(items.slice(i, i + 8));
fs.writeFileSync(OUT, JSON.stringify({ batches }, null, 0));
console.log(`pass-c-batches.json: ${items.length} hubs with links → ${batches.length} batches of ~8`);
