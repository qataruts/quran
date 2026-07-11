/**
 * المصحف الموضوعي — the thematic index of the whole Quran, loaded once. A clean
 * three-level tree (قسم → موضوع → آية) built to be browsed simply: the surface
 * is 12 sections; depth is revealed on demand. Also exposes the per-verse
 * unified index (verse-index.json) so any ayah can show its topic + network role.
 */
import { useEffect, useState } from "react";

export interface MTopic {
  title: string;
  theme: string;
  rep: string;
  members: string[];
}
export interface MSection {
  title: string;
  theme: string;
  verses: number;
  topics: MTopic[];
}
interface Mawdui {
  meta: { sections: number; topics: number; verses: number };
  sections: MSection[];
}

let data: Mawdui | null = null;
let loading: Promise<Mawdui> | null = null;

export function loadMawdui(): Promise<Mawdui> {
  if (data) return Promise.resolve(data);
  loading ??= fetch(`${import.meta.env.BASE_URL}mawdui.json?v=${__DATA_VERSION__}`)
    .then((r) => {
      if (!r.ok) throw new Error(`mawdui.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((d: Mawdui) => (data = d))
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function useMawdui(): Mawdui | null {
  const [d, setD] = useState<Mawdui | null>(data);
  useEffect(() => {
    let live = true;
    loadMawdui().then((x) => live && setD(x)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return d;
}

/* --------------------------- per-verse unified index --------------------------- */
// verse record: [topicId, kindCode, gradeCode, tafsilDeg, elaborates, twins, muhkamaId]
type VRec = [number, number, number, number, number, number, number];
interface VerseIndex {
  meta: { kinds: Record<string, number>; grades: Record<string, number> };
  sections: { title: string; theme: string }[];
  topics: { title: string; sec: number }[];
  muhkamat: { title: string; kubra: string; section: number }[];
  verses: Record<string, VRec>;
}
let vidx: VerseIndex | null = null;
let vloading: Promise<VerseIndex> | null = null;
const KIND_AR = ["", "حكم", "أخلاق", "عقيدة", "سنة", "وعد"];
const GRADE_AR = ["", "أصل جامع", "متفرّع", "موجز", "مجرّد"];

export function loadVerseIndex(): Promise<VerseIndex> {
  if (vidx) return Promise.resolve(vidx);
  vloading ??= fetch(`${import.meta.env.BASE_URL}verse-index.json?v=${__DATA_VERSION__}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`verse-index: ${r.status}`))))
    .then((d: VerseIndex) => (vidx = d))
    .catch((e) => {
      vloading = null;
      throw e;
    });
  return vloading;
}

export interface VerseInfo {
  topic: string | null;
  section: string | null;
  sectionIdx: number | null; // for /mawdui/:sectionIdx
  jamiaKind: string | null;
  grade: string | null;
  muhkama: string | null;
  tafsilDeg: number;
  elaborates: number;
  twins: number;
}
/** Synchronous lookup once loadVerseIndex() has resolved; null before that. */
export function verseInfo(loc: string): VerseInfo | null {
  if (!vidx) return null;
  const r = vidx.verses[loc];
  if (!r) return null;
  const topic = r[0] >= 0 ? vidx.topics[r[0]] : null;
  return {
    topic: topic?.title ?? null,
    section: topic ? vidx.sections[topic.sec]?.title ?? null : null,
    sectionIdx: topic ? topic.sec : null,
    jamiaKind: r[1] ? KIND_AR[r[1]] : null,
    grade: r[2] ? GRADE_AR[r[2]] : null,
    muhkama: r[6] >= 0 ? vidx.muhkamat[r[6]]?.title ?? null : null,
    tafsilDeg: r[3],
    elaborates: r[4],
    twins: r[5],
  };
}

export function useVerseIndex(): boolean {
  const [ready, setReady] = useState<boolean>(!!vidx);
  useEffect(() => {
    let live = true;
    loadVerseIndex().then(() => live && setReady(true)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
