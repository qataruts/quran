/**
 * المحكمات الجامعة — browse the pyramid's apex. Level 1: the 40 كبرى (major
 * principles). Level 2: one كبرى → its verified محكمات, each shown with its
 * «أمّ» (mother principle-verse) illuminated and its جوامع beneath. From
 * muhkamat.json; the reader climbs from the great root down to the detail.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import { readPathOf } from "../types";
import type { AyahDoc } from "../types";
import { jawamiCount, useMuhkamat, type Kubra, type Muhkama } from "../muhkamat";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/** the جوامع under a محكمة — collapsed to a count, expands to clickable refs. */
function Members({ m, texts }: { m: Muhkama; texts: Map<string, AyahDoc> }) {
  const [open, setOpen] = useState(false);
  const ar = getUILang() === "ar";
  const others = m.members.filter((loc) => loc !== m.umm);
  if (others.length === 0) return null;
  return (
    <div className="mk-members">
      <button className="mk-members-btn" onClick={() => setOpen(!open)}>
        {open ? "▾" : "◂"} {ar ? "الجوامع المندرجة" : "principle-verses under it"}{" "}
        <span className="muted">· {num(others.length)}</span>
      </button>
      {open && (
        <div className="mk-members-list">
          {others.map((loc) => (
            <Link key={loc} to={readPathOf(loc)} className="mk-verse">
              <span className="mk-verse-ref">{arName(loc)}</span>
              <span className="mk-verse-text quran">{texts.get(loc)?.textClean ?? loc}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** one محكمة: title · theme · the illuminated أمّ verse · its جوامع. */
function MuhkamaCard({ m, texts }: { m: Muhkama; texts: Map<string, AyahDoc> }) {
  const ar = getUILang() === "ar";
  const umm = texts.get(m.umm);
  return (
    <div className="mk-card">
      <h3 className="mk-title">{m.title}</h3>
      {m.theme && <p className="mk-theme">{m.theme}</p>}
      <Link to={readPathOf(m.umm)} className="mk-umm">
        <span className="mk-umm-lbl">{ar ? "الأمّ" : "root verse"} · {arName(m.umm)}</span>
        <span className="mk-umm-text quran">{umm?.textUthmani ?? m.umm}</span>
      </Link>
      <Members m={m} texts={texts} />
    </div>
  );
}

/* --------------------------------- level 2 --------------------------------- */
function KubraView({ kb, texts }: { kb: Kubra; texts: Map<string, AyahDoc> }) {
  useUILang();
  const ar = getUILang() === "ar";
  return (
    <>
      <nav className="mw-crumb" aria-label={ar ? "مسار" : "path"}>
        <Link to="/muhkamat">{ar ? "المحكمات" : "Muhkamat"}</Link>
        <span className="mw-sep">›</span>
        <span className="mw-here">{kb.title}</span>
      </nav>
      <header className="jw-header">
        <h1 className="jw-title">{kb.title}</h1>
        <p className="jw-lead">
          {ar
            ? `أصلٌ كبرى يضمّ ${num(kb.muhkamat.length)} محكمةً متجانسة، و${num(jawamiCount(kb))} آيةً جامعة.`
            : `A major principle holding ${num(kb.muhkamat.length)} coherent muhkamāt and ${num(jawamiCount(kb))} principle-verses.`}
        </p>
      </header>
      <div className="mk-cards">
        {kb.muhkamat.map((m, i) => (
          <MuhkamaCard key={i} m={m} texts={texts} />
        ))}
      </div>
      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <Link to="/muhkamat" className="chip link" style={{ textDecoration: "none" }}>
          ← {ar ? "كل الأصول" : "all principles"}
        </Link>
      </div>
    </>
  );
}

/* --------------------------------- level 1 --------------------------------- */
function Index({ data }: { data: NonNullable<ReturnType<typeof useMuhkamat>> }) {
  const ar = getUILang() === "ar";
  const net = data.meta.network;
  return (
    <>
      <header className="jw-header">
        <h1 className="jw-title">{ar ? "المحكمات الجامعة" : "The Governing Principles"}</h1>
        <p className="jw-lead">
          {ar
            ? "الطبقة الثالثة فوق الجوامع: عنقدنا الآياتِ الجامعة في أصولٍ كبرى، ثم دقّقنا كلَّ عنقودٍ عدائيًّا حتى لا يجمعه إلا معنًى واحد. اصعد من الأصل الكبير إلى المحكمة إلى جوامعها إلى تفصيلها."
            : "The third layer above the principle-verses: the جوامع clustered into major roots, each cluster then adversarially split until one meaning binds it. Climb from the great root to the muhkama to its verses to their detail."}
        </p>
        <div className="jw-stats">
          <span className="chip"><b>{num(data.meta.muhkamat)}</b> {ar ? "محكمة" : "muhkamāt"}</span>
          <span className="chip"><b>{num(data.meta.kubra)}</b> {ar ? "أصلًا كبرى" : "major roots"}</span>
          <span className="chip"><b>{num(data.meta.principles)}</b> {ar ? "آية جامعة" : "principles"}</span>
          <span className="chip"><b>{num(net.giantPct)}٪</b> {ar ? "نسيجٌ واحد" : "one fabric"}</span>
        </div>
      </header>
      <div className="mk-kubra-grid">
        {data.kubra.map((kb, i) =>
          kb.muhkamat.length === 0 ? null : (
            <Link key={i} to={`/muhkamat/${i}`} className="mk-kubra-card" title={kb.title}>
              <span className="mk-kubra-title">{kb.title}</span>
              <span className="mk-kubra-preview">
                {kb.muhkamat.map((m) => m.title).slice(0, 3).join(" · ")}
              </span>
              <span className="mk-kubra-meta">
                {num(kb.muhkamat.length)} {ar ? "محكمة" : "muhkamāt"} · {num(jawamiCount(kb))} {ar ? "جامعة" : "verses"}
                {kb.coherent && <span className="mk-coherent"> · {ar ? "متجانسة" : "coherent"}</span>}
              </span>
            </Link>
          ),
        )}
      </div>
    </>
  );
}

export default function Muhkamat() {
  useUILang();
  const params = useParams<{ k?: string }>();
  const data = useMuhkamat();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());

  useEffect(() => {
    ayahByLocationMap().then(setTexts);
  }, []);

  const kIdx = params.k != null ? Number(params.k) : null;
  const kb = useMemo(() => (data && kIdx != null ? data.kubra[kIdx] : null), [data, kIdx]);

  if (!data) {
    return (
      <div className="page page-narrow">
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="jw-wrap">
        {kb ? <KubraView kb={kb} texts={texts} /> : <Index data={data} />}
      </div>
    </div>
  );
}
