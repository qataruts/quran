/**
 * Reading control bar — appears when an ayah is selected in the Reader.
 * Navigate ayah-by-ayah, recite from the selected ayah with repeat, and
 * continue or stop. Keyboard: ← → move ayah · space play/pause · Esc clear.
 */
import { surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { setContinueAfter, setRepeat, setSelectedAyah, useReading } from "../reading";
import {
  currentPlayingId,
  playFrom,
  stopAudio,
  usePlayingId,
} from "./AudioButton";

/** ayah global id (1..6236) from a location, via the surah list (sync). */
function globalIdOf(loc: string, surahBase: Map<number, number>): number {
  const [s, a] = loc.split(":").map(Number);
  return (surahBase.get(s) ?? 0) + a;
}

export default function ReadingBar({
  surahBase,
  onNavigate,
  onOpenAyat,
}: {
  surahBase: Map<number, number>;
  /** move selection by ±1 ayah (Reader owns the ordered ayah list) */
  onNavigate: (dir: -1 | 1) => void;
  /** open the selected ayah in the آيات view (tools + translation) */
  onOpenAyat?: () => void;
}) {
  useUILang();
  const { selected, repeat, continueAfter } = useReading();
  const playingId = usePlayingId();
  if (!selected) return null;

  const [s, a] = selected.split(":").map(Number);
  const gid = globalIdOf(selected, surahBase);
  const isPlaying = playingId === gid;

  const playHere = () => {
    if (isPlaying) stopAudio();
    else playFrom(gid, { repeat, continueAfter });
  };

  const btn = (label: string, onClick: () => void, title: string, primary = false) => (
    <button
      onClick={onClick}
      title={title}
      className={primary ? "primary" : "chip"}
      style={{ border: "none", cursor: "pointer", fontSize: 15, padding: primary ? "6px 14px" : "5px 10px" }}
    >
      {label}
    </button>
  );

  const rtl = getUILang() === "ar";
  const prevArrow = rtl ? "→" : "←";
  const nextArrow = rtl ? "←" : "→";

  return (
    <div
      className="card"
      style={{
        position: "fixed",
        bottom: 44,
        insetInline: 12,
        maxWidth: 640,
        margin: "0 auto",
        zIndex: 45,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: "8px 12px",
      }}
    >
      <span className="quran" style={{ fontSize: 16 }}>
        {surahNameAr(s)} {num(a)}
      </span>
      {onOpenAyat &&
        btn(
          rtl ? "الآيات" : "ayah view",
          onOpenAyat,
          rtl ? "افتح هذه الآية في عرض الآيات: الأدوات والترجمة والتفصيل" : "open in the ayah view (tools + translation)",
        )}
      <span style={{ flex: 1 }} />
      {btn(prevArrow, () => onNavigate(-1), t("read.prevAyah"))}
      {btn(isPlaying ? `◼ ${t("stop")}` : `▶ ${t("read.playHere")}`, playHere, t("read.playHere"), true)}
      {btn(nextArrow, () => onNavigate(1), t("read.nextAyah"))}
      {/* repeat count */}
      <span className="chip" style={{ gap: 4 }}>
        🔁
        <select
          value={repeat}
          onChange={(e) => setRepeat(Number(e.target.value))}
          style={{ border: "none", background: "transparent", padding: "0 2px", fontSize: 13 }}
          title={t("read.repeat")}
        >
          {[0, 1, 2, 3, 5, 7].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? t("read.once") : `×${num(n + 1)}`}
            </option>
          ))}
        </select>
      </span>
      {/* continue toggle */}
      <button
        className="chip"
        onClick={() => setContinueAfter(!continueAfter)}
        title={t("read.continue")}
        style={{
          border: "none",
          cursor: "pointer",
          ...(continueAfter ? { background: "var(--accent-soft)", color: "var(--accent)" } : {}),
        }}
      >
        {t("read.continue")}
      </button>
      <button
        className="chip"
        onClick={() => {
          stopAudio();
          setSelectedAyah(null);
        }}
        title={t("read.clear")}
        style={{ border: "none", cursor: "pointer" }}
      >
        ✕
      </button>
    </div>
  );
}

export { currentPlayingId };
