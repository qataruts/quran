import { useEffect, useRef, useState } from "react";
import { addAyahs, createCollection, useCollections } from "../store/collections";
import { num, t, useUILang } from "../i18n";

/**
 * "Collect" button: adds ayah locations ("s:a") to a chosen (or new)
 * collection. `criterion` records WHY these ayahs belong together.
 * The picker renders position:fixed (never clipped by scroll containers)
 * and closes on outside click / Escape.
 */
export default function CollectButton({
  locations,
  criterion,
  label: btnLabel,
}: {
  locations: string[];
  criterion?: { kind: "root" | "lemma" | "search" | "manual"; value: string };
  label?: string;
}) {
  useUILang();
  const collections = useCollections();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const openPicker = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 250;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    setPos({ top: Math.min(rect.bottom + 6, window.innerHeight - 60), left });
    setOpen(true);
  };

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const collect = (id: string) => {
    addAyahs(id, locations, criterion);
    setOpen(false);
    setDone(id);
    setTimeout(() => setDone(null), 1600);
  };

  return (
    <>
      <button
        ref={btnRef}
        className="primary"
        onClick={() => (open ? setOpen(false) : openPicker())}
        disabled={locations.length === 0}
        title={t("collect.ayahs")}
      >
        {done
          ? t("collect.done")
          : (btnLabel ?? `${t("collect.ayahs")} (${num(locations.length)})`)}
      </button>
      {open && pos && (
        <div
          ref={popRef}
          className="card"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 60,
            width: 250,
            padding: 10,
            maxHeight: "50vh",
            overflowY: "auto",
          }}
        >
          {collections.map((c) => (
            <button
              key={c.id}
              style={{ display: "block", width: "100%", marginBottom: 6, textAlign: "start" }}
              onClick={() => collect(c.id)}
            >
              {c.name} <span className="muted">({num(c.ayahs.length)})</span>
            </button>
          ))}
          <button
            style={{ display: "block", width: "100%" }}
            onClick={() => {
              const name = prompt(
                t("collect.namePrompt"),
                criterion ? `${criterion.value}` : t("collect.myCollection"),
              );
              if (name) collect(createCollection(name).id);
            }}
          >
            {t("collect.new")}
          </button>
        </div>
      )}
    </>
  );
}
