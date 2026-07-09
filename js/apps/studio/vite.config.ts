import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import fs from "node:fs";

/** Short content hash of the app database — busts the data cache on redeploy. */
function dataVersion(): string {
  for (const p of ["./public/quran-app.db", "../../../quran-app.db", "../../../quran-app.db.gz"]) {
    const abs = resolve(__dirname, p);
    if (fs.existsSync(abs)) {
      const h = createHash("sha1");
      h.update(fs.readFileSync(abs));
      return h.digest("hex").slice(0, 10);
    }
  }
  return "dev";
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

export default defineConfig({
  plugins: [
    react(),
    devEmbedApi(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "مصحف المعرفة",
        short_name: "مصحف المعرفة",
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
        // the app shell precaches; the big data files cache on first use
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2,wasm}"],
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
            // recitation audio — cache what was listened to
            urlPattern: /^https:\/\/cdn\.islamic\.network\/quran\/audio\//,
            handler: "CacheFirst",
            options: {
              cacheName: "qkg-audio",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
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
