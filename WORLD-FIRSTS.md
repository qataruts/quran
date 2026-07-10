# العوالم الأولى — World-Firsts Verdict

Produced 2026-07-10 by a 26-agent swarm: landscape scan (apps + academic
research + classical scholarship) → 24 invented candidates → adversarial
prior-art verification per candidate (Arabic + English searches; only
survivors count) → final judgment. Constraint honored throughout: buildable
from ONLY the Quran text, its morphology, the classical lexicons,
translations, and our Gemini vectors — no external resources.

FINAL JUDGMENT — مصحف المعرفة "World Firsts"
(Data budget verified against quran-kg.db: maqayis=1,509 / mufradat=1,469 / lisan=1,614 / sihah=1,610 root entries; 6,236 ayah embeddings; 3 translations × 6,236; lemmas ≥10 occ = 860 (95,225 occurrences), ≥5 = 1,434; segment table carries verb_form/aspect/mood/voice/person + particle families; feature_glossary (41) and pos_tag (48) exist for template generation; ruku/chrono_order/page structure confirmed. All six candidates are buildable; the stylometry candidate (بصمة التنزيل) is CUT from the top 5 — Qur'an Tools already ships free interactive per-surah grammatical/stylistic charting, Sadeghi did the science, and public Meccan/Medinan classifiers exist, leaving the thinnest delta of the six plus the highest religious-sensitivity-to-value ratio.)

====================================================================
1. RANKED TOP 5
====================================================================

---- #1 — فروق المتشابهات — درة التنزيل الكاملة / The Complete, Explained Mutashabihat ----
Sharpened first (accepted): first tool to diff twin verses at the word/morpheme level showing what DIFFERS (all existing tools highlight what matches), with machine-generated, morphology-typed Arabic explanations of each difference and side-by-side Mufradat glosses for root substitutions, over a computed, coverage-guaranteed catalog — a machine-completed درة التنزيل. Must NOT claim "no computed catalog exists" (qurananalysis.com, Procedia 2019, QuranHub) or "no in-mushaf marking exists" (Tarteel premium, Mushaf al-Tibyan).

User experience: A hafiz opens 6:151 and sees a twin marker; tapping it shows 17:31 aligned word-by-word, identical words dimmed, differences colored and each labeled in Arabic: "هنا «مِن إملاق» (فقر واقع) وهناك «خشية إملاق» (فقر متوقَّع) — تقديم وتأخير في نرزقهم/نرزقكم", with the two roots' Mufradat paragraphs side by side where roots differ. A per-juz review mode lists every twin cluster in the juz for pre-tasmi' drilling. Ordinary readers get the same cards as tadabbur material.

Pipeline: (a) Candidate pairs: minhash/winnowing over word n-grams of text_clean for all 6,236 ayahs plus sliding phrase windows, unioned with ayah_embedding cosine > threshold to catch paraphrase twins; recall reported against our own n-gram statistics (the coverage guarantee). (b) Alignment: lemma-sequence edit-distance alignment per pair using word.lemma_id. (c) Diff typing: classify each diff cell from segment features (aspect PERF/IMPF, verb_form I–XII, person/gender/number, particle family, case, insertion/deletion, transposition detected as paired moves). (d) Explanation: Arabic templates over feature_glossary + pos_tag; root substitutions pull both root_meaning(mufradat) texts. Ships as one precomputed SQLite table: pair_id, ayah_a, ayah_b, alignment JSON, typed diffs, generated Arabic strings, confusability score — rendered client-side in the existing mushaf.

Effort: 3–4 weeks to a full catalog + diff cards (pair generation 1 wk incl. threshold tuning, alignment+typing 1 wk, templates+glosses 3–4 days, UI 1 wk); +1–2 weeks for mushaf markers and per-juz review mode.

Biggest risk: Threshold tuning — too loose floods the catalog with formulaic openings (يا أيها الذين آمنوا), too tight misses the paraphrase pairs memorizers actually confuse. Mitigation: tiered catalog (exact-phrase tier, near-twin tier, paraphrase tier) with the tier shown, and the UI must label explanations as WHAT changed, never the rhetorical WHY.

---- #2 — الوجوه والنظائر محسوبةً / Computed Wujuh wa-Nazair ----
Sharpened first (accepted): first ALGORITHMIC sense-clustering of every occurrence of every polysemous Quranic lemma (860→1,434 lemmas vs the ~500-word ceiling of all manual wujuh works) with inspectable criteria, and first automatic alignment of induced senses to classical lexicon sense-paragraphs (Raghib/Ibn Faris/Lisan). Frame as "first computed and first lexicon-aligned wujuh," never "first per-word sense pages" (manual ones exist online).

User experience: On the root page for د-ي-ن, the reader sees "وجوه كلمة دِين" — cards: "الجزاء" (with يوم الدين ayahs), "الشريعة والملة" (لكم دينكم ولي دين...), each card carrying its member ayahs, the 3–5 collocate roots that distinguish it, the matching Mufradat/Lisan paragraph as gloss, and a confidence badge. Per-occurrence, the mushaf word popup gains a "وجه هذه الكلمة هنا" line.

Pipeline: For each of ~95k occurrences of the 860 lemmas: build a clause-bounded context window (particle/segment boundaries from the segment table), embed with the same Gemini model (new but budget-internal compute). Per lemma: agglomerative/HDBSCAN with silhouette-chosen k + bootstrap stability filter; label clusters by embedding the sense-paragraphs of the root's lexicon entries and assigning centroid→nearest paragraph; cross-validate with translation-word alignment per occurrence across en/fr/tr (different induced senses should draw different translation words — a strong budget-internal check); distinguishing collocates from root co-occurrence edges restricted per cluster. Ships as: lemma_sense table (occurrence→sense_id, sense→lexicon_paragraph, confidence, collocates).

Effort: 5–7 weeks (embedding compute + clustering 2 wks, lexicon alignment + translation cross-check 1–2 wks, confidence/stability gating 1 wk, UI 1 wk, manual spot-review of top-100 lemmas ~1 wk).

Biggest risk: Clusters split on TOPIC rather than SENSE (hellfire vs cooking fire), producing false "faces" a layperson cannot detect. Mitigation is the translation-alignment cross-check as a shipping gate: only surface senses where at least two of the three translations systematically diverge; everything else ships collapsed with an honest "وجه واحد محسوب" label.

---- #3 — نظم الدرر الرقمي / Al-Biqa'i at Full Scale ----
Sharpened first (accepted): first system to compute and publish per-pair linkage scores for all ~6,122 consecutive within-surah ayah pairs with a decomposed evidence model, validated against ruku boundaries, and the first reader to display verse-to-verse linkage inline — plus itemized khawatim↔fawatih tests for all 113 surah junctions. Differentiate explicitly from the Shahid Beheshti adjacent-surah papers (aggregate only) — do not claim "nobody profiled consecutive coherence."

User experience: A thin ribbon runs down the mushaf margin; its intensity shows each ayah's linkage to the next. Tapping a strong link reveals the evidence: shared rare roots, semantic similarity, the connecting فاء/ثم/بل, pronoun-addressee continuity. Score minima render as paragraph breaks — the surah's computed sections, shown against traditional ruku marks. Each surah's last page offers "المناسبة مع السورة التالية" with the junction evidence.

Pipeline: Composite score per consecutive pair = ayah_embedding cosine + inverse-frequency-weighted shared roots (root.occurrences) + connective-particle family of the opening segment + PGN/pronoun-suffix continuity from segment. Smooth per surah, segment at minima, report ruku agreement as built-in validation. Junctions: last-N vs first-N ayahs against a permutation baseline of random surah pairings. Ships as: pair_linkage table + per-surah segmentation JSON + 113 junction pages. Nearly all inputs already sit in the DB — this is the cheapest big candidate.

Effort: 2–3 weeks (scoring + validation 1 wk, ribbon UI 1 wk, junction pages 3–4 days).

Biggest risk: Classical munasabah is often rhetorical (contrast, resumption, answer-to-objection), which embeddings score LOW — a naive ribbon brands exactly those pivots as "weak links" and inverts the message. Mitigation: never label low scores as weakness; render them as "مفصل/انتقال" points of interest, and call the metric "الترابط اللفظي-الدلالي," never "قوة التناسب."

---- #4 — خرائط النظم / Surah Symmetry Maps ----
Sharpened first (accepted): first computational DETECTION and statistical TEST of ring composition in the Quran — self-similarity heatmaps for all 114 surahs, automatic mirror-symmetry detection around candidate centers, per-surah symmetry and تشابه الأطراف scores, all against a shuffled-ayah null model. Cite-and-distinguish the two GitHub visualizers (they draw assumed palindrome pairings; they compute nothing).

User experience: On any surah's page, a zoomable ayah×ayah heatmap; if a statistically significant mirror center exists, it is drawn with its z-score ("البقرة: مركز مرشَّح عند ١٤٣، z=３.２ مقابل ١٠٠٠ خلطة عشوائية"). Famous claimed centers from the literature are overlayable as hypotheses the reader can check. A leaderboard ranks surahs by symmetry and opening↔closing linkage that survive the null.

Pipeline: cell = embedding cosine + rarity-weighted shared-root overlap (ayah units; fixed root-count blocks for surahs >100 ayahs); ring detection = correlation of the matrix with its reflection around each candidate center's anti-diagonal, z-scored against 1,000 length-preserving within-surah permutations; تشابه الأطراف = first↔last block linkage vs same null. Ships as 114 precomputed matrices + symmetry stats JSON.

Effort: ~2 weeks (computation 4–5 days, permutation testing 2 days, heatmap UI 1 wk).

Biggest risk: Honest partial-negative results — claimed rings are thematic and boundary-dependent, so beloved claims (Farrin's Baqarah ring) may visibly fail the null model. This is survivable only with the null displayed prominently and framing as "ما يصمد لفظياً-دلالياً" rather than a verdict on the literary claims; without that it slides into Rorschach numerology.

---- #5 — ميزان المقاييس / Testing Ibn Faris ----
Sharpened first (accepted): first QUANTITATIVE corpus-scored evaluation of any classical Arabic dictionary against usage — per-root coherence of Ibn Faris' «يدل على» essences over every Quranic occurrence, outlier detection, occurrence-to-أصل assignment for multi-essence roots, scored Ibn Faris vs al-Raghib comparison, and a leaderboard of roots whose Quranic usage transcends both. Market as "first empirical test," acknowledging al-Mustafawi's manual al-Tahqiq did the qualitative program.

User experience: Each root page gains a scorecard: essence statement, a coherence gauge, occurrences colored by which أصل they follow, outlier ayahs flagged ("هنا يستعمل القرآن الجذر على غير ما يتوقعه المعجم"), and a Faris-vs-Raghib "أيهما أوفق للقرآن" bar. A browsable leaderboard surfaces the roots where the Quran most exceeds the dictionaries.

Pipeline: Regex-extract essence sentences from root_meaning(maqayis) (formulaic «يدل على», «أصلان/ثلاثة أصول»); embed essences and occurrence context windows (same model); per root: mean/variance of occurrence→essence similarity, nearest-essence assignment, outliers below a threshold calibrated on within-root vs between-root distributions across all 1,509 Maqayis roots; repeat with Mufradat as anchor; MANDATORY null model of shuffled essence↔root pairs before anything ships. Ships as root_essence_score table.

Effort: 2–3 weeks — but gated: 1 week to the null-model verdict, and the feature is killed or reframed if the signal is flat.

Biggest risk: Cross-register embedding comparison (metalinguistic definition vs usage context) may yield a flat similarity distribution that ranks roots by definition verbosity, not semantic fit. It ranks #5 despite high novelty because its value skews scholarly (lowest ordinary-reader pull of the five) and it is the only candidate whose core signal might simply not exist.

====================================================================
2. THE ONE TO BUILD FIRST: #1 فروق المتشابهات
====================================================================
Build the Mutashabihat first. It is the only candidate of the five whose core computation is deterministic — string fingerprinting, lemma alignment, and feature lookup over tables we have already verified (segment features, feature_glossary, mufradat texts) — so there is no scenario where the science fails after three weeks of work; the residual risks are tuning and framing, not signal existence. It serves the largest and most motivated audience in the entire Quran-app market (every hafiz and hifz student alive drills twin verses weekly, from static lists that show which verses collide but never what differs), so it converts novelty into daily-habit usage rather than one-time wonder. It slots directly into مصحف المعرفة's existing strengths — the mushaf reader gets markers, the word-level morphology popups gain diff cards, the root pages' Mufradat texts get re-used as substitution glosses — making it a deepening of the product rather than a bolt-on. And strategically it builds the exact assets the harder firsts need next: the pair catalog and alignment machinery feed the coherence ribbon (#3), and the clause-windowing and lexicon-paragraph plumbing feed Wujuh (#2), which should follow as the prestige release once this trust-building, verifiable feature has shipped.

====================================================================
3. PUBLIC NAME
====================================================================
Name it «فُروقُ التنزيل» (Furūq al-Tanzīl). The word فُروق invokes the classical genre of كتب الفروق — books that name the precise difference between things that seem alike — which is exactly the deliverable: every difference named, not merely every similarity highlighted; and التنزيل deliberately echoes al-Iskafi's درة التنزيل, planting the product in a thousand-year lineage while the plural فروق signals completeness (all twins, every difference) that no classical author reached. It is short, sonorous, instantly parseable by any Arabic reader, and honest: it promises named differences (فروق), not rhetorical adjudication (توجيه), which keeps the tool inside its epistemic warrant — the machine states what differs; the reader, with درة التنزيل beside them, ponders why. As an umbrella for the eventual suite, the sibling features can inherit the pattern later (وجوه التنزيل، نظم التنزيل), giving مصحف المعرفة a coherent family name for its computed-ulum layer.

====================================================================
ADDENDUM (same day) — Owner's two candidates, checked before building
====================================================================

A. «الآيات الجوامع» (hub ayahs + their تفصيل sets — owner's المحكمات idea)
   Prior art: PARTIALLY EXISTS. Building blocks are public (QurSim's 7,679
   related-verse pairs; a per-surah "central verse" paper, ICCKE 2018; one
   hobbyist in-degree blog), but a Quran-wide computed hub→elaboration
   structure has never shipped. Feasibility PROVEN on our data: neighbor-graph
   in-degree already surfaces genuine جوامع (67:6, 3:189, 7:178, 18:30…).
   ⚠ Naming constraint (verifier's strong warning): do NOT ship under
   «المحكمات/المتشابهات» — that classification is doctrinally reserved
   (Āl ʿImrān 7) and contested; the Shahrour framing is polarizing; and
   «متشابهات» collides with memorization terminology. Ship as
   «الآيات الجوامع» with computed "elaboration" framing (تصريف الآيات).

B. «التفصيل الموضوعي محسوبًا» (computed thematic mushaf — owner's request,
   inspired by the printed مصحف التفصيل الموضوعي)
   Prior art: PARTIALLY EXISTS — the two halves exist separately, never
   combined. Manual: dar-alfajr's mushaf (digitized on tafsir.app), Ghar
   Hira's 7-color mushaf, saintcoran.com (interactive but manual, fixed 7
   themes), and the classical ruku divisions. Computed: research PDFs only —
   surah-level topic models, scattered-verse clustering; no contiguous
   full-mushaf segmentation, no auto-labels, no mushaf UI anywhere.
   Defensible delta: computed contiguous boundaries + data-driven section
   labels (distinctive roots) + tunable granularity + validation against
   ruku and the manual schemes (a publishable evaluation nobody has done).
   Feasibility note (tested locally on al-Baqarah 20-36): raw consecutive
   cosine is FLAT and misses the printed breaks — the composite model is
   required (vectors + rare shared roots + opening-particle discourse
   markers + pronoun continuity), i.e. the SAME engine as نظم الدرر (#3).

REVISED BUILD ORDER (approved candidates integrated):
  1. فروق التنزيل (in progress — pair catalog computing)
  2. نظم الدرر + التفصيل الموضوعي as ONE build (shared linkage engine →
     margin ribbon + computed sections + root labels + ruku validation)
  3. الآيات الجوامع (ships on existing neighbors data; careful naming)
  4. الوجوه والنظائر محسوبة (prestige release)
  5. خرائط النظم → ميزان المقاييس (gated)

====================================================================
BEYOND المحكم→تفصيل — novel ideas & data assets we already hold (2026-07-10)
Owner: "we need all of that." Do not lose these.
====================================================================

ALREADY-COMPUTED, un-shipped (nearly free to surface):
  N1. Pass A principle-map — every ayah classified حكم/عقيدة/أخلاق/سنة/وعد by
      one consistent standard. First of its kind. Powers a filterable
      «موضوعات المبادئ» + the Shahrour-convergence categorization.
  N2. توكيد self-restatement graph — from the typed تفصيل relations, the map
      of which principles the Quran RESTATES most across itself: القرآن
      يُثنّي / الْمَثَانِي made visible. Ships almost free once Pass B done.
      *Owner's top-interest candidate.*
  N3. فروق التنزيل twin catalog — 14,313 tiered pairs computed (quran-twins.json);
      awaits the word-diff + Arabic-explanation engine.

NOVEL IDEAS our data uniquely enables (within method: Quran + morphology +
vectors + معاجم + Arabic language):
  N4. الجينوم الصرفي / grammar genome — map which of Arabic's feature-
      combinations the Quran uses & WHERE, and especially which it NEVER uses
      (the negative space is data). Unprecedented; pure morphology.
      *Owner's top-interest candidate.*
  N5. ديوان الالتفات / iltifāt register — computed catalogue of EVERY person/
      number shift (غيبة↔خطاب…) from PGN sequences. First complete list.
  N6. أطلس الفواصل / rhyme-ending atlas — cluster ayah-ending sound-families
      (سجع/فاصلة); test rhyme-shift ↔ topic-shift. Pure data, strong visual.
  N7. الوجوه والنظائر محسوبة — every polysemous word's senses induced from
      usage, aligned to classical معاجم (also WORLD-FIRSTS #2).

Priority hints (owner): N2 + N4 flagged most-novel-and-most-ours. All wanted.
