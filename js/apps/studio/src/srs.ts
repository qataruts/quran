/**
 * مسار الجذور — spaced repetition over the Qur'an's roots. Each root is a card;
 * its answer is the classical gloss (الراغب / مقاييس) we already ship. A small
 * SM-2-style scheduler, persisted in localStorage and reactive like settings.
 *
 * New roots are introduced most-frequent-first, so effort tracks the text: the
 * top few hundred roots cover the great majority of the mushaf's words.
 */
import { useSyncExternalStore } from "react";

export type Card = {
  ease: number; // difficulty multiplier (>=1.3)
  interval: number; // days until next review (0 = still in learning)
  due: number; // timestamp of next review
  reps: number; // total successful-or-not reviews
  lapses: number; // times forgotten
};
export type Grade = 0 | 1 | 2 | 3; // Again · Hard · Good · Easy

const KEY = "quran-studio:srs";
const DAY = 86_400_000;

function load(): Record<string, Card> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
let store: Record<string, Card> = load();
const listeners = new Set<() => void>();
const emit = () => {
  localStorage.setItem(KEY, JSON.stringify(store));
  listeners.forEach((l) => l());
};

/** Grade a root and reschedule it. */
export function grade(root: string, q: Grade): void {
  const now = Date.now();
  const c: Card = store[root]
    ? { ...store[root] }
    : { ease: 2.3, interval: 0, due: now, reps: 0, lapses: 0 };
  if (q === 0) {
    // forgot — back to learning, seen again in a minute
    c.lapses += 1;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.interval = 0;
    c.due = now + 60_000;
  } else {
    if (c.interval === 0) {
      c.interval = q === 3 ? 3 : 1; // graduate: Easy jumps ahead
    } else {
      const mult = q === 1 ? 1.2 : q === 3 ? c.ease * 1.3 : c.ease;
      c.interval = Math.max(1, Math.round(c.interval * mult));
    }
    c.ease = Math.max(1.3, c.ease + (q === 3 ? 0.1 : q === 1 ? -0.15 : 0));
    c.due = now + c.interval * DAY;
  }
  c.reps += 1;
  store = { ...store, [root]: c };
  emit();
}

export const cardOf = (root: string): Card | undefined => store[root];
/** A root counts as "learned" once it has graduated out of same-day learning. */
export const isLearned = (c: Card | undefined): boolean => !!c && c.interval >= 1;

export function useSrs(): Record<string, Card> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store,
  );
}

export function resetSrs(): void {
  store = {};
  emit();
}
