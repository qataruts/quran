/**
 * الوجوه والنظائر (محسوبة) — candidate polysemous words. For each content-word,
 * its Qur'anic verses were split by meaning-embedding into two groups; the words
 * whose two groups are most distinct are the likeliest to carry two «وجوه».
 * This is a COMPUTED approximation (from semantic proximity, not from a
 * وجوه-ونظائر book) — shown openly; the reader judges. Data: wujuh.json.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import type { AyahDoc } from "../types";
import PageSearch from "../components/PageSearch";
import { fuzzyMatch } from "../lib/fuzzy";

interface WWord {
  lemma: string;
  root: string;
  n: number;
  score: number;
  faces: { n: number; verses: string[] }[];
}
interface WData {
  meta: { candidates: number; scanned: number; minVerses: number };
  words: WWord[];
}

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

function Face({ face, idx, texts }: { face: { n: number; verses: string[] }; idx: number; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  return (
    <div className="wj-face">
      <div className="wj-face-h">
        {ar ? `الوجه ${num(idx + 1)}` : `sense ${num(idx + 1)}`} <span className="muted">{num(face.n)} {ar ? "موضعًا" : "verses"}</span>
      </div>
      {face.verses.map((loc) => (
        <Link key={loc} to={readPathOf(loc)} className="jw-verse">
          <span className="jw-verse-ref">{arName(loc)}</span>
          <span className="jw-verse-text quran">{texts.get(loc)?.textClean ?? loc}</span>
        </Link>
      ))}
    </div>
  );
}

function WordCard({ w, texts }: { w: WWord; texts: Map<string, AyahDoc> }) {
  const [open, setOpen] = useState(false);
  const ar = getUILang() === "ar";
  return (
    <div className={`jw-card${open ? " open" : ""}`}>
      <button className="jw-cardhead" onClick={() => setOpen(!open)}>
        <span className="wj-word quran">{w.lemma}</span>
        <Link
          to={`/roots/${encodeURIComponent(w.root)}`}
          className="chip"
          onClick={(e) => e.stopPropagation()}
        >
          {ar ? "جذر" : "root"} <span className="quran">{w.root}</span>
        </Link>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="chip gold">{w.faces.length === 2 ? (ar ? "وجهان" : "2 senses") : `${num(w.faces.length)} ${ar ? "أوجه" : "senses"}`}</span>
        <span className="jw-deg">{num(w.n)} {ar ? "موضعًا" : "verses"}</span>
        <span className="jw-caret">{open ? "▾" : "◂"}</span>
      </button>
      {open && (
        <div className="wj-faces">
          {w.faces.map((f, i) => (
            <Face key={i} face={f} idx={i} texts={texts} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Wujuh() {
  useUILang();
  const [d, setD] = useState<WData | null>(null);
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const ar = getUILang() === "ar";

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}wujuh.json?v=${__DATA_VERSION__}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setD(j))
      .catch(() => {});
    ayahByLocationMap().then(setTexts);
  }, []);

  const [limit, setLimit] = useState(40);
  const [q, setQ] = useState("");
  const words = useMemo(() => (d?.words ?? []).filter((w) => fuzzyMatch(q, w.lemma, w.root)), [d, q]);
  useEffect(() => setLimit(40), [q]);

  if (!d) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الوجوه والنظائر" : "Polysemy (computed)"}</h1>
          <p className="jw-lead">
            {ar
              ? "الكلمةُ الواحدة قد تحمل في القرآن أكثرَ من وجهٍ في المعنى بحسب سياقها. نجمع مواضعَ كلِّ كلمةٍ ونقيس تقارُبها في المعنى بمتّجهات الآيات؛ فإذا انقسمت مواضعُها إلى مجموعتين متمايزتين، عرَضناها هنا احتمالًا لوجهين — استنباطًا من الاستعمال القرآنيّ نفسه، لا نقلًا عن كتب الوجوه والنظائر، مرتّبةً بحسب وضوح الانقسام."
              : "One word may carry more than one «sense» (wajh) across the Qur'an by its context. We gather each word's occurrences and measure their meaning-proximity with verse-vectors; where they split into two distinct groups, we show it here as a possible two senses — drawn from Qur'anic usage itself, not copied from a polysemy lexicon, ranked by how clear the split is."}
          </p>
          <div className="jw-stats">
            <span className="chip"><span className="ai-spark" aria-hidden /> {ar ? "محسوبٌ بالمعنى" : "meaning-computed"}</span>
            <span className="chip"><b>{num(d.meta.candidates)}</b> {ar ? "كلمةً لها وجهان محتمَلان" : "words with two senses"}</span>
            <span className="chip">{ar ? `من ${num(d.meta.scanned)} كلمةٍ كثيرةِ الورود` : `of ${num(d.meta.scanned)} frequent words`}</span>
          </div>
        </header>

        <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث بكلمةٍ أو جذر…" : "search by word or root…"} />

        <div className="jw-list">
          {words.slice(0, limit).map((w) => (
            <WordCard key={`${w.lemma}|${w.root}`} w={w} texts={texts} />
          ))}
        </div>
        {words.length > limit && (
          <div style={{ textAlign: "center", margin: "18px 0" }}>
            <button onClick={() => setLimit(limit + 40)}>
              {ar ? `عرض المزيد (${num(words.length - limit)})` : `show more (${words.length - limit})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
