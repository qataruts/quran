import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { initDb, listSurahs } from "./db";
import { applyUILang, getUILang, setUILang, t, useUILang } from "./i18n";
import "./theme.css";
import Reader from "./views/Reader";
import Roots from "./views/Roots";
import Network from "./views/Network";
import Search from "./views/Search";
import Collections from "./views/Collections";
import Dashboard from "./views/Dashboard";
import { NowPlayingBar } from "./components/AudioButton";
import Omnibox from "./components/Omnibox";
import Goto from "./views/Goto";
import Today from "./views/Today";
import Jawami from "./views/Jawami";
import SettingsPanel from "./components/SettingsPanel";
import BookmarksPanel from "./components/BookmarksPanel";
import FocusExit from "./components/FocusExit";
import { applySettings, setSettings, useSettings } from "./settings";

applyUILang();
applySettings();

function Boot({ children }: { children: React.ReactNode }) {
  useUILang();
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDb((loaded, total) => setProgress({ loaded, total }))
      .then(() => listSurahs()) // prime surah names for AyahRef
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="boot">
        <div>
          <div className="title">مصحف المعرفة</div>
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <p className="muted">
            <code>node ../../scripts/convert-to-app-db.mjs</code>
          </p>
        </div>
      </div>
    );
  }
  if (!ready) {
    const pct =
      progress && progress.total > 0
        ? Math.round((progress.loaded / progress.total) * 100)
        : null;
    return (
      <div className="boot">
        <div>
          <div className="title">مصحف المعرفة</div>
          <div className="bar">
            <div style={{ width: pct != null ? `${pct}%` : "30%" }} />
          </div>
          <div className="muted">
            {t("boot.loading")} {pct != null ? `${pct}%` : ""}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {t("boot.tagline")}
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function ThemeToggle() {
  const s = useSettings();
  const resolved =
    s.theme === "auto"
      ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : s.theme;
  const isDark = resolved === "dark";
  return (
    <button
      onClick={() => setSettings({ theme: isDark ? "light" : "dark" })}
      title={getUILang() === "ar" ? "فاتح/داكن" : "Light/Dark"}
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}

function LangToggle() {
  const lang = useUILang();
  return (
    <button
      onClick={() => setUILang(lang === "ar" ? "en" : "ar")}
      title={lang === "ar" ? "Switch interface to English" : "التبديل إلى العربية"}
    >
      {lang === "ar" ? "EN" : "ع"}
    </button>
  );
}

function Footer() {
  useUILang();
  const src = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
  return (
    <footer className="footer">
      <span>
        {getUILang() === "ar" ? (
          <>
            {t("footer.sources")}: {src("https://corpus.quran.com", "المدونة القرآنية (جامعة ليدز)")} ·{" "}
            {src("https://tanzil.net", "مشروع تنزيل")} ·{" "}
            {src("https://alquran.cloud", "تلاوة الشيخ الحصري")} ·{" "}
            {src("https://github.com/qataruts/monlite", "monlite")}
            <span className="muted"> — {t("footer.provenance")}</span>
          </>
        ) : (
          <>
            {t("footer.sources")}: {src("https://corpus.quran.com", "Quranic Arabic Corpus")} ·{" "}
            {src("https://tanzil.net", "Tanzil")} ·{" "}
            {src("https://alquran.cloud", "al-Ḥuṣarī / Islamic Network")} · Gemini ·{" "}
            {src("https://github.com/qataruts/monlite", "monlite")}
            <span className="muted"> — {t("footer.provenance")}</span>
          </>
        )}
      </span>
    </footer>
  );
}

function Nav() {
  useUILang();
  return (
    <nav>
      <NavLink to="/read">{t("nav.reader")}</NavLink>
      <NavLink to="/jawami">{t("nav.jawami")}</NavLink>
      <NavLink to="/roots">{t("nav.roots")}</NavLink>
      <NavLink to="/network">{t("nav.network")}</NavLink>
      <NavLink to="/search">{t("nav.search")}</NavLink>
      <NavLink to="/collections">{t("nav.collections")}</NavLink>
      <NavLink to="/dashboard">{t("nav.dashboard")}</NavLink>
    </nav>
  );
}

/** First load opens the Quran — at the last-read position, else al-Fātiḥa. */
function Home() {
  const last = localStorage.getItem("quran-studio:last-read");
  const to = last && /^\d+:\d+$/.test(last)
    ? `/read/${last.split(":")[0]}/${last.split(":")[1]}`
    : "/read/1";
  return <Navigate to={to} replace />;
}

function Brand() {
  return (
    <NavLink
      to="/"
      className="brand"
      style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}
    >
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={30} height={30} />
      <span className="ar" style={{ fontSize: 21, marginInlineStart: 0 }}>
        مصحف المعرفة
      </span>
    </NavLink>
  );
}

function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="topbar">
          <Brand />
          <Nav />
          <span className="spacer" />
          <Omnibox />
          <BookmarksPanel />
          <LangToggle />
          <ThemeToggle />
          <SettingsPanel />
        </header>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/read" element={<Home />} />
          <Route path="/read/:surahNo" element={<Reader />} />
          <Route path="/read/:surahNo/:ayahNo" element={<Reader />} />
          <Route path="/jawami" element={<Jawami />} />
          <Route path="/roots" element={<Roots />} />
          <Route path="/roots/:root" element={<Roots />} />
          <Route path="/network" element={<Network />} />
          <Route path="/network/:root" element={<Network />} />
          <Route path="/network/:root/:other" element={<Network />} />
          <Route path="/search" element={<Search />} />
          <Route path="/meaning" element={<Navigate to="/search?m=1" replace />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:id" element={<Collections />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/today" element={<Today />} />
          <Route path="/goto/:kind/:n" element={<Goto />} />
        </Routes>
        <Footer />
        <NowPlayingBar />
        <FocusExit />
      </div>
    </HashRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boot>
      <App />
    </Boot>
  </React.StrictMode>,
);
