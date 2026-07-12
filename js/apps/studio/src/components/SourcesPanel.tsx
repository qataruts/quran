/**
 * SourcesPanel — the ⓘ top-bar popover crediting every external place whose
 * data the app uses. Replaces the old always-on footer (kept the chrome light).
 */
import { useEffect, useRef, useState } from "react";
import { getUILang, t, useUILang } from "../i18n";

/** Every external source we actually use — one credit each. */
export const SOURCES: { url: string; ar: string; en: string }[] = [
  {
    url: "https://tanzil.net",
    ar: "نص القرآن العثماني وبياناته (الجزء/الحزب/الصفحة/السجدات) — مشروع تنزيل",
    en: "Uthmani text + metadata (juz/hizb/page/sajda) — Tanzil",
  },
  {
    url: "https://corpus.quran.com",
    ar: "الصرف والجذور والمداخل والإعراب — المدونة القرآنية (جامعة ليدز)",
    en: "Morphology, roots, lemmas, grammar — Quranic Arabic Corpus (Leeds)",
  },
  {
    url: "https://github.com/wizsk/arabic_lexicons",
    ar: "المعاجم: المفردات (الراغب) · مقاييس اللغة (ابن فارس) · الصحاح · لسان العرب",
    en: "Lexicons: Mufradāt · Maqāyīs · Ṣiḥāḥ · Lisān al-ʿArab",
  },
  {
    url: "https://qbook.kfgqpc.org",
    ar: "الإعراب: المجتبى من مشكل إعراب القرآن — أ.د. أحمد الخراط، نشر مجمع الملك فهد",
    en: "Iʿrāb (grammar): al-Mujtabā min Mushkil Iʿrāb al-Qurʾān — A. al-Kharrāṭ, King Fahd Complex",
  },
  {
    url: "https://tanzil.net/trans/",
    ar: "الترجمات: صحيح إنترناشونال (EN) · حميد الله (FR) · ديانت (TR) — تنزيل",
    en: "Translations: Saheeh Intl (EN) · Hamidullah (FR) · Diyanet (TR) — Tanzil",
  },
  {
    url: "https://alquran.cloud/cdn",
    ar: "التلاوة: الحصري · العفاسي · عبد الباسط · المنشاوي · السديس · المعيقلي (Islamic Network)",
    en: "Recitations: Ḥuṣarī · Alafasy · ʿAbd al-Bāsiṭ · Minshāwī · Sudais · Muʿayqilī (Islamic Network)",
  },
  {
    url: "https://qul.tarteel.ai",
    ar: "نصّ مصحف المدينة وخطّ KFGQPC حفص — مجمع الملك فهد، عبر Quran.com وQUL",
    en: "Madina muṣḥaf text + KFGQPC Ḥafṣ font — King Fahd Complex, via Quran.com & QUL",
  },
  {
    url: "https://ai.google.dev",
    ar: "المتجهات الدلالية للبحث بالمعنى — Gemini embeddings",
    en: "Semantic vectors for meaning-search — Gemini embeddings",
  },
  {
    url: "https://github.com/qataruts/monlite",
    ar: "محرك قاعدة البيانات في المتصفح — monlite",
    en: "In-browser database engine — monlite",
  },
];

export default function SourcesPanel() {
  useUILang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ar = getUILang() === "ar";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="set-wrap" ref={ref}>
      <button onClick={() => setOpen(!open)} title={t("footer.sources")} aria-label="sources">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden style={{ verticalAlign: "-4px" }}>
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
      </button>
      {open && (
        <div className="set-panel card">
          <div className="set-head">{t("footer.sources")}</div>
          <div className="src-list">
            {SOURCES.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="src-item">
                {ar ? s.ar : s.en}
              </a>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.6 }}>
            {t("footer.provenance")}
          </div>
        </div>
      )}
    </div>
  );
}
