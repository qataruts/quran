import { num } from "../i18n";
import { useSettings } from "../settings";
import type { WordDoc } from "../types";
import { TAJWID, tajwidWords } from "../tajwid";

/** One ayah rendered word-by-word; clicking a word selects it. Honours the
 *  script setting (Uthmani ⇄ simple/imlaa'i). With tajwīd on, each word is
 *  colour-coded IN PLACE — same layout, still clickable. */
export default function AyahText({
  words,
  ayahNo,
  selected,
  onSelect,
}: {
  words: WordDoc[];
  ayahNo?: number;
  selected?: string | null;
  onSelect?: (w: WordDoc) => void;
}) {
  const { script, tajwid } = useSettings();
  // tajwīd needs the fully-vowelled Uthmani text; compute per-word colours once
  const colored = tajwid ? tajwidWords(words.map((w) => w.textUthmani)) : null;
  return (
    <div className="quran">
      {words.map((w, wi) => (
        <span key={w.location}>
          <span
            className={`w${selected === w.location ? " sel" : ""}`}
            onClick={() => onSelect?.(w)}
          >
            {colored
              ? colored[wi].map((s, i) =>
                  s.rule ? (
                    <span key={i} className={TAJWID[s.rule].cls} title={TAJWID[s.rule].ar}>{s.text}</span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )
              : script === "imlaai" ? w.textClean : w.textUthmani}
          </span>{" "}
        </span>
      ))}
      {ayahNo != null && <span className="ayah-marker">﴿{num(ayahNo)}﴾</span>}
    </div>
  );
}
