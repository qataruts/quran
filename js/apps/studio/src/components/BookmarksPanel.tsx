/**
 * BookmarksPanel — the ★ top-bar popover: the list of bookmarked ayahs
 * (jump / remove). All localStorage, reactive.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toggleBookmark, useBookmarks } from "../bookmarks";
import { surahNameAr } from "../db";
import { getUILang, num } from "../i18n";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

export default function BookmarksPanel() {
  const marks = useBookmarks();
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
      <button onClick={() => setOpen(!open)} title={ar ? "العلامات المرجعية" : "Bookmarks"} aria-label="bookmarks">
        ★{marks.length > 0 && <sup style={{ fontSize: 9 }}> {num(marks.length)}</sup>}
      </button>
      {open && (
        <div className="set-panel card">
          <div className="set-head">{ar ? "العلامات المرجعية" : "Bookmarks"}</div>
          {marks.length === 0 ? (
            <div className="muted" style={{ padding: "6px 0" }}>
              {ar ? "اضغط ☆ بجانب أي آية لحفظها هنا" : "tap ☆ on any ayah to save it here"}
            </div>
          ) : (
            <div className="bm-list">
              {marks.map((loc) => (
                <div key={loc} className="bm-item">
                  <Link to={`/read/${loc.split(":")[0]}/${loc.split(":")[1]}`} onClick={() => setOpen(false)}>
                    {arName(loc)}
                  </Link>
                  <button
                    onClick={() => toggleBookmark(loc)}
                    title={ar ? "إزالة" : "remove"}
                    style={{ border: "none", background: "none", color: "var(--muted)" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
