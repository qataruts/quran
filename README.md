# مشكاة · Mishkāt

**The Qur'an as a computed knowledge graph — read, traced, and connected, entirely in the browser.**
Live: **[quran.uts.qa](https://quran.uts.qa)**

مشكاة is the niche that holds a lamp — «مَثَلُ نُورِهِ كَمِشْكَاةٍ فِيهَا مِصْبَاح» (النور ٣٥).
The project sets out to serve the Qur'an in a new way: not another reader, but a
place where the text's own language — its roots, its morphology, its recurrences,
its similitudes — is **computed and presented** simply, so that a reader can see
connections that were always there in the text.

## The discipline

مشكاة computes; it never interprets. Every layer is derived **only** from:

```
┌─────────────────────────────────────────────────────────────┐
│  • the Qur'anic text itself (Uthmani + clean orthography)    │
│  • word-by-word morphology — the Quranic Arabic Corpus       │
│  • lexical meaning — classical Arabic dictionaries only:      │
│        مفردات الراغب الأصفهاني · مقاييس اللغة لابن فارس        │
│  • the mushaf's own typography and page layout               │
└─────────────────────────────────────────────────────────────┘
```

It deliberately uses **no tafsīr, no hadith, no asbāb al-nuzūl, no qirāʾāt, and no
naskh**. What the text and its language yield by computation, we present; what
belongs to the people of interpretation, we leave to them. The motto is
«نحسب ونعرض» — *we compute, and we present*. See
[findings/METHODOLOGY.md](findings/METHODOLOGY.md) and [AUDIT.md](AUDIT.md).

## What's inside

Each of these is a computed view over the same offline database:

| View | What it computes |
|---|---|
| **المصحف** — the reader | Page and ayah reading, reverent typography, tap any word for its full morphology. |
| **الصرف والنحو** — morphology | Every word's segments, root, lemma, POS, and grammatical features, from the QAC. |
| **الجذور والمعاني** — roots & meanings | Each root's derivations and locations, with its dictionary sense (الراغب / مقاييس). |
| **الفروق اللغوية** — differentiation | How near-synonymous roots differ, from their fields, collocations, and shawāhid. |
| **فروق التنزيل** — the mutashābihāt | Explained differences between the Qur'an's near-identical verses. |
| **الوجوه والنظائر** — polysemy | A word's distinct senses across contexts, computed and grouped. |
| **المحكمات والجوامع** — the pyramid | Comprehensive verses (jawāmiʿ) and the verses that detail them. |
| **المواضيع** — themes | Thematic clusters over the whole text. |
| **الأمثال** — the similitudes | The Qur'an's own parables, gathered. |
| **شبكة القرآن** — the network | The galaxy of roots, linked by how often they meet in the same verse. |
| **البحث الدلالي** — semantic search | Meaning-based search over every ayah, on-device. |
| **معالم وإحصاءات** — landmarks | Global statistics of morphology, rasm, and structure. |

## How it works

- **Offline-first.** The whole corpus ships as one [monlite](https://github.com/qataruts/monlite)
  SQLite database read in the browser via `sql.js` — collections, full-text search,
  root-relation edges, and precomputed statistics. No server round-trips for reading.
- **Semantic search** uses Google `gemini-embedding-001` vectors (768-dim), computed
  once offline and shipped as a binary sidecar; matching runs on-device. The only
  network calls in the app are the optional embedding/generation proxies in `api/`.
- **The network layout** for شبكة القرآن is force-directed and **precomputed offline**
  (roots as nodes sized by occurrence, edges weighted by shared verses, Louvain
  communities for colour) so the app only paints a baked layout — see
  [js/scripts/export-network.mjs](js/scripts/export-network.mjs).
- **PWA**, right-to-left, installable, and fully usable without a connection.

Stack: React 18 · Vite · TypeScript · monlite/sql.js · Vite-PWA. Deployed on Vercel.

## The data

| Layer | Source | Version / License |
|---|---|---|
| Morphology (roots, lemmas, POS, features) | [Quranic Arabic Corpus](https://corpus.quran.com) (Kais Dukes, Univ. of Leeds), Arabic-script edition via [mustafa0x/quran-morphology](https://github.com/mustafa0x/quran-morphology) | v0.4, GPL |
| Uthmani text · structural metadata (juz/hizb/page/sajda, surah names & types) | [Tanzil](https://tanzil.net) | v1.1 / v1.0, CC BY 3.0 |
| Lexical meaning | مفردات ألفاظ القرآن — الراغب الأصفهاني · مقاييس اللغة — ابن فارس (classical, public domain) | — |
| Semantic vectors | Google `gemini-embedding-001` (computed once, shipped as a sidecar) | — |

The canonical shape is validated on every build: **114 surahs · 6,236 ayahs ·
77,429 words · 130,030 segments · ~1,650 roots**.

## Build & run

```bash
# the app
cd js/apps/studio
npm install
npm run dev            # Quran Studio in the browser
npm run build          # production build (decompresses quran-app.db.gz into public/)
```

`copy-assets.mjs` unpacks the database and data sidecars into `public/` before the
build; `dataVersion()` in `vite.config.ts` fingerprints them for cache-busting.

## Repository layout

```
quran-app.db.gz            the shipped database (monlite), decompressed at build
data/                      source texts (QAC morphology, Tanzil text & metadata)
build_qkg.py               builds quran-kg.db from data/ (deterministic, stdlib only)
qkg.py                     command-line explorer for quran-kg.db
js/apps/studio/            مشكاة — the React app (Quran Studio)
js/scripts/                data generators: converters, embeddings, and every
                           computed layer's exporter (network, furuq, wujuh, …)
findings/                  the research record — methodology, categorizations, audits
AUDIT.md · ARCHITECTURE.md the correctness audit and the entity model
```

## Regenerating the data

```bash
python3 build_qkg.py                         # data/ -> quran-kg.db (self-validating)
node js/scripts/convert-to-app-db.mjs        # quran-kg.db -> quran-app.db (monlite)
node js/scripts/export-*.mjs                  # rebuild each computed sidecar
```

## License & credits

Application code: MIT (see [LICENSE](LICENSE)). Source data retains its upstream
licenses (QAC: GPL; Tanzil: CC BY 3.0). Built on
[monlite](https://github.com/qataruts/monlite).

*نحسب ونعرض.*
