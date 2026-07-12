/**
 * /api/chat — المُعين's planner. Given the conversation + the material this chat
 * has gathered, it returns a small STRUCTURED plan: a short reply to show, and
 * one action — retrieve (which local tool + query), compose, or none (answer from
 * the material). The tools run in the browser (free); this call is just routing,
 * so it stays cheap and tightly bounded to the Qur'an's own data.
 *
 * POST { messages:[{role,text}], material:{ayahs:[{ref,text}],roots:[{root}]} } -> plan
 */
import { guard } from "./_guard.js";

export const config = { runtime: "edge" };
const MODEL = process.env.CHAT_MODEL || "gemini-2.5-flash";

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    action: { type: "string", enum: ["search_meaning", "search_root", "root_info", "similar_roots", "compose", "search_compose", "none"] },
    query: { type: "string" },
    task: { type: "string", enum: ["khutba", "post", "lecture", "summary"] },
    subject: { type: "string" },
    length: { type: "string", enum: ["short", "medium", "long"] },
  },
  required: ["reply", "action"],
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
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-10) : [];
  if (!messages.length) return json({ error: "no messages" }, 400);
  const mat = body?.material || {};
  const ayahs = Array.isArray(mat.ayahs) ? mat.ayahs.slice(0, 14) : [];
  const roots = Array.isArray(mat.roots) ? mat.roots.slice(0, 12) : [];

  const materialText = ayahs.length || roots.length
    ? [
        ayahs.length ? "الآيات المجموعة: " + ayahs.map((a) => `[${String(a.ref ?? "").slice(0, 16)}] ${String(a.text ?? "").slice(0, 90)}`).join(" · ") : "",
        roots.length ? "الجذور المجموعة: " + roots.map((r) => String(r.root ?? "")).join("، ") : "",
      ].filter(Boolean).join("\n")
    : "لا شيء بعد.";

  const SYSTEM = `أنت «نِبراس» في تطبيق «مشكاة»: مساعدُ بحثٍ في القرآن للباحثين والطلاب والمعلّمين. لا تُفسِّر ولا تُفتي؛ تجمعُ من بيانات القرآن (نصّه، جذوره، معاني ألفاظه من المعجمين، والآيات القريبة معنًى) وترتّبها، ثم تُعين على الكتابة منها.

اختر إجراءً واحدًا (action):
- search_meaning: ابحث عن آياتٍ بالمعنى. اجعل query جملةً وصفيّةً غنيّةً تُوسّعُ المعنى المطلوب بمرادفاتِه ومعانيه القريبة (لا كلمةً مجرّدة)، مثال: «إغاثة الملهوف» → query: «إجابةُ دعاءِ المضطرّ وكشفُ الكربِ والسوء، ونصرةُ المظلوم، وإطعامُ الجائعِ وإيواءُ المحتاج، وتفريجُ الهمّ عن المكروب». كلّما كان الوصفُ أدقَّ وأشملَ كانتِ الآياتُ أنسب. هذا أكثرها استعمالًا.
- search_root: ابحث عن جذرٍ أو كلمة (query = الكلمة/الجذر).
- root_info: معنى جذرٍ ومشتقّاته ومواضعه (query = الجذر).
- similar_roots: الجذور القريبة معنًى (query = الجذر).
- compose: حين يطلب المستخدم صياغةً ممّا جُمِع سابقًا — املأ task و subject و length. حدِّدْ task بدقّةٍ بحسب طلبه: «مقال/مقالة/منشور/موضوع» → post، «خطبة/جمعة» → khutba، «محاضرة/درس» → lecture، «تلخيص/خلاصة» → summary. اجعل length=long للخطبةِ والمحاضرةِ والمقالِ المطوّل، وmedium للمنشورِ القصير، إلّا أن يطلبَ إيجازًا أو إطالةً صراحةً. وإن طلب توسيعَ المسوّدةِ السابقةِ أو تنقيحَها أو إضافةَ محورٍ إليها فاختَرْ compose أيضًا (سيُبنى على المسوّدة السابقة).
- search_compose: حين يطلبُ في رسالةٍ واحدةٍ أن تجمعَ آياتٍ في موضوعٍ ثمّ تكتبَ منها — املأ query (وصفًا غنيًّا للمعنى كما في search_meaning) وtask (بالتحديد نفسه أعلاه) وsubject وlength. يُبحَثُ أوّلًا ثمّ يُصاغُ من الآيات المُلتقَطة. آثِرْ هذا كلّما ذُكِرَ الجمعُ والكتابةُ معًا («اجمع آياتٍ عن كذا ثمّ اكتب…»، «هات آياتٍ في كذا واكتب منها مقالًا»).
- none: حين تُجيب من المادّة الحاضرة أو يكون الكلام عامًّا؛ ضَعِ الجواب في reply.

القيود: لا تُدخِل تفسيرًا بالرأي، ولا حديثًا، ولا حكمًا فقهيًّا، ولا معلومةً من خارج بيانات القرآن التي بين يديك. تعامَلْ مع القرآن بقدسيّة.

reply: جملةٌ عربيّةٌ قصيرةٌ تُعرَض للمستخدم (البيانات ستُعرَض تلقائيًّا تحتها، فلا تُكرّرها). عند compose اجعل reply تمهيدًا لطيفًا («إليك مسوّدةً تبني عليها…»).

المادّة الحاضرة في هذه المحادثة:
${materialText}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.text ?? "").slice(0, 1500) }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: PLAN_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) return json({ error: `upstream ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
  const data = await res.json();
  const raw = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || "").join("").trim();
  let plan;
  try { plan = JSON.parse(raw); } catch { plan = { reply: raw || "…", action: "none" }; }
  return json(plan);
}
