/**
 * TajwidText — renders one ayah's Uthmani text with computed tajwīd colouring.
 * Ayah-level (spans cross word boundaries), so per-word morphology click is off
 * while tajwīd is on — it is a recitation aid. Tap the ayah marker still selects.
 */
import { useMemo } from "react";
import { TAJWID, tajwidSpans } from "../tajwid";
import { num } from "../i18n";

export default function TajwidText({
  text,
  ayahNo,
  onMarker,
}: {
  text: string;
  ayahNo?: number;
  onMarker?: () => void;
}) {
  const spans = useMemo(() => tajwidSpans(text), [text]);
  return (
    <div className="quran">
      {spans.map((s, i) =>
        s.rule ? (
          <span key={i} className={TAJWID[s.rule].cls} title={TAJWID[s.rule].ar}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
      {ayahNo != null && (
        <span
          className="ayah-marker"
          role={onMarker ? "button" : undefined}
          style={onMarker ? { cursor: "pointer" } : undefined}
          onClick={onMarker}
        >
          {" "}
          ﴿{num(ayahNo)}﴾
        </span>
      )}
    </div>
  );
}
