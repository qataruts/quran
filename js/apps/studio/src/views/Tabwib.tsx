/**
 * مواضيع مشكاة — تبويبٌ موضوعيٌّ محسوبٌ بالكامل من منتجات أسراب السياق:
 * عنقدةُ معاني وحداتِ السياق المسمّاة (١٣٢٥) إلى ~١٢٠ موضوعًا متجانسًا، ثم
 * ١٤ بابًا كبرى — فالمصحفُ كلُّه مبوَّب وحدةً وحدة، على شكل التقليدي وبحسابنا.
 *   /tabwib        → الأبواب
 *   /tabwib/:bab   → باب ← مواضيعه (أكورديون) ← وحداته بنصوص فواتحها
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { loadSiyaq, type SiyaqUnit } from "../siyaq";
import { loadTopics, topicBabsList, topicBabOf, type TopicBab, type Topic } from "../tabwib";
import TopicLayerToggle from "../components/TopicLayerToggle";
import type { AyahDoc } from "../types";

function useTopicsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([loadTopics(), loadSiyaq()]).then(() => live && setReady(true));
    return () => { live = false; };
  }, []);
  return ready;
}

function BabsView() {
  const ar = getUILang() === "ar";
  const babs = topicBabsList();
  const topicsTotal = useMemo(() => babs.reduce((s, b) => s + b.topics.length, 0), [babs]);
  return (
    <>
      <header className="mw-head">
        <h1 className="mw-title">{ar ? "مواضيع مشكاة" : "Mishkat Topics"}</h1>
        <p className="mw-lead">
          {ar
            ? "تبويبٌ موضوعيٌّ محسوبٌ بالكامل من إصدار مشكاة: مقاطعُ المصحف — وحداتُ السياق المسمّاةُ وحدةً وحدة — تجمّعت بتقارب معانيها مواضيعَ، والمواضيعُ أبوابًا. لا قائمةَ موضوعاتٍ جاهزة: حسبنا وعرضنا، والقارئ يتدبّر."
            : "A fully computed topical index from Mishkat: the muṣḥaf's passages — the named context units — gathered by meaning into topics, and the topics into chapters. No preset list: computed and shown."}
        </p>
        <div className="muted" style={{ fontSize: 13 }}>{num(babs.length)} {ar ? "بابًا" : "chapters"} · {num(topicsTotal)} {ar ? "موضوعًا" : "topics"} · {num(1325)} {ar ? "وحدة تغطي المصحف كله" : "units covering the whole muṣḥaf"}</div>
        <TopicLayerToggle />
      </header>
      <div className="mw-topics mw-topics-lg">
        {babs.map((b) => (
          <Link key={b.id} to={`/tabwib/${b.id}`} className="mw-topic-card">
            <span className="mw-topic-name">{b.name}</span>
            <span className="mw-topic-count">{num(b.topics.length)} {ar ? "موضوعًا" : "topics"} · {num(b.unitsCount)} {ar ? "وحدة" : "units"}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function BabView({ bab }: { bab: TopicBab }) {
  const ar = getUILang() === "ar";
  const [units, setUnits] = useState<SiyaqUnit[] | null>(null);
  useEffect(() => {
    let live = true;
    loadSiyaq().then((sy) => { if (live && sy) setUnits((sy as { units: SiyaqUnit[] }).units); });
    return () => { live = false; };
  }, []);
  const verseCount = (tp: Topic) => tp.units.reduce((n, ui) => { const u = units?.[ui]; return u ? n + (u.a2 - u.a1 + 1) : n; }, 0);
  if (!units) return <p className="muted">{t("loading")}</p>;
  return (
    <>
      <nav className="mw-crumb" aria-label="مسار">
        <Link to="/tabwib">{ar ? "مواضيع مشكاة" : "Topics"}</Link>
        <span className="mw-sep">›</span>
        <span className="mw-here">{bab.name}</span>
      </nav>
      <header className="mw-head">
        <h1 className="mw-title">{bab.name}</h1>
        <div className="muted" style={{ fontSize: 13 }}>{num(bab.topics.length)} {ar ? "موضوعًا" : "topics"} · {num(bab.unitsCount)} {ar ? "وحدة" : "units"}</div>
      </header>
      <div className="mw-topics">
        {bab.topics.map((tp) => (
          <Link key={tp.id} to={`/tabwib/${bab.id}/${tp.id}`} className="mw-topic-card">
            <span className="mw-topic-name">{tp.name}</span>
            <span className="mw-topic-count">{num(verseCount(tp))} {ar ? "آية" : "verses"}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function TopicView({ bab, topic, texts }: { bab: TopicBab; topic: Topic; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const [units, setUnits] = useState<SiyaqUnit[] | null>(null);
  useEffect(() => {
    let live = true;
    loadSiyaq().then((sy) => { if (live && sy) setUnits((sy as { units: SiyaqUnit[] }).units); });
    return () => { live = false; };
  }, []);
  if (!units) return <p className="muted">{t("loading")}</p>;
  const rows: { loc: string; s: number; a: number; uname: string }[] = [];
  for (const ui of topic.units) {
    const u = units[ui];
    if (!u) continue;
    for (let a = u.a1; a <= u.a2; a++) rows.push({ loc: `${u.s}:${a}`, s: u.s, a, uname: u.name });
  }
  return (
    <>
      <nav className="mw-crumb" aria-label="مسار">
        <Link to="/tabwib">{ar ? "مواضيع مشكاة" : "Topics"}</Link>
        <span className="mw-sep">›</span>
        <Link to={`/tabwib/${bab.id}`}>{bab.name}</Link>
        <span className="mw-sep">›</span>
        <span className="mw-here">{topic.name}</span>
      </nav>
      <header className="mw-head">
        <h1 className="mw-title">{topic.name}</h1>
        <div className="muted" style={{ fontSize: 13 }}>{num(topic.units.length)} {ar ? "وحدة" : "units"} · {num(rows.length)} {ar ? "آية" : "verses"}</div>
      </header>
      <div className="mw-verses">
        {rows.map(({ loc, s: su, a, uname }) => (
          <Link key={loc} to={`/read/${su}/${a}`} className="mw-verse" title={uname}>
            <span className="mw-verse-ref">{surahNameAr(su)} {num(a)}</span>
            <span className="mw-verse-text quran">{texts.get(loc)?.textUthmani ?? texts.get(loc)?.textClean ?? ""}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function Tabwib() {
  useUILang();
  const ready = useTopicsReady();
  const params = useParams<{ bab?: string; topic?: string }>();
  const babId = params.bab != null ? Number(params.bab) : null;
  const topicId = params.topic != null ? Number(params.topic) : null;
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);
  const bab = useMemo(() => (ready && babId != null ? topicBabOf(babId) : null), [ready, babId]);
  const topic = useMemo(() => (bab && topicId != null ? bab.topics.find((x) => x.id === topicId) ?? null : null), [bab, topicId]);
  if (!ready) {
    return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;
  }
  return (
    <div className="page">
      <div className="mw-wrap">
        {babId == null ? <BabsView /> : !bab ? <p className="muted">{t("notFound")}</p> : topicId == null ? <BabView bab={bab} /> : topic ? <TopicView bab={bab} topic={topic} texts={texts} /> : <p className="muted">{t("notFound")}</p>}
      </div>
    </div>
  );
}
