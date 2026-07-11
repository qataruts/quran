/**
 * معجم القرآن — a browsable dictionary of the Qur'an's roots, showing the FULL
 * classical entries we carry: «المفردات في غريب القرآن» للراغب الأصفهاني و«مقاييس
 * اللغة» لابن فارس — نصُّها كما هو، بلا تفسير. Search any word (fuzzy, by letters)
 * or browse by letter. Route: /mujam and /mujam/:root.
 *
 * (The root page shows usage + one clipped line; this is where the full lexical
 * text lives — «نعرض نصَّ المعجم، والقارئ يقرأ».)
 */
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { fuzzyRoots, getRoot, rootsWithMeanings, searchRoots } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { RootDoc } from "../types";

// hamza/alif variants folded into ا; ى→ي, ة→ه — so a root files under its letter
const foldLetter = (c: string) =>
  c.replace(/[ءأإآٱ]/, "ا").replace(/ى/, "ي").replace(/ة/, "ه");
const LETTERS = [
  "ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض",
  "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي",
];
const firstLetter = (root: string) => foldLetter(root[0] ?? "");
const snip = (text: string, n = 96) => (text.length > n ? `${text.slice(0, n)}…` : text);

/* ------------------------------------------------------------------------ */
/* Index                                                                     */
/* ------------------------------------------------------------------------ */

function MujamIndex() {
  useUILang();
  const ar = getUILang() === "ar";
  const [all, setAll] = useState<RootDoc[] | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RootDoc[] | null>(null);
  const [letter, setLetter] = useState("ا");

  useEffect(() => {
    rootsWithMeanings().then(setAll).catch(() => setAll([]));
  }, []);

  // letters that actually have entries
  const byLetter = useMemo(() => {
    const m = new Map<string, RootDoc[]>();
    for (const r of all ?? []) {
      const l = firstLetter(r.root);
      (m.get(l) ?? m.set(l, []).get(l)!).push(r);
    }
    return m;
  }, [all]);

  // search: prefix + fuzzy (by letters), then keep only roots that have an entry
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits(null); return; }
    let alive = true;
    Promise.all([
      searchRoots(q, 40).catch(() => [] as RootDoc[]),
      fuzzyRoots(q, 40).catch(() => [] as { doc: RootDoc; dist: number }[]),
    ]).then(([pfx, fz]) => {
      if (!alive) return;
      const seen = new Set<string>();
      const out: RootDoc[] = [];
      for (const r of pfx) if (r.meanings?.length && !seen.has(r.root)) { seen.add(r.root); out.push(r); }
      for (const f of fz) if (f.doc.meanings?.length && !seen.has(f.doc.root)) { seen.add(f.doc.root); out.push(f.doc); }
      setHits(out);
    }).catch(() => alive && setHits([]));
    return () => { alive = false; };
  }, [query]);

  const shown = query.trim() ? (hits ?? []) : (byLetter.get(letter) ?? []);

  if (!all) {
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
          <h1 className="jw-title">{ar ? "معجم القرآن" : "Dictionary of the Qur'an"}</h1>
          <p className="jw-lead">
            {ar
              ? "معاني جذور القرآن من «المفردات في غريب القرآن» للراغب الأصفهاني و«مقاييس اللغة» لابن فارس — نصُّها كاملًا كما هو، بلا تفسير. ابحث عن أيّ كلمة أو تصفّح بالحرف."
              : "The meanings of the Qur'an's roots from al-Rāghib's Mufradāt and Ibn Fāris's Maqāyīs — the full classical text, verbatim. Search any word or browse by letter."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(all.length)}</b> {ar ? "جذرًا مشروحًا" : "roots"}</span>
            <span className="chip">{ar ? "مصدران" : "2 sources"}</span>
          </div>
        </header>

        <input
          type="text"
          dir="rtl"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder={ar ? "ابحث عن كلمة أو جذر…" : "search a word or root…"}
          style={{ width: "100%", fontFamily: "var(--font-quran)", marginBottom: 12 }}
        />

        {!query.trim() && (
          <div className="mj-letters">
            {LETTERS.map((l) => {
              const has = byLetter.has(l);
              return (
                <button
                  key={l}
                  className={`mj-letter${l === letter ? " active" : ""}`}
                  disabled={!has}
                  onClick={() => setLetter(l)}
                >
                  {l}
                </button>
              );
            })}
          </div>
        )}

        {query.trim() && hits == null ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>{t("loading")}</div>
        ) : shown.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>{t("notFound")}</div>
        ) : (
          <div className="mj-list">
            {shown.map((r) => (
              <Link key={r._id} to={`/mujam/${encodeURIComponent(r.root)}`} className="mj-entry">
                <span className="mj-root quran">{r.root}</span>
                <span className="mj-snip" dir="rtl">{snip(r.meanings![0].text)}</span>
                <span className="mj-occ">{num(r.occurrences)}×</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Entry                                                                     */
/* ------------------------------------------------------------------------ */

function MujamEntry({ root }: { root: string }) {
  useUILang();
  const ar = getUILang() === "ar";
  const [doc, setDoc] = useState<RootDoc | null | undefined>(undefined);
  useEffect(() => {
    getRoot(root).then(setDoc).catch(() => setDoc(null));
  }, [root]);

  if (doc === undefined) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="muted" style={{ marginBottom: 10 }}>
          <Link to="/mujam">{ar ? "معجم القرآن" : "Dictionary"}</Link> / {ar ? "مدخل" : "entry"}
        </div>

        {doc === null ? (
          <div className="card">
            {t("notFound")} — <span className="quran" style={{ fontSize: 22 }}>{root}</span>
          </div>
        ) : (
          <>
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span className="quran" style={{ fontSize: 44, lineHeight: 1.25, color: "var(--accent)" }}>{doc.root}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="chip">{num(doc.occurrences)} {ar ? "مرّة" : "×"}</span>
                <Link to={`/roots/${encodeURIComponent(doc.root)}`} className="chip link" style={{ textDecoration: "none" }}>
                  {ar ? "مواضعه في القرآن ←" : "usage ←"}
                </Link>
                <Link to={`/fabric/${encodeURIComponent(doc.root)}`} className="chip link" style={{ textDecoration: "none" }}>
                  {ar ? "النسيج ←" : "fabric ←"}
                </Link>
              </div>
            </div>

            {doc.lemmas.length > 0 && (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{ar ? "المشتقات الواردة" : "derived lemmas"}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {doc.lemmas.map((l) => (
                    <Link key={l.lemma} to={`/roots/${encodeURIComponent(doc.root)}`} className="chip" style={{ textDecoration: "none" }}>
                      <span className="quran" style={{ fontSize: 17, lineHeight: 1.3 }}>{l.lemma}</span>
                      <span className="muted"> ({num(l.occurrences)})</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {doc.meanings && doc.meanings.length > 0 ? (
              doc.meanings.map((m) => (
                <div key={m.key} className="card mj-entry-card">
                  <h2 className="mj-src-title">{m.title}</h2>
                  <div className="mj-text" dir="rtl">{m.text}</div>
                </div>
              ))
            ) : (
              <div className="card" style={{ marginTop: 14 }}>
                <p className="muted">{ar ? "لا يوجد شرحٌ لهذا الجذر في المصدرين." : "No entry for this root in the two sources."}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export default function Mujam() {
  const params = useParams<{ root?: string }>();
  if (!params.root) return <MujamIndex />;
  const root = decodeURIComponent(params.root);
  return <MujamEntry key={root} root={root} />;
}
