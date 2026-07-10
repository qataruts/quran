# إعدادات القارئ — Reader settings & options (build list)

A serious, free Quran reader should let people tune the experience. Grouped by
category; ✓ = quick (hours), ○ = medium (day), ◆ = needs new data/compute.
All within method (Quran text + our data + Arabic; nothing external).

## ✅ SHIPPED (2026-07-10) — the ⚙ settings gear + ★ bookmarks
A reactive `settings.ts` store + a ⚙ top-bar popover now ship these live:
- **Script** Uthmani ⇄ إملائي (per-word render in list & pages modes)
- **Numerals** auto / ٠١٢ / 012 (num() honours an override, not just UI lang)
- **Font size** 80–160% via a `--quran-scale` multiplier on all Quran text
- **Theme** auto / light / **sepia** (new mushaf-cream) / dark — topbar ☾ shares it
- **Focus mode** — hides chrome for distraction-free reading
- **Knowledge-layer toggles** — المحكم→التفصيل chip · «مثلها» · word-root chip
Plus a ★ bookmarks popover: **khatma progress** bar (furthest ayah / 6236, with
reset) and a **bookmark jump list** (`bookmarks.ts`); ☆/★ on every ayah.
And QCF furniture: ۞ hizb/rub-quarter markers + ۩ sajda bands on the Madina page.
The محكم→تفصيل network also ships as the «الجوامع» view + inline reader panels.
Remaining ○/◆ items below are the next wave.

## 1. Text & script (شكل النص)
- ✓ Script: Uthmani ⇄ Imlaa'i (simple) — we already store both
- ✓ Font family: Amiri Quran · KFGQPC Hafs · Scheherazade New · Uthmanic — picker
- ✓ Font size (خط أكبر/أصغر) + line height + word spacing sliders
- ✓ Numerals: Arabic-Indic ٠١٢ ⇄ Western 012 (already have num(); expose toggle)
- ○ Ayah-end mark style (﴿١﴾ vs ۝ vs plain) 
- ○ Show/hide waqf marks (علامات الوقف) — in the Uthmani source
- ◆ Madina-mushaf glyph rendering (KFGQPC/QCF) — photoreal, backlog

## 2. Reading view (طريقة العرض)
- ✓ Mode: صفحات (mushaf pages) ⇄ آيات (list) — already have; make it a setting
- ○ Continuous scroll ⇄ paginated (page-turn)
- ✓ Focus / distraction-free mode (hide chrome, just text)
- ✓ Max reading width + justified toggle
- ○ Real-mushaf page frame refinement (15-line Madina layout) — future look&feel

## 3. Resume & navigation (متابعة القراءة)
- ✓ DONE: resume last position on load and via المصحف
- ○ Finer resume: remember scroll/ayah within a surah (not just surah)
- ○ Bookmarks / علامات مرجعية (star an ayah, jump list)
- ○ Reading history (recently read surahs/ayahs)
- ○ Reading goal / progress (khatma tracker: % of Quran read)
- ✓ Quick go-to already in ⌘K omnibox (surah/juz/page/ayah)

## 4. Translation & meaning (الترجمة والمعنى)
- ✓ DONE: show/hide + language pick (en/fr/tr), persistent, discreet in Arabic
- ○ Inline (under each ayah) ⇄ side-by-side column
- ◆ Transliteration line (Latin) — needs a translit layer (optional)
- ✓ Word meaning on tap (already: morphology inspector + root meanings)

## 5. Recitation (التلاوة)
- ✓ DONE: per-ayah + continuous al-Ḥuṣarī with follow-along
- ○ Reciter picker (multiple reciters from the CDN)
- ○ Playback speed (0.75×–1.5×)
- ○ Repeat: ayah repeat N times · range repeat (memorization/حفظ drill)
- ◆ Word-level highlight synced to audio — needs word-timing data (backlog)

## 6. Appearance (المظهر)
- ✓ DONE: light/dark + language toggle
- ✓ Sepia / mushaf-cream reading theme (third theme)
- ✓ Reduce motion / high-contrast (accessibility)

## 7. Knowledge-graph layers (طبقات المعرفة) — our unique toggles
- ✓ Show/hide: root chips · «مثلها» · «الجوامع» links · tajwīd coloring (when computed)
- ○ Per-view density (compact ⇄ comfortable)

## Implementation note
One settings store (localStorage, like collections/lang), a ⚙ panel in the
top bar, every option reactive via a useSettings() hook. Ship the ✓ items
first (a strong settings panel in ~1 day), then ○, then ◆ as their data lands.


## ★ Mushaf photoreal page mode (the serious page overhaul) — planned
Reference CONFIRMED: **QUL (qul.tarteel.ai) — QCF/KFGQPC Madina Mushaf**.
Per-page fonts map the real Uthmani text to glyph codes + layout data (word→
line→page) → each page renders PIXEL-IDENTICAL to the printed Madina mushaf
(exact 15-line breaks, authentic ligatures) while every word stays REAL
selectable text (photoreal AND interactive: tap word→صرف, select ayah,
recitation highlight). Fits method (Quran's own KFGQPC typography), GPL/open.
Build: (1) bundle QCF fonts, (2) fetch QUL mushaf-layout (word/line/page),
(3) new MushafPage renderer (15 lines/page, page font), (4) page ◀▶ nav + swipe.
Verified: qul.tarteel.ai/resources/mushaf-layout exists; pin exact font URL at
build (mustafa0x/qpc-fonts path 404'd — use QUL's current download). ~1-2 days.
Pairs with the shipped ayah-selection + reading controller (repeat/continue).
