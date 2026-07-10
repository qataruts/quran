/**
 * MushafRealPage — one Madani page in its QCF font, laid out like the printed
 * mushaf: ornamental frame, surah-name bands + basmala where a surah begins,
 * juz/hizb margin markers, page number. Pages 1–2 are the special half-page
 * decorated openings. Every glyph stays real, interactive text keyed to our
 * word location so all layers attach.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { loadLayout, loadPageFont, pageFont, pageLines } from "../mushaf";
import type { MushafLine } from "../mushaf";
import { ayahByLocationMap, surahNameAr } from "../db";
import type { MushafMark } from "../db";
import type { AyahDoc } from "../types";
import { num } from "../i18n";
import { useSettings } from "../settings";
import { TAJWID, tajwidSpans } from "../tajwid";

const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

/** first ayah of a surah → surah number (for the header band). */
function surahStartingAt(key: string): number | null {
  const m = key.match(/^(\d+):1:1$/);
  return m ? Number(m[1]) : null;
}

function SurahBand({ surah }: { surah: number }) {
  return (
    <div className="qcf-surah-band">
      <span className="qcf-surah-name quran">سورة {surahNameAr(surah)}</span>
      {surah !== 9 && surah !== 1 && (
        <div className="qcf-basmala quran">{BASMALA}</div>
      )}
    </div>
  );
}

export default function MushafRealPage({
  page,
  juz,
  marks,
  selectedWord,
  playingAyah,
  onWord,
  onAyah,
}: {
  page: number;
  juz?: number | null;
  marks?: Map<string, MushafMark>;
  selectedWord?: string | null;
  playingAyah?: string | null;
  onWord?: (key: string) => void;
  onAyah?: (loc: string) => void;
}) {
  const { tajwid } = useSettings();
  const [ready, setReady] = useState(false);
  const [ayahText, setAyahText] = useState<Map<string, AyahDoc>>(new Map());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setReady(false);
    Promise.all([loadLayout(), loadPageFont(page)])
      .then(() => mounted.current && setReady(true))
      .catch(() => mounted.current && setReady(true));
    if (page > 1) void loadPageFont(page - 1).catch(() => {});
    if (page < 604) void loadPageFont(page + 1).catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, [page]);

  // tajwīd can't colour the QCF ligature glyphs — so in tajwīd mode we render the
  // same page's real Uthmani text (coloured) in the mushaf frame instead.
  useEffect(() => {
    if (tajwid) void ayahByLocationMap().then((m) => mounted.current && setAyahText(m));
  }, [tajwid]);

  const lines: MushafLine[] = ready ? pageLines(page) : [];
  const fam = pageFont(page);
  const opening = page <= 2; // the decorated Fātiḥa / Baqara opening pages

  // ordered distinct ayahs on this page (for the tajwīd real-text rendering)
  const pageAyahs: string[] = [];
  if (tajwid) {
    const seen = new Set<string>();
    for (const ln of lines) for (const w of ln.words) if (!seen.has(w.ayah)) { seen.add(w.ayah); pageAyahs.push(w.ayah); }
  }
  const tajwidReady = tajwid && ready && ayahText.size > 0;

  return (
    <section className={`mushaf-page qcf${opening ? " opening" : ""}`}>
      {/* top margin: juz label */}
      <div className="qcf-margin-top">
        {juz != null && <span>الجزء {num(juz)}</span>}
      </div>

      <div className={`qcf-body${tajwid ? " qcf-tajwid" : ""}`}>
        {tajwid ? (
          !tajwidReady ? (
            <div className="muted" style={{ textAlign: "center", padding: 40 }}>…</div>
          ) : (
            <div className="quran" style={{ textAlign: "justify", textAlignLast: "center" }}>
              {pageAyahs.map((loc) => {
                const [s, a] = loc.split(":");
                const startSurah = a === "1" ? Number(s) : null;
                const mk = marks?.get(loc);
                const d = ayahText.get(loc);
                return (
                  <Fragment key={loc}>
                    {startSurah != null && <SurahBand surah={startSurah} />}
                    {mk?.quarter && (
                      <div className="qcf-markband qcf-rub"><span>۞ {num(mk.quarter)}</span></div>
                    )}
                    {mk?.sajda && (
                      <div className="qcf-markband qcf-sajda"><span>۩ موضع سجدة</span></div>
                    )}
                    <span
                      className={`qcf-tajwid-ayah${playingAyah === loc ? " play" : ""}`}
                      role="button"
                      onClick={() => onAyah?.(loc)}
                    >
                      {tajwidSpans(d?.textUthmani ?? "").map((sp, i) =>
                        sp.rule ? (
                          <span key={i} className={TAJWID[sp.rule].cls} title={TAJWID[sp.rule].ar}>{sp.text}</span>
                        ) : (
                          <span key={i}>{sp.text}</span>
                        ),
                      )}
                      <span className="ayah-marker"> ﴿{num(a)}﴾</span>
                    </span>{" "}
                  </Fragment>
                );
              })}
            </div>
          )
        ) : !ready ? (
          <div className="muted" style={{ textAlign: "center", padding: 40 }}>…</div>
        ) : (
          lines.map((ln) => {
            const first = ln.words[0]?.key;
            const startSurah = first ? surahStartingAt(first) : null;
            const full = ln.words.length >= 4;
            // furniture: ۞ hizb/rub and ۩ sajda for ayahs that START on this line
            const lineMarks = marks
              ? ln.words
                  .filter((w) => w.key.split(":")[2] === "1")
                  .map((w) => ({ loc: w.ayah, mark: marks.get(w.ayah) }))
                  .filter((x): x is { loc: string; mark: MushafMark } => !!x.mark)
              : [];
            return (
              <div key={ln.line}>
                {startSurah != null && <SurahBand surah={startSurah} />}
                {lineMarks.map(({ loc, mark }) => (
                  <Fragment key={loc}>
                    {mark.quarter && (
                      <div className="qcf-markband qcf-rub">
                        <span>۞ {num(mark.quarter)}</span>
                      </div>
                    )}
                    {mark.sajda && (
                      <div className="qcf-markband qcf-sajda">
                        <span>۩ موضع سجدة</span>
                      </div>
                    )}
                  </Fragment>
                ))}
                <div className="qcf-line" style={{ justifyContent: full ? "space-between" : "center" }}>
                  {ln.words.map((w) => {
                    const sel = selectedWord === w.key;
                    const playing = playingAyah === w.ayah;
                    return (
                      <span
                        key={w.key}
                        className={`qcf-w${sel ? " sel" : ""}${playing ? " play" : ""}`}
                        style={{ fontFamily: `"${fam}"` }}
                        role="button"
                        title={w.ayah}
                        onClick={() => (w.end ? onAyah?.(w.ayah) : onWord?.(w.key))}
                      >
                        {w.code}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="page-no">{num(page)}</div>
    </section>
  );
}
