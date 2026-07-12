/**
 * صندوق واحد لكل شيء — the omnibox (⌘K / Ctrl+K / «/»). A popup over the whole
 * app; the same resolution also powers the on-page reader search (InlineOmni).
 * See src/omni.ts for the query → jump-targets brain.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t, useUILang } from "../i18n";
import { useOmniResults } from "../omni";

export default function Omnibox() {
  useUILang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const items = useOmniResults(q);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setActive(0), [items]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const trigger = (
    <button
      className="omni-trigger"
      onClick={() => setOpen((o) => !o)}
      title={`${t("omni.trigger")} · ⌘K`}
      aria-label={t("omni.trigger")}
    >
      <span aria-hidden>⌕</span>
      <span className="omni-trigger-label">{t("omni.trigger")}</span>
      <span className="omni-trigger-kbd" aria-hidden>⌘K</span>
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgb(0 0 0 / 0.35)",
          zIndex: 70,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: "12vh",
        }}
      >
        <div
          className="card"
          role="dialog"
          aria-modal="true"
          aria-label={t("omni.trigger")}
          onClick={(e) => e.stopPropagation()}
          style={{ width: "min(620px, 92vw)", padding: 10 }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("omni.placeholder")}
            aria-label={t("omni.placeholder")}
            style={{ width: "100%", fontSize: 17, padding: "12px 14px" }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && items[active]) {
                go(items[active].to);
              }
            }}
          />
          {items.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: "50vh", overflowY: "auto" }}>
              {items.map((item, i) => (
                <div
                  key={item.key}
                  onClick={() => go(item.to)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: i === active ? "var(--accent-soft)" : undefined,
                  }}
                >
                  <span className="chip" style={{ fontSize: 10.5, minWidth: 52, justifyContent: "center" }}>
                    {t(`omni.${item.kind}`)}
                  </span>
                  <span
                    className={item.kind === "text" || item.kind === "root" ? "quran" : undefined}
                    style={{ fontSize: item.kind === "text" ? 17 : 15, lineHeight: 1.6, flex: 1, minWidth: 0 }}
                  >
                    {item.label}
                  </span>
                  {item.sub && <span className="muted">{item.sub}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="muted" style={{ marginTop: 8, textAlign: "center" }}>
            {t("omni.hint")}
          </div>
        </div>
      </div>
    </>
  );
}
