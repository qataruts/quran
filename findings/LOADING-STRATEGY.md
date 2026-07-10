# Loading strategy — first-load performance (STUDY, do not build yet)

Owner concern (2026-07-10): as we add layers, first-load db may become a burden;
consider a "second wave" for some data so first load feels fast — BUT only after
studying all use cases, and only if 100% safe. If a split would hurt UX, prefer a
slightly longer first load (safer default).

## Measured reality (quran-app.db, 57.8 MB)
- Content payload is only ~12 MB: ayahs (incl. all 3 translations) 5.2 · roots
  (incl. lexicon meanings) 3.5 · words (morphology) 3.1. rootEdges/meta ~0.
- The other ~46 MB is INDEXES + FTS5, not text. Brotli → ~12–13 MB over the wire.
CONCLUSION: translations & meanings are CHEAP (~4 MB) — deferring them saves
little and risks the "pop-in" UX harm. Keep them in the FIRST wave.

## What is actually worth deferring
Heavy ANALYTICAL layers, none needed to read — only for their own views:
محكم→تفصيل, syntactic treebank, sense-clusters (وجوه), rootEdges/network,
embeddings (already a separate .bin ✓). القراءات = extra reading text (keep with
reader if small). Load these on-demand per view.

## 100%-safe technique (recommended IF measurement shows a need)
Layered files + gated access + service-worker cache:
1. Wave 1 (blocking, small): ayahs(text+translations) + word morphology + structure.
2. On-demand: each analytical layer = own file, fetched when its view opens,
   via db.ts which shows a clean "loading layer…" state; nothing else blocks.
3. Service Worker caches each fetched layer → offline + instant on return.
Degrades gracefully; preserves offline; gating centralized in db.ts.

REJECTED technique: sql.js-httpvfs (HTTP byte-range) — breaks offline (a hard
requirement) and adds per-query latency. Keep as last-resort only if db becomes
enormous AND offline is dropped for that layer.

## Free, safe wins (no split needed)
- Ship the browser build with ONLY the indexes the app queries (drop the rest;
  derived data, zero behavior change) → smaller file.
- Tiny bootstrap (al-Fātiḥa + surah list) for sub-second first paint while core streams.

## Decision rule
Do NOT implement now. Finish features → MEASURE real db size. If first-load is
fine, keep the single load (already 100% safe with the progress screen). Split
into waves ONLY if measured burden, and only the heavy analytical layers — never
the reading essentials. When unsure, a slightly longer honest first-load wins.
