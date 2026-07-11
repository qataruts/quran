/**
 * Reader settings — one localStorage-backed, reactive store (like i18n). A ⚙
 * panel in the top bar edits it; components subscribe via useSettings(). Only
 * within-method options (Quran text + our data + Arabic); nothing external.
 */
import { useSyncExternalStore } from "react";
import { setNumeralsMode } from "./i18n";

export type Script = "uthmani" | "imlaai";
export type QuranFont = "amiri" | "kfgqpc" | "scheherazade";
export type Numerals = "auto" | "ar" | "west";
export type Theme = "auto" | "light" | "dark" | "sepia";

export interface Settings {
  script: Script;
  quranFont: QuranFont; // the Quran text typeface
  numerals: Numerals;
  quranScale: number; // 0.8 – 1.6, multiplies the Quran font size
  theme: Theme;
  focus: boolean; // distraction-free: hide chrome, just the text
  speed: number; // recitation playback rate (0.75 – 1.25)
  reciter: string; // key into RECITERS (AudioButton); default al-Ḥuṣarī
  tajwid: boolean; // colour-coded tajwīd in the text reading modes
  layers: {
    jawami: boolean; // محكم→تفصيل chip in the reader
    roots: boolean; // root chip in the word inspector
    similar: boolean; // «مثلها» semantic-neighbours chip
  };
}

const KEY = "quran-studio:settings";
const DEFAULTS: Settings = {
  script: "uthmani",
  quranFont: "scheherazade",
  numerals: "auto",
  quranScale: 1,
  theme: "auto",
  focus: false,
  speed: 1,
  reciter: "husary",
  tajwid: false,
  layers: { jawami: true, roots: true, similar: true },
};

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULTS, ...raw, layers: { ...DEFAULTS.layers, ...(raw.layers ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

let state: Settings = load();
const listeners = new Set<() => void>();

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** Push the current settings into the DOM + sibling stores (theme, numerals,
 *  quran scale, focus). Safe to call repeatedly. */
export function applySettings(): void {
  const root = document.documentElement;
  root.dataset.theme = state.theme === "auto" ? (prefersDark() ? "dark" : "light") : state.theme;
  root.dataset.quranFont = state.quranFont;
  root.style.setProperty("--quran-scale", String(state.quranScale));
  document.body.classList.toggle("focus-mode", state.focus);
  setNumeralsMode(state.numerals);
}

export function getSettings(): Settings {
  return state;
}

export function setSettings(patch: Partial<Settings>): void {
  state = { ...state, ...patch, layers: { ...state.layers, ...(patch.layers ?? {}) } };
  localStorage.setItem(KEY, JSON.stringify(state));
  applySettings();
  listeners.forEach((cb) => cb());
}

export function setLayer(name: keyof Settings["layers"], on: boolean): void {
  setSettings({ layers: { ...state.layers, [name]: on } });
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

// keep "auto" theme in sync with the OS preference while the app is open
if (typeof window !== "undefined") {
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (state.theme === "auto") applySettings();
  });
}
