/**
 * FocusExit — the escape hatch for distraction-free (focus) mode. Because focus
 * mode hides the top bar (where the ⚙ lives), we must always offer a way out:
 * a small floating button + the Esc key. Renders nothing when focus is off.
 * It sits OUTSIDE .topbar so the focus-mode CSS never hides it.
 */
import { useEffect } from "react";
import { setSettings, useSettings } from "../settings";
import { getUILang, useUILang } from "../i18n";

export default function FocusExit() {
  useUILang();
  const { focus } = useSettings();

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const el = e.target as HTMLElement;
        // don't steal Esc from inputs/popovers mid-typing
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
        setSettings({ focus: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  if (!focus) return null;
  const ar = getUILang() === "ar";
  return (
    <button
      className="focus-exit"
      onClick={() => setSettings({ focus: false })}
      title={ar ? "إنهاء وضع التركيز (Esc)" : "Exit focus mode (Esc)"}
    >
      ✕ {ar ? "إنهاء التركيز" : "Exit focus"}
    </button>
  );
}
