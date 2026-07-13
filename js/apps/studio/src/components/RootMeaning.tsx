/**
 * RootMeaning — shows what our DB knows about a selected word's root, right in
 * the word sheet: the classical معجم gloss (Mufradāt / Maqāyīs), how often the
 * root occurs, and its derived lemmas. Within-method (Arabic lexicons only).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRoot } from "../db";
import type { RootDoc } from "../types";
import { getUILang, num, t, useUILang } from "../i18n";

export default function RootMeaning({ root }: { root: string }) {
  useUILang();
  const [doc, setDoc] = useState<RootDoc | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setOpen(false);
    setDoc(null);
    getRoot(root).then((d) => live && setDoc(d));
    return () => {
      live = false;
    };
  }, [root]);

  if (!doc) return null;
  const ar = getUILang() === "ar";
  const meaning = doc.meanings?.[0];
  const isLong = (meaning?.text.length ?? 0) > 220;

  return (
    <div className="card rootmeaning">
      <div className="rootmeaning-head">
        <span className="muted">{t("roots.meanings")}</span>
        <Link to={`/roots/${encodeURIComponent(root)}`} className="chip link">
          {t("morph.root")} <b className="quran" style={{ fontSize: 15 }}>{root}</b>
        </Link>
      </div>

      {meaning ? (
        <>
          <div
            dir="rtl"
            className="rootmeaning-text"
            style={
              isLong && !open
                ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }
                : undefined
            }
          >
            {meaning.text}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span className="muted" style={{ fontSize: 11 }}>{meaning.title}</span>
            {isLong && (
              <button
                className="chip link"
                style={{ border: "none", fontSize: 11, padding: "1px 8px" }}
                onClick={() => setOpen(!open)}
              >
                {open ? (ar ? "اطوِ ▴" : "less ▴") : ar ? "المزيد ▾" : "more ▾"}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12.5 }}>
          {ar ? "لا يوجد شرح معجمي لهذا الجذر" : "no lexicon entry for this root"}
        </div>
      )}

      <div className="rootmeaning-meta muted">
        {ar ? "ورد" : "occurs"} <b>{num(doc.occurrences)}</b> {ar ? "مرة" : "×"}
        {doc.lemmas.length > 0 && (
          <> · {num(doc.lemmas.length)} {ar ? "مشتقات" : "derived forms"}</>
        )}
      </div>
      {doc.lemmas.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
          {doc.lemmas.slice(0, 6).map((l) => (
            <span key={l.lemma} className="chip">
              <b className="quran" style={{ fontSize: 15 }}>{l.lemma}</b>
              <span className="muted"> {num(l.occurrences)}</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <Link to={`/khayt?q=${encodeURIComponent(root)}`} className="chip link" style={{ textDecoration: "none" }}>
          {ar ? "تتبَّعْ هذا اللفظَ عبر المصحف ←" : "trace across the mushaf →"}
        </Link>
        <Link to={`/roots/${encodeURIComponent(root)}`} className="chip link" style={{ textDecoration: "none" }}>
          {ar ? "صفحةُ الجذر ←" : "root page →"}
        </Link>
      </div>
    </div>
  );
}
