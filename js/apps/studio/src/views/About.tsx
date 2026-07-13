/**
 * عن المشروع — the research front door. A written paper (aboutContent.ts, drafted
 * by a specialist writer + reviewer) is the spine: what مشكاة is, exactly how
 * embeddings/vectors/cosine measure meaning, exactly how the جامعية ميزان ranks
 * every āya, a tour of what's built on it, the other tools, and an honest closing.
 * Around that spine we keep the functional widgets: the data covenant, the
 * one-click Excel of the whole computed dataset, and the sources. Route: /about.
 */
import type { JSX } from "react";
import { getUILang, useUILang } from "../i18n";
import { ABOUT_SECTIONS } from "../aboutContent";

/** inline **bold** → <strong> */
function inline(text: string): JSX.Element[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

/** render a section body: \n\n paragraphs, "- " bullet lists, **bold** */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length && lines.every((l) => l.trim().startsWith("- "))) {
          return <ul key={bi} className="ab-prose-ul">{lines.map((l, li) => <li key={li}>{inline(l.trim().slice(2))}</li>)}</ul>;
        }
        return <p key={bi} className="ab-prose-p">{inline(lines.join(" "))}</p>;
      })}
    </>
  );
}

function Section({ id }: { id: string }) {
  const ar = getUILang() === "ar";
  const s = ABOUT_SECTIONS.find((x) => x.id === id);
  if (!s) return null;
  return (
    <section className="ab-prose">
      <h2 className="ab-h2 ab-section-h">{ar ? s.ar_heading : s.en_heading}</h2>
      <Prose text={ar ? s.ar_body : s.en_body} />
    </section>
  );
}

export default function About() {
  useUILang();
  const ar = getUILang() === "ar";
  const XLSX_URL = `${import.meta.env.BASE_URL}mishkat-dataset.xlsx`;

  const USE = ar
    ? ["نصّ القرآن الكريم (مصحف المدينة، رسم عثمان طه)", "ترجمات ومعاني الكلمات", "«المفردات» للراغب الأصفهاني و«مقاييس اللغة» لابن فارس", "الوسم الصرفيّ لمُدوّنة القرآن (QAC)", "إعرابٌ منشور محكَّم («المجتبى» — الخراط)", "الطباعة والرسم والفواصل"]
    : ["The Qur'anic text (Madina muṣḥaf)", "Word translations & glosses", "al-Rāghib's Mufradāt + Ibn Fāris's Maqāyīs", "The Quranic Arabic Corpus morphology", "One published, reviewed iʿrāb (al-Kharrāṭ)", "Typography, rasm & verse-endings"];
  const AVOID = ar
    ? ["تفسير", "حديث", "أسباب نزول", "قراءات", "ناسخ ومنسوخ"]
    : ["Tafsīr", "Ḥadīth", "Occasions of revelation", "Variant readings (qirāʾāt)", "Abrogation (naskh)"];

  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "عن المشروع" : "About the project"}</h1>
          <p className="jw-lead">
            {ar
              ? "«مشكاة» تجربةٌ في خدمة القرآن حاسوبيًّا: نستخرج من نصّ المصحف — بالذكاء الاصطناعيّ والحساب — شبكةً من المعاني والعلاقات، ونعرضها في يُسرٍ ووضوح، إعانةً للقارئ على التدبّر والبحث."
              : "Mishkāt is an experiment in serving the Qur'an computationally: from the mushaf's text — with AI and computation — we extract a graph of meanings and relations, presented with ease and clarity, to aid the reader's reflection and study."}
          </p>
        </header>

        {/* 1 — the research framing */}
        <Section id="mishkat-research" />

        {/* the data covenant — the bounds every layer is held to */}
        <div className="card ab-covenant-card">
          <h2 className="ab-h2">{ar ? "حدودٌ نلتزمها" : "The bounds we keep"}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {ar
              ? "منهجُنا أن نحسب من مصادرَ محدودةٍ معلومة، ونعرض ما حسبناه وحده. وما وراءها من علومٍ جليلةٍ نتركه لأهله ومظانّه:"
              : "Our method: compute from a fixed, known set of sources, and present only what we computed. The greater sciences beyond them we leave to their scholars:"}
          </p>
          <div className="ab-covenant">
            <div className="ab-col ab-use">
              <div className="ab-col-h">{ar ? "نحسب منه" : "We compute from"}</div>
              <ul>{USE.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div className="ab-col ab-avoid">
              <div className="ab-col-h">{ar ? "نتركه لأهله" : "Left to its scholars"}</div>
              <ul>{AVOID.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
          <p className="ab-covenant-note">
            {ar
              ? "وليس في هذا حكمٌ على تلك العلوم ولا استغناءٌ عنها — فالتفسيرُ والحديثُ وعلومُ القرآن أصلُ فهمِ الكتاب، ولها أهلُها الراسخون. وإنّما هو انضباطٌ في الأداة: نَقصُرها على ما يُحسَب ويُتحقَّق منه، ولا نُقحِمُ فيه رأيًا من عندنا؛ نعرض المحسوب مادّةً بين يدَي القارئ. فالمشروعُ رافدٌ، لا بديلٌ عن عالمٍ ولا عن كتاب."
              : "This is no judgment on those sciences, nor doing without them — tafsīr, ḥadīth and the Qur'anic sciences are the ground of understanding the Book, with their deeply-rooted scholars. It is a discipline of the tool: we keep it to what can be computed and verified, and we inject no opinion of our own — we present the computed as material in the reader's hands. The project is an aid, never a substitute for a scholar or a book."}
          </p>
        </div>

        {/* 2 — embeddings, vectors, cosine */}
        <Section id="embeddings-vectors" />

        {/* 3 — the جامعية ميزان, in full */}
        <Section id="jamiiyya-mizan" />

        {/* 4 — a tour of what's built on the measure */}
        <Section id="sections-on-mizan" />

        {/* 5 — the other instruments */}
        <Section id="other-tools" />

        {/* open data */}
        <div className="card ab-data">
          <h2 className="ab-h2">{ar ? "بياناتٌ مفتوحةٌ قابلةٌ للتحقّق" : "Open, verifiable data"}</h2>
          <p style={{ marginTop: 0 }}>
            {ar
              ? "لأنّ كلَّ شيءٍ محسوب، فكلُّ شيءٍ قابلٌ للفحص. حمِّل مجموعات البيانات المحسوبة كلَّها في ملفِّ Excel واحد: الجذور والمعجمان، والمترادفات، والحقول الدلالية، وفروق التنزيل، والأمثال، والصرف بالأرقام."
              : "Because everything is computed, everything is inspectable. Download all the computed datasets in one Excel file: roots, synonyms, semantic fields, furūq, parables, and the morphology census."}
          </p>
          <a className="ab-dl" href={XLSX_URL} download>
            <span aria-hidden>⬇</span> {ar ? "تنزيل البيانات (Excel · ٧ أوراق)" : "Download dataset (Excel · 7 sheets)"}
          </a>
        </div>

        {/* 6 — honest closing */}
        <Section id="closing" />

        <p className="muted" style={{ textAlign: "center", margin: "22px 0 8px", fontSize: 12.5, lineHeight: 1.9 }}>
          {ar
            ? "المصادر: نصّ مصحف المدينة وخطّ KFGQPC (مجمع الملك فهد) · «المفردات» للراغب و«مقاييس اللغة» لابن فارس · الوسم الصرفيّ QAC · «المجتبى من مشكل إعراب القرآن» للخراط · نماذج Gemini للمتّجهات والتوليد المقيَّد."
            : "Sources: Madina muṣḥaf text + KFGQPC font (King Fahd Complex) · al-Rāghib's Mufradāt & Ibn Fāris's Maqāyīs · QAC morphology · al-Kharrāṭ's iʿrāb · Gemini models for vectors & grounded generation."}
        </p>
      </div>
    </div>
  );
}
