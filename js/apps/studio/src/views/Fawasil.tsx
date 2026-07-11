/**
 * أطلس الفواصل — the map of the Qur'an's verse-endings (rhyme). The روي is the
 * last letter of an ayah's final word; this atlas shows its distribution across
 * the whole Qur'an, the commonest endings, and each surah's dominant rhyme with
 * how uniform it is — all computed from the text alone. Data: fawasil.json.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getUILang, num, t, useUILang } from "../i18n";

interface Fawasil {
  meta: { ayahs: number; letters: number };
  letters: { letter: string; count: number; pct: number }[];
  endings: { end: string; count: number }[];
  surahs: { no: number; name: string; dom: string; domPct: number; ayahs: number }[];
}

export default function Fawasil() {
  useUILang();
  const [d, setD] = useState<Fawasil | null>(null);
  const ar = getUILang() === "ar";

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}fawasil.json?v=${__DATA_VERSION__}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setD(j))
      .catch(() => {});
  }, []);

  if (!d) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  const maxPct = d.letters[0]?.pct ?? 1;
  const tier = (pct: number) => (pct >= 90 ? " hi" : pct >= 60 ? " mid" : "");

  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "أطلس الفواصل" : "Atlas of the verse-endings"}</h1>
          <p className="jw-lead">
            {ar
              ? "فاصلةُ الآية خاتمتُها، ورَويُّها آخِرُ حرفٍ فيها. هذه خريطةُ قوافي القرآن محسوبةً من النصّ وحده — قرابةُ نصفِ آياته تنتهي بالنون (ون/ين)، وبعضُ السور قافيةٌ واحدة تمامًا."
              : "A verse's ending is its close; its روي is its final letter. This maps the Qur'an's rhyme from the text alone — nearly half its verses end in nūn (-ūn / -īn), and some surahs keep one rhyme throughout."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(d.meta.ayahs)}</b> {ar ? "فاصلة" : "endings"}</span>
            <span className="chip"><b>{num(d.meta.letters)}</b> {ar ? "رَويًّا" : "rhyme letters"}</span>
          </div>
        </header>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="fw-h">{ar ? "الرَّويّ عبر القرآن" : "rhyme letter across the Qur'an"}</div>
          <div className="fw-bars">
            {d.letters.slice(0, 12).map((l) => (
              <div key={l.letter} className="fw-bar-row">
                <span className="fw-let quran">{l.letter}</span>
                <div className="fw-bar">
                  <div className="fw-bar-fill" style={{ width: `${(l.pct / maxPct) * 100}%` }} />
                </div>
                <span className="fw-pct">{num(l.pct)}٪</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="fw-h">{ar ? "أكثر الخواتيم" : "commonest endings"}</div>
          <div className="jw-chipset" style={{ marginTop: 8 }}>
            {d.endings.map((e) => (
              <span key={e.end} className="chip">
                <span className="quran">«{e.end}»</span> <span className="muted">{num(e.count)}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="fw-h">
            {ar ? "فاصلةُ كل سورة" : "each surah's rhyme"}{" "}
            <span className="muted" style={{ fontWeight: 400 }}>· {ar ? "كثافةُ اللون = انتظامُ القافية" : "colour = rhyme uniformity"}</span>
          </div>
          <div className="fw-grid">
            {d.surahs.map((s) => (
              <Link
                key={s.no}
                to={`/read/${s.no}`}
                className={`fw-cell${tier(s.domPct)}`}
                title={`${s.name} · ${ar ? "الغالب" : "dominant"} «${s.dom}» ${s.domPct}٪`}
              >
                <span className="fw-cell-name">{s.name}</span>
                <span className="fw-cell-dom quran">{s.dom}</span>
                <span className="fw-cell-pct">{num(s.domPct)}٪</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
