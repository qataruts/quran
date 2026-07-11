/**
 * Reader — the mushaf reading view (/read/:surahNo and /read/:surahNo/:ayahNo).
 *
 * Two display modes:
 *   «صفحات» (default) — continuous mushaf flow, grouped by Madani page.
 *   «آيات»            — ayah-by-ayah list with tools and translation.
 *
 * Three columns: surah sidebar (250px) · text · word inspector (360px).
 * Under 900px the sidebars collapse and a surah <select> takes over.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getWord, listAyahs, listSurahs, listWords, surahNameAr } from "../db";
import type { AyahDoc, SurahDoc, WordDoc } from "../types";
import { getUILang, num, t, useUILang } from "../i18n";
import { setSelectedAyah, useReading } from "../reading";
import { useSettings } from "../settings";
import { recordProgress, toggleBookmark, useBookmarks } from "../bookmarks";
import { TAJWID, tajwidWords } from "../tajwid";
import ReadingBar from "../components/ReadingBar";
import AyahText from "../components/AyahText";
import AyahRef from "../components/AyahRef";
import MorphologyCard from "../components/MorphologyCard";
import RootMeaning from "../components/RootMeaning";
import CollectButton from "../components/CollectButton";
import AudioButton, { ayahIdOf, isPreviewPlaying, playContinuous, usePlayingId } from "../components/AudioButton";
import SimilarAyahs from "../components/SimilarAyahs";
import TafsilChip, { TafsilPanel } from "../components/TafsilChip";
import TafsilAside from "../components/TafsilAside";
import VerseContext from "../components/VerseContext";
import { useVerseIndex, verseInfo } from "../mawdui";
import Translations from "../components/Translations";

const MODE_KEY = "quran-studio:reader-mode";
type Mode = "pages" | "ayat";

/** Tracks whether the viewport is narrower than 900px. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState<boolean>(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

function SurahSidebar({
  surahs,
  activeNo,
  onPick,
}: {
  surahs: SurahDoc[];
  activeNo: number;
  onPick: (surahNo: number) => void;
}) {
  useUILang();
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const shown = q
    ? surahs.filter(
        (s) =>
          String(s.surahNo).startsWith(q) ||
          s.nameTranslit.toLowerCase().includes(q) ||
          s.nameEn.toLowerCase().includes(q) ||
          s.nameAr.includes(filter.trim()),
      )
    : surahs;
  return (
    <aside
      style={{
        width: 250,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderInlineEnd: "1px solid var(--line)",
        background: "var(--panel)",
        minHeight: 0,
      }}
    >
      <div style={{ padding: "10px 10px 8px" }}>
        <input
          value={filter}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
          placeholder={t("reader.filter")}
          style={{ width: "100%" }}
          aria-label={t("reader.filter")}
        />
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "0 6px 10px" }}>
        {shown.map((s) => {
          const active = s.surahNo === activeNo;
          return (
            <div
              key={s.surahNo}
              onClick={() => onPick(s.surahNo)}
              role="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
                background: active ? "var(--accent-soft)" : undefined,
                color: active ? "var(--accent)" : "var(--ink-2)",
              }}
            >
              <span className="muted" style={{ width: 26, textAlign: "end" }}>
                {num(s.surahNo)}
              </span>
              <span className="quran" style={{ fontSize: 19, lineHeight: 1.4 }}>
                {s.nameAr}
              </span>
              {getUILang() !== "ar" && (
                <span className="muted" style={{ marginInlineStart: "auto", fontSize: 11 }}>
                  {s.nameTranslit}
                </span>
              )}
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="muted" style={{ padding: 10 }}>
            {t("notFound")} “{filter}”
          </div>
        )}
      </div>
    </aside>
  );
}

function Inspector({ word }: { word: WordDoc | null }) {
  useUILang();
  const { layers } = useSettings();
  if (!word) {
    return (
      <div className="muted" style={{ padding: 8, lineHeight: 1.8 }}>
        {t("reader.inspector.hint")}
      </div>
    );
  }
  const ayahLoc = `${word.surahNo}:${word.ayahNo}`;
  return (
    <div>
      <MorphologyCard word={word} />
      {word.root && layers.roots && <RootMeaning root={word.root} />}
      <div
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}
      >
        <CollectButton
          locations={[ayahLoc]}
          criterion={{ kind: "manual", value: word.location }}
          label={`⊕ ${t("collect")}`}
        />
      </div>
    </div>
  );
}

const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

/** Continuous mushaf flow for one Madani page of the current surah — laid out
 *  like the printed Madina mushaf: header margin (juz · surah · hizb), surah
 *  name band + basmala where the surah begins, ۞ hizb/rub and ۩ sajda marks,
 *  and the page number at the foot. */
function MushafPage({
  page,
  ayahs,
  wordsByAyah,
  selected,
  onSelect,
  onAyahMarker,
  targetAyahNo,
  rubMarks,
  opening = false,
}: {
  page: number;
  ayahs: AyahDoc[];
  wordsByAyah: Map<number, WordDoc[]>;
  selected: string | null;
  onSelect: (w: WordDoc) => void;
  onAyahMarker: (a: AyahDoc) => void;
  targetAyahNo: number | null;
  rubMarks: Map<number, string>;
  opening?: boolean;
}) {
  const { script, tajwid, layers } = useSettings();
  const vidxReady = useVerseIndex(); // to mark جوامع on the page
  const ar = getUILang() === "ar";
  const first = ayahs[0];
  const surahNo = first?.surahNo ?? 0;
  const surahStartsHere = ayahs.some((a) => a.ayahNo === 1);
  return (
    <section className={`mushaf-page${opening ? " opening" : ""}`}>
      <div className="mp-margin">
        <span>{ar ? "الجزء" : "Juz"} {num(first?.juz ?? 0)}</span>
        <span>{surahNameAr(surahNo)} · {ar ? "الحزب" : "Hizb"} {num(first?.hizb ?? 0)}</span>
      </div>
      {surahStartsHere && (
        <div className="mp-surah-band">
          <span className="mp-surah-name quran">سورة {surahNameAr(surahNo)}</span>
          {surahNo !== 1 && surahNo !== 9 && <div className="mp-basmala quran">{BASMALA}</div>}
        </div>
      )}
      <div className="quran">
        {ayahs.map((ayah) => {
          const rub = rubMarks.get(ayah.ayahNo);
          const ws = wordsByAyah.get(ayah.ayahNo) ?? [];
          const colored = tajwid ? tajwidWords(ws.map((w) => w.textUthmani)) : null;
          // mark آيات جامعة (principle verses) with a gold marker
          const jamia = layers.jawami && vidxReady ? verseInfo(`${ayah.surahNo}:${ayah.ayahNo}`)?.jamiaKind ?? null : null;
          return (
            <Fragment key={ayah.location}>
              {rub && <div className="mp-mark mp-rub"><span>۞ {num(rub)}</span></div>}
              {ayah.sajdaType && <div className="mp-mark mp-sajda"><span>۩ موضع سجدة</span></div>}
              <span
                id={`ayah-${ayah.surahNo}-${ayah.ayahNo}`}
                className={targetAyahNo === ayah.ayahNo ? "mp-ayah target" : "mp-ayah"}
              >
                {ws.map((w, wi) => (
                  <span key={w.location}>
                    <span
                      className={`w${selected === w.location ? " sel" : ""}`}
                      onClick={() => onSelect(w)}
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
                ))}{" "}
                <span
                  className={`ayah-marker${jamia ? " jamia" : ""}`}
                  role="button"
                  title={`${t("reader.ayat")} ${num(ayah.ayahNo)}${ayah.sajdaType ? " ۩" : ""}${jamia ? ` · ${ar ? "آية جامعة" : "principle"} · ${jamia}` : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onAyahMarker(ayah)}
                >
                  ﴿{num(ayah.ayahNo)}﴾
                </span>{" "}
              </span>
            </Fragment>
          );
        })}
      </div>
      <div className="page-no">﴾ {num(page)} ﴿</div>
    </section>
  );
}

export default function Reader() {
  useUILang();
  const params = useParams<{ surahNo: string; ayahNo?: string }>();
  const navigate = useNavigate();
  const surahNo = Number(params.surahNo);
  const targetAyahNo = params.ayahNo != null ? Number(params.ayahNo) : null;
  const narrow = useNarrow();
  // صفحات is the default (easiest for most readers); آيات is opt-in for its
  // tools/translation/«مثلها». A returning reader's explicit choice is remembered.
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(MODE_KEY) === "ayat" ? "ayat" : "pages"),
  );
  const switchMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  };

  const [surahs, setSurahs] = useState<SurahDoc[]>([]);
  const [ayahs, setAyahs] = useState<AyahDoc[]>([]);
  const [wordsByAyah, setWordsByAyah] = useState<Map<number, WordDoc[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WordDoc | null>(null);
  // which ayah's محكم→تفصيل panel is open (آيات mode); one at a time keeps the
  // page short and the panel renders beneath the verse, not above it.
  const [openTafsil, setOpenTafsil] = useState<string | null>(null);
  // صفحات mode shows ONE mushaf page at a time; pageIdx indexes into `pages`.
  const [pageIdx, setPageIdx] = useState(0);
  const wantLastPage = useRef<number | null>(null); // surah we back-flipped INTO → show its last page
  const bookmarks = useBookmarks();

  useEffect(() => {
    let cancelled = false;
    listSurahs().then((all: SurahDoc[]) => {
      if (!cancelled) setSurahs(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // One fetch per surah: ayahs + all words, grouped by ayahNo with a Map.
  useEffect(() => {
    if (!Number.isInteger(surahNo) || surahNo < 1 || surahNo > 114) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    Promise.all([listAyahs(surahNo), listWords(surahNo)])
      .then(([ay, ws]: [AyahDoc[], WordDoc[]]) => {
        if (cancelled) return;
        const byAyah = new Map<number, WordDoc[]>();
        for (const w of ws) {
          const bucket = byAyah.get(w.ayahNo);
          if (bucket) bucket.push(w);
          else byAyah.set(w.ayahNo, [w]);
        }
        setAyahs(ay);
        setWordsByAyah(byAyah);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setAyahs([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [surahNo]);

  /** cumulative ayahs before each surah — global id = base + ayahNo */
  const surahBase = useMemo(() => {
    const map = new Map<number, number>();
    let acc = 0;
    for (const s of surahs) {
      map.set(s.surahNo, acc);
      acc += s.ayahCount;
    }
    return map;
  }, [surahs]);

  // remember the last reading position (for resume) and advance khatma progress
  useEffect(() => {
    if (Number.isInteger(surahNo) && surahNo >= 1 && surahNo <= 114) {
      localStorage.setItem("quran-studio:last-read", `${surahNo}:${targetAyahNo ?? 1}`);
      const base = surahBase.get(surahNo);
      if (base != null) recordProgress(base + (targetAyahNo ?? 1));
    }
  }, [surahNo, targetAyahNo, surahBase]);

  // Scroll the :ayahNo target into view once the surah has rendered.
  useEffect(() => {
    if (loading || targetAyahNo == null) return;
    const el = document.getElementById(`ayah-${surahNo}-${targetAyahNo}`);
    el?.scrollIntoView({ block: "center" });
  }, [loading, surahNo, targetAyahNo, mode]);

  const surah = useMemo(() => surahs.find((s) => s.surahNo === surahNo), [surahs, surahNo]);

  // follow-along: highlight and scroll to the ayah being recited; if the
  // recitation crosses into another surah, follow it.
  const playingId = usePlayingId();
  const playingAyahNo = useMemo(() => {
    if (playingId === 0 || surahs.length === 0) return null;
    const base = surahBase.get(surahNo) ?? 0;
    const within = playingId - base;
    return within >= 1 && within <= (surah?.ayahCount ?? 0) ? within : null;
  }, [playingId, surahBase, surahNo, surah, surahs.length]);

  useEffect(() => {
    if (isPreviewPlaying()) return; // a «مثلها» sample must not move the reader
    if (playingAyahNo != null) {
      document
        .getElementById(`ayah-${surahNo}-${playingAyahNo}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (playingId > 0 && surahs.length > 0) {
      // recitation moved outside this surah — follow it
      let acc = 0;
      for (const s of surahs) {
        if (playingId <= acc + s.ayahCount) {
          if (s.surahNo !== surahNo) navigate(`/read/${s.surahNo}/${playingId - acc}`, { replace: true });
          break;
        }
        acc += s.ayahCount;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId, playingAyahNo]);

  const pages = useMemo(() => {
    const byPage = new Map<number, AyahDoc[]>();
    for (const a of ayahs) {
      const bucket = byPage.get(a.page);
      if (bucket) bucket.push(a);
      else byPage.set(a.page, [a]);
    }
    return [...byPage.entries()].sort((x, y) => x[0] - y[0]);
  }, [ayahs]);

  // ۞ hizb/rub-quarter marks: ayahNo → «الحزب N» / «الربع» / «النصف» / «الثلاثة أرباع»
  const QUARTER = ["", "الربع", "النصف", "الثلاثة أرباع"];
  const rubMarks = useMemo(() => {
    const m = new Map<number, string>();
    let prev: number | null = ayahs[0]?.rub ?? null;
    for (const a of ayahs) {
      if (prev !== null && a.rub !== prev) {
        const q = (a.rub - 1) % 4;
        m.set(a.ayahNo, q === 0 ? `الحزب ${Math.ceil(a.rub / 4)}` : QUARTER[q]);
      }
      prev = a.rub;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayahs]);

  // Pick which single page to show when the surah / target ayah changes:
  // the target's page, or the last page when we arrived by flipping backwards.
  useEffect(() => {
    if (pages.length === 0) return;
    if (targetAyahNo != null) {
      const i = pages.findIndex(([, pa]) => pa.some((a) => a.ayahNo === targetAyahNo));
      setPageIdx(i >= 0 ? i : 0);
    } else if (wantLastPage.current === surahNo) {
      // only honour a back-flip that resolved to the surah it was meant for —
      // guards against an intervening navigation superseding the fetch
      setPageIdx(pages.length - 1);
      wantLastPage.current = null;
    } else {
      wantLastPage.current = null;
      setPageIdx(0);
    }
  }, [pages, targetAyahNo, surahNo]);

  // keep the shown page in step with continuous recitation (but not previews)
  useEffect(() => {
    if (mode !== "pages" || playingAyahNo == null || pages.length === 0 || isPreviewPlaying()) return;
    const i = pages.findIndex(([, pa]) => pa.some((a) => a.ayahNo === playingAyahNo));
    if (i >= 0) setPageIdx(i);
  }, [playingAyahNo, mode, pages]);

  // Turn the page. dir +1 = forward (next page, then next surah); -1 = back.
  const flipPage = (dir: -1 | 1) => {
    const next = pageIdx + dir;
    if (next >= 0 && next < pages.length) {
      setPageIdx(next);
    } else if (dir === 1 && surahNo < 114) {
      navigate(`/read/${surahNo + 1}`);
    } else if (dir === -1 && surahNo > 1) {
      wantLastPage.current = surahNo - 1;
      navigate(`/read/${surahNo - 1}`);
    }
  };

  const goTo = (n: number) => navigate(`/read/${n}`);

  // Ayah selection + navigation (reading controller). Selecting an ayah opens
  // the ReadingBar; ← → move ayah (crossing surah at the ends); Esc clears.
  const { selected: selectedLoc } = useReading();
  const selectAyah = (loc: string) => {
    setSelectedAyah(loc);
    document.getElementById(`ayah-${loc.split(":")[0]}-${loc.split(":")[1]}`)?.scrollIntoView({ block: "center" });
  };
  const navigateAyah = (dir: -1 | 1) => {
    if (!selectedLoc) return;
    const [ss, aa] = selectedLoc.split(":").map(Number);
    if (ss !== surahNo) {
      navigate(`/read/${ss}/${aa + dir}`);
      return;
    }
    const nextNo = aa + dir;
    if (nextNo >= 1 && nextNo <= ayahs.length) {
      selectAyah(`${surahNo}:${nextNo}`);
    } else if (nextNo < 1 && surahNo > 1) {
      navigate(`/read/${surahNo - 1}`); // previous surah
    } else if (nextNo > ayahs.length && surahNo < 114) {
      navigate(`/read/${surahNo + 1}/1`);
      setSelectedAyah(`${surahNo + 1}:1`);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return;
      if (!selectedLoc) {
        // no ayah selected → arrows turn the mushaf page (RTL: ← forward)
        if (mode === "pages") {
          const rtl = getUILang() === "ar";
          if (e.key === "ArrowLeft") { e.preventDefault(); flipPage(rtl ? 1 : -1); }
          else if (e.key === "ArrowRight") { e.preventDefault(); flipPage(rtl ? -1 : 1); }
        }
        return;
      }
      if (e.key === "ArrowRight") { e.preventDefault(); navigateAyah(getUILang() === "ar" ? -1 : 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); navigateAyah(getUILang() === "ar" ? 1 : -1); }
      else if (e.key === "Escape") setSelectedAyah(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!Number.isInteger(surahNo) || surahNo < 1 || surahNo > 114) {
    return (
      <div className="page">
        <div className="card page-narrow">
          <p>
            {t("notFound")} — <b>{params.surahNo}</b>
          </p>
          <Link to="/read/1">الفاتحة</Link>
        </div>
      </div>
    );
  }

  const ar = getUILang() === "ar";
  // which ayah to visually mark as "playing/target" — a «مثلها» preview must
  // NOT move the highlight (same rule the scroll/page-sync effects follow).
  const displayTargetAyahNo = isPreviewPlaying() ? targetAyahNo : (playingAyahNo ?? targetAyahNo);
  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden" }}>
      {!narrow && <SurahSidebar surahs={surahs} activeNo={surahNo} onPick={goTo} />}

      <main className="page" style={{ flex: 1, minWidth: 0 }}>
        {narrow && (
          <select
            value={surahNo}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => goTo(Number(e.target.value))}
            style={{ width: "100%", marginBottom: 16 }}
            aria-label={t("reader.filter")}
          >
            {surahs.map((s) => (
              <option key={s.surahNo} value={s.surahNo}>
                {s.surahNo}. {s.nameAr}{getUILang() !== "ar" ? ` — ${s.nameTranslit}` : ""}
              </option>
            ))}
          </select>
        )}

        {surah && (
          <header className="reader-bar">
            <span className="reader-bar-name quran">{surah.nameAr}</span>
            <span className="muted reader-bar-meta">
              {surah.revelation === "Meccan" ? t("reader.meccan") : t("reader.medinan")} ·{" "}
              {num(surah.ayahCount)} {t("reader.ayahs")}
              {getUILang() !== "ar" ? ` · ${surah.nameTranslit}` : ""}
            </span>
            <span className="reader-bar-spacer" />
            <button
              className="chip link"
              style={{ border: "none" }}
              onClick={() => playContinuous((surahBase.get(surahNo) ?? 0) + 1)}
              title={getUILang() === "ar" ? "استمع للسورة كاملة" : "listen to the whole surah"}
            >
              ▶ {t("reader.listenSurah")}
            </button>
            <span className="reader-modes">
              {(["pages", "ayat"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={mode === m ? "on" : ""}
                  title={
                    getUILang() === "ar"
                      ? m === "pages" ? "عرض الصفحة: تدفّق مستمرّ مجمّعًا بصفحات المصحف" : "عرض الآيات: آيةً آية مع الأدوات والترجمة"
                      : m === "pages" ? "page view: continuous flow by mushaf page" : "ayah view: one by one with tools"
                  }
                >
                  {m === "pages" ? t("reader.pages") : t("reader.ayat")}
                </button>
              ))}
            </span>
          </header>
        )}

        {loading ? (
          <p className="muted">{t("loading")}</p>
        ) : ayahs.length === 0 ? (
          <p className="muted">{t("notFound")}</p>
        ) : mode === "pages" ? (
          (() => {
            const idx = Math.min(Math.max(pageIdx, 0), pages.length - 1);
            const [pageNo, pageAyahs] = pages[idx];
            return (
              <div className="mushaf-stage">
                <MushafPage
                  page={pageNo}
                  ayahs={pageAyahs}
                  wordsByAyah={wordsByAyah}
                  selected={selected?.location ?? null}
                  onSelect={(w: WordDoc) => setSelected(w)}
                  // tap the ﴿n﴾ marker → open the reading bar for this ayah,
                  // staying inside صفحات (a separate «الآيات» button jumps to the
                  // ayah view). Selecting also lets ← → walk ayah-by-ayah.
                  onAyahMarker={(a: AyahDoc) => setSelectedAyah(a.location)}
                  targetAyahNo={displayTargetAyahNo}
                  rubMarks={rubMarks}
                  opening={pageNo === 1 || pageNo === 2}
                />
                <nav className="mushaf-pager" aria-label={ar ? "تصفّح الصفحات" : "page navigation"}>
                  <button
                    className="mp-nav"
                    onClick={() => flipPage(-1)}
                    disabled={surahNo === 1 && idx === 0}
                    title={ar ? "الصفحة السابقة (سهم →)" : "previous page (→)"}
                  >
                    {ar ? "السابقة ›" : "‹ Prev"}
                  </button>
                  <span className="mp-pageinfo" title={ar ? "رقم صفحة المصحف" : "mushaf page number"}>
                    {ar ? "صفحة" : "page"} {num(pageNo)}
                  </span>
                  <button
                    className="mp-nav"
                    onClick={() => flipPage(1)}
                    disabled={surahNo === 114 && idx === pages.length - 1}
                    title={ar ? "الصفحة التالية (سهم ←)" : "next page (←)"}
                  >
                    {ar ? "‹ التالية" : "Next ›"}
                  </button>
                </nav>
              </div>
            );
          })()
        ) : (
          ayahs.map((ayah: AyahDoc) => {
            const isTarget = displayTargetAyahNo === ayah.ayahNo;
            return (
              <article
                key={ayah.location}
                id={`ayah-${ayah.surahNo}-${ayah.ayahNo}`}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius)",
                  marginBottom: 6,
                  background: isTarget ? "var(--accent-soft)" : undefined,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <AyahRef location={ayah.location} />
                  <button
                    className="chip"
                    onClick={() => setSelectedAyah(ayah.location)}
                    title={t("read.playHere")}
                    style={{ border: "none", cursor: "pointer",
                      ...(selectedLoc === ayah.location ? { background: "var(--accent-soft)", color: "var(--accent)" } : {}) }}
                  >▶</button>
                  <span className="chip">
                    {t("reader.juz")} {num(ayah.juz)}
                  </span>
                  <span className="chip">
                    {t("reader.page")} {num(ayah.page)}
                  </span>
                  {ayah.sajdaType && (
                    <span className="chip gold" title={ayah.sajdaType}>
                      ۩ {t("reader.sajda")}
                    </span>
                  )}
                  <AudioButton ayahId={ayahIdOf(ayah)} />
                  <SimilarAyahs ayahId={ayahIdOf(ayah)} location={ayah.location} />
                  <CollectButton
                    locations={[ayah.location]}
                    criterion={{ kind: "manual", value: ayah.location }}
                    label="⊕"
                  />
                  <button
                    className="chip"
                    onClick={() => toggleBookmark(ayah.location)}
                    title={getUILang() === "ar" ? "علامة مرجعية" : "bookmark"}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      ...(bookmarks.includes(ayah.location)
                        ? { background: "var(--gold-soft)", color: "var(--gold)" }
                        : {}),
                    }}
                  >
                    {bookmarks.includes(ayah.location) ? "★" : "☆"}
                  </button>
                  <TafsilChip
                    location={ayah.location}
                    open={openTafsil === ayah.location}
                    onToggle={() =>
                      setOpenTafsil((cur) => (cur === ayah.location ? null : ayah.location))
                    }
                  />
                </div>
                <AyahText
                  words={wordsByAyah.get(ayah.ayahNo) ?? []}
                  ayahNo={ayah.ayahNo}
                  selected={selected?.location ?? null}
                  onSelect={(w: WordDoc) => setSelected(w)}
                />
                <Translations ayah={ayah} />
                <TafsilPanel location={ayah.location} open={openTafsil === ayah.location} />
              </article>
            );
          })
        )}
      </main>

      {!narrow && (
        <aside
          style={{
            width: 360,
            flexShrink: 0,
            overflowY: "auto",
            borderInlineStart: "1px solid var(--line)",
            background: "var(--panel)",
            padding: 16,
            minHeight: 0,
          }}
        >
          <VerseContext location={selectedLoc} />
          <TafsilAside location={selectedLoc} />
          <Inspector word={selected} />
        </aside>
      )}

      <ReadingBar
        surahBase={surahBase}
        onNavigate={navigateAyah}
        onOpenAyat={() => {
          if (!selectedLoc) return;
          const [s, a] = selectedLoc.split(":").map(Number);
          switchMode("ayat");
          navigate(`/read/${s}/${a}`);
        }}
      />

      {narrow && (selected || selectedLoc) && (
        <div
          className="card"
          style={{
            position: "fixed",
            insetInline: 12,
            bottom: 12,
            maxHeight: "55vh",
            overflowY: "auto",
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                setSelected(null);
                setSelectedAyah(null);
              }}
              aria-label="close"
            >
              ✕
            </button>
          </div>
          <VerseContext location={selectedLoc} />
          <TafsilAside location={selectedLoc} />
          {selected && <Inspector word={selected} />}
        </div>
      )}
    </div>
  );
}
