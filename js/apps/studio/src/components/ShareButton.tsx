/**
 * زرُّ المشاركة — يُشارك الصفحةَ التي بين يدي القارئ، لا الجذرَ وحدَه.
 *
 * على الجوال (ومتصفّح ماك) يفتح لوحةَ المشاركة الأصليّة (Web Share API)، فيصل
 * الرابطُ إلى واتساب أو الرسائل أو غيرها بلمسةٍ واحدة. وحيث لا لوحةَ — أكثرُ
 * متصفّحات سطح المكتب — يُنسخ الرابطُ إلى الحافظة ويُخبَر القارئُ بنسخِه.
 * وإن مُنعت الحافظةُ (سياقٌ غير آمن) عُرض الرابطُ محدَّدًا لينسخه بيده.
 *
 * الرابطُ يُبنى دائمًا على النطاق المُعلن لا على مضيف الجلسة، كي لا يُشارَك
 * عنوانٌ محلّيٌّ لا يفتحُ عند غيره.
 */
import { useEffect, useRef, useState } from "react";
import { getUILang } from "../i18n";

/** النطاقُ المعلن — ما يُشارَك دائمًا مهما كان مضيفُ الجلسة */
const SITE = "https://quran.mishkat.qa/";

export function shareUrl(): string {
  const hash = window.location.hash && window.location.hash !== "#/" ? window.location.hash : "";
  return SITE + hash;
}

/**
 * مشاركةُ آيةٍ بعينها — النصُّ نفسُه هو المُشارَك لا الرابطُ وحدَه:
 * ﴿…﴾ ثم اسمُ السورة ورقمُ الآية، ثم رابطُها في مشكاة. فمن وصلته على
 * واتساب قرأ الآيةَ كاملةً في الرسالة، والرابطُ يفتحها في موضعها.
 * تُرجع "copied" إن نُسخت للحافظة (فيُعلم القارئ)، و"shared" إن فُتحت
 * اللوحةُ الأصليّة، و"failed" إن امتنع كلاهما.
 */
export async function shareAyah(a: { text: string; surahName: string; ayahNo: string; loc: string }): Promise<"shared" | "copied" | "failed"> {
  const url = `${SITE}#/read/${a.loc.split(":")[0]}/${a.loc.split(":")[1]}`;
  const body = `﴿${a.text}﴾
[${a.surahName} ${a.ayahNo}]`;
  if (navigator.share) {
    try {
      await navigator.share({ text: `${body}
${url}` });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "shared"; // إلغاءُ القارئ ليس فشلًا
    }
  }
  try {
    await navigator.clipboard.writeText(`${body}
${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}

type State = "idle" | "copied" | "manual";

export default function ShareButton({ compact = false }: { compact?: boolean }) {
  const ar = getUILang() === "ar";
  const [state, setState] = useState<State>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (state === "manual") inputRef.current?.select();
  }, [state]);

  const flash = (s: State) => {
    setState(s);
    window.clearTimeout(timer.current);
    if (s === "copied") timer.current = window.setTimeout(() => setState("idle"), 2200);
  };

  const onShare = async () => {
    const url = shareUrl();
    const title = ar ? "مشكاة — القرآن الكريم كشبكة معرفة" : "Mishkāt — the Qur'an as a knowledge graph";
    const text = ar
      ? "قراءةٌ وصرفٌ كلمةً كلمة، وجذورٌ ومعانٍ من المعاجم، وبحثٌ بالمعنى — كلُّه في متصفّحك."
      : "Reading, word-by-word morphology, roots from the classical lexicons, and meaning search — all in your browser.";
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        // إلغاءُ القارئ ليس خطأً — نصمت عنه ولا نُبدّل الحال
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("copied");
    } catch {
      flash("manual");
    }
  };

  const label = ar ? "شارِك مشكاة" : "Share Mishkāt";
  return (
    <span className="sh-wrap">
      <button
        className={compact ? "sh-btn sh-btn-wide" : "sh-btn"}
        onClick={onShare}
        title={ar ? "شارِك هذه الصفحة" : "Share this page"}
        aria-label={label}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="2.6" />
          <circle cx="6" cy="12" r="2.6" />
          <circle cx="18" cy="19" r="2.6" />
          <path d="M8.3 10.8 15.7 6.4M8.3 13.2l7.4 4.4" />
        </svg>
        {compact && <span>{label}</span>}
      </button>

      {state === "copied" && (
        <span className="sh-toast" role="status">{ar ? "نُسخ الرابط" : "Link copied"}</span>
      )}

      {state === "manual" && (
        <span className="sh-manual">
          <input ref={inputRef} readOnly value={shareUrl()} onFocus={(e) => e.currentTarget.select()} />
          <button onClick={() => setState("idle")} aria-label={ar ? "إغلاق" : "close"}>✕</button>
        </span>
      )}
    </span>
  );
}
