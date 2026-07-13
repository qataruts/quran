import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { initDb, listSurahs } from "./db";
import { applyUILang, getUILang, setUILang, t, useUILang } from "./i18n";
import "./theme.css";
import Reader from "./views/Reader";
import Roots from "./views/Roots";
import Search from "./views/Search";
const Collections = lazy(() => import("./views/Collections"));
const Dashboard = lazy(() => import("./views/Dashboard"));
import { NowPlayingBar } from "./components/AudioButton";
import ErrorBoundary from "./components/ErrorBoundary";
import Goto from "./views/Goto";
const Today = lazy(() => import("./views/Today"));
const Kulliyat = lazy(() => import("./views/Kulliyat"));
const AyaCard = lazy(() => import("./views/AyaCard"));
const Wujuh = lazy(() => import("./views/Wujuh"));
const Furuq = lazy(() => import("./views/Furuq"));
const Amthal = lazy(() => import("./views/Amthal"));
const Fawasil = lazy(() => import("./views/Fawasil"));
const Mawdui = lazy(() => import("./views/Mawdui"));
const Mawadi = lazy(() => import("./views/Mawadi"));
const Tafasir = lazy(() => import("./views/Tafasir"));
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
    ar: "الموضوعات", en: "Themes",
    items: [
      ["/mawdui", "المحاور", "Axes"],
      ["/mawadi", "المواضيع", "Topics"],
      ["/khayt", "الخيوط الموضوعية", "Thematic threads"],
      ["/amthal", "الأمثال", "Parables"],
    ],
  },
  {
    ar: "بناء المصحف", en: "Composition",
    items: [
      ["/kulliyat", "الكلّيّات والجوامع", "Kulliyyāt"],
      ["/shabaka", "خريطة المصحف", "Mushaf map"],
      ["/furuq", "فروق التنزيل", "Furūq"],
      ["/fawasil", "أطلس الفواصل", "Rhyme atlas"],
    ],
  },
  {
    ar: "الجذور واللغة", en: "Roots & language",
    items: [
      ["/roots", "الجذور", "Roots"],
      ["/galaxy", "شبكة الجذور", "Roots network"],
      ["/lisan", "الفروق اللغوية", "Lexical distinctions"],
      ["/wujuh", "الوجوه والنظائر", "Polysemy"],
      ["/sarf", "الصرف بالأرقام", "Morphology"],
    ],
  },
  {
    ar: "مصادر وأدوات", en: "Sources & tools",
    items: [
      ["/mujam", "معجم القرآن", "Dictionary"],
      ["/tafasir", "التفاسير والمصادر", "Tafsir & sources"],
      ["/maalim", "إحصاءات القرآن", "Qur'an stats"],
    ],
  },
];

/** The nav groups, with المجموعات appended to «مصادر وأدوات» only when its layer is enabled. */
function useNavGroups() {
  const s = useSettings();
  if (!s.layers.collect) return NAV_GROUPS;
  return NAV_GROUPS.map((g) =>
    g.en === "Sources & tools"
      ? { ...g, items: [...g.items, ["/collections", "المجموعات", "Collections"] as NavItem] }
      : g,
  );
}

/** Retired root-graph (توارد الجذور) + journey routes fold into the root page,
 *  which now hosts the journey inline. Keeps old links working. */
function ToRootRedirect() {
  const { root } = useParams();
  return <Navigate to={root ? `/roots/${encodeURIComponent(root)}` : "/roots"} replace />;
}

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
  const groups = useNavGroups();
  return (
    <nav>
      <NavLink to="/read" title={ar ? "اقرأ المصحف" : "read the Qur'an"}>{t("nav.reader")}</NavLink>
      {groups.map((g) => (
        <NavGroup key={g.ar} label={ar ? g.ar : g.en} items={g.items} />
      ))}
      <NavLink to="/about" title={ar ? "عن المشروع" : "about the project"}>{ar ? "عن المشروع" : "About"}</NavLink>
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
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={35} height={35} />
      <span className="ar" style={{ fontSize: 24, marginInlineStart: 0 }}>
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
  const groups = useNavGroups();
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
          {groups.map((g) => (
            <div key={g.ar} className="drawer-group">
              <div className="drawer-group-h">{ar ? g.ar : g.en}</div>
              {g.items.map(([to, arL, enL]) => (
                <NavLink key={to} to={to}>{ar ? arL : enL}</NavLink>
              ))}
            </div>
          ))}
          <NavLink to="/about">{ar ? "عن المشروع" : "About"}</NavLink>
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

/** نِبراس — a floating AI-chat button on every page (mobile + web), pinned bottom-
 *  right; the single entry to research + meaning-search chat. A speech bubble with
 *  a sparkle marks it as an AI chat. Hidden while نِبراس itself is open. */
function NibrasFab() {
  const loc = useLocation();
  const ar = getUILang() === "ar";
  if (loc.pathname.startsWith("/assistant")) return null;
  return (
    <NavLink to="/assistant" className="nibras-fab" title={ar ? "نِبراس: محادثةُ ذكاءٍ اصطناعيّ — بحثٌ بالمعنى وصياغةٌ من بيانات القرآن" : "Nibras: an AI chat — meaning-search & drafting from the Qur'an's data"} aria-label={ar ? "نِبراس — محادثة ذكاء اصطناعي" : "Nibras — AI chat"}>
      <svg className="nibras-fab-ic" viewBox="0 0 24 24" aria-hidden focusable="false">
        <path d="M12 1.6c.55 5.9 1.9 9.95 9.9 10.4-8 .45-9.35 4.5-9.9 10.4-.55-5.9-1.9-9.95-9.9-10.4 8-.45 9.35-4.5 9.9-10.4z" fill="currentColor" />
        <path d="M19.4 2.2c.2 2.1.7 3.55 3.5 3.7-2.8.15-3.3 1.6-3.5 3.7-.2-2.1-.7-3.55-3.5-3.7 2.8-.15 3.3-1.6 3.5-3.7z" fill="currentColor" opacity=".7" />
      </svg>
      <span className="nibras-fab-label">{ar ? "نِبراس" : "Nibras"}</span>
    </NavLink>
  );
}

/** Mobile-only bottom tab bar — thumb-reachable jumps to the key surfaces; the
 *  «المزيد» tab opens the full drawer. Hidden on desktop. */
function MobileTabBar({ onMenu }: { onMenu: () => void }) {
  const loc = useLocation();
  const p = loc.pathname;
  const ar = getUILang() === "ar";
  if (p.startsWith("/assistant")) return null; // نِبراس is a focused full-screen chat
  const on = (to: string) => (to === "/read" ? p === "/" || p.startsWith("/read") : p === to || p.startsWith(to + "/"));
  return (
    <nav className="tabbar" aria-label={ar ? "تنقّل" : "tabs"}>
      <NavLink to="/read" className={`tab${on("/read") ? " active" : ""}`}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 4.5A2 2 0 0 1 6 3h5v16H6a2 2 0 0 0-2 1.2zM20 4.5A2 2 0 0 0 18 3h-5v16h5a2 2 0 0 1 2 1.2z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
        <span>{ar ? "المصحف" : "Read"}</span>
      </NavLink>
      <NavLink to="/kulliyat" className={`tab${on("/kulliyat") || on("/aya") ? " active" : ""}`}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2 3 7l9 5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
        <span>{ar ? "الكلّيّات" : "Kulliyyāt"}</span>
      </NavLink>
      <NavLink to="/mawdui" className={`tab${on("/mawdui") ? " active" : ""}`}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
        <span>{ar ? "المحاور" : "Axes"}</span>
      </NavLink>
      <button className="tab" onClick={onMenu} aria-label={ar ? "القائمة" : "menu"}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        <span>{ar ? "المزيد" : "More"}</span>
      </button>
    </nav>
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
        <NibrasFab />
        {mobile && <MobileTabBar onMenu={() => setDrawer(true)} />}
        <RouteBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/read" element={<Home />} />
          <Route path="/read/:surahNo" element={<Reader />} />
          <Route path="/read/:surahNo/:ayahNo" element={<Reader />} />
          {/* RETIRED (2026-07-13): the old محكمات/جوامع system is superseded by الكلّيّات. */}
          <Route path="/jawami" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/jawami/lenses" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/gaps" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/muhkamat" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/muhkamat/:k" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/kulliyat" element={<Kulliyat />} />
          <Route path="/graph" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/graph/:s/:a" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/fabric" element={<ToRootRedirect />} />
          <Route path="/fabric/:root" element={<ToRootRedirect />} />
          <Route path="/maalim" element={<Maalim />} />
          <Route path="/mujam" element={<Mujam />} />
          <Route path="/mujam/:root" element={<Mujam />} />
          <Route path="/lisan" element={<Lisan />} />
          <Route path="/sarf" element={<Sarf />} />
          <Route path="/galaxy" element={<Galaxy />} />
          <Route path="/shabaka" element={<MushafMap />} />
          <Route path="/khayt" element={<ThematicThread />} />
          <Route path="/about" element={<About />} />
          <Route path="/lexicon" element={<Navigate to="/kulliyat" replace />} />
          <Route path="/wujuh" element={<Wujuh />} />
          <Route path="/furuq" element={<Furuq />} />
          <Route path="/amthal" element={<Amthal />} />
          <Route path="/fawasil" element={<Fawasil />} />
          <Route path="/mawdui" element={<Mawdui />} />
          <Route path="/mawdui/:t" element={<Mawdui />} />
          <Route path="/mawadi" element={<Mawadi />} />
          <Route path="/mawadi/:sec" element={<Mawadi />} />
          <Route path="/tafasir" element={<Tafasir />} />
          <Route path="/tafasir/:id" element={<Tafasir />} />
          <Route path="/aya/:s/:a" element={<AyaCard />} />
          <Route path="/roots" element={<Roots />} />
          <Route path="/roots/:root" element={<Roots />} />
          <Route path="/network" element={<ToRootRedirect />} />
          <Route path="/network/:root" element={<ToRootRedirect />} />
          <Route path="/network/:root/:other" element={<ToRootRedirect />} />
          <Route path="/search" element={<Search />} />
          <Route path="/meaning" element={<Navigate to="/search?m=1" replace />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:id" element={<Collections />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/eraab" element={<EraabDrill />} />
          <Route path="/journey" element={<ToRootRedirect />} />
          <Route path="/journey/:root" element={<ToRootRedirect />} />
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
