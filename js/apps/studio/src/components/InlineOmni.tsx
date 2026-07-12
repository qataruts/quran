/**
 * InlineOmni — the on-page search bar for the reader (the "main page"). Same
 * look as the PageSearch bar on every content page, and the same brain as the
 * ⌘K omnibox (src/omni.ts) — but inline, not a popup: type a surah, ayah, juz,
 * page, root or phrase and pick a jump target from the dropdown beneath it.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUILang, t, useUILang } from "../i18n";
import { useOmniResults } from "../omni";

export default function InlineOmni({
  placeholder,
  autoFocus,
  onNavigate,
}: {
  placeholder?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  useUILang();
  const ar = getUILang() === "ar";
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const items = useOmniResults(q);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // dismiss the dropdown on outside-click
  useEffect(() => {
    if (!focused) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [focused]);

  const show = focused && q.trim() !== "" && items.length > 0;
  const go = (to: string) => {
    setQ("");
    setFocused(false);
    onNavigate?.();
    navigate(to);
  };

  return (
    <div className="inline-omni" ref={wrapRef}>
      <div className="page-search">
        <span className="page-search-icon" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder ?? (ar ? "ابحث في القرآن كلّه، أو اذهب إلى سورة أو آية…" : "search the whole Qur'an, or go to a surah/ayah…")}
          aria-label={ar ? "البحث والانتقال" : "search & jump"}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              go(items[active].to);
            } else if (e.key === "Escape") {
              setFocused(false);
            }
          }}
        />
        {q && (
          <button className="page-search-clear" onClick={() => setQ("")} aria-label={ar ? "مسح" : "clear"}>
            ✕
          </button>
        )}
      </div>
      {show && (
        <div className="inline-omni-results" role="listbox">
          {items.map((item, i) => (
            <div
              key={item.key}
              role="option"
              aria-selected={i === active}
              onClick={() => go(item.to)}
              onMouseEnter={() => setActive(i)}
              className={`inline-omni-row${i === active ? " active" : ""}`}
            >
              <span className="chip inline-omni-kind">{t(`omni.${item.kind}`)}</span>
              <span
                className={item.kind === "text" || item.kind === "root" ? "quran inline-omni-label" : "inline-omni-label"}
              >
                {item.label}
              </span>
              {item.sub && <span className="muted inline-omni-sub">{item.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
