/**
 * معالم القرآن — computed landmarks & statistics of the Qur'an, straight from
 * our data: longest/shortest verses, the sajda verses, the verbatim-repeated
 * refrains, the muqaṭṭaʿāt openings, the rarest and commonest roots. Facts, not
 * opinion — «نحسب ونعرض». Route: /maalim.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { allAyahs, allRootsList, listSurahs, surahNameAr } from "../db";
import { ayahsCount, getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import type { AyahDoc, RootDoc, SurahDoc } from "../types";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;
// the 29 suras opened by the disconnected letters (a known, uncontroversial set)
const MUQATTA_SURAHS = [2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32, 36, 38, 40, 41, 42, 43, 44, 45, 46, 50, 68];
// the disconnected-letter opening ayahs — usually ayah 1, but الشورى (42) splits
// them across 42:1 «حم» and 42:2 «عسق», so exclude by exact ayah, not «ayahNo===1».
const MUQATTA_AYAHS = new Set([...MUQATTA_SURAHS.map((s) => `${s}:1`), "42:2"]);

/** a landmark card: a title, a one-line note, and a body (list / facts). */
function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="maalim-card">
      <h2 className="maalim-title">{title}</h2>
      {note && <p className="maalim-note muted">{note}</p>}
      {children}
    </section>
  );
}

/** a ranked list of verses with a numeric value each. The reference is written
 *  as an explicit verse citation («العصر · الآية ١») so a one-word verse is
 *  never misread as a one-word sura. */
function VerseList({ items, unit }: { items: { loc: string; v: number; text?: string }[]; unit: string }) {
  const ar = getUILang() === "ar";
  return (
    <ol className="maalim-list">
      {items.map(({ loc, v, text }) => {
        const [s, a] = loc.split(":");
        return (
          <li key={loc}>
            <Link to={readPathOf(loc)} className="maalim-ref">
              {surahNameAr(Number(s))}{" "}
              <span className="muted" style={{ fontWeight: 400 }}>{ar ? `· الآية ${num(a)}` : `· v.${a}`}</span>
            </Link>
            <span className="maalim-val">{ar ? `${unit} ${num(v)}` : `${num(v)} ${unit}`}</span>
            {text && <span className="maalim-vtext quran">{text}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function Maalim() {
  useUILang();
  const ar = getUILang() === "ar";
  const [ayahs, setAyahs] = useState<AyahDoc[] | null>(null);
  const [roots, setRoots] = useState<RootDoc[]>([]);
  const [surahs, setSurahs] = useState<SurahDoc[]>([]);

  useEffect(() => {
    allAyahs().then(setAyahs).catch(() => setAyahs([]));
    allRootsList().then(setRoots).catch(() => {});
    listSurahs().then(setSurahs).catch(() => {});
  }, []);

  const m = useMemo(() => {
    if (!ayahs || ayahs.length === 0) return null;
    const byWords = [...ayahs].sort((a, b) => b.wordCount - a.wordCount);
    const byLetters = [...ayahs].sort((a, b) => b.letterCount - a.letterCount);
    const sajda = ayahs.filter((a) => a.sajdaType).sort((a, b) => a.surahNo - b.surahNo || a.ayahNo - b.ayahNo);

    // verbatim-repeated verses: group by exact clean text, keep groups of ≥2
    const groups = new Map<string, AyahDoc[]>();
    for (const a of ayahs) {
      const key = (a.textClean || "").trim();
      if (key.length < 4) continue;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
    }
    const repeated = [...groups.values()]
      .filter((g) => g.length >= 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);

    return { byWords, byLetters, sajda, repeated };
  }, [ayahs]);

  const rootStats = useMemo(() => {
    if (!roots.length) return null;
    const sorted = [...roots].sort((a, b) => (b.occurrences ?? 0) - (a.occurrences ?? 0));
    const hapax = roots.filter((r) => (r.occurrences ?? 0) === 1);
    return { top: sorted.slice(0, 12), hapax };
  }, [roots]);

  const surahStats = useMemo(() => {
    if (!surahs.length) return null;
    const byAyat = [...surahs].sort((a, b) => b.ayahCount - a.ayahCount);
    const meccan = surahs.filter((s) => s.revelation === "Meccan").length;
    return { longest: byAyat.slice(0, 5), shortest: [...byAyat].reverse().slice(0, 5), meccan, medinan: surahs.length - meccan };
  }, [surahs]);

  const ayahByLoc = useMemo(() => {
    const map = new Map<string, AyahDoc>();
    for (const a of ayahs ?? []) map.set(`${a.surahNo}:${a.ayahNo}`, a);
    return map;
  }, [ayahs]);

  if (!m) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "معالم القرآن" : "Landmarks of the Qur'an"}</h1>
          <p className="jw-lead">
            {ar
              ? "حقائقُ محسوبةٌ من نصّ القرآن وبنيته — لا رأيَ فيها: أطولُ الآيات وأقصرُها، مواضعُ السجود، ما تكرّر بلفظه، فواتحُ السور، وأندرُ الجذور وأكثرُها. للباحث والمتدبّر."
              : "Computed facts about the Qur'an's text and structure — no opinion: the longest and shortest verses, the sajda verses, the verbatim refrains, the sura openings, the rarest and commonest roots."}
          </p>
        </header>

        <div className="maalim-grid">
          <Card title={ar ? "أطول الآيات" : "Longest verses"} note={ar ? "بعدد الكلمات" : "by word count"}>
            <VerseList items={m.byWords.slice(0, 6).map((a) => ({ loc: `${a.surahNo}:${a.ayahNo}`, v: a.wordCount }))} unit={ar ? "عدد الكلمات" : "words"} />
          </Card>

          <Card title={ar ? "أقصر الآيات" : "Shortest verses"} note={ar ? "بعدد الكلمات (عدا الحروف المقطّعة)" : "by word count (excl. the disconnected letters)"}>
            <VerseList
              items={m.byWords
                .filter((a) => !MUQATTA_AYAHS.has(`${a.surahNo}:${a.ayahNo}`))
                .slice(-6)
                .reverse()
                .map((a) => ({ loc: `${a.surahNo}:${a.ayahNo}`, v: a.wordCount, text: a.textUthmani }))}
              unit={ar ? "عدد الكلمات" : "words"}
            />
          </Card>

          <Card title={ar ? "آيات السجدة" : "Prostration verses"} note={ar ? `${num(m.sajda.length)} موضعًا يُسجَد عندها` : `${m.sajda.length} sajda verses`}>
            <ol className="maalim-list">
              {m.sajda.map((a) => (
                <li key={a.surahNo + ":" + a.ayahNo}>
                  <Link to={readPathOf(`${a.surahNo}:${a.ayahNo}`)} className="maalim-ref">{arName(`${a.surahNo}:${a.ayahNo}`)}</Link>
                  {/* the ۩ mark is in the mushaf itself (positional); the
                      عزيمة/مستحبّة distinction is external jurisprudence — omitted */}
                  <span className="maalim-val">{ar ? "۩ سجدة" : "۩ sajda"}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={ar ? "الآيات المكرّرة بلفظها" : "Verbatim-repeated verses"} note={ar ? "آيةٌ نصُّها نفسه في أكثر من موضع" : "identical text in ≥2 places"}>
            <ol className="maalim-list">
              {m.repeated.map((g) => (
                <li key={g[0].surahNo + ":" + g[0].ayahNo}>
                  <Link to={readPathOf(`${g[0].surahNo}:${g[0].ayahNo}`)} className="maalim-ref quran" style={{ fontSize: 17 }}>{g[0].textClean}</Link>
                  <span className="maalim-val">{num(g.length)}× · {surahNameAr(g[0].surahNo)}…</span>
                </li>
              ))}
            </ol>
          </Card>

          {surahStats && (
            <Card title={ar ? "أطول السور وأقصرها" : "Longest & shortest suras"} note={ar ? `${num(surahStats.meccan)} مكّية · ${num(surahStats.medinan)} مدنية` : `${surahStats.meccan} Meccan · ${surahStats.medinan} Medinan`}>
              <div className="maalim-two">
                <ol className="maalim-list">
                  {surahStats.longest.map((s) => (
                    <li key={s.surahNo}><Link to={`/read/${s.surahNo}`} className="maalim-ref">{s.nameAr}</Link><span className="maalim-val">{ayahsCount(s.ayahCount)}</span></li>
                  ))}
                </ol>
                <ol className="maalim-list">
                  {surahStats.shortest.map((s) => (
                    <li key={s.surahNo}><Link to={`/read/${s.surahNo}`} className="maalim-ref">{s.nameAr}</Link><span className="maalim-val">{ayahsCount(s.ayahCount)}</span></li>
                  ))}
                </ol>
              </div>
            </Card>
          )}

          <Card title={ar ? "الحروف المقطّعة" : "The disconnected letters"} note={ar ? `${num(MUQATTA_SURAHS.length)} سورةً تُفتَتح بها` : `${MUQATTA_SURAHS.length} suras open with them`}>
            <div className="maalim-muqatta">
              {MUQATTA_SURAHS.map((sn) => {
                const a = ayahByLoc.get(`${sn}:1`);
                return (
                  <Link key={sn} to={`/read/${sn}`} className="maalim-muq" title={surahNameAr(sn)}>
                    <span className="quran">{a?.textUthmani ?? "…"}</span>
                    <span className="muted">{surahNameAr(sn)}</span>
                  </Link>
                );
              })}
            </div>
          </Card>

          {rootStats && (
            <Card title={ar ? "أكثر الجذور ورودًا" : "Commonest roots"} note={ar ? "أعلى تكرارًا في القرآن" : "by occurrences"}>
              <div className="maalim-roots">
                {rootStats.top.map((r) => (
                  <Link key={r.root} to={`/roots/${encodeURIComponent(r.root)}`} className="chip">
                    <b className="quran">{r.root}</b> <span className="muted">{num(r.occurrences ?? 0)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {rootStats && (
            <Card title={ar ? "الجذور الفريدة" : "Hapax roots"} note={ar ? `${num(rootStats.hapax.length)} جذرًا لم يَرِد إلا مرّةً واحدة في القرآن كلّه` : `${rootStats.hapax.length} roots occurring exactly once`}>
              <div className="maalim-roots">
                {rootStats.hapax.slice(0, 40).map((r) => (
                  <Link key={r.root} to={`/roots/${encodeURIComponent(r.root)}`} className="chip"><b className="quran">{r.root}</b></Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
