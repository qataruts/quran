/**
 * /api/compose — المُعين's writing step. Given ONLY the material a chat has
 * gathered (verses from the Qur'an + the computed lexical/structural data on
 * them), it drafts a خطبة / منشور / محاضرة / تلخيص about the subject. It is a
 * grounded DRAFT for a researcher/teacher/khatib to build on — never a finished
 * authoritative text, and never tafsir, hadith, rulings, or outside knowledge.
 *
 * POST { task, subject, ayahs:[{ref,text}], roots?:[{root,gloss}], length? } -> { text }
 */
import { guard } from "./_guard.js";

export const config = { runtime: "edge" };
const MODEL = process.env.COMPOSE_MODEL || "gemini-2.5-flash";

const TASK = {
  khutba: "مسوّدةَ خطبةٍ منظّمة: افتتاحٌ موجز يُمهّد للموضوع، ثم عرضُ الآيات المعطاة مرتَّبةً حوله مع الربط بينها والإفادة من معاني ألفاظها المذكورة، ثم وقفاتٌ تدبّرية مستخلَصة من الآيات نفسها، وخاتمةٌ جامعة.",
  post: "منشورًا موجزًا (فقرة أو فقرتين) يجمع الآيات المعطاة حول الموضوع ببلاغةٍ ووضوح، معتمدًا على معاني ألفاظها المذكورة.",
  lecture: "مسوّدةَ محاضرةٍ منظّمة بعناوينَ فرعية: تمهيدٌ، ثم محاورُ مبنيّةٌ على الآيات المعطاة ومعاني ألفاظها، فخلاصة.",
  summary: "تلخيصًا واضحًا للمادة المعطاة حول الموضوع في نقاط، مستندًا إلى الآيات ومعانيها.",
};
const LEN = { short: "موجزٌ جدًّا", medium: "متوسّط الطول", long: "مبسوطٌ بعض الشيء" };

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const blocked = guard(req);
  if (blocked) return blocked;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "GEMINI_API_KEY not configured" }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const task = String(body?.task ?? "post");
  if (!TASK[task]) return json({ error: "unknown task" }, 400);
  const subject = String(body?.subject ?? "").slice(0, 200).trim();
  const length = LEN[body?.length] ? body.length : "medium";
  const ayahs = Array.isArray(body?.ayahs) ? body.ayahs.slice(0, 14) : [];
  const roots = Array.isArray(body?.roots) ? body.roots.slice(0, 12) : [];
  if (!ayahs.length) return json({ error: "no material" }, 400);

  const material = [
    subject ? `الموضوع: ${subject}` : "",
    "الآيات (من المصحف):\n" + ayahs.map((a) => `• ﴿${String(a.text ?? "").slice(0, 320)}﴾ [${String(a.ref ?? "").slice(0, 16)}]`).join("\n"),
    roots.length ? "معاني بعض ألفاظها (من مفردات الراغب/مقاييس اللغة):\n" + roots.map((r) => `• ${String(r.root ?? "")}: ${String(r.gloss ?? "").slice(0, 200)}`).join("\n") : "",
  ].filter(Boolean).join("\n\n");

  const SYSTEM = `أنت مُعينٌ للباحث والمعلّم والخطيب داخل تطبيق «مشكاة»، تُنشئ مسوّداتٍ من مادّةٍ قرآنيّةٍ محسوبةٍ تُعطى لك، ولستَ مفسِّرًا ولا مُفتِيًا.

المادّة التي بين يديك: آياتٌ من القرآن، ومعاني بعض ألفاظها من المعجمين (الراغب/مقاييس). اعمل عليها وحدها.

ممنوعٌ منعًا باتًّا: إدخالُ تفسيرٍ بالرأي، أو حديثٍ، أو سبب نزول، أو حكمٍ فقهيٍّ أو فتوى، أو معلومةٍ من خارج المادّة، أو القطعُ بمعنًى لم يَرِد فيها، أو نسبةُ قولٍ إلى أحد.

المسموح: ترتيبُ الآيات المعطاة حول الموضوع، والربطُ بينها، والإفادةُ من معاني ألفاظها المذكورة، وصياغةٌ عربيّةٌ فصيحةٌ بليغة بحسب القالب المطلوب. تعامَلْ مع نصّ القرآن بأدبٍ وقدسيّة، ولا تَقتطِعْه اقتطاعًا يُخلّ بمعناه الظاهر.

هذه **مسوّدةٌ محسوبة** يبني عليها الباحثُ بنفسه ويُراجعها، لا نصٌّ نهائيٌّ مُعتمَد. ابدأ مباشرةً بالمسوّدة بلا تصدير، وبأسلوبٍ ${LEN[length]}. لا تدّعِ أنّ هذا تفسيرٌ أو خطبةٌ جاهزةٌ للإلقاء دون مراجعة.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `اكتب ${TASK[task]}\n\nاعتمِدْ على هذه المادّة فقط:\n\n${material}` }] }],
        generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 1400, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );
  if (!res.ok) return json({ error: `upstream ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || "").join("").trim();
  if (!text) return json({ error: "empty response" }, 502);
  return json({ text });
}
