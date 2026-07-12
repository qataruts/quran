/**
 * /api/tadabbur — «مساعد التدبّر». A STRICTLY-GROUNDED reflection helper: Gemini
 * is given ONLY our own material for the verse (the آية, its translation, its
 * إعراب from al-Khaṭṭāb's al-Mujtabā, and the verses closest to it in meaning)
 * and is forbidden from adding outside knowledge, tafsir-by-opinion, asbāb,
 * hadith or rulings. It organises what's in front of it and asks reflective
 * questions — «إعانةٌ على التدبّر، لا تفسير». Key stays server-side.
 *
 * POST { verse, ref, translation?, eraab?, neighbors?: string[] } -> { text }
 * Set GEMINI_API_KEY (and optionally TADABBUR_MODEL) in Vercel env.
 */
export const config = { runtime: "edge" };

const MODEL = process.env.TADABBUR_MODEL || "gemini-2.5-flash";

const SYSTEM = `أنت مُعينٌ على تدبّر القرآن ضمن مادّةٍ محدَّدةٍ تُعطى لك، ولستَ مفسِّرًا.

اعمل حصرًا على ما يُقدَّم إليك: نصّ الآية، وترجمتها إن وُجدت، وإعرابها المذكور، والآيات القريبة منها معنًى المذكورة — لا تُدخِل أيَّ معرفةٍ من خارج هذه المادّة.

ممنوعٌ منعًا باتًّا: التفسيرُ بالرأي، والقطعُ بمعنًى لم يَرِد، والاختلاقُ أو الإتيان بآياتٍ أو معلوماتٍ ليست في المادّة، وذكرُ أسباب النزول أو الأحكام الفقهيّة أو الأحاديث أو الإسرائيليّات أو الخلافات.

المسموح: تنظيمُ ما بين يديك في تأمّلٍ هادئ، وربطُ الآية بالآيات القريبة منها المذكورة، ولفتُ النظر إلى بناء الجملة من إعرابها ودلالته الظاهرة، وطرحُ أسئلةٍ تفتح التدبّر.

الأسلوب: عربيّةٌ رصينةٌ موجزة (٣–٤ فقراتٍ قصيرة أو نقاط)، متواضعة، لا تَقطع بما ليس في النصّ، وابدأ بلا تصدير. لا تختم بأسئلةٍ عامّة إنشائيّة؛ اجعل الخاتمة لفتةً موجزةً نافعةً مستخلَصةً من المادّة نفسها. لا تدّعِ أن هذا تفسير.`;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: "GEMINI_API_KEY not configured" }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const verse = String(body?.verse ?? "").trim();
  if (!verse) return json({ error: "verse required" }, 400);
  const ref = String(body?.ref ?? "").slice(0, 40);
  const translation = String(body?.translation ?? "").slice(0, 600);
  const eraab = String(body?.eraab ?? "").slice(0, 800);
  const neighbors = Array.isArray(body?.neighbors) ? body.neighbors.slice(0, 4).map((n) => String(n).slice(0, 220)) : [];
  const roots = Array.isArray(body?.roots) ? body.roots.slice(0, 4).map((r) => String(r).slice(0, 200)) : [];

  const ctx = [
    `الآية${ref ? ` (${ref})` : ""}: ${verse}`,
    translation ? `ترجمتها (صحيح إنترناشونال): ${translation}` : "",
    eraab ? `إعرابها (المجتبى من مشكل إعراب القرآن — الخراط): ${eraab}` : "",
    roots.length ? `معاني جذور كلماتها (من مفردات الراغب ومقاييس اللغة):\n${roots.map((r) => `• ${r}`).join("\n")}` : "",
    neighbors.length ? `آياتٌ قريبةٌ منها معنًى (محسوبةٌ بالتضمينات):\n${neighbors.map((n) => `• ${n}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `تدبَّرْ هذه الآية معتمدًا على ما يلي فقط:\n\n${ctx}` }] }],
        generationConfig: { temperature: 0.6, topP: 0.9, maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  );
  if (!res.ok) return json({ error: `upstream ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || "").join("").trim();
  if (!text) return json({ error: "empty response" }, 502);
  return json({ text });
}
