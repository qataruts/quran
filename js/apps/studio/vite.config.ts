import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import fs from "node:fs";

/** Short content hash of the app database + data sidecars — busts the data
 *  cache on redeploy, so re-exporting neighbours/إعراب/أمثال is picked up too. */
function dataVersion(): string {
  const h = createHash("sha1");
  let any = false;
  for (const p of ["./public/quran-app.db", "../../../quran-app.db", "../../../quran-app.db.gz"]) {
    const abs = resolve(__dirname, p);
    if (fs.existsSync(abs)) {
      h.update(fs.readFileSync(abs));
      any = true;
      break;
    }
  }
  for (const p of ["./public/quran-neighbors.bin", "./public/eraab.json", "./public/amthal.json"]) {
    const abs = resolve(__dirname, p);
    if (fs.existsSync(abs)) {
      h.update(fs.readFileSync(abs));
      any = true;
    }
  }
  return any ? h.digest("hex").slice(0, 10) : "dev";
}

/**
 * Dev-only /api/embed — mirrors api/embed.js (the Vercel Edge function) so
 * Meaning search works locally with zero setup. Reads GEMINI_API_KEY from the
 * repo root .env; the key never leaves the dev server process.
 */
function devEmbedApi(): Plugin {
  const MODEL = "gemini-embedding-001";
  const DIM = 768;
  const envKey = (): string | undefined => {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
      const env = fs.readFileSync(resolve(__dirname, "../../../.env"), "utf-8");
      return env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
    } catch {
      return undefined;
    }
  };
  return {
    name: "dev-embed-api",
    configureServer(server) {
      server.middlewares.use("/api/embed", (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          const send = (status: number, body: unknown) => {
            res.statusCode = status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(body));
          };
          if (req.method !== "POST") return send(405, { error: "POST only" });
          const key = envKey();
          if (!key) return send(500, { error: "GEMINI_API_KEY not found in .env" });
          let text = "";
          try {
            text = String(JSON.parse(Buffer.concat(chunks).toString()).text ?? "").trim();
          } catch {
            /* fall through */
          }
          if (!text || text.length > 500) return send(400, { error: "text required" });
          try {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${key}`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  model: `models/${MODEL}`,
                  content: { parts: [{ text }] },
                  taskType: "RETRIEVAL_QUERY",
                  outputDimensionality: DIM,
                }),
              },
            );
            if (!r.ok) return send(502, { error: `upstream HTTP ${r.status}` });
            const { embedding } = (await r.json()) as { embedding: { values: number[] } };
            send(200, { vector: embedding.values });
          } catch (e) {
            send(502, { error: (e as Error).message });
          }
        });
      });
    },
  };
}

/**
 * Dev-only /api/tadabbur — mirrors api/tadabbur.js so «مساعد التدبّر» works
 * locally. Same STRICT grounding prompt; reads GEMINI_API_KEY from the repo .env.
 */
function devTadabburApi(): Plugin {
  const MODEL = process.env.TADABBUR_MODEL || "gemini-2.5-flash";
  const SYSTEM = `أنت مُعينٌ على تدبّر القرآن ضمن مادّةٍ محدَّدةٍ تُعطى لك، ولستَ مفسِّرًا.

اعمل حصرًا على ما يُقدَّم إليك: نصّ الآية، وترجمتها إن وُجدت، وإعرابها المذكور، والآيات القريبة منها معنًى المذكورة — لا تُدخِل أيَّ معرفةٍ من خارج هذه المادّة.

ممنوعٌ منعًا باتًّا: التفسيرُ بالرأي، والقطعُ بمعنًى لم يَرِد، والاختلاقُ أو الإتيان بآياتٍ أو معلوماتٍ ليست في المادّة، وذكرُ أسباب النزول أو الأحكام الفقهيّة أو الأحاديث أو الإسرائيليّات أو الخلافات.

المسموح: تنظيمُ ما بين يديك في تأمّلٍ هادئ، وربطُ الآية بالآيات القريبة منها المذكورة، ولفتُ النظر إلى بناء الجملة من إعرابها ودلالته الظاهرة، وطرحُ أسئلةٍ تفتح التدبّر.

الأسلوب: عربيّةٌ رصينةٌ موجزة (٣–٤ فقراتٍ قصيرة أو نقاط)، متواضعة، لا تَقطع بما ليس في النصّ، وابدأ بلا تصدير. لا تختم بأسئلةٍ عامّة إنشائيّة؛ اجعل الخاتمة لفتةً موجزةً نافعةً مستخلَصةً من المادّة نفسها. لا تدّعِ أن هذا تفسير.`;
  const envKey = (): string | undefined => {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
      const env = fs.readFileSync(resolve(__dirname, "../../../.env"), "utf-8");
      return env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
    } catch {
      return undefined;
    }
  };
  return {
    name: "dev-tadabbur-api",
    configureServer(server) {
      server.middlewares.use("/api/tadabbur", (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          const send = (status: number, body: unknown) => {
            res.statusCode = status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(body));
          };
          if (req.method !== "POST") return send(405, { error: "POST only" });
          const key = envKey();
          if (!key) return send(500, { error: "GEMINI_API_KEY not found in .env" });
          let b: Record<string, unknown> = {};
          try {
            b = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            /* fall through */
          }
          const verse = String(b.verse ?? "").trim();
          if (!verse) return send(400, { error: "verse required" });
          const ref = String(b.ref ?? "").slice(0, 40);
          const translation = String(b.translation ?? "").slice(0, 600);
          const eraab = String(b.eraab ?? "").slice(0, 800);
          const neighbors = Array.isArray(b.neighbors) ? b.neighbors.slice(0, 4).map((n) => String(n).slice(0, 220)) : [];
          const roots = Array.isArray(b.roots) ? b.roots.slice(0, 4).map((r) => String(r).slice(0, 200)) : [];
          const ctx = [
            `الآية${ref ? ` (${ref})` : ""}: ${verse}`,
            translation ? `ترجمتها (صحيح إنترناشونال): ${translation}` : "",
            eraab ? `إعرابها (المجتبى من مشكل إعراب القرآن — الخراط): ${eraab}` : "",
            roots.length ? `معاني جذور كلماتها (من مفردات الراغب ومقاييس اللغة):\n${roots.map((r) => `• ${r}`).join("\n")}` : "",
            neighbors.length ? `آياتٌ قريبةٌ منها معنًى (محسوبةٌ بالتضمينات):\n${neighbors.map((n) => `• ${n}`).join("\n")}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          try {
            const r = await fetch(
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
            if (!r.ok) return send(502, { error: `upstream ${r.status}`, detail: (await r.text()).slice(0, 300) });
            const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
            const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || "").join("").trim();
            if (!text) return send(502, { error: "empty response" });
            send(200, { text });
          } catch (e) {
            send(502, { error: (e as Error).message });
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    devEmbedApi(),
    devTadabburApi(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "مشكاة",
        short_name: "مشكاة",
        description:
          "القرآن الكريم كشبكة معرفة: قراءة، صرف كلمة بكلمة، جذور ومعانٍ من المعاجم، بحث بالمعنى — يعمل كاملًا دون اتصال.",
        dir: "rtl",
        lang: "ar",
        start_url: "/",
        display: "standalone",
        theme_color: "#0b6e56",
        background_color: "#f7f4ee",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // the app shell precaches; the big data files cache on first use.
        // json is precached (jawami.json, the محكم→تفصيل network — small, core);
        // layout.json stays runtime-cached via its globIgnore below.
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2,wasm,json}"],
        globIgnores: ["**/quran-app.db", "**/*.bin"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // versioned data files (?v=<hash>) — cache-first, keep 2 versions
            urlPattern: /\/(quran-app\.db|quran-embeddings\.bin|quran-neighbors\.bin)(\?.*)?$/,
            handler: "CacheFirst",
            options: {
              cacheName: "qkg-data",
              expiration: { maxEntries: 6 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // recitation audio — cache what was listened to.
            // rangeRequests: iOS <audio> streams via HTTP Range; without the
            // RangeRequestsPlugin the SW serves a cached full 200 and Safari
            // refuses to play it (needs 206). This is *the* iPhone-audio fix.
            urlPattern: /^https:\/\/cdn\.islamic\.network\/quran\/audio\//,
            handler: "CacheFirst",
            options: {
              cacheName: "qkg-audio",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      // Polyfill Node built-ins so @monlite/core (built for Node) runs in the
      // browser — same approach as monlite's own demo app.
      "node:module": resolve(__dirname, "./src/mocks/node-module.js"),
      module: resolve(__dirname, "./src/mocks/node-module.js"),
      "node:crypto": resolve(__dirname, "./src/mocks/crypto.js"),
      crypto: resolve(__dirname, "./src/mocks/crypto.js"),
      "node:buffer": "buffer",
    },
  },
  define: {
    global: "globalThis",
    __DATA_VERSION__: JSON.stringify(dataVersion()),
  },
  optimizeDeps: {
    // fts5-sql-bundle is CJS — it MUST be pre-bundled (esbuild adds the
    // default-export interop); excluding it breaks `import initSqlJs` in dev.
    include: [
      "fts5-sql-bundle/dist/sql-wasm.js",
      "@monlite/core",
      "@monlite/wasm",
      "@monlite/fts",
      "buffer",
      "react",
      "react-dom",
    ],
  },
  build: {
    target: "es2022",
    commonjsOptions: { transformMixedEsModules: true },
  },
  server: {
    fs: { allow: ["../.."] },
  },
});
