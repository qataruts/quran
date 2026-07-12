/**
 * الصرف والنحو والرسم بالأرقام — the Qur'an counted: word classes, verb forms,
 * tense/voice/mood, إعراب, definiteness, function words, and letter frequency —
 * every figure computed from the Qur'anic Arabic Corpus morphology we ship
 * (data/quran-morphology.txt → public/morph-stats.json). نحصي ونعرض، لا نؤوّل.
 * Route: /sarf.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getUILang, num, useUILang } from "../i18n";

interface Row { k?: string | number; n: number; ar?: string; en?: string }
interface MorphStats {
  meta: { segments: number; words: number; verbs: number; roots: number; lemmas: number; letters: number; source: string };
  classes: Row[]; verbForms: Row[]; tense: Row[]; voice: Row[]; mood: Row[];
  case: Row[]; definite: Row[]; functionWords: Row[]; letters: Row[];
}

function Bars({ rows, quran = false, accent = "var(--accent)" }: { rows: Row[]; quran?: boolean; accent?: string }) {
  const ar = getUILang() === "ar";
  const max = Math.max(...rows.map((r) => r.n), 1);
  const total = rows.reduce((s, r) => s + r.n, 0) || 1;
  return (
    <div className="ms-bars">
      {rows.map((r, i) => (
        <div key={i} className="ms-bar">
          <span className={`ms-bar-lbl${quran ? " quran" : ""}`}>{quran ? r.ar ?? String(r.k) : ar ? r.ar : r.en ?? r.ar}</span>
          <span className="ms-bar-track">
            <span className="ms-bar-fill" style={{ width: `${(r.n / max) * 100}%`, background: accent }} />
          </span>
          <span className="ms-bar-n">
            {num(r.n)} <span className="ms-pct">{Math.round((r.n / total) * 100)}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`card ms-section${wide ? " ms-wide" : ""}`}>
      <h3 className="ms-title">{title}</h3>
      {note && <p className="muted ms-note">{note}</p>}
      {children}
    </div>
  );
}

export default function Sarf() {
  useUILang();
  const ar = getUILang() === "ar";
  const [s, setS] = useState<MorphStats | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}morph-stats.json?v=${__DATA_VERSION__}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => {});
  }, []);

  if (!s) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{ar ? "جارٍ التحميل…" : "Loading…"}</div>
      </div>
    );
  }

  const m = s.meta;
  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الصرف والنحو بالأرقام" : "The Qur'an, counted"}</h1>
          <p className="jw-lead">
            {ar
              ? "إحصاءٌ صرفيٌّ ونحويٌّ ورسميٌّ للقرآن كلِّه، محسوبٌ من الوسم الصرفيّ لمُدوّنة القرآن (QAC) الذي نعتمده — لا تأويل ولا زيادة، أرقامٌ فحسب. نحصي ونعرض."
              : "A morphological, syntactic and orthographic census of the whole Qur'an, computed from the Quranic Arabic Corpus morphology we ship — no interpretation, just figures."}
          </p>
          <div className="jw-stats">
            <span className="chip"><b>{num(m.words)}</b> {ar ? "كلمة" : "words"}</span>
            <span className="chip"><b>{num(m.segments)}</b> {ar ? "مقطعًا صرفيًّا" : "segments"}</span>
            <span className="chip"><b>{num(m.roots)}</b> {ar ? "جذرًا" : "roots"}</span>
            <span className="chip"><b>{num(m.lemmas)}</b> {ar ? "صيغة" : "lemmas"}</span>
          </div>
        </header>

        <div className="ms-grid">
          <Section title={ar ? "أقسام الكلمة" : "Word classes"} note={ar ? "الأصول (بلا سوابق ولا لواحق)" : "stems only"}>
            <Bars rows={s.classes} accent="var(--accent)" />
          </Section>

          <Section title={ar ? "زمن الفعل" : "Verb tense"} note={ar ? `من ${num(m.verbs)} فعلًا` : `of ${num(m.verbs)} verbs`}>
            <Bars rows={s.tense} accent="var(--gold)" />
          </Section>

          <Section title={ar ? "بناء الفعل" : "Verb voice"}>
            <Bars rows={s.voice} accent="var(--gold)" />
          </Section>

          <Section title={ar ? "جهة المضارع (الإعراب)" : "Mood"}>
            <Bars rows={s.mood} accent="var(--gold)" />
          </Section>

          <Section title={ar ? "الإعراب (الحالة)" : "Case"} note={ar ? "على الأسماء" : "on nominals"}>
            <Bars rows={s.case} accent="var(--accent)" />
          </Section>

          <Section title={ar ? "المعرفة والنكرة" : "Definiteness"}>
            <Bars rows={s.definite} accent="var(--accent)" />
          </Section>

          <Section title={ar ? "الأفعال بالأوزان" : "Verb forms"} wide note={ar ? "الأوزان العشرة — عددُ الأفعال في كلٍّ" : "the ten forms"}>
            <Bars rows={s.verbForms} quran accent="var(--gold)" />
          </Section>

          <Section title={ar ? "الأدوات والوظائف" : "Function words"} wide>
            <Bars rows={s.functionWords} accent="var(--accent)" />
          </Section>

          <Section title={ar ? "رسمُ الحروف بالأرقام" : "Letter frequency"} wide note={ar ? `${num(m.letters)} حرفًا — بلا حركات` : `${num(m.letters)} letters`}>
            <Bars rows={s.letters} quran accent="var(--accent)" />
          </Section>
        </div>

        <p className="muted" style={{ textAlign: "center", margin: "20px 0 6px", fontSize: 12.5 }}>{m.source}</p>
      </div>
    </div>
  );
}
