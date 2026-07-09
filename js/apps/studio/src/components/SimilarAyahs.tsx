import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAyahByGlobalNo } from "../db";
import { num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import { readPathOf } from "../types";
import { similarOf } from "../similar";
import AyahRef from "./AyahRef";
import CollectButton from "./CollectButton";

interface Row {
  ayah: AyahDoc;
  score: number;
}

/**
 * «مثلها» — ayahs closest in meaning (precomputed Gemini neighbors, no API).
 * A quiet chip that expands inline; each result carries its own chip, so the
 * reader can wander the meaning-web ayah by ayah.
 */
export default function SimilarAyahs({ ayahId, location }: { ayahId: number; location: string }) {
  useUILang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);

  const toggle = async () => {
    setOpen(!open);
    if (rows !== null || open) return;
    const ns = await similarOf(ayahId);
    const resolved = await Promise.all(
      ns.map(async (n) => ({ score: n.score, ayah: await getAyahByGlobalNo(n.ayahId) })),
    );
    setRows(resolved.flatMap((r): Row[] => (r.ayah ? [{ ayah: r.ayah, score: r.score }] : [])));
  };

  return (
    <>
      <button
        className="chip"
        onClick={() => void toggle()}
        style={{
          border: "none",
          cursor: "pointer",
          ...(open ? { background: "var(--accent-soft)", color: "var(--accent)" } : {}),
        }}
        title={t("similar.title")}
      >
        ≈ {t("similar.chip")}
      </button>
      {open && (
        <div
          style={{
            flexBasis: "100%",
            margin: "6px 0 2px",
            padding: "8px 12px",
            borderInlineStart: "3px solid var(--accent-soft)",
          }}
        >
          {rows === null ? (
            <span className="muted">{t("loading")}</span>
          ) : rows.length === 0 ? (
            <span className="muted">{t("notFound")}</span>
          ) : (
            rows.map((r) => (
              <div key={r.ayah.location} style={{ padding: "6px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <AyahRef location={r.ayah.location} />
                  <span className="chip" style={{ fontSize: 10.5 }}>
                    {num(Math.round(r.score * 100))}٪
                  </span>
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
                  onClick={() => navigate(readPathOf(r.ayah.location))}
                >
                  {r.ayah.textUthmani}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
