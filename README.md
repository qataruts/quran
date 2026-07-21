# مشكاة · Mishkāt

**The Qur'an as a computed knowledge graph — read, traced, connected, and searched by meaning, entirely in the browser.**
Live: **[mishkat.qa](https://mishkat.qa)**

مشكاة is the niche that holds a lamp — «مَثَلُ نُورِهِ كَمِشْكَاةٍ فِيهَا مِصْبَاح» (النور ٣٥).
The project sets out to serve the Qur'an in a new way: not another reader, but a
place where the text's own language — its roots, its morphology, its recurrences,
its similitudes, its examined inter-verse links — is **computed and presented**
simply, so a reader can see connections that were always there in the text.

## The discipline

The motto is «نحسب ونعرض» — *we compute, and we present* — and every claim in the
app carries one of three declared grades of sanad:

- **محسوب (computed)** — derived *only* from the Qur'anic text (Uthmani + clean
  orthography), QAC word-by-word morphology, the two classical lexicons
  (مفردات الراغب · مقاييس ابن فارس), the muṣḥaf's typography, and Gemini
  meaning-embeddings. Computed layers never draw on tafsīr.
- **منقول (quoted)** — a cited reference library shown *as sources, never as
  computation*: concise and classical tafsirs, asbāb al-nuzūl, qirāʾāt, iʿrāb,
  and the bayān books (furūq, wujūh, baṣāʾir, mutashābih, ʿulūm al-Qurʾān) —
  every quote attributed to its book.
- **مولَّد (generated)** — نبراس's constrained inference: only over computed
  premises, in explicit conditional form, visibly tagged, never presented as
  transmitted knowledge, and guarded server-side.

No fatwa, no rulings, no judgment upon verses — examination applies to *our
work*, never to the text. See [findings/METHODOLOGY.md](findings/METHODOLOGY.md),
[findings/TERMS-CHARTER.md](findings/TERMS-CHARTER.md), and the review dossiers
under [findings/](findings/).

## What's inside

| View | What it is |
|---|---|
| **المصحف** — reader | Page/ayah reading, reverent typography; tap any word for full morphology, tafsīr, asbāb, qirāʾāt, iʿrāb at that verse. |
| **نِبراس** — AI research assistant | An agentic researcher over مشكاة's own layers and cited books: meaning-search, roots, context units, deterministic counting, drafting — verses quoted only from tool output (server-side sanad guards), every fact attributed. |
| **الكلّيّات والجوامع والتفصيل** | A computed tiering from the unified examined network: 9,494 directed links + 1,312 mutual affirmations, each examined with both passages' context in view. |
| **المحاور المنبثقة** | 206 emergent axes over the rule co-elaboration graph (deterministic Louvain, 99.6% stability). |
| **مواضيع مشكاة** | The whole muṣḥaf topically organized from computed context units (topics ← chapters), beside the first-generation traditional index for comparison. |
| **خريطة المصحف** | All 6,236 verses as one map — tiers, examined links, and mutual affirmations traversable cell by cell. |
| **البيان** — tadabbur of language | Edited + auto-generated cards (usage maps computed; readings quoted from the bayān library), with the rooted bayān library alongside. |
| **فروق التنزيل** | The near-identical verses aligned letter-by-letter, differences classified. |
| **الفروق اللغوية · الجذور** | Root network with lexicon senses; near-synonym differentiation from fields and collocations. |
| **الوجوه والنظائر** | Polysemous words: each sense with its verses and quoted lexicon witness. |
| **السياق** | 1,404 computed context units — the muṣḥaf in coherent passages. |
| **مثلها · الأمثال · الفواصل** | Nearest verses by meaning; the parables gathered; the verse-ending atlas. |
| **التفاسير والمصادر** | The full cited library — 43 books: concise works local, twenty classical tafsirs fetched sura-by-sura on demand («نمط الصوت») from [qataruts/mishkat-data](https://github.com/qataruts/mishkat-data). |
| **البحث** | Meaning-based semantic search over every ayah, on-device. |
| **عن المشروع** | The method in full, the data covenant, and the entire computed dataset as one Excel download. |

## How it works

- **Offline-first.** The corpus ships as one [monlite](https://github.com/qataruts/monlite)
  SQLite database read in the browser via `sql.js`. No server round-trips for reading.
- **Semantic search** uses `gemini-embedding-001` vectors computed once offline and
  shipped as int8 sidecars; matching is an on-device cosine scan. The only network
  calls are the `api/` proxies (embedding, نبراس, drafting) and the on-demand
  classical-tafsir fetches from the public data repo.
- **نبراس** is a stateless agentic loop: the model requests tools, the browser
  executes them locally over مشكاة's data for free, and the final answer is
  woven under server-side guards (verbatim-verse guard, number guard, inference
  guard). Tool rounds run on a fast model; final composition on the strongest
  (one env switch, `NIBRAS_TIER`).
- **Every layer is regenerable**: deterministic scripts in `js/scripts/` build each
  computed sidecar from the database; the manifest (`rag-manifest.json`) is the
  single registry the app boots from — adding a book or layer is a data entry,
  not a code change.
- **PWA**, right-to-left, installable, fully usable offline.

Stack: React 18 · Vite · TypeScript · monlite/sql.js · Vite-PWA · Vercel (+ Edge
functions for نبراس over Gemini).

## The data

| Layer | Source | Notes |
|---|---|---|
| Morphology | [Quranic Arabic Corpus](https://corpus.quran.com) (Kais Dukes), Arabic edition via [mustafa0x/quran-morphology](https://github.com/mustafa0x/quran-morphology) | GPL |
| Uthmani text · structure | [Tanzil](https://tanzil.net) | CC BY 3.0 |
| Lexicons | مفردات الراغب · مقاييس ابن فارس | classical, public domain |
| Cited books | verse-anchored tafsir/asbāb/qirāʾāt collections + bayān books structured from [OpenITI](https://openiti.org) witnesses | quoted, attributed, per-book provenance in `findings/` |
| Semantic vectors | `gemini-embedding-001`, computed once, shipped int8 | — |
| Classical-tafsir hosting | [qataruts/mishkat-data](https://github.com/qataruts/mishkat-data) — per-sura JSON, fetched on demand | 20 books |

Canonical shape validated on every build: **114 surahs · 6,236 ayahs · 77,429
words · 130,030 segments · ~1,650 roots**.

The research record — every swarm's dossier, gate, calibration report, and the
frozen held-out exams — lives in [findings/](findings/): the full story of how
each number on the site was produced, errors corrected openly, never erased.

## Build & run

```bash
cd js && npm install
npm run dev            # مشكاة in the browser
npm run build          # production build (decompresses quran-app.db.gz into public/)
```

`copy-assets.mjs` unpacks the database and sidecars into `public/` before the
build; `dataVersion()` fingerprints them for cache-busting. نبراس needs the
`api/` functions (Vercel or `vercel dev`) and a `GEMINI_API_KEY`.

## Repository layout

```
quran-app.db.gz            the shipped database (monlite)
data/                      source texts (QAC morphology, Tanzil text & metadata)
build_qkg.py · qkg.py      deterministic KG builder + CLI explorer
js/apps/studio/            مشكاة — the React app (+ api/ edge functions)
js/scripts/                every computed layer's deterministic generator
findings/                  the research record — methodology, dossiers, audits
hosted-data → qataruts/mishkat-data   the on-demand classical-tafsir repo
```

## Regenerating the data

```bash
python3 build_qkg.py                      # data/ -> quran-kg.db (self-validating)
node js/scripts/convert-to-app-db.mjs     # quran-kg.db -> quran-app.db (monlite)
node js/scripts/build-manifest.mjs        # the single registry the app boots from
node js/scripts/<layer generator>.mjs     # rebuild any computed sidecar
```

## License & credits

Application code: MIT (see [LICENSE](LICENSE)). Source data retains its upstream
licenses (QAC: GPL; Tanzil: CC BY 3.0). Built on
[monlite](https://github.com/qataruts/monlite).

Contact: **Eng. Emad Jumaah** · +974 3388 2806 · emadjumaah@gmail.com

*نحسب ونعرض.*
