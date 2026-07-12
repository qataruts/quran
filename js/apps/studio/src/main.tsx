import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { initDb, listSurahs } from "./db";
import { applyUILang, getUILang, setUILang, t, useUILang } from "./i18n";
import "./theme.css";
import Reader from "./views/Reader";
import Roots from "./views/Roots";
import Network from "./views/Network";
import Search from "./views/Search";
const Collections = lazy(() => import("./views/Collections"));
const Dashboard = lazy(() => import("./views/Dashboard"));
import { NowPlayingBar } from "./components/AudioButton";
import ErrorBoundary from "./components/ErrorBoundary";
import Goto from "./views/Goto";
const Today = lazy(() => import("./views/Today"));
import Jawami from "./views/Jawami";
const Gaps = lazy(() => import("./views/Gaps"));
const Muhkamat = lazy(() => import("./views/Muhkamat"));
const Lexicon = lazy(() => import("./views/Lexicon"));
const Wujuh = lazy(() => import("./views/Wujuh"));
const Furuq = lazy(() => import("./views/Furuq"));
const Amthal = lazy(() => import("./views/Amthal"));
const Fawasil = lazy(() => import("./views/Fawasil"));
const Mawdui = lazy(() => import("./views/Mawdui"));
const Graph = lazy(() => import("./views/Graph"));
const RootsGraph = lazy(() => import("./views/RootsGraph"));
const Maalim = lazy(() => import("./views/Maalim"));
const Mujam = lazy(() => import("./views/Mujam"));
const Lisan = lazy(() => import("./views/Lisan"));
const Sarf = lazy(() => import("./views/Sarf"));
const About = lazy(() => import("./views/About"));
const Galaxy = lazy(() => import("./views/Galaxy"));
const Learn = lazy(() => import("./views/Learn"));
import SettingsPanel from "./components/SettingsPanel";
import SourcesPanel from "./components/SourcesPanel";
import BookmarksPanel from "./components/BookmarksPanel";
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
          <div className="title">مشكاة</div>
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
          <div className="title">مشكاة</div>
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
      aria-label={getUILang() === "ar" ? (isDark ? "الوضع الفاتح" : "الوضع الداكن") : isDark ? "Light mode" : "Dark mode"}
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

// desktop «المزيد ▾» — the pages that don't fit the primary bar but must still
// be reachable without typing a URL (this was the desktop gap).
const MORE_LINKS: [string, string, string][] = [
  ["/learn", "مسار الجذور", "Learn roots"],
  ["/maalim", "معالم وإحصاءات", "Landmarks & stats"],
  ["/mujam", "معجم القرآن", "Dictionary"],
  ["/fawasil", "أطلس الفواصل", "Rhyme atlas"],
  ["/sarf", "الصرف بالأرقام", "Morphology"],
  ["/collections", "المجموعات", "Collections"],
  ["/dashboard", "إحصاءات المصحف", "Corpus stats"],
  ["/about", "عن المشروع", "About"],
];

function Nav() {
  useUILang();
  const loc = useLocation();
  const ar = getUILang() === "ar";
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [loc.pathname]); // close on navigate
  // «المواضيع» resumes where you left off; other tabs are plain
  const inMawdui = loc.pathname.startsWith("/mawdui");
  const mawduiTo = inMawdui ? loc.pathname : localStorage.getItem("quran-studio:mawdui-last") || "/mawdui";
  const moreActive = MORE_LINKS.some(([to]) => loc.pathname.startsWith(to));
  return (
    <nav>
      <NavLink to="/read" title={ar ? "اقرأ المصحف" : "read the Qur'an"}>{t("nav.reader")}</NavLink>
      <NavLink to="/muhkamat" title={ar ? "المحكمات والجوامع: كبرى ← محكمة ← جامعة (أصل) ← تفصيل" : "muḥkamāt & principles: كبرى → محكمة → جامعة → تفصيل"}>{t("nav.muhkamat")}</NavLink>
      <NavLink to="/roots">{t("nav.roots")}</NavLink>
      <NavLink to="/lisan" title={ar ? "الفروق اللغوية: قارن كلمتين من المعجمين — مترادفات وحقول دلالية محسوبة" : "compare two words from the two lexica — computed synonyms & fields"}>{t("nav.lisan")}</NavLink>
      <NavLink to="/furuq" title={ar ? "فروق التنزيل: المتشابهات اللفظية وما اختلف بينها" : "differences between near-identical verses"}>{t("nav.furuq")}</NavLink>
      <NavLink to="/wujuh" title={ar ? "الوجوه والنظائر: كلماتٌ بمعانٍ متعدّدة، محسوبةٌ من سياقاتها" : "computed polysemy — words with multiple senses"}>{ar ? "الوجوه والنظائر" : "Polysemy"}</NavLink>
      <Link to={mawduiTo} className={inMawdui ? "active" : undefined} title={ar ? "تصفّح القرآن بحسب الموضوع (يتابع من حيث توقّفت)" : "browse by theme (resumes)"}>{t("nav.mawdui")}</Link>
      <NavLink to="/amthal" title={ar ? "أمثال القرآن والتشبيهات — من نصّ القرآن وحده" : "the Qur'an's own parables & similitudes"}>{ar ? "الأمثال" : "Parables"}</NavLink>
      <NavLink to="/search"><span className="ai-spark" aria-hidden /> {t("nav.search")}</NavLink>
      <NavLink to="/galaxy" title={ar ? "شبكة القرآن: توارد الجذور في الآيات، كوكباتٍ محسوبة" : "the roots co-occurrence galaxy"}>{ar ? "شبكة القرآن" : "Network"}</NavLink>
      <span className="nav-more">
        <button className={`nav-more-btn${moreActive ? " active" : ""}`} onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {ar ? "المزيد" : "More"} <span style={{ fontSize: 10 }}>▾</span>
        </button>
        {more && (
          <>
            <div className="nav-more-backdrop" onClick={() => setMore(false)} />
            <div className="nav-more-menu" role="menu">
              {MORE_LINKS.map(([to, arL, enL]) => (
                <NavLink key={to} to={to} role="menuitem">{ar ? arL : enL}</NavLink>
              ))}
            </div>
          </>
        )}
      </span>
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
        مشكاة
      </span>
    </NavLink>
  );
}

/** Tracks whether the viewport is phone-width. */
function useIsMobile(): boolean {
  const [m, setM] = useState<boolean>(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

// every destination, for the mobile drawer — SAME ORDER as the desktop nav
// (primary tabs first, then everything under «المزيد»).
const DRAWER_LINKS: [string, string, string][] = [
  // primary nav (desktop order)
  ["/read", "المصحف", "Reader"],
  ["/muhkamat", "المحكمات", "Muhkamāt"],
  ["/roots", "الجذور", "Roots"],
  ["/learn", "مسار الجذور", "Learn roots"],
  ["/lisan", "الفروق اللغوية", "Lexical distinctions"],
  ["/furuq", "فروق التنزيل", "Furūq"],
  ["/wujuh", "الوجوه والنظائر", "Polysemy"],
  ["/mawdui", "المواضيع", "Topics"],
  ["/amthal", "الأمثال", "Parables"],
  ["/search", "البحث الدلالي", "Semantic"],
  ["/galaxy", "شبكة القرآن", "Network"],
  // «المزيد» (desktop order)
  ["/maalim", "معالم وإحصاءات", "Landmarks & stats"],
  ["/mujam", "معجم القرآن", "Dictionary"],
  ["/fawasil", "أطلس الفواصل", "Rhyme"],
  ["/sarf", "الصرف بالأرقام", "Morphology"],
  ["/collections", "المجموعات", "Collections"],
  ["/dashboard", "إحصاءات المصحف", "Stats"],
  ["/about", "عن المشروع", "About"],
];

function MobileDrawer({ onClose }: { onClose: () => void }) {
  useUILang();
  const ar = getUILang() === "ar";
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={ar ? "القائمة" : "menu"}>
        <div className="drawer-head">
          <span className="ar" style={{ fontFamily: "var(--font-quran)", color: "var(--accent)", fontSize: 22, fontWeight: 700 }}>مشكاة</span>
          <button onClick={onClose} aria-label={ar ? "إغلاق" : "close"}>✕</button>
        </div>
        <nav className="drawer-nav" onClick={onClose}>
          {DRAWER_LINKS.map(([to, arL, enL]) => (
            <NavLink key={to} to={to}>
              {to === "/search" && <span className="ai-spark" aria-hidden />}{" "}
              {ar ? arL : enL}
            </NavLink>
          ))}
        </nav>
        <div className="drawer-controls">
          <SourcesPanel />
          <LangToggle />
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}

// Per-route boundary: keyed by path so a broken view shows an inline message
// (the top bar / nav / now-playing stay), and navigating away remounts + recovers.
function RouteBoundary({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <ErrorBoundary compact key={loc.pathname}>
      <Suspense fallback={<div className="page"><p className="muted">{t("loading")}</p></div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  const mobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!mobile) setDrawer(false);
  }, [mobile]);
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="topbar">
          {mobile && (
            <button className="menu-btn" onClick={() => setDrawer(true)} aria-label={getUILang() === "ar" ? "القائمة" : "menu"}>
              ☰
            </button>
          )}
          <Brand />
          {!mobile && <Nav />}
          <span className="spacer" />
          {mobile ? (
            <>
              <BookmarksPanel />
              <SettingsPanel />
            </>
          ) : (
            <>
              <BookmarksPanel />
              <SourcesPanel />
              <LangToggle />
              <ThemeToggle />
              <SettingsPanel />
            </>
          )}
        </header>
        {mobile && drawer && <MobileDrawer onClose={() => setDrawer(false)} />}
        <RouteBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/read" element={<Home />} />
          <Route path="/read/:surahNo" element={<Reader />} />
          <Route path="/read/:surahNo/:ayahNo" element={<Reader />} />
          {/* الجوامع merged into المحكمات (one page). /jawami/lenses stays as the analytics view. */}
          <Route path="/jawami" element={<Navigate to="/muhkamat" replace />} />
          <Route path="/jawami/lenses" element={<Jawami />} />
          <Route path="/gaps" element={<Gaps />} />
          <Route path="/muhkamat" element={<Muhkamat />} />
          <Route path="/muhkamat/:k" element={<Muhkamat />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/graph/:s/:a" element={<Graph />} />
          <Route path="/fabric" element={<RootsGraph />} />
          <Route path="/fabric/:root" element={<RootsGraph />} />
          <Route path="/maalim" element={<Maalim />} />
          <Route path="/mujam" element={<Mujam />} />
          <Route path="/mujam/:root" element={<Mujam />} />
          <Route path="/lisan" element={<Lisan />} />
          <Route path="/sarf" element={<Sarf />} />
          <Route path="/galaxy" element={<Galaxy />} />
          <Route path="/about" element={<About />} />
          <Route path="/lexicon" element={<Lexicon />} />
          <Route path="/wujuh" element={<Wujuh />} />
          <Route path="/furuq" element={<Furuq />} />
          <Route path="/amthal" element={<Amthal />} />
          <Route path="/fawasil" element={<Fawasil />} />
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
          <Route path="/learn" element={<Learn />} />
          <Route path="/today" element={<Today />} />
          <Route path="/goto/:kind/:n" element={<Goto />} />
        </Routes>
        </RouteBoundary>
        <NowPlayingBar />
        <FocusExit />
      </div>
    </HashRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Boot>
        <App />
      </Boot>
    </ErrorBoundary>
  </React.StrictMode>,
);
