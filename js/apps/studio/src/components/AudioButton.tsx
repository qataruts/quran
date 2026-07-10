import { useSyncExternalStore } from "react";
import { getUILang, num, t, useUILang } from "../i18n";
import { getSettings } from "../settings";

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
const CDN_ROOT = "https://cdn.islamic.network/quran/audio";
const LAST_AYAH = 6236;

/** Reciters on the Islamic Network CDN — each pinned to a bitrate verified to
 *  return 200 (they differ per edition). The SW audio cache rule matches any
 *  edition/bitrate under this host, so all reciters cache offline. */
export const RECITERS: Record<string, { ed: string; br: number; ar: string; en: string }> = {
  husary: { ed: "ar.husary", br: 64, ar: "محمود خليل الحصري", en: "al-Ḥuṣarī" },
  alafasy: { ed: "ar.alafasy", br: 128, ar: "مشاري العفاسي", en: "Mishary Alafasy" },
  abdulbasit: { ed: "ar.abdulbasitmurattal", br: 64, ar: "عبد الباسط عبد الصمد", en: "ʿAbd al-Bāsiṭ" },
  minshawi: { ed: "ar.minshawi", br: 128, ar: "محمد صديق المنشاوي", en: "al-Minshāwī" },
  sudais: { ed: "ar.abdurrahmaansudais", br: 192, ar: "عبد الرحمن السديس", en: "as-Sudais" },
  muaiqly: { ed: "ar.mahermuaiqly", br: 128, ar: "ماهر المعيقلي", en: "al-Muʿayqilī" },
};

const reciterOf = () => RECITERS[getSettings().reciter] ?? RECITERS.husary;
const audioBase = () => {
  const r = reciterOf();
  return `${CDN_ROOT}/${r.br}/${r.ed}`;
};

let player: HTMLAudioElement | null = null;
let currentId = 0;
let continuous = false;
let currentLocation: string | null = null;
let repeatTotal = 0; // 0 = no repeat; N = repeat current ayah N times
let repeatLeft = 0;
let stopAtId = 0; // 0 = no bound; else stop after this global ayah (range end)
let preview = false; // true = a «مثلها» sample; the reader must NOT follow it

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
  repeatTotal = 0;
  repeatLeft = 0;
  stopAtId = 0;
  preview = false;
  if (player && !player.paused) player.pause();
  currentId = 0;
  currentLocation = null;
  notify();
}

/** Global playback id (0 when stopped) — for the reader to reflect state. */
export const currentPlayingId = () => currentId;

/** True while the current playback is a «مثلها» preview sample. The reader's
 *  follow-along / page-sync effects check this so a sample never moves the
 *  reader off the ayah/page they are on. */
export const isPreviewPlaying = () => preview;

/** Apply a new playback rate to the live player (settings change mid-recitation). */
export function setLivePlaybackRate(rate: number) {
  if (player) {
    player.defaultPlaybackRate = rate;
    player.playbackRate = rate;
  }
}

/** Reciter changed in settings — restart the current ayah in the new voice so
 *  the change is heard at once (keeps continuous/repeat/range state). */
export function reloadForReciter() {
  if (currentId && player && !player.paused) start(currentId);
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
          artist: reciterOf().ar,
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
        preview = false; // transport controls leave preview mode
        if (currentId > 1) start(currentId - 1);
      });
    }
  }
  player.onended = () => {
    if (currentId !== id) return;
    if (repeatLeft > 0) {
      repeatLeft -= 1;
      start(id); // replay same ayah
      return;
    }
    if (stopAtId && id >= stopAtId) {
      stopAudio();
      return;
    }
    if (continuous && id < LAST_AYAH) {
      if (repeatTotal > 0) repeatLeft = repeatTotal; // repeat each ayah in a continuous range
      start(id + 1);
    } else stopAudio();
  };
  player.onerror = () => {
    if (currentId === id) stopAudio();
  };
  player.src = `${audioBase()}/${id}.mp3`;
  // loading a new src resets the rate to defaultPlaybackRate — set both
  player.defaultPlaybackRate = getSettings().speed;
  player.playbackRate = getSettings().speed;
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
  preview = false;
  continuous = false;
  start(globalAyahNo);
}

/** Sample one ayah's recitation WITHOUT moving the reader — used by the «مثلها»
 *  neighbour rows. Reader effects ignore playback while isPreviewPlaying(). */
export function playPreview(globalAyahNo: number) {
  if (currentId === globalAyahNo && player && !player.paused && preview) {
    stopAudio();
    return;
  }
  continuous = false;
  repeatTotal = 0;
  repeatLeft = 0;
  stopAtId = 0;
  preview = true;
  start(globalAyahNo);
}

/** «استمع للسورة» — continuous recitation from this ayah onward. */
export function playContinuous(fromGlobalAyahNo: number) {
  preview = false;
  continuous = true;
  repeatTotal = 0;
  repeatLeft = 0;
  stopAtId = 0;
  start(fromGlobalAyahNo);
}

/**
 * Reading controller — play from an ayah with options.
 *   repeat: repeat EACH ayah this many extra times (0 = once)
 *   continueAfter: keep going to following ayahs (else stop at `from`, honouring repeat)
 *   until: optional global ayah id to stop after (range end)
 */
export function playFrom(
  fromGlobalAyahNo: number,
  opts: { repeat?: number; continueAfter?: boolean; until?: number } = {},
) {
  preview = false;
  repeatTotal = Math.max(0, opts.repeat ?? 0);
  repeatLeft = repeatTotal;
  continuous = opts.continueAfter ?? false;
  stopAtId = opts.until ?? 0;
  start(fromGlobalAyahNo);
}

export function next() {
  preview = false; // advancing via the transport control leaves preview mode
  if (currentId > 0 && currentId < LAST_AYAH) start(currentId + 1);
}

/** `ayahId` is the global ayah number 1..6236 (from AyahDoc._id "a<n>").
 *  `preview` routes clicks through playPreview so sampling a «مثلها» neighbour
 *  never drags the reader to that ayah's surah/page. */
export default function AudioButton({ ayahId, preview: isPreview = false }: { ayahId: number; preview?: boolean }) {
  useUILang();
  const playing = usePlayingId() === ayahId;
  return (
    <button
      className="chip"
      onClick={() => (isPreview ? playPreview(ayahId) : toggle(ayahId))}
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
