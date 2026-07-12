import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAyahByGlobalNo } from "../db";
import { num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import { readPathOf } from "../types";
import { similarOf } from "../similar";
import { useSettings } from "../settings";
import AyahRef from "./AyahRef";
import CollectButton from "./CollectButton";
import AudioButton, { ayahIdOf } from "./AudioButton";

interface Row {
  ayah: AyahDoc;
  score: number;
}

// one-time introductory pulse: the first «مثلها» chip with neighbours to ever
// render in this browser glows briefly, then never again.
const PULSE_KEY = "quran-studio:similar-seen";
let pulseAvailable = (() => {
  try {
    return !localStorage.getItem(PULSE_KEY);
  } catch {
    return false;
  }
})();

/**
 * «مثلها» — the flagship semantic-neighbours feature (precomputed Gemini
 * neighbours, no API). A gold, first-class chip that shows a live neighbour
 * count and expands into a shared panel (also reused by the صفحات popup). It
 * hides itself when an ayah has no close neighbours — never a dead-end.
 */
export default function SimilarAyahs({
  ayahId,
  location,
  open: openProp,
  onToggle,
}: {
  ayahId: number;
  location: string;
  /** controlled mode (reader): the panel is rendered by the parent BELOW the
   *  verse, so it never sits inside the toolbar's flex row. */
  open?: boolean;
  onToggle?: () => void;
}) {
  useUILang();
  const { layers } = useSettings();
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const [count, setCount] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);

  // cheap: only the neighbour COUNT (no per-ayah text resolution) for the badge
  useEffect(() => {
    let live = true;
    similarOf(ayahId).then((ns) => live && setCount(ns.length));
    return () => {
      live = false;
    };
  }, [ayahId]);

  // claim the one-time pulse for the first visible chip
  useEffect(() => {
    if (count && count > 0 && pulseAvailable) {
      pulseAvailable = false;
      try {
        localStorage.setItem(PULSE_KEY, "1");
      } catch {
        /* private mode */
      }
      setPulse(true);
    }
  }, [count]);

  if (!layers.similar) return null;
  if (count === 0) return null; // no close neighbours → no dead-end affordance

  return (
    <>
      <button
        className={`chip similar${open ? " open" : ""}${pulse ? " similar-cta-pulse" : ""}`}
        onClick={() => (controlled ? onToggle?.() : setOpenState((v) => !v))}
        style={{ cursor: "pointer" }}
        title={t("similar.title")}
      >
        <span className="ai-spark" aria-hidden /> {t("similar.chip")}
      </button>
      {!controlled && open && <SimilarAyahsPanel ayahId={ayahId} location={location} />}
    </>
  );
}

/**
 * The shared neighbour list — rendered identically inline (آيات view) and
 * inside the صفحات popup. Self-fetching: resolves each neighbour's full text
 * once on mount. Each row can be sampled with a preview ▶ (does not move the
 * reader) and opened fully (navigates, then fires onNavigate to close a popup).
 */
export function SimilarAyahsPanel({
  ayahId,
  location,
  onNavigate,
}: {
  ayahId: number;
  location: string;
  onNavigate?: () => void;
}) {
  useUILang();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const ns = await similarOf(ayahId);
      const resolved = await Promise.all(
        ns.map(async (n) => ({ score: n.score, ayah: await getAyahByGlobalNo(n.ayahId) })),
      );
      if (live) setRows(resolved.flatMap((r): Row[] => (r.ayah ? [{ ayah: r.ayah, score: r.score }] : [])));
    })();
    return () => {
      live = false;
    };
  }, [ayahId]);

  return (
    <div className="similar-panel">
      {rows === null ? (
        <span className="muted">{t("loading")}</span>
      ) : rows.length === 0 ? (
        <span className="muted">{t("notFound")}</span>
      ) : (
        rows.map((r) => (
          <div key={r.ayah.location} className="similar-row">
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <AyahRef location={r.ayah.location} />
              <span className="chip gold" style={{ fontSize: 10.5 }}>
                {num(Math.round(r.score * 100))}٪
              </span>
              <AudioButton ayahId={ayahIdOf(r.ayah)} preview />
              <CollectButton
                locations={[r.ayah.location]}
                criterion={{ kind: "search", value: `مثل ${location}` }}
                label="⊕"
              />
            </div>
            <div
              className="quran"
              style={{ fontSize: 19, lineHeight: 1.9, cursor: "pointer" }}
              title={t("nav.reader")}
              onClick={() => {
                navigate(readPathOf(r.ayah.location));
                onNavigate?.();
              }}
            >
              {r.ayah.textUthmani}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
