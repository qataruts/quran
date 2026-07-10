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
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getWord, listAyahs, listSurahs, listWords, mushafMarks, pageJuzMap } from "../db";
import type { MushafMark } from "../db";
import type { AyahDoc, SurahDoc, WordDoc } from "../types";
import { getUILang, num, t, useUILang } from "../i18n";
import { setSelectedAyah, useReading } from "../reading";
import { useSettings } from "../settings";
import { recordProgress, toggleBookmark, useBookmarks } from "../bookmarks";
import { TAJWID, tajwidSpans } from "../tajwid";
import ReadingBar from "../components/ReadingBar";
import MushafRealPage from "../components/MushafRealPage";
import AyahText from "../components/AyahText";
import AyahRef from "../components/AyahRef";
import MorphologyCard from "../components/MorphologyCard";
import RootMeaning from "../components/RootMeaning";
import CollectButton from "../components/CollectButton";
import AudioButton, { ayahIdOf, playContinuous, usePlayingId } from "../components/AudioButton";
import SimilarAyahs from "../components/SimilarAyahs";
import TafsilChip from "../components/TafsilChip";
import TafsilAside from "../components/TafsilAside";
import Translations from "../components/Translations";

const MODE_KEY = "quran-studio:reader-mode";
type Mode = "mushaf" | "pages" | "ayat";

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

/** Continuous mushaf flow for one Madani page of the current surah. */
function MushafPage({
  page,
  ayahs,
  wordsByAyah,
  selected,
  onSelect,
  onAyahMarker,
  targetAyahNo,
}: {
  page: number;
  ayahs: AyahDoc[];
  wordsByAyah: Map<number, WordDoc[]>;
  selected: string | null;
  onSelect: (w: WordDoc) => void;
  onAyahMarker: (a: AyahDoc) => void;
  targetAyahNo: number | null;
}) {
  const { script, tajwid } = useSettings();
  return (
    <section className="mushaf-page">
      <div className="quran">
        {ayahs.map((ayah) => (
          <span
            key={ayah.location}
            id={`ayah-${ayah.surahNo}-${ayah.ayahNo}`}
            style={
              targetAyahNo === ayah.ayahNo
                ? { background: "var(--accent-soft)", borderRadius: 8 }
                : undefined
            }
          >
            {tajwid
              ? tajwidSpans((wordsByAyah.get(ayah.ayahNo) ?? []).map((w) => w.textUthmani).join(" ")).map((s, i) =>
                  s.rule ? (
                    <span key={i} className={TAJWID[s.rule].cls} title={TAJWID[s.rule].ar}>{s.text}</span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )
              : (wordsByAyah.get(ayah.ayahNo) ?? []).map((w) => (
              <span key={w.location}>
                <span
                  className={`w${selected === w.location ? " sel" : ""}`}
                  onClick={() => onSelect(w)}
                >
                  {script === "imlaai" ? w.textClean : w.textUthmani}
                </span>{" "}
              </span>
            ))}{" "}
            <span
              className="ayah-marker"
              role="button"
              title={`${t("reader.ayat")} ${num(ayah.ayahNo)}${ayah.sajdaType ? " ۩" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => onAyahMarker(ayah)}
            >
              ﴿{num(ayah.ayahNo)}﴾
            </span>{" "}
          </span>
        ))}
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
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(MODE_KEY) as Mode) || "mushaf",
  );
  const [mushafPage, setMushafPage] = useState<number>(1);
  const [pageJuz, setPageJuz] = useState<Map<number, number>>(new Map());
  const [marks, setMarks] = useState<Map<string, MushafMark>>(new Map());
  useEffect(() => { void pageJuzMap().then(setPageJuz); void mushafMarks().then(setMarks); }, []);
  const switchMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  };

  const [surahs, setSurahs] = useState<SurahDoc[]>([]);
  const [ayahs, setAyahs] = useState<AyahDoc[]>([]);
  const [wordsByAyah, setWordsByAyah] = useState<Map<number, WordDoc[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WordDoc | null>(null);
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
        const tgt = targetAyahNo ? ay.find((x) => x.ayahNo === targetAyahNo) : ay[0];
        if (tgt) setMushafPage(tgt.page);
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
      if (!selectedLoc) return;
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
          <header className="card" style={{ textAlign: "center", marginBottom: 18 }}>
            <div className="quran" style={{ fontSize: 42, lineHeight: 1.6 }}>
              {surah.nameAr}
            </div>
            {getUILang() !== "ar" && (
              <div style={{ fontWeight: 600 }}>
                {surah.nameTranslit} <span className="muted">· {surah.nameEn}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 10,
              }}
            >
              <span className="chip">
                <b>{surah.revelation === "Meccan" ? t("reader.meccan") : t("reader.medinan")}</b>
              </span>
              <span className="chip">
                <b>{num(surah.ayahCount)}</b> {t("reader.ayahs")}
              </span>
              <span className="chip">
                <b>{num(surah.wordCount)}</b> {t("reader.words")}
              </span>
              <button
                className="chip link"
                style={{ border: "none" }}
                onClick={() => playContinuous((surahBase.get(surahNo) ?? 0) + 1)}
              >
                ▶ {t("reader.listenSurah")}
              </button>
              <span
                className="chip"
                style={{ background: "var(--panel)", border: "1px solid var(--line)", gap: 0, padding: 2 }}
              >
                {(["mushaf", "pages", "ayat"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "2px 12px",
                      background: mode === m ? "var(--accent-soft)" : "transparent",
                      color: mode === m ? "var(--accent)" : "var(--muted)",
                      fontWeight: mode === m ? 600 : 400,
                    }}
                  >
                    {m === "mushaf" ? t("reader.mushaf") : m === "pages" ? t("reader.pages") : t("reader.ayat")}
                  </button>
                ))}
              </span>
            </div>
          </header>
        )}

        {loading ? (
          <p className="muted">{t("loading")}</p>
        ) : ayahs.length === 0 ? (
          <p className="muted">{t("notFound")}</p>
        ) : mode === "mushaf" ? (
          <>
            <MushafRealPage
              page={mushafPage}
              juz={pageJuz.get(mushafPage) ?? null}
              marks={marks}
              selectedWord={selected?.location ?? null}
              playingAyah={playingAyahNo != null ? `${surahNo}:${playingAyahNo}` : null}
              onWord={(key) => { void getWord(key).then((w) => w && setSelected(w)); }}
              onAyah={(loc) => setSelectedAyah(loc)}
            />
            <div className="mushaf-nav">
              <button onClick={() => setMushafPage((p) => Math.min(604, p + 1))} disabled={mushafPage >= 604} title={t("read.nextPage")}>›</button>
              <span className="pos">{t("reader.page")} {num(mushafPage)} / {num(604)}</span>
              <button onClick={() => setMushafPage((p) => Math.max(1, p - 1))} disabled={mushafPage <= 1} title={t("read.prevPage")}>‹</button>
            </div>
          </>
        ) : mode === "pages" ? (
          pages.map(([page, pageAyahs]) => (
            <MushafPage
              key={page}
              page={page}
              ayahs={pageAyahs}
              wordsByAyah={wordsByAyah}
              selected={selected?.location ?? null}
              onSelect={(w: WordDoc) => setSelected(w)}
              onAyahMarker={(a: AyahDoc) => {
                switchMode("ayat");
                navigate(`/read/${a.surahNo}/${a.ayahNo}`);
              }}
              targetAyahNo={playingAyahNo ?? targetAyahNo}
            />
          ))
        ) : (
          ayahs.map((ayah: AyahDoc) => {
            const isTarget = (playingAyahNo ?? targetAyahNo) === ayah.ayahNo;
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
                  <TafsilChip location={ayah.location} />
                </div>
                <AyahText
                  words={wordsByAyah.get(ayah.ayahNo) ?? []}
                  ayahNo={ayah.ayahNo}
                  selected={selected?.location ?? null}
                  onSelect={(w: WordDoc) => setSelected(w)}
                />
                <Translations ayah={ayah} />
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
          <TafsilAside location={selectedLoc} />
          <Inspector word={selected} />
        </aside>
      )}

      <ReadingBar surahBase={surahBase} onNavigate={navigateAyah} />

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
          <TafsilAside location={selectedLoc} />
          {selected && <Inspector word={selected} />}
        </div>
      )}
    </div>
  );
}
