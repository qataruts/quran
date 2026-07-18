/**
 * التفاسير — browse & search the browser's cited reference books (تفاسير · غريب ·
 * إعراب · قراءات). Verse-anchored, lazy-loaded, clearly attributed — these are
 * quoted SOURCES, kept wholly separate from مشكاة's computed layers. Two levels:
 *   /tafasir       → the books, grouped by genre
 *   /tafasir/:id   → one book: pick a سورة (or search its text) → entries by ref
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { booksByGenre, bookById, loadBookEntries, GENRE_LABELS, type BookEntry } from "../books";
import { ensureLayers } from "../layers";
import { surahNameAr } from "../db";
import { readPathOf } from "../types";
import PageSearch from "../components/PageSearch";
import { getUILang, num, t, useUILang } from "../i18n";

const SURAHS = Array.from({ length: 114 }, (_, i) => i + 1);
const refLabel = (e: BookEntry) =>
  e.refEnd && e.refEnd !== e.ref
    ? `${surahNameAr(Number(e.ref.split(":")[0]))} ${num(Number(e.ref.split(":")[1]))}–${num(Number(e.refEnd.split(":")[1]))}`
    : `${surahNameAr(Number(e.ref.split(":")[0]))} ${num(Number(e.ref.split(":")[1]))}`;

/* ---------- level 0: the books ---------- */
function BookList() {
  const ar = getUILang() === "ar";
  // القائمة تُعاد بعد اكتمال المانيفست كي تظهر الكتب المضافة قيودَ بيانات
  const [groups, setGroups] = useState(() => booksByGenre());
  useEffect(() => { void ensureLayers().then(() => setGroups(booksByGenre())); }, []);
  return (
    <>
      <header className="mw-head">
        <h1 className="mw-title">{ar ? "التفاسير والمصادر" : "Tafsir & sources"}</h1>
        <p className="mw-lead">
          {ar
            ? "مكتبةٌ مرجعيّةٌ مقتبسة: تفاسيرُ ميسّرة، وكتبُ غريبٍ وإعرابٍ وقراءات — مُرتَّبةٌ على الآيات. تُنسَبُ لأصحابها وتُعرَضُ كما هي، منفصلةً تمامًا عن طبقات مشكاة المحسوبة."
            : "A cited reference library: concise tafsirs, plus غريب, إعراب and qirāʾāt — verse-anchored. Attributed to their authors and shown as-is, kept wholly separate from مشكاة's computed layers."}
        </p>
      </header>
      {groups.map((g) => (
        <section key={g.genre} className="tf-genre">
          <h2 className="tf-genre-h">{g.label}</h2>
          <div className="mw-topics">
            {g.books.map((b) => (
              <Link key={b.id} to={`/tafasir/${b.id}`} className="mw-topic-card">
                <span className="mw-topic-name">{b.label}</span>
                {b.author && <span className="mw-topic-count">{b.author}</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/* ---------- level 1: one book → entries by سورة / search ---------- */
function BookView({ id }: { id: string }) {
  const ar = getUILang() === "ar";
  const book = bookById(id);
  const [entries, setEntries] = useState<BookEntry[] | null>(null);
  const [surah, setSurah] = useState(1);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    setEntries(null);
    loadBookEntries(id).then((e) => live && setEntries(e));
    return () => { live = false; };
  }, [id]);

  const shown = useMemo(() => {
    if (!entries) return [];
    const query = q.trim();
    if (query) return entries.filter((e) => e.text.includes(query)).slice(0, 200);
    return entries.filter((e) => Number(e.ref.split(":")[0]) === surah);
  }, [entries, surah, q]);

  if (!book) return <p className="muted">{t("notFound")}</p>;
  return (
    <>
      <nav className="mw-crumb" aria-label="مسار">
        <Link to="/tafasir">{ar ? "التفاسير" : "Tafsir"}</Link>
        <span className="mw-sep">›</span>
        <span className="mw-here">{book.label}</span>
      </nav>
      <header className="mw-head">
        <h1 className="mw-title">{book.label}</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          {book.author ? `${book.author} · ` : ""}{GENRE_LABELS[book.genre]} · {ar ? "مصدرٌ مقتبس" : "cited source"}
        </div>
      </header>
      <div className="tf-controls">
        <select className="tf-surah" value={surah} onChange={(e) => setSurah(Number(e.target.value))} aria-label={ar ? "السورة" : "surah"} disabled={!!q.trim()}>
          {SURAHS.map((s) => (
            <option key={s} value={s}>{num(s)} · {surahNameAr(s)}</option>
          ))}
        </select>
        <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث في نصّ الكتاب…" : "search the book's text…"} />
      </div>
      {entries === null ? (
        <div className="muted" style={{ padding: 24, textAlign: "center" }}>{t("loading")}</div>
      ) : shown.length === 0 ? (
        <div className="muted" style={{ padding: 24, textAlign: "center" }}>{ar ? "لا شيء هنا." : "Nothing here."}</div>
      ) : (
        <div className="tafsir-panel">
          {q.trim() && <div className="muted" style={{ fontSize: 12.5 }}>{ar ? `${num(shown.length)} نتيجة${shown.length >= 200 ? "+" : ""}` : `${shown.length} results`}</div>}
          {shown.map((e) => (
            <div key={e.ref} className="tafsir-entry">
              <div className="tafsir-src"><Link to={readPathOf(e.ref)} style={{ textDecoration: "none" }}>◆ {refLabel(e)}</Link></div>
              <div className="tafsir-text">{e.text}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Tafasir() {
  useUILang();
  const { id } = useParams<{ id?: string }>();
  const ar = getUILang() === "ar";
  return (
    <div className="page">
      <div className="mw-wrap">
        {id && (
          <Link to="/tafasir" className="mw-back" title={ar ? "كل الكتب" : "all books"}>
            <span aria-hidden="true">{ar ? "→" : "←"}</span> {ar ? "رجوع" : "Back"}
          </Link>
        )}
        {id ? <BookView id={id} /> : <BookList />}
      </div>
    </div>
  );
}
