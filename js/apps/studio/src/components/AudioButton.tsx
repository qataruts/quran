import { useSyncExternalStore } from "react";
import { getUILang, num, t, useUILang } from "../i18n";

/**
 * Recitation playback — Shaykh Mahmoud Khalil al-Husary (murattal), 64 kbps,
 * streamed from the Islamic Network CDN (cached offline by the service worker).
 *
 * One shared player. Two modes:
 *   single      — the per-ayah ▶ button (stops at the ayah's end)
 *   continuous  — «استمع للسورة»: chains ayah after ayah through the mushaf,
 *                 with Media Session lock-screen controls.
 * The global NowPlayingBar always offers stop/next wherever the user goes.
 */
const CDN = "https://cdn.islamic.network/quran/audio/64/ar.husary";
const LAST_AYAH = 6236;

let player: HTMLAudioElement | null = null;
let currentId = 0;
let continuous = false;
let currentLocation: string | null = null;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Global ayah number currently playing (0 = nothing). */
export const usePlayingId = () => useSyncExternalStore(subscribe, () => currentId);
export const playingLocation = () => currentLocation;

export function stopAudio() {
  continuous = false;
  if (player && !player.paused) player.pause();
  currentId = 0;
  currentLocation = null;
  notify();
}

async function updateMediaSession(id: number) {
  currentLocation = null;
  try {
    const { getAyahByGlobalNo, surahNameAr } = await import("../db");
    const ayah = await getAyahByGlobalNo(id);
    if (ayah && currentId === id) {
      currentLocation = ayah.location;
      notify();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `${surahNameAr(ayah.surahNo)} — ${ayah.ayahNo}`,
          artist: "الشيخ محمود خليل الحصري",
          album: "مصحف المعرفة",
        });
      }
    }
  } catch {
    /* metadata is decorative */
  }
}

function start(id: number) {
  if (id < 1 || id > LAST_AYAH) {
    stopAudio();
    return;
  }
  if (!player) {
    player = new Audio();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("pause", stopAudio);
      navigator.mediaSession.setActionHandler("stop", stopAudio);
      navigator.mediaSession.setActionHandler("nexttrack", () => next());
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (currentId > 1) start(currentId - 1);
      });
    }
  }
  player.onended = () => {
    if (currentId !== id) return;
    if (continuous && id < LAST_AYAH) start(id + 1);
    else stopAudio();
  };
  player.onerror = () => {
    if (currentId === id) stopAudio();
  };
  player.src = `${CDN}/${id}.mp3`;
  currentId = id;
  void player.play().catch(() => {
    // a rapid second play() aborts this one — only clear if still current
    if (currentId === id) stopAudio();
  });
  notify();
  void updateMediaSession(id);
}

/** Play one ayah (stops at its end). */
function toggle(globalAyahNo: number) {
  if (currentId === globalAyahNo && player && !player.paused) {
    stopAudio();
    return;
  }
  continuous = false;
  start(globalAyahNo);
}

/** «استمع للسورة» — continuous recitation from this ayah onward. */
export function playContinuous(fromGlobalAyahNo: number) {
  continuous = true;
  start(fromGlobalAyahNo);
}

export function next() {
  if (currentId > 0 && currentId < LAST_AYAH) start(currentId + 1);
}

/** `ayahId` is the global ayah number 1..6236 (from AyahDoc._id "a<n>"). */
export default function AudioButton({ ayahId }: { ayahId: number }) {
  useUILang();
  const playing = usePlayingId() === ayahId;
  return (
    <button
      className="chip"
      onClick={() => toggle(ayahId)}
      style={{ border: "none", cursor: "pointer" }}
      title={getUILang() === "ar" ? "تلاوة الشيخ محمود خليل الحصري" : "Recitation: Shaykh al-Ḥuṣarī"}
    >
      {playing ? `◼ ${t("stop")}` : `▶ ${t("listen")}`}
    </button>
  );
}

/** Fixed mini player shown whenever recitation is playing. */
export function NowPlayingBar() {
  useUILang();
  const id = usePlayingId();
  if (id === 0) return null;
  const loc = currentLocation;
  return (
    <div
      className="card"
      style={{
        position: "fixed",
        bottom: 46,
        insetInlineStart: 16,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: "var(--accent)",
          animation: "pulse 1.2s ease-in-out infinite",
        }}
      />
      <span style={{ fontWeight: 600, color: "var(--accent)" }}>
        {getUILang() === "ar" ? "تلاوة" : "Reciting"}
        {loc ? ` · ${num(loc.split(":")[1])}` : ""}
      </span>
      <button className="chip" style={{ border: "none", cursor: "pointer" }} onClick={() => next()} title="⏭">
        ⏭
      </button>
      <button className="chip" style={{ border: "none", cursor: "pointer" }} onClick={stopAudio} title={t("stop")}>
        ◼ {t("stop")}
      </button>
    </div>
  );
}

export const ayahIdOf = (doc: { _id: string }): number => Number(doc._id.slice(1));
