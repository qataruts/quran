/**
 * SettingsPanel — the ⚙ reader-settings popover. Edits the one settings store;
 * every option applies live. Grouped: script & numerals, size, appearance,
 * focus, and our knowledge-graph layer toggles.
 */
import { useEffect, useRef, useState } from "react";
import { setSettings, useSettings, type Numerals, type QuranFont, type Script, type Theme } from "../settings";
import { RECITERS, reloadForReciter, setLivePlaybackRate } from "./AudioButton";
import { TAJWID_LEGEND } from "../tajwid";
import { getUILang, num, useUILang } from "../i18n";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-label">{label}</span>
      <span className="set-control">{children}</span>
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string; tip?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <span className="set-seg">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)} title={o.tip}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

export default function SettingsPanel() {
  useUILang();
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ar = getUILang() === "ar";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="set-wrap" ref={ref}>
      <button onClick={() => setOpen(!open)} title={ar ? "الإعدادات" : "Settings"} aria-label="settings">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden style={{ verticalAlign: "-4px" }}>
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </button>
      {open && (
        <div className="set-panel card">
          <div className="set-head">{ar ? "إعدادات القراءة" : "Reading settings"}</div>

          <div className="set-group">{ar ? "النص" : "Text"}</div>
          <Row label={ar ? "الرسم" : "Script"}>
            <Seg<Script>
              value={s.script}
              onChange={(v) => setSettings({ script: v })}
              options={[
                { v: "uthmani", label: ar ? "عثماني" : "Uthmani" },
                { v: "imlaai", label: ar ? "إملائي" : "Simple" },
              ]}
            />
          </Row>
          <Row label={ar ? "خطّ المصحف" : "Quran font"}>
            <Seg<QuranFont>
              value={s.quranFont}
              onChange={(v) => setSettings({ quranFont: v })}
              options={[
                { v: "amiri", label: ar ? "أميري" : "Amiri", tip: ar ? "خطّ أميري: نسخٌ أنيق واضح" : "Amiri: elegant naskh" },
                { v: "kfgqpc", label: ar ? "المدينة" : "Madina", tip: ar ? "خطّ مجمع الملك فهد: رسم مصحف المدينة" : "KFGQPC: Madina mushaf style" },
                { v: "scheherazade", label: ar ? "تقليدي" : "Classic", tip: ar ? "خطّ نسخيّ تقليديّ واضح ورصين" : "traditional, clear naskh" },
              ]}
            />
          </Row>
          <Row label={ar ? "الأرقام" : "Numerals"}>
            <Seg<Numerals>
              value={s.numerals}
              onChange={(v) => setSettings({ numerals: v })}
              options={[
                { v: "auto", label: ar ? "تلقائي" : "Auto" },
                { v: "ar", label: "٠١٢" },
                { v: "west", label: "012" },
              ]}
            />
          </Row>
          <Row label={`${ar ? "حجم الخط" : "Font size"} · ${num(Math.round(s.quranScale * 100))}%`}>
            <span className="set-stepper">
              <button
                onClick={() => setSettings({ quranScale: Math.max(0.8, +(s.quranScale - 0.1).toFixed(2)) })}
                disabled={s.quranScale <= 0.8}
              >
                −
              </button>
              <input
                type="range"
                min={0.8}
                max={1.6}
                step={0.1}
                value={s.quranScale}
                onChange={(e) => setSettings({ quranScale: Number(e.target.value) })}
              />
              <button
                onClick={() => setSettings({ quranScale: Math.min(1.6, +(s.quranScale + 0.1).toFixed(2)) })}
                disabled={s.quranScale >= 1.6}
              >
                +
              </button>
            </span>
          </Row>

          <div className="set-group">{ar ? "المظهر" : "Appearance"}</div>
          <Row label={ar ? "السمة" : "Theme"}>
            <Seg<Theme>
              value={s.theme}
              onChange={(v) => setSettings({ theme: v })}
              options={[
                { v: "auto", label: ar ? "تلقائي" : "Auto" },
                { v: "light", label: ar ? "فاتح" : "Light" },
                { v: "sepia", label: ar ? "ورقي" : "Sepia" },
                { v: "dark", label: ar ? "داكن" : "Dark" },
              ]}
            />
          </Row>
          <Row label={ar ? "وضع التركيز" : "Focus mode"}>
            <label className="set-switch">
              <input
                type="checkbox"
                checked={s.focus}
                onChange={(e) => setSettings({ focus: e.target.checked })}
              />
              <span className="muted">{ar ? "إخفاء الأدوات" : "hide chrome"}</span>
            </label>
          </Row>

          <div className="set-group">{ar ? "التلاوة" : "Recitation"}</div>
          <Row label={ar ? "القارئ" : "Reciter"}>
            <select
              value={s.reciter}
              onChange={(e) => {
                setSettings({ reciter: e.target.value });
                reloadForReciter();
              }}
              style={{ padding: "4px 8px", maxWidth: 168 }}
            >
              {Object.entries(RECITERS).map(([key, r]) => (
                <option key={key} value={key}>
                  {ar ? r.ar : r.en}
                </option>
              ))}
            </select>
          </Row>
          <Row label={ar ? "السرعة" : "Speed"}>
            <Seg<string>
              value={String(s.speed)}
              onChange={(v) => {
                setSettings({ speed: Number(v) });
                setLivePlaybackRate(Number(v));
              }}
              options={[
                { v: "0.75", label: ar ? "٠٫٧٥×" : "0.75×" },
                { v: "1", label: ar ? "١×" : "1×" },
                { v: "1.25", label: ar ? "١٫٢٥×" : "1.25×" },
              ]}
            />
          </Row>

          <div className="set-group">{ar ? "التجويد" : "Tajwīd"}</div>
          <Row label={ar ? "تلوين التجويد" : "Colour-coded tajwīd"}>
            <label className="set-switch">
              <input
                type="checkbox"
                checked={s.tajwid}
                onChange={(e) => setSettings({ tajwid: e.target.checked })}
              />
              <span className="muted">{ar ? "في وضعَي النص" : "text modes"}</span>
            </label>
          </Row>
          {s.tajwid && (
            <div className="tj-legend">
              {TAJWID_LEGEND.map((l) => (
                <div key={l.cls} className="tj-legend-row">
                  <span className={`tj-swatch ${l.cls}`} />
                  <span>{ar ? l.ar : l.en}</span>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                {ar ? "محسوبة من النص العثماني — عونٌ على التلاوة" : "computed from the text — a recitation aid"}
              </div>
            </div>
          )}

          <div className="set-group">{ar ? "طبقات المعرفة" : "Knowledge layers"}</div>
          <Row label={ar ? "المحكم والتفصيل" : "Principle → tafsil"}>
            <input
              type="checkbox"
              checked={s.layers.jawami}
              onChange={(e) => setSettings({ layers: { ...s.layers, jawami: e.target.checked } })}
            />
          </Row>
          <Row label={ar ? "قريب المعنى (مثلها)" : "Similar meaning"}>
            <input
              type="checkbox"
              checked={s.layers.similar}
              onChange={(e) => setSettings({ layers: { ...s.layers, similar: e.target.checked } })}
            />
          </Row>
          <Row label={ar ? "جذر الكلمة" : "Word root"}>
            <input
              type="checkbox"
              checked={s.layers.roots}
              onChange={(e) => setSettings({ layers: { ...s.layers, roots: e.target.checked } })}
            />
          </Row>
          <Row label={ar ? "زرّ الإضافة للمجموعات ⊕" : "Add-to-collection ⊕"}>
            <input
              type="checkbox"
              checked={s.layers.collect}
              onChange={(e) => setSettings({ layers: { ...s.layers, collect: e.target.checked } })}
            />
          </Row>
        </div>
      )}
    </div>
  );
}
