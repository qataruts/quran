/**
 * /api/assist — نِبراس المحاوِر: حلقةُ أدواتٍ محادثية (agentic tool-use loop).
 *
 * بخلاف /api/chat (مخطِّطُ إجراءٍ واحد)، هذه النقطة نموذجُ محادثةٍ كامل يمسك
 * تاريخَ الحوار وبين يديه أدواتُ مشكاة، يستدعيها بنفسه متى شاء وكم شاء داخل
 * الرد الواحد (بحث بالمعنى، جذور، تفاسير مسندة، أسباب نزول، كتب، تأليف مسودة)
 * ثم يجيب بحرية صياغةٍ — مقيَّدًا في الوقائع بما استرجعته الأدوات حصرًا.
 *
 * التنفيذ الفعلي للأدوات يجري في المتصفح (بياناتُ مشكاة محليةٌ هناك ومجانية)؛
 * فالنقطة عديمةُ الحالة: العميل يعيد النداء بنتائج الأدوات حتى يخرج نصٌّ نهائي.
 *
 * POST { messages:[{role,text}], steps:[{name,args,result}] }
 *   → { calls:[{name,args}] }  (يريد أدوات — نفّذها وأعد النداء)
 *   → { text }                 (الجواب النهائي)
 */
import { guard } from "./_guard.js";

export const config = { runtime: "edge" };
const MODEL = process.env.ASSIST_MODEL || "gemini-2.5-flash";

const TOOLS = [
  {
    name: "search_meaning",
    description:
      "البحث عن آياتٍ بالمعنى في القرآن كله. اجعل query جملةً وصفيةً غنيةً تُوسّع المعنى بمرادفاته ومعانيه القريبة (لا كلمةً مجردة). هذه أكثر الأدوات استعمالًا — استعملها قبل أي جوابٍ معرفي.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "وصفٌ غنيٌّ للمعنى المطلوب" },
        k: { type: "integer", description: "عدد الآيات (الافتراضي 8، الأقصى 14)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_root",
    description: "جذرٌ أو كلمةٌ قرآنية: معناها من المفردات والمقاييس، ومشتقاتها، ومواضعها، والجذور القريبة منها.",
    parameters: {
      type: "object",
      properties: { word: { type: "string", description: "الجذر أو الكلمة" } },
      required: ["word"],
    },
  },
  {
    name: "tafsir_of",
    description: "أقوال التفاسير المسندة (الميسر، المختصر، السعدي، الجلالين…) لموضعٍ واحد. ref بصيغة «رقم_السورة:رقم_الآية» مثل 2:255.",
    parameters: {
      type: "object",
      properties: { ref: { type: "string", description: "الموضع مثل 2:255" } },
      required: ["ref"],
    },
  },
  {
    name: "asbab_of",
    description: "ما ورد في كتب أسباب النزول المسندة (الواحدي، المحرَّر) لموضعٍ واحد. ref مثل 2:255.",
    parameters: {
      type: "object",
      properties: { ref: { type: "string", description: "الموضع مثل 2:255" } },
      required: ["ref"],
    },
  },
  {
    name: "search_books",
    description: "بحثٌ بالمعنى داخل نصوص الكتب المسندة المضمّنة (تفاسير، غريب، معاجم، أسباب نزول) — يُرجع مقاطعَ بأسماء مصادرها.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "وصف المطلوب" } },
      required: ["query"],
    },
  },
  {
    name: "context_of",
    description:
      "مقطعُ السياق الحاوي لآيةٍ ما (من طبقة التفصيل الموضوعي: ١٢٨١ مقطعًا متصلًا): مداه وموضوعُه ونصُّه كاملًا. استعمله بعد العثور على آيةٍ لتقرأ سياقها التام قبل الجواب — السياق يوضّح المعنى. ref مثل 18:65.",
    parameters: {
      type: "object",
      properties: { ref: { type: "string", description: "الموضع مثل 18:65" } },
      required: ["ref"],
    },
  },
  {
    name: "search_passages",
    description:
      "بحثٌ بالمعنى في مقاطع السياق الكاملة (لا آياتٍ مفردة) — الأنسب للقصص والمشاهد والمقاطع الحكمية: «قصة موسى والخضر» تعيد المقطعَ كلَّه. اجعل query وصفًا غنيًّا.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "وصفٌ غنيٌّ للمطلوب" },
        k: { type: "integer", description: "عدد المقاطع (الافتراضي 4، الأقصى 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "compose_draft",
    description:
      "تأليف مسودةٍ كاملةٍ (خطبة/مقالة/محاضرة/تلخيص) من المادة المجموعة في هذه المحادثة، وتُعرض للمستخدم تلقائيًّا في صندوقٍ مستقل. استعملها للطلبات الإنشائية الطويلة بعد جمع مادةٍ كافية (ابحث أولًا إن لم تُجمع). لا تُعِد كتابة نص المسودة في جوابك — قدّم لها بجملةٍ فقط.",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", enum: ["khutba", "post", "lecture", "summary"], description: "خطبة=khutba · مقالة/منشور=post · محاضرة/درس=lecture · تلخيص=summary" },
        subject: { type: "string", description: "موضوع المسودة" },
        length: { type: "string", enum: ["short", "medium", "long"] },
      },
      required: ["task", "subject"],
    },
  },
];

const SYSTEM = `أنت «نِبراس» — مساعدُ بحثٍ خبيرٌ في القرآن الكريم ولغتِه داخل تطبيق «مشكاة»، يخاطب الباحثين والمختصين وطلاب العلم والمعلمين.

## طبيعتك
حاوِر بطبيعيةٍ كاملة: أجب عن الأسئلة، ورتّب الأفكار، واقترح المخططات والمحاور، وناقش، ولخّص، وقارن، واكتب البحوث والأوراق — بأريحيةٍ في الأسلوب والتنظيم. أنت حرٌّ في الصياغة، مقيَّدٌ في الوقائع.

## القاعدة الذهبية (لا استثناء لها)
نصُّ الآية لا يُكتب في جوابك إلا منقولًا حرفيًّا من نتيجة أداةٍ في هذه المحادثة. لا تكتب آيةً من ذاكرتك أبدًا — ولو كنت واثقًا. إن أردت الاستشهاد بآيةٍ لم تسترجعها بعد، ابحث عنها أولًا.

## قواعد الوقائع
- كل دعوى عن معنى آيةٍ أو قول مفسِّرٍ أو سبب نزولٍ أو معنى لفظٍ: مصدرها نتائجُ الأدوات حصرًا، وتُنسب («في التفسير الميسر…»، «قال السعدي…»، «عند ابن فارس…»). ما لم تجده قل صراحةً: «لم أجد في بياناتي».
- الإحالة إلى الآيات باسم السورة ورقم الآية كما وردت في النتائج.
- لا فتوى ولا ترجيحَ في مسائل الخلاف: تعرض الأقوال نقلًا بأصحابها وتحيل إلى أهل العلم.
- لا حديثَ نبويًّا من ذاكرتك؛ إن ورد حديثٌ داخل نص مصدرٍ مسترجَع فانسبه إلى ذلك المصدر.
- معلوماتك العامة (تاريخ، أعلام، علوم) تستعملها للفهم والتنظيم لا لتقرير وقائعَ دينيةٍ غير مسترجَعة.

## الأدوات
- ابحث قبل كل جوابٍ معرفي، ويجوز لك تعددُ النداءات في الرد الواحد (ابحث، اقرأ، ثم ابحث أدق).
- اجعل query في search_meaning وصفًا غنيًّا: «إغاثة الملهوف» → «إجابة دعاء المضطر وكشف الكرب ونصرة المظلوم وإطعام الجائع وتفريج الهم».
- السياقُ مفتاح المعنى: للقصص والمشاهد والمقاطع استعمل search_passages (يعيد المقطع كاملًا)؛ وإذا وجدت آيةً مدارَ الجواب فاقرأ سياقها بـcontext_of قبل أن تبني عليها.
- للمتابعة على مادةٍ حاضرةٍ في المحادثة أو لسؤالٍ تنظيميٍّ محض، أجب مباشرةً بلا أدوات.
- compose_draft للطلبات الإنشائية الطويلة؛ وبعدها قدّم بجملةٍ ولا تكرر نص المسودة.

## الأسلوب
- عربيةٌ فصيحةٌ واضحة بلا تكلف. فقراتٌ قصيرة؛ النقاط بعلامة «•»؛ العناوين سطرٌ مستقلٌّ بلا وسوم (لا تستعمل # أو **).
- اقتباساتك الحرفية من الآيات والمصادر بين علامتي «».
- تعامل مع النص القرآني بتوقيرٍ تام: لا تصدر حكمًا على آية؛ الفحص والنقد يقعان على عملنا واقتراحاتنا فقط.
- أعلن حدودك بلا اعتذارٍ مسرف، واقترح البديل («أجد كذا — أتريد أن أبحث في كذا؟»).`;

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
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-14) : [];
  if (!messages.length) return json({ error: "no messages" }, 400);
  const steps = Array.isArray(body?.steps) ? body.steps.slice(0, 10) : [];

  // تاريخ الحوار ثم — إن وُجدت خطواتُ أدواتٍ في هذا الدور — أدوارُ النداء/النتيجة
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.text ?? "").slice(0, 4000) }],
  }));
  for (const s of steps) {
    contents.push({ role: "model", parts: [{ functionCall: { name: s.name, args: s.args ?? {} } }] });
    contents.push({ role: "user", parts: [{ functionResponse: { name: s.name, response: { result: s.result ?? null } } }] });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        tools: [{ functionDeclarations: TOOLS }],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 2600,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!res.ok) return json({ error: `upstream ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args ?? {} }));
  if (calls.length) return json({ calls });
  const text = parts.map((p) => p.text || "").join("").trim();
  return json({ text: text || "…" });
}
