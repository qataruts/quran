/**
 * Bookmarks + reading progress — two small localStorage stores, reactive like
 * settings. Bookmarks: starred ayahs ("s:a") with a jump list. Progress: the
 * furthest ayah reached (global 1..6236), shown as a khatma percentage.
 */
import { useSyncExternalStore } from "react";

const BM_KEY = "quran-studio:bookmarks";
const PROG_KEY = "quran-studio:progress"; // furthest global ayah number reached

/* ------------------------------- bookmarks ------------------------------- */
function loadBookmarks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(BM_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
let bookmarks: string[] = loadBookmarks();
const bmListeners = new Set<() => void>();
const bmEmit = () => {
  localStorage.setItem(BM_KEY, JSON.stringify(bookmarks));
  bmListeners.forEach((cb) => cb());
};

export const isBookmarked = (loc: string): boolean => bookmarks.includes(loc);

export function toggleBookmark(loc: string): void {
  bookmarks = bookmarks.includes(loc) ? bookmarks.filter((l) => l !== loc) : [loc, ...bookmarks];
  bmEmit();
}

export function useBookmarks(): string[] {
  return useSyncExternalStore(
    (cb) => {
      bmListeners.add(cb);
      return () => bmListeners.delete(cb);
    },
    () => bookmarks,
  );
}

/* ------------------------------- progress -------------------------------- */
const TOTAL_AYAHS = 6236;
function loadProgress(): number {
  const n = Number(localStorage.getItem(PROG_KEY) ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(TOTAL_AYAHS, n)) : 0;
}
let progress = loadProgress();
const progListeners = new Set<() => void>();

/** Record that reading reached global ayah `globalNo` (only advances). */
export function recordProgress(globalNo: number): void {
  if (globalNo > progress && globalNo <= TOTAL_AYAHS) {
    progress = globalNo;
    localStorage.setItem(PROG_KEY, String(progress));
    progListeners.forEach((cb) => cb());
  }
}

export function resetProgress(): void {
  progress = 0;
  localStorage.setItem(PROG_KEY, "0");
  progListeners.forEach((cb) => cb());
}

export function useProgress(): { reached: number; total: number; pct: number } {
  const reached = useSyncExternalStore(
    (cb) => {
      progListeners.add(cb);
      return () => progListeners.delete(cb);
    },
    () => progress,
  );
  return { reached, total: TOTAL_AYAHS, pct: Math.round((reached / TOTAL_AYAHS) * 100) };
}
