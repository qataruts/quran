# مكتبة نِبراس — book corpus for RAG

Verse-anchored Qurʾān-related books collected for نِبراس (grounded retrieval + citation).
Computed layers (الكلّيّات، المواضيع، مثلها، فروق) stay COVENANT-pure; these books are a
**separate, cited** source — نِبراس retrieves passages and attributes them ("من تفسير ابن كثير…").

## Format
Every book is `<genre>/<id>.jsonl`, one JSON object per line:

```json
{"ref":"2:255","text":"…"}                 // single āyah
{"ref":"112:1","refEnd":"112:4","text":"…"} // one commentary block covering a range
```

`refEnd` appears only when a passage spans several āyāt. spa5k stores such blocks
duplicated on every āyah; `collect-books.mjs` collapses each into ONE ranged record —
so a reader lookup for any loc in `[ref … refEnd]` resolves, and embedding sees no
duplicates. `manifest.json` lists every book with `blocks` (records), `ayat` (āyāt
covered) and `textMB`.

## Contents (33 books via spa5k + 2 pre-existing + Quranpedia layers)

| genre | books |
|---|---|
| `tafsir/` | المختصر · الميسّر · الجلالين · السعدي · تدبّر وعمل · أيسر التفاسير · ابن عثيمين · الطبري · ابن كثير · الدرّ المنثور · ابن أبي حاتم · البغوي · القرطبي · الكشّاف · الرازي · البحر المحيط · البيضاوي · ابن عطية · الألوسي · الشوكاني · ابن عاشور · النسفي · أبو السعود · القاسمي · أضواء البيان |
| `munasabat/` | نظم الدرر (البقاعي) |
| `i3rab/` | الجدول (محمود صافي) · الدرّ المصون · الدرويش · الإعراب الميسّر |
| `gharib/` | السراج (الخضيري) · الميسّر في الغريب · تحليل كلمات القرآن |
| `qiraat/` | الموسوعة القرآنية للقراءات · النشر (ابن الجزري) |
| `asbab/` | المحرَّر في أسباب النزول (المزيني، 198 آية — الصحيح فقط) · أسباب نزول القرآن (الواحدي، 564 آية) |
| `lexicon/` | المفردات في غريب القرآن (الراغب الأصفهاني، تحقيق الداوودي) — **root-organized**, `{root, letter, text, ayahs}` |
| `quranpedia/` | `topics.json` (تصنيف موضوعي) · `similar.ndjson` (متشابه) · `qiraat.ndjson` (قراءات لكل كلمة) |

### Quranpedia structured layers (api.quranpedia.net, per-āyah)
- **`topics.json`** — 6,100 curated topics (1,516 roots, 19,117 āyah-links): `{id,name,parent_id,ayahs}`.
  A human-curated thematic tree — complements the computed المواضيع layer as a citable source.
- **`similar.ndjson`** — متشابه لفظي with difference `notes` per āyah. Direct grounding for **فروق التنزيل**.
- **`qiraat.ndjson`** — word-level variant readings with rawi chains.

## Provenance & licensing
- **spa5k/tafsir_api** — community aggregation of classical/public-domain tafsir; convenient, verse-anchored.
- **Quranpedia** (api.quranpedia.net) — الموسوعة القرآنية; structured per-āyah content.
- **alquran.cloud** — origin of the pre-existing الميسّر (KFGQPC) + الجلالين.
Classical texts (الطبري، ابن كثير، القرطبي…) are public domain. For shipping, prefer the
highest-provenance edition per book (KFGQPC / مركز تفسير / QUL) and re-verify text before embed.

## Rebuild
```
# 1) verse-anchored books (needs a spa5k sparse-checkout of tafsir_api/tafsir)
node scripts/collect-books.mjs <tafsir_api/tafsir>
# 2) quranpedia layers (polite, resumable)
node scripts/harvest-quranpedia.mjs similar
node scripts/harvest-quranpedia.mjs qiraat
# 2b) a single Quranpedia book by id → <genre>/<outId>.jsonl (per-āyah, HTML-stripped)
node scripts/harvest-quranpedia-book.mjs 460 asbab muharrar   # المحرّر (المزيني)
node scripts/harvest-quranpedia-book.mjs 2919 asbab wahidi    # أسباب النزول (الواحدي)
#    NB: run book harvests ONE AT A TIME — concurrent runs throttle the API (~20% errors)
# 2c) المفردات للراغب (root-organized, from Quranpedia's book-contents dump)
curl -s https://api.quranpedia.net/books-contents/book-353.json -o /tmp/mufradat353.json
node scripts/collect-mufradat.mjs /tmp/mufradat353.json
# 3) embed a book for نِبراس (browser int8 path)
GEMINI_API_KEY=… node scripts/build-book-embeddings.mjs <genre>/<id>.jsonl <id>
#    then register {id,label} in src/rag.ts BOOK_SOURCES
```

## Notes on what to embed
- **Concise → browser int8** (small, per-āyah): المختصر، الميسّر، الجلالين، السراج/غريب، الإعراب الميسّر، تدبّر وعمل.
- **Heavy → server rag.db** (large, ranged blocks): الطبري، ابن كثير، القرطبي، الرازي، الألوسي، البحر المحيط… dedup is already done (ranged records); still light-clean isnād/`[[…]]` editorial marks before embed.
