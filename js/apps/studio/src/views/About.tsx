/**
 * عن المشروع — the research front door: what مشكاة is, the data covenant it holds
 * itself to, how each layer is computed, exactly how AI is (and isn't) used, the
 * sources, and a one-click download of the whole computed dataset as Excel.
 * Route: /about.
 */
import { getUILang, num, useUILang } from "../i18n";

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

  const AUDIENCE = ar
    ? [
        ["طالبُ العلم والباحث", "بياناتٌ محسوبةٌ قابلةٌ للتحقّق — جذورٌ وفروقٌ وإحصاءٌ صرفيّ — مع تصديرٍ كامل."],
        ["الدارسُ للّغة", "الفروق اللغوية والمترادفات والمعجم والصرف بالأرقام في مكانٍ واحد."],
        ["القارئُ المتدبّر", "مصحفٌ نظيفٌ للقراءة، والآياتُ المتشابهة، وإعانةٌ على التدبّر بأدواتٍ محسوبة."],
        ["المطوّر وصانعُ المحتوى", "بياناتٌ مفتوحةٌ جاهزةٌ للبناء عليها أو الاقتباس منها."],
      ]
    : [
        ["Students & researchers", "Computed, verifiable datasets — roots, furūq, morphology — with a full export."],
        ["Language scholars", "Lexical distinctions, synonyms, the dictionary and morphology-by-numbers in one place."],
        ["Reflective readers", "A clean reader, the similar verses, and a computed aid to reflection."],
        ["Developers & creators", "Open data, ready to build on or cite."],
      ];

  const METHODS = ar
    ? [
        ["المحكمات والجوامع", "نلتقط من القرآن جُمَلَه المُحكَمة، ثم نبني شبكةً من توارُدها — أيُّ المعاني يجتمع مع أيّ في الآيات — فتنتظم في هرمٍ من القاعدة التفصيلية إلى الأصول الجامعة الكبرى، كلُّه بالإحصاء بلا ترتيبٍ مسبق."],
        ["فروق التنزيل", "نُحاذي آليًّا بين كلِّ آيتين متشابهتين لفظًا بخوارزمية محاذاة النصوص، فتظهر مواضعُ الاختلاف كلمةً كلمة: إبدالًا وتقديمًا وزيادةً وإيجازًا."],
        ["الفروق اللغوية والمترادفات", "نُحوّل تعريفَ كلِّ جذرٍ في المعجمين إلى «متّجهٍ» رقميّ يمثّل معناه، ثم نقيس القُربَ بينها: فأقربُها متّجهًا أقربُها معنًى (مترادفات)، وعناقيدُها المتبادلة حقولٌ دلالية — والقارئ يوازن الفرق بنفسه."],
        ["مثلها (الآيات القريبة)", "بالطريقة نفسها نُمثّل كلَّ آيةٍ بمتّجه معنى، فنكشف أقربَ الآيات إليها دلالةً عبر المصحف كلِّه — ترتيبٌ بحسب القُرب، لا تأويلٌ للمعنى."],
        ["الصرف والنحو بالأرقام", "نمرُّ على ١٣٠٬٠٣٠ مقطعًا صرفيًّا في الوسم القرآنيّ (QAC) ونُحصي كلَّ سِمة: قسمَ الكلمة، ووزنَ الفعل وزمنَه، وحالتَه الإعرابية — فيخرج إحصاءٌ للقرآن كلِّه."],
        ["مساعد التدبّر", "نجمع ما حسبناه عن الآية — إعرابَها وجذورَها ومعانيها وجيرانها — ونعرضه على نموذج توليدٍ بتوجيهٍ صارمٍ يمنعه من تجاوز هذه المادّة أو ادّعاء التفسير."],
      ]
    : [
        ["Muḥkamāt & principles", "We lift the Qur'an's decisive statements, then build a network of their co-occurrence — which meanings gather with which — so they settle into a pyramid from detail up to the great governing principles, by counting alone, with no prior ordering."],
        ["Furūq al-tanzīl", "We align every pair of near-identical verses with a sequence-alignment algorithm, surfacing each difference word by word: substitution, reordering, addition and concision."],
        ["Lexical distinctions & synonyms", "We turn each root's lexicon definition into a numeric meaning-vector, then measure closeness: nearest by vector = nearest by meaning (synonyms), and mutual clusters are semantic fields — the reader weighs the difference."],
        ["Similar verses", "The same way, each verse becomes a meaning-vector, revealing its closest āyāt across the whole muṣḥaf — ranked by nearness, not interpreted."],
        ["Morphology by the numbers", "We walk all 130,030 segments of the QAC morphology and tally every feature: word class, verb form and tense, grammatical case — a census of the whole Qur'an."],
        ["Reflection assistant", "We gather what we computed about a verse — its iʿrāb, roots, glosses and neighbours — and give it to a generation model under a strict instruction that forbids going beyond this material or claiming to be tafsīr."],
      ];

  return (
    <div className="page">
      <div className="fr-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "عن المشروع" : "About the project"}</h1>
          <p className="jw-lead">
            {ar
              ? "«مشكاة» تجربةٌ في خدمة القرآن حاسوبيًّا: نستخرج من نصّ المصحف — بالذكاء الاصطناعيّ والحساب — شبكةً من المعاني والعلاقات، ونعرضها بسطًا يسيرًا. مبدؤنا واحد: نحسب ونعرض، والقارئ يحكم."
              : "Mishkāt is an experiment in serving the Qur'an computationally: from the mushaf's text — with AI and computation — we extract a graph of meanings and relations, presented simply. One principle: we compute and present; the reader judges."}
          </p>
        </header>

        {/* purpose + audience */}
        <div className="card ab-purpose">
          <h2 className="ab-h2">{ar ? "الغاية" : "The aim"}</h2>
          <p style={{ marginTop: 0 }}>
            {ar
              ? "أن نفتح بنيةَ القرآن الداخلية للعين: كيف تتشابك آياتُه وجذورُه ومعانيه في نسيجٍ واحدٍ يُقلَّب بيسرٍ وأمانة. ليست الغايةُ تفسيرًا نُنشئه، بل عدسةٌ حاسوبيةٌ على النصّ نفسه تُعين على التأمّل والبحث، ويبقى الحكمُ للقارئ."
              : "To open the Qur'an's inner structure to the eye: how its verses, roots and meanings interlace into one fabric, turned over easily and faithfully. The aim is not an interpretation we author, but a computational lens on the text itself that aids reflection and research — and the judgment stays with the reader."}
          </p>
          <h3 className="ab-h3">{ar ? "لمن؟" : "For whom?"}</h3>
          <div className="ab-who">
            {AUDIENCE.map(([who, what]) => (
              <div key={who} className="ab-who-item"><b>{who}</b><span>{what}</span></div>
            ))}
          </div>
        </div>

        {/* the data covenant */}
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
              ? "وليس في هذا حكمٌ على تلك العلوم ولا استغناءٌ عنها — فالتفسيرُ والحديثُ وعلومُ القرآن أصلُ فهمِ الكتاب، ولها أهلُها الراسخون. وإنّما هو انضباطٌ في الأداة: نَقصُرها على ما يُحسَب ويُتحقَّق منه، ولا نُقحِمُ فيه رأيًا من عندنا — نعرض المحسوب، والحكمُ للقارئ. فالمشروعُ رافدٌ بين يدَيه، لا بديلٌ عن عالمٍ ولا عن كتاب."
              : "This is no judgment on those sciences, nor doing without them — tafsīr, ḥadīth and the Qur'anic sciences are the ground of understanding the Book, with their deeply-rooted scholars. It is a discipline of the tool: we keep it to what can be computed and verified, and we inject no opinion of our own — we present the computed, and the reader judges. The project is an aid in the reader's hands, never a substitute for a scholar or a book."}
          </p>
        </div>

        {/* how the project was built */}
        <h2 className="ab-h2 ab-section-h">{ar ? "كيف أُنجز المشروع" : "How the project was built"}</h2>
        <p className="muted ab-build-intro">
          {ar
            ? "بدأنا من نصّ المصحف والوسم الصرفيّ (QAC) ومعجمَي الراغب وابن فارس. ثمّ سخّرنا الذكاء الاصطناعيّ لقراءة النصّ واستخراج طبقاته البنيوية، وحسبنا الإحصاءات من الوسم الصرفيّ، ومثّلنا الآيات والكلمات بمتّجهات المعنى للمقارنة، وبنينا فوق ذلك أدواتِ القراءة والتدبّر. وتفصيلُ كلِّ طبقةٍ وكيف أُنجزت فيما يلي:"
            : "We began from the mushaf's text, the QAC morphology, and the lexica of al-Rāghib and Ibn Fāris. Then we set AI to read the text and extract its structural layers, computed the statistics from the morphology, represented verses and words as meaning-vectors for comparison, and built the reading and reflection tools on top. Each layer and how it was made follows:"}
        </p>
        <div className="ab-methods">
          {METHODS.map(([t, d]) => (
            <div key={t} className="card ab-method">
              <div className="ab-method-t">{t}</div>
              <div className="ab-method-d">{d}</div>
            </div>
          ))}
        </div>

        {/* AI transparency */}
        <div className="card ab-ai">
          <h2 className="ab-h2"><span className="ai-spark" aria-hidden /> {ar ? "الذكاء الاصطناعي في المشروع" : "AI in the project"}</h2>
          <p>
            {ar
              ? "الذكاءُ الاصطناعيّ أداةٌ رئيسةٌ في مشكاة لا ثانويّة، وكلُّ استعمالٍ له واضحٌ مُبيَّن:"
              : "AI is a primary tool in Mishkāt, not a secondary one, and every use of it is clear and stated:"}
          </p>
          <ul className="ab-ai-list">
            <li>
              <b>{ar ? "استخراجُ الطبقات من النصّ:" : "Extracting the layers from the text:"}</b>{" "}
              {ar
                ? "به قرأنا نصَّ المصحف واستخرجنا منه بنيتَه — المحكمات والتفصيل والجوامع، والمواضيع، والأمثال، والفروق، وسواها — تنظيمًا لكلمات القرآن لا إضافةً عليها."
                : "with it we read the mushaf's text and drew out its structure — the muḥkamāt, tafṣīl and principles, the topics, parables, furūq and more — organizing the Qur'an's own words, adding nothing to them."}
            </li>
            <li>
              <b>{ar ? "متّجهات المعنى (embeddings):" : "Meaning-vectors (embeddings):"}</b>{" "}
              {ar
                ? "لقياس تقارُب الآيات («مثلها») والكلمات المترادفة («الفروق اللغوية») — ترتيبٌ بالقُرب، لا إنشاءُ نصّ."
                : "to measure the closeness of verses (similar āyāt) and synonym words — ranking by nearness, writing no text."}
            </li>
            <li>
              <b>{ar ? "مساعد التدبّر (توليد مقيَّد):" : "Reflection assistant (grounded generation):"}</b>{" "}
              {ar
                ? "يُغذَّى بما حسبناه عن الآية وحده، بتوجيهٍ صارمٍ يمنعه من تجاوزه أو ادّعاء التفسير."
                : "fed only what we computed about the verse, under a strict instruction that forbids exceeding it or claiming to be tafsīr."}
            </li>
          </ul>
          <p className="ab-ai-ground">
            {ar
              ? "ومادّتُه في ذلك كلِّه نصُّ القرآن ومعانيه ومعاجمُه — على ما تقدّم في «حدودٍ نلتزمها». ثمّ نعرض ما استخرج ليراجعه القارئ على المصحف؛ نحسب ونعرض، والقارئ يحكم."
              : "In all of it, its material is the Qur'anic text, its meanings and its lexica — within the bounds set out above. Then we present what it drew out for the reader to check against the mushaf; we compute and present, and the reader judges."}
          </p>
        </div>

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

        <p className="muted" style={{ textAlign: "center", margin: "22px 0 8px", fontSize: 12.5, lineHeight: 1.9 }}>
          {ar
            ? "المصادر: نصّ مصحف المدينة وخطّ KFGQPC (مجمع الملك فهد) · «المفردات» للراغب و«مقاييس اللغة» لابن فارس · الوسم الصرفيّ QAC · «المجتبى من مشكل إعراب القرآن» للخراط · نماذج Gemini للمتّجهات والتوليد المقيَّد."
            : "Sources: Madina muṣḥaf text + KFGQPC font (King Fahd Complex) · al-Rāghib's Mufradāt & Ibn Fāris's Maqāyīs · QAC morphology · al-Kharrāṭ's iʿrāb · Gemini models for vectors & grounded generation."}
        </p>
      </div>
    </div>
  );
}
