# مصحف المعرفة — Roadmap

Produced by the 24-agent swarm (3 verified code reviews + 3 innovation lenses
+ synthesis), 2026-07-10. Ten items, ranked; duplicates merged; ideas that add
surface without serving "everything at a fingertip" were killed.

## Shipped already
- ✅ **Offline PWA** (item 1) — installable (manifest + icons), service worker
  with cache-first versioned data files (?v=<db-hash> busts on redeploy) and
  recitation audio caching; boots from cache after first visit.
- ✅ **آيات قريبة المعنى** (item 2) — top-8 Gemini neighbors per ayah precomputed
  into a 146 KB sidecar; «مثلها ≈» chip on every ayah in Reader and Search,
  expanding inline, wanderable, no API key at read time.
- ✅ **رفقاء الكلمة** (item 3) — the Network force-graph is replaced: companions
  of a root as a ranked, readable list; every row expands into the real ayahs
  where the two roots meet (dual green/gold highlighting); pairs promoted to
  «آيات اللقاء» (`/network/:a/:b`) — every meeting in mushaf order, collectable.
- ✅ Unified search — text + by-meaning as one page with a mode switch.
- ✅ Swarm-confirmed bug fixes: audio play/stop race, orphaned recitation
  (global now-playing bar with stop), semantic-vectors retry after a failed
  fetch, StrictMode double database download, RTL bar corners, Arabic-Indic
  digits in ayah markers.

## Next (ranked)

1. **الاستماع المتواصل / Continuous listening** — chain ayah audio, follow-along
   highlight + autoscroll, mini-player, Media Session lock-screen controls. *days*
2. **صندوق واحد لكل شيء / ⌘K omnibox** — one input resolving «البقرة ٢٥٥»,
   "2:255", juz/page, surah names, roots, text and meaning search; plus
   prev/next page/surah navigation and an alias table (آية الكرسي…). *days*
3. **واجهة الإبهام / One-thumb mobile shell** — bottom tab bar, long-press word
   → bottom-sheet morphology, surah sheet. The phone is where the habit lives. *weeks*
4. **صفحة اليوم / "Today" home** — date-seeded آية اليوم unfolding into its
   root, gloss, and semantic siblings; «واصل القراءة» resume chip. *days*
5. **المتشابهات / Echoes** — computed mutashabihat: near-duplicate ayahs with
   word-aligned diffs (lemma sequences + vectors), drill mode for huffaz. *days*
6. **شارك الآية / Share as image** — canvas-rendered ayah card + deep link;
   the WhatsApp growth loop. *days*
7. **عدسات القراءة / Reader lenses** — revelation-order navigation toggle;
   hapax underline («هذه الكلمة لا ترد إلا هنا») with its Mufradat gloss. *hours*
8. **Constellations (theme galaxies)** — deferred: needs PMI re-weighting of
    the co-occurrence graph + a curation pass; revisit after 2–3 prove appetite.

## Network verdict (recorded)
REPLACE, not redesign — done. Co-occurrence data stays novel and valuable,
but as *evidence readers can read* (companions list → shared ayahs), never as
an abstract force graph. If a graph ever returns, it is a small deterministic
SVG signpost whose edges open the pair pages — never the interface itself.
