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
  khutba: "خطبةً منبريّةً كاملة، بأسلوبِ الخطابةِ ومخاطبةِ الحاضرين (كنداءِ «عبادَ اللهِ» و«أيّها المسلمون») تبدأُ بحمدِ اللهِ والثناءِ عليه: افتتاحٌ يُمهّد للموضوع، ثمّ محاورُ تُبنى على الآياتِ ويُستشهَدُ فيها بها نصًّا مع وقفاتٍ تدبّريّةٍ وعبرٍ ونظراتٍ نافعة، ثمّ خاتمةٌ جامعةٌ ووصايا ودعاء.",
  post: "مقالًا مكتوبًا مكتمِلًا متماسكًا، بأسلوبِ المقالةِ لا الخطبةِ المنبريّة — بلا نداءٍ («أيّها…») وبلا افتتاحِ خطبةٍ أو دعاءِ ختام: مقدّمةٌ تجذبُ القارئ، ثمّ محاورُ نثريّةٌ متماسكةٌ تجمعُ الآياتِ وتربطُ بينها وتُبرزُ معانيَ ألفاظها بنظرٍ متجدّدٍ مع الاستشهادِ بها نصًّا، ثمّ خاتمةٌ عمليّة.",
  lecture: "محاضرةً تعليميّةً كاملةً بمحاورَ معنونة، بأسلوبٍ شارحٍ يُخاطبُ المتعلّم: تمهيدٌ يبيّنُ أهمّيةَ الموضوع، ثمّ محاورُ مفصّلةٌ مبنيّةٌ على الآياتِ ومعاني ألفاظها مع الاستشهادِ بها وتدبّرِها من نواحٍ نافعة، وأمثلةٌ تطبيقيّةٌ من واقع الناس، فخلاصةٌ عمليّةٌ ونقاطُ مراجعة.",
  summary: "تلخيصًا واضحًا منظّمًا في محاورَ ونقاطٍ مركّزة، مستندًا إلى الآياتِ المعطاةِ ومعانيها مع الإشارةِ إلى مواضعها — بلا أسلوبِ خطبةٍ ولا وعظ.",
};
const LEN = {
  short: { g: "نصٌّ مكتمِلٌ موجز: فِقَرٌ قليلةٌ بمقدّمةٍ وخاتمة", max: 1500 },
  medium: { g: "نصٌّ مكتمِلٌ متوسّط: عدّةُ فِقَرٍ أو محاورَ بمقدّمةٍ وعرضٍ وخاتمةٍ عمليّة", max: 2800 },
  long: { g: "نصٌّ مبسوطٌ مكتمِل: محاورُ متعدّدةٌ معنونة، ووقفاتٌ تدبّريّة، ونظراتٌ جديدة، وتطبيقاتٌ عمليّة، بمقدّمةٍ وخاتمةٍ وافيتين", max: 4096 },
};

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
  const lenSpec = LEN[length];
  const ayahs = Array.isArray(body?.ayahs) ? body.ayahs.slice(0, 16) : [];
  const roots = Array.isArray(body?.roots) ? body.roots.slice(0, 12) : [];
  const instruction = String(body?.instruction ?? "").slice(0, 300).trim();
  const previous = String(body?.previous ?? "").slice(0, 4000).trim();
  if (!ayahs.length) return json({ error: "no material" }, 400);

  const material = [
    subject ? `الموضوع: ${subject}` : "",
    "الآيات (من المصحف):\n" + ayahs.map((a) => `• ﴿${String(a.text ?? "").slice(0, 340)}﴾ [${String(a.ref ?? "").slice(0, 28)}]`).join("\n"),
    roots.length ? "معاني بعض ألفاظها (من مفردات الراغب/مقاييس اللغة):\n" + roots.map((r) => `• ${String(r.root ?? "")}: ${String(r.gloss ?? "").slice(0, 220)}`).join("\n") : "",
  ].filter(Boolean).join("\n\n");

  const SYSTEM = `أنت «نِبراس» في تطبيق «مشكاة»: كاتبٌ بليغٌ متدبّرٌ يُعينُ الباحثَ والمعلّمَ والخطيب، فيصوغُ من مادّةٍ قرآنيّةٍ محسوبةٍ تُعطى لك نصًّا عاليَ الجودة، كاملًا قائمًا بذاته. لك الحرّيّةُ في الإبداعِ والبناءِ والنظر، والانضباطُ في المصدر.

مصدرُك وحدَه: آياتٌ من القرآن، ومعاني بعض ألفاظها من المعجمين (مفردات الراغب/مقاييس اللغة).

جوِّدِ المخرَجَ بأن:
- تستشهِدَ بالآيات المعطاة نصًّا داخل الكلام، محصورةً بين ﴿ ﴾ ومتبوعةً بموضعها هكذا [السورة الآية]، موظَّفةً في موضعها من الفكرة لا محشوّةً حشوًا.
- تتدبّرَ الآياتِ وتَربِطَ بينها وبين معاني ألفاظها، وتفتحَ نظراتٍ جديدةً نافعةً تنشأُ من تأمّلِ الألفاظِ وتناسُبِ الآيات (لا من خارجها).
- تُخاطِبَ القارئَ بأسلوبٍ حيٍّ بليغ، وتُنزِّلَ المعانيَ على واقعِه بأمثلةٍ عمليّة، وتَختِمَ بما ينفعُه عملًا.

وانضبِطْ بأن:
- لا تُدخِلَ حديثًا، ولا سببَ نزول، ولا حكمًا فقهيًّا أو فتوى، ولا خبرًا أو معلومةً من خارج المادّة، ولا تنسُبَ تفسيرًا إلى عالمٍ بعينه.
- تجعلَ التدبّرَ والنظرَ بصيغةِ التأمّلِ والاحتمال (كـ«لعلّ» و«من معانيها» و«ومن اللطائف») لا بصيغةِ القطعِ بأنّ هذا مرادُ اللهِ يقينًا.
- تتعامَلَ مع نصّ القرآن بأدبٍ وقدسيّة، وتقتبِسَه بدقّةٍ دون بترٍ يُخلّ بظاهرِ معناه.

التزِمِ السجلَّ المناسبَ للقالبِ المطلوبِ تمامًا: المقالُ نثرٌ مكتوبٌ للقارئِ (بلا نداءٍ منبريٍّ ولا افتتاحِ خطبةٍ)، والخطبةُ خطابٌ للحاضرين، والمحاضرةُ شرحٌ للمتعلّم؛ فلا تُخرِجْ مقالًا في ثوبِ خطبة.

هذه مسوّدةٌ يبني عليها الباحثُ ويُراجعها، ليست تفسيرًا معتمَدًا ولا فتوى. ابدأْ مباشرةً بالنصّ بلا تصديرٍ ولا مقدّماتٍ عن نفسك. الطولُ والبناء: ${lenSpec.g}.`;

  const refine = previous && instruction
    ? `\n\nلديك مسوّدةٌ سابقةٌ في هذه المحادثة، والمطلوبُ الآن تطويرُها وفقَ طلب المستخدم: «${instruction}». احتفِظْ بجيّدِها وابنِ عليها (وسِّعْها أو نقِّحْها أو أضِفْ ما طُلب) من المادّةِ نفسِها، ولا تبدأْ من الصفر.\n\nالمسوّدةُ السابقة:\n${previous}`
    : "";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `اكتب ${TASK[task]}\n\nالموضوع: ${subject || "(يُستخلَص من الآيات)"}\n\nاعتمِدْ على هذه المادّةِ وحدَها، واستشهِدْ بآياتها نصًّا:\n\n${material}${refine}` }] }],
        generationConfig: { temperature: 0.85, topP: 0.95, maxOutputTokens: lenSpec.max, thinkingConfig: { thinkingBudget: 2048 } },
      }),
    },
  );
  if (!res.ok) return json({ error: `upstream ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || "").join("").trim();
  if (!text) return json({ error: "empty response" }, 502);
  return json({ text });
}
