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
const Kulliyat = lazy(() => import("./views/Kulliyat"));
const AyaCard = lazy(() => import("./views/AyaCard"));
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
const MushafMap = lazy(() => import("./views/MushafMap"));
const ThematicThread = lazy(() => import("./views/ThematicThread"));
const Learn = lazy(() => import("./views/Learn"));
const EraabDrill = lazy(() => import("./views/EraabDrill"));
const RootJourney = lazy(() => import("./views/RootJourney"));
const Assistant = lazy(() => import("./views/Assistant"));
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

// The desktop nav: a couple of always-visible destinations + themed dropdown
// GROUPS, so the bar stays tidy instead of one long scattered row. The mobile
// drawer reuses the same groups as labelled sections.
type NavItem = [to: string, ar: string, en: string];
const NAV_GROUPS: { ar: string; en: string; items: NavItem[] }[] = [
  {
    ar: "اللغة والجذور", en: "Language & roots",
    items: [
      ["/roots", "الجذور", "Roots"],
      ["/journey", "رحلة الجذر", "Root journey"],
      ["/lisan", "الفروق اللغوية", "Lexical distinctions"],
      ["/wujuh", "الوجوه والنظائر", "Polysemy"],
      ["/mujam", "معجم القرآن", "Dictionary"],
      ["/sarf", "الصرف بالأرقام", "Morphology"],
    ],
  },
  {
    ar: "البنية والتدبّر", en: "Structure",
    items: [
      ["/kulliyat", "الكلّيّات", "Kulliyyāt"],
      ["/furuq", "فروق التنزيل", "Furūq"],
      ["/mawdui", "المواضيع", "Topics"],
      ["/amthal", "الأمثال", "Parables"],
      ["/shabaka", "خريطة المصحف", "Mushaf map"],
      ["/khayt", "الخيوط الموضوعية", "Thematic threads"],
      ["/galaxy", "شبكة الجذور", "Roots network"],
      ["/fawasil", "أطلس الفواصل", "Rhyme atlas"],
    ],
  },
  {
    ar: "معالم وأدوات", en: "More",
    items: [
      ["/maalim", "معالم وإحصاءات", "Landmarks & stats"],
      ["/dashboard", "إحصاءات المصحف", "Corpus stats"],
      ["/collections", "المجموعات", "Collections"],
      ["/about", "عن المشروع", "About"],
    ],
  },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const ar = getUILang() === "ar";
  useEffect(() => setOpen(false), [loc.pathname]); // close on navigate
  const active = items.some(([to]) => loc.pathname.startsWith(to));
  return (
    <span className="nav-more">
      <button className={`nav-more-btn${active ? " active" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label} <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div className="nav-more-backdrop" onClick={() => setOpen(false)} />
          <div className="nav-more-menu" role="menu">
            {items.map(([to, arL, enL]) => (
              <NavLink key={to} to={to} role="menuitem">{ar ? arL : enL}</NavLink>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

function Nav() {
  useUILang();
  const ar = getUILang() === "ar";
  return (
    <nav>
      <NavLink to="/read" title={ar ? "اقرأ المصحف" : "read the Qur'an"}>{t("nav.reader")}</NavLink>
      {NAV_GROUPS.map((g) => (
        <NavGroup key={g.ar} label={ar ? g.ar : g.en} items={g.items} />
      ))}
      <NavLink to="/search" title={ar ? "البحث بالمعنى في القرآن كلّه" : "meaning-based search"}>
        <span className="ai-spark" aria-hidden /> {t("nav.search")}
      </NavLink>
      <NavLink to="/assistant" title={ar ? "نِبراس: مساعدُ بحثٍ وصياغةٍ من بيانات القرآن" : "research & drafting assistant"}>
        <span className="ai-spark" aria-hidden /> {ar ? "نِبراس" : "Nibras"}
      </NavLink>
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

// (the mobile drawer builds its sections from NAV_GROUPS above.)

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
          <NavLink to="/read">{ar ? "المصحف" : "Reader"}</NavLink>
          <NavLink to="/search"><span className="ai-spark" aria-hidden /> {ar ? "البحث الدلالي" : "Semantic search"}</NavLink>
          <NavLink to="/assistant"><span className="ai-spark" aria-hidden /> {ar ? "نِبراس" : "Nibras"}</NavLink>
          {NAV_GROUPS.map((g) => (
            <div key={g.ar} className="drawer-group">
              <div className="drawer-group-h">{ar ? g.ar : g.en}</div>
              {g.items.map(([to, arL, enL]) => (
                <NavLink key={to} to={to}>{ar ? arL : enL}</NavLink>
              ))}
            </div>
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
          <Route path="/kulliyat" element={<Kulliyat />} />
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
          <Route path="/shabaka" element={<MushafMap />} />
          <Route path="/khayt" element={<ThematicThread />} />
          <Route path="/about" element={<About />} />
          <Route path="/lexicon" element={<Lexicon />} />
          <Route path="/wujuh" element={<Wujuh />} />
          <Route path="/furuq" element={<Furuq />} />
          <Route path="/amthal" element={<Amthal />} />
          <Route path="/fawasil" element={<Fawasil />} />
          <Route path="/mawdui" element={<Mawdui />} />
          <Route path="/mawdui/:t" element={<Mawdui />} />
          <Route path="/aya/:s/:a" element={<AyaCard />} />
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
          <Route path="/eraab" element={<EraabDrill />} />
          <Route path="/journey" element={<RootJourney />} />
          <Route path="/journey/:root" element={<RootJourney />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/assistant/:id" element={<Assistant />} />
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
