/**
 * Dashboard — corpus statistics overview (/dashboard).
 *
 * Stat tiles · Meccan/Medinan split bars · longest/shortest surahs ·
 * top roots + letter frequency (from the precomputed stats doc) ·
 * revelation-order strip. All charts are plain CSS bars.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getStats, listSurahs, topRoots } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { RootDoc, SurahDoc } from "../types";

const MECCAN_COLOR = "var(--accent)";
const MEDINAN_COLOR = "var(--gold)";

/** Fallback totals shown when the stats doc is missing from this db build. */
const STATIC_COUNTS: { key: string; labelKey: string; value: number }[] = [
  { key: "surahs", labelKey: "dashboard.surahs", value: 114 },
  { key: "ayahs", labelKey: "dashboard.ayahsT", value: 6236 },
  { key: "words", labelKey: "dashboard.words", value: 77429 },
  { key: "segments", labelKey: "dashboard.segments", value: 130030 },
  { key: "roots", labelKey: "dashboard.roots", value: 1651 },
  { key: "lemmas", labelKey: "dashboard.lemmasT", value: 4776 },
];

const fmt = (n: number): string => num(n);

// --- defensive readers for the untyped stats doc ---------------------------

type StatsDoc = Record<string, unknown>;

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function liveCount(stats: StatsDoc | null, key: string): number | null {
  if (!stats) return null;
  const counts = asRecord(stats.counts);
  return (counts ? asNumber(counts[key]) : null) ?? asNumber(stats[key]);
}

interface NamedCount {
  name: string;
  count: number;
}

/** Normalize stats.topRoots ([{root, occurrences}] in the current converter). */
function extractRootStats(stats: StatsDoc | null): NamedCount[] {
  const raw = stats?.topRoots;
  if (!Array.isArray(raw)) return [];
  const out: NamedCount[] = [];
  for (const item of raw as unknown[]) {
    const o = asRecord(item);
    if (!o) continue;
    const name = typeof o.root === "string" ? o.root : null;
    const count = asNumber(o.occurrences) ?? asNumber(o.count) ?? asNumber(o.freq);
    if (name && count != null) out.push({ name, count });
  }
  return out;
}

/** Normalize stats.letterFreq ([{letter, freq}] or a {letter: n} record). */
function extractLetterStats(stats: StatsDoc | null): NamedCount[] {
  const raw = stats?.letterFreq ?? stats?.letterFrequencies ?? stats?.letters;
  const out: NamedCount[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw as unknown[]) {
      const o = asRecord(item);
      if (!o) continue;
      const name =
        typeof o.letter === "string" ? o.letter : typeof o.char === "string" ? o.char : null;
      const count = asNumber(o.freq) ?? asNumber(o.count) ?? asNumber(o.occurrences);
      if (name && count != null) out.push({ name, count });
    }
  } else {
    const rec = asRecord(raw);
    if (rec) {
      for (const [k, v] of Object.entries(rec)) {
        const n = asNumber(v);
        if (n != null) out.push({ name: k, count: n });
      }
    }
  }
  return out.sort((a: NamedCount, b: NamedCount) => b.count - a.count);
}

// --- small presentational pieces --------------------------------------------

function StatTile({ label, value, live }: { label: string; value: number; live: boolean }) {
  return (
    <div
      className="card"
      style={{ flex: "1 1 130px", minWidth: 120, padding: "12px 16px" }}
    >
      <div
        className="muted"
        style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 2 }}>{fmt(value)}</div>
    </div>
  );
}

function LegendSwatch({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }}
      />
      <span className="muted">{text}</span>
    </span>
  );
}

/** Two-segment 100% horizontal bar: Meccan (accent) vs Medinan (gold). */
function SplitBar({ title, meccan, medinan }: { title: string; meccan: number; medinan: number }) {
  const total = meccan + medinan;
  const pct = total > 0 ? (meccan / total) * 100 : 50;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 5,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        <span className="muted">
          {t("reader.meccan")} {fmt(meccan)} ({fmt(Math.round(pct))}٪) · {t("reader.medinan")}{" "}
          {fmt(medinan)} ({fmt(Math.round(100 - pct))}٪)
        </span>
      </div>
      <div style={{ display: "flex", gap: 2, height: 14 }} role="img" aria-label={title}>
        <div
          title={`${t("reader.meccan")} — ${fmt(meccan)}`}
          style={{ width: `${pct}%`, background: MECCAN_COLOR, borderRadius: 3 }}
        />
        <div
          title={`${t("reader.medinan")} — ${fmt(medinan)}`}
          style={{ flex: 1, background: MEDINAN_COLOR, borderRadius: 3 }}
        />
      </div>
    </div>
  );
}

/** Horizontal bar list — one row per item, width scaled to the max count. */
function BarList({
  items,
  labelWidth,
  linkTo,
}: {
  items: NamedCount[];
  labelWidth: number;
  linkTo?: (name: string) => string;
}) {
  const max = Math.max(...items.map((i: NamedCount) => i.count), 1);
  return (
    <div>
      {items.map((i: NamedCount) => (
        <div
          key={i.name}
          title={`${i.name} — ${fmt(i.count)}`}
          style={{
            display: "grid",
            gridTemplateColumns: `${labelWidth}px 1fr 64px`,
            alignItems: "center",
            gap: 10,
            padding: "3px 0",
          }}
        >
          {linkTo ? (
            <Link to={linkTo(i.name)} className="quran" style={{ fontSize: 18, lineHeight: 1.5 }}>
              {i.name}
            </Link>
          ) : (
            <span className="quran" style={{ fontSize: 18, lineHeight: 1.5 }}>
              {i.name}
            </span>
          )}
          <div style={{ height: 10, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                width: `${(i.count / max) * 100}%`,
                height: "100%",
                background: "var(--accent)",
                borderRadius: 3,
              }}
            />
          </div>
          <span
            className="muted"
            style={{ fontVariantNumeric: "tabular-nums", textAlign: "end" }}
          >
            {fmt(i.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SurahTable({ title, rows }: { title: string; rows: SurahDoc[] }) {
  useUILang();
  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            <th>{t("dashboard.surahs")}</th>
            <th style={{ textAlign: "end" }}>{t("dashboard.ayahsT")}</th>
            <th style={{ textAlign: "end" }}>{t("dashboard.words")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s: SurahDoc) => (
            <tr key={s.surahNo}>
              <td className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(s.surahNo)}
              </td>
              <td>
                <Link to={`/read/${s.surahNo}`} className="quran" style={{ fontSize: 17, lineHeight: 1.2 }}>
                  {s.nameAr}
                </Link>{" "}
                {getUILang() !== "ar" && (
                  <span className="muted" style={{ fontSize: 11 }}>{s.nameTranslit}</span>
                )}
              </td>
              <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>
                {fmt(s.ayahCount)}
              </td>
              <td style={{ textAlign: "end", fontVariantNumeric: "tabular-nums" }}>
                {fmt(s.wordCount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- the view ----------------------------------------------------------------

/** The small `meta` roll-up of every knowledge layer (public/layer-stats.json). */
interface LayerStats {
  jawami: { principles: number; hubs: number; links: number; rels: Record<string, number> };
  muhkamat: { count: number; kubra: number; network: { nodes: number; giantPct: number; avgHops: number } };
  mawdui: { sections: number; topics: number; verses: number };
  furuq: { pairs: number; categories: Record<string, number> };
  network: { inNetwork: number; mathani: number };
}

export default function Dashboard() {
  useUILang();
  const [surahs, setSurahs] = useState<SurahDoc[]>([]);
  const [stats, setStats] = useState<StatsDoc | null>(null);
  const [rootStats, setRootStats] = useState<NamedCount[]>([]);
  const [layers, setLayers] = useState<LayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [all, statsDoc, lyr] = await Promise.all([
        listSurahs(),
        getStats().catch(() => null as StatsDoc | null),
        fetch(`${import.meta.env.BASE_URL}layer-stats.json?v=${__DATA_VERSION__}`)
          .then((r) => (r.ok ? (r.json() as Promise<LayerStats>) : null))
          .catch(() => null),
      ]);
      if (cancelled) return;
      setSurahs(all);
      setStats(statsDoc);
      setLayers(lyr);
      let roots = extractRootStats(statsDoc).slice(0, 20);
      if (statsDoc && roots.length === 0) {
        // stats doc exists but has no usable top-roots list: derive live.
        try {
          const docs = await topRoots(20);
          roots = docs.map((r: RootDoc) => ({ name: r.root, count: r.occurrences }));
        } catch {
          roots = [];
        }
      }
      if (!cancelled) {
        setRootStats(roots);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const revelation = useMemo(() => {
    let meccanSurahs = 0;
    let medinanSurahs = 0;
    let meccanWords = 0;
    let medinanWords = 0;
    for (const s of surahs) {
      if (s.revelation === "Meccan") {
        meccanSurahs += 1;
        meccanWords += s.wordCount;
      } else {
        medinanSurahs += 1;
        medinanWords += s.wordCount;
      }
    }
    return { meccanSurahs, medinanSurahs, meccanWords, medinanWords };
  }, [surahs]);

  const chrono = useMemo(
    () => [...surahs].sort((a: SurahDoc, b: SurahDoc) => a.chronoOrder - b.chronoOrder),
    [surahs],
  );
  const longest = useMemo(
    () => [...surahs].sort((a: SurahDoc, b: SurahDoc) => b.wordCount - a.wordCount).slice(0, 8),
    [surahs],
  );
  const shortest = useMemo(
    () => [...surahs].sort((a: SurahDoc, b: SurahDoc) => a.wordCount - b.wordCount).slice(0, 8),
    [surahs],
  );
  const letters = useMemo(() => extractLetterStats(stats).slice(0, 15), [stats]);

  if (loading) {
    return (
      <div className="page">
        <p className="muted">{t("loading")}</p>
      </div>
    );
  }

  if (surahs.length === 0) {
    return (
      <div className="page">
        <div className="card page-narrow">
          <p>{t("notFound")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 18, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t("dashboard.title")}</div>
          <Link to="/fawasil" className="chip link" style={{ textDecoration: "none" }}>
            {getUILang() === "ar" ? "أطلس الفواصل ←" : "rhyme atlas →"}
          </Link>
        </header>

        {/* stat tiles */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          {STATIC_COUNTS.map((c: { key: string; labelKey: string; value: number }) => {
            const live = liveCount(stats, c.key);
            return (
              <StatTile key={c.key} label={t(c.labelKey)} value={live ?? c.value} live={live != null} />
            );
          })}
        </div>

        {/* knowledge layers — everything we computed over the text */}
        {layers &&
          (() => {
            const ar = getUILang() === "ar";
            const rels = Object.entries(layers.jawami.rels)
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count);
            const cats = Object.entries(layers.furuq.categories)
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count);
            const net = layers.muhkamat.network;
            return (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{ar ? "طبقات المعرفة" : "Knowledge layers"}</div>
                <div className="muted" style={{ marginBottom: 14 }}>
                  {ar ? "ما حسبناه فوق النصّ — كلٌّ قابل للتصفّح" : "what we computed over the text — each browsable"}
                </div>
                <div className="lyr-grid">
                  <Link to="/jawami" className="lyr">
                    <div className="lyr-n">{num(layers.jawami.principles)}</div>
                    <div className="lyr-t">{ar ? "آية جامعة" : "principles"}</div>
                    <div className="lyr-s">{num(layers.jawami.hubs)} {ar ? "لها تفصيل" : "with tafsil"}</div>
                  </Link>
                  <Link to="/jawami" className="lyr">
                    <div className="lyr-n">{num(layers.jawami.links)}</div>
                    <div className="lyr-t">{ar ? "رابط تفصيل" : "tafsil links"}</div>
                    <div className="lyr-s">{ar ? "٤ علاقات مُراجَعة" : "4 reviewed relations"}</div>
                  </Link>
                  <Link to="/jawami" className="lyr">
                    <div className="lyr-n">{num(layers.muhkamat.count)}</div>
                    <div className="lyr-t">{ar ? "محكمة جامعة" : "muhkamat"}</div>
                    <div className="lyr-s">{ar ? `من ${num(layers.muhkamat.kubra)} عنقودًا` : `from ${layers.muhkamat.kubra}`}</div>
                  </Link>
                  <Link to="/mawdui" className="lyr">
                    <div className="lyr-n">{num(layers.mawdui.topics)}</div>
                    <div className="lyr-t">{ar ? "موضوعًا" : "topics"}</div>
                    <div className="lyr-s">{num(layers.mawdui.sections)} {ar ? "أقسام · تغطية كاملة" : "sections"}</div>
                  </Link>
                  <div className="lyr" style={{ cursor: "default" }}>
                    <div className="lyr-n">{num(net.giantPct)}٪</div>
                    <div className="lyr-t">{ar ? "نسيجٌ واحد" : "one fabric"}</div>
                    <div className="lyr-s">{num(layers.network.inNetwork)} {ar ? `آية · ${num(net.avgHops)} خطوة` : "ayahs in network"}</div>
                  </div>
                  <Link to="/jawami" className="lyr">
                    <div className="lyr-n">{num(layers.network.mathani)}</div>
                    <div className="lyr-t">{ar ? "مثاني" : "mathani"}</div>
                    <div className="lyr-s">{ar ? "أزواج متقابلة" : "reciprocal pairs"}</div>
                  </Link>
                  <div className="lyr" style={{ cursor: "default" }}>
                    <div className="lyr-n">{num(layers.furuq.pairs)}</div>
                    <div className="lyr-t">{ar ? "فروق التنزيل" : "furuq"}</div>
                    <div className="lyr-s">{ar ? "بين المتشابهات لفظًا" : "between look-alikes"}</div>
                  </div>
                </div>
                <div className="grid-2" style={{ marginTop: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{ar ? "علاقات التفصيل" : "tafsil relations"}</div>
                    <BarList items={rels} labelWidth={44} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{ar ? "فئات فروق التنزيل" : "furuq categories"}</div>
                    <BarList items={cats} labelWidth={72} />
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Meccan vs Medinan + revelation-order strip */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>{t("dashboard.meccanMedinan")}</div>
            <div style={{ display: "flex", gap: 14 }}>
              <LegendSwatch color={MECCAN_COLOR} text={t("reader.meccan")} />
              <LegendSwatch color={MEDINAN_COLOR} text={t("reader.medinan")} />
            </div>
          </div>
          <SplitBar
            title={t("dashboard.surahs")}
            meccan={revelation.meccanSurahs}
            medinan={revelation.medinanSurahs}
          />
          <SplitBar
            title={t("dashboard.words")}
            meccan={revelation.meccanWords}
            medinan={revelation.medinanWords}
          />

          <div style={{ borderTop: "1px solid var(--line)", margin: "14px 0", paddingTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{t("dashboard.revOrder")}</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              {t("dashboard.revOrderHint")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {chrono.map((s: SurahDoc) => (
                <Link
                  key={s.surahNo}
                  to={`/read/${s.surahNo}`}
                  title={`${s.chronoOrder}. ${s.nameAr}`}
                  aria-label={`${s.chronoOrder}. ${s.nameAr}`}
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    display: "block",
                    background: s.revelation === "Meccan" ? MECCAN_COLOR : MEDINAN_COLOR,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* longest / shortest surahs */}
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <SurahTable title={t("dashboard.longest")} rows={longest} />
          <SurahTable title={t("dashboard.shortest")} rows={shortest} />
        </div>

        {/* top roots + letter frequency (need the stats doc) */}
        {stats == null ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              {t("notFound")} — <Link to="/roots">{t("roots.title")}</Link>
            </p>
          </div>
        ) : (
          <div className="grid-2">
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{t("dashboard.topRoots")}</div>
              <div className="muted" style={{ marginBottom: 10 }}>
                {t("dashboard.topRootsHint")}
              </div>
              {rootStats.length > 0 ? (
                <BarList
                  items={rootStats}
                  labelWidth={64}
                  linkTo={(name: string) => `/roots/${encodeURIComponent(name)}`}
                />
              ) : (
                <p className="muted" style={{ margin: 0 }}>{t("notFound")}</p>
              )}
            </div>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{t("dashboard.letterFreq")}</div>
              <div className="muted" style={{ marginBottom: 10 }}>
                {t("dashboard.letterFreqHint")}
              </div>
              {letters.length > 0 ? (
                <BarList items={letters} labelWidth={32} />
              ) : (
                <p className="muted" style={{ margin: 0 }}>{t("notFound")}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
