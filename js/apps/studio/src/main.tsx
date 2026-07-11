import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
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
import Mawdui from "./views/Mawdui";
import SettingsPanel from "./components/SettingsPanel";
import BookmarksPanel from "./components/BookmarksPanel";
import SourcesPanel from "./components/SourcesPanel";
import FocusExit from "./components/FocusExit";
import { applySettings, setSettings, useSettings } from "./settings";

applyUILang();
applySettings();

// Keep the app fresh. vite-plugin-pwa (registerType:autoUpdate) already applies
// and reloads on a new service worker — but only checks on load. Poll every 30s
// so an already-open tab picks up a new deploy instead of serving stale code.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready
    .then((reg) => {
      setInterval(() => void reg.update().catch(() => {}), 30_000);
    })
    .catch(() => {});
}

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

function Nav() {
  useUILang();
  const loc = useLocation();
  // «المواضيع» resumes where you left off; other tabs are plain
  const inMawdui = loc.pathname.startsWith("/mawdui");
  const mawduiTo = inMawdui ? loc.pathname : localStorage.getItem("quran-studio:mawdui-last") || "/mawdui";
  return (
    <nav>
      <NavLink to="/read" title={getUILang() === "ar" ? "اقرأ المصحف" : "read the Qur'an"}>{t("nav.reader")}</NavLink>
      <Link to={mawduiTo} className={inMawdui ? "active" : undefined} title={getUILang() === "ar" ? "تصفّح القرآن بحسب الموضوع (يتابع من حيث توقّفت)" : "browse by theme (resumes)"}>{t("nav.mawdui")}</Link>
      <NavLink to="/jawami" title={getUILang() === "ar" ? "الآيات الجوامع وتفصيلها" : "principle verses & their tafsil"}>{t("nav.jawami")}</NavLink>
      <NavLink to="/roots">{t("nav.roots")}</NavLink>
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
          <SourcesPanel />
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
          <Route path="/mawdui" element={<Mawdui />} />
          <Route path="/mawdui/:s" element={<Mawdui />} />
          <Route path="/mawdui/:s/:t" element={<Mawdui />} />
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
