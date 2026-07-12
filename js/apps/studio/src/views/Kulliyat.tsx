/**
 * الكلّيّات والجوامع والتفصيل — the computed classification. Browse the كلّيّات
 * (theme heads); tap one to see its theme laid out كلّيّة → جوامع → تفصيل. From
 * the Qur'an's own data (see docs/kulliyat-methodology.md).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ayahByLocationMap, surahNameAr } from "../db";
import { getUILang, num, t, useUILang } from "../i18n";
import type { AyahDoc } from "../types";
import { kulliyatList, kulliyatMeta, themeMembers, tierCounts, useKulliyat } from "../kulliyat";

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

function VerseRow({ loc, texts, cls }: { loc: string; texts: Map<string, AyahDoc>; cls?: string }) {
  const [s, a] = loc.split(":");
  return (
    <Link to={`/read/${s}/${a}`} className={`kl-verse${cls ? " " + cls : ""}`}>
      <span className="kl-verse-ref">{arName(loc)}</span>
      <span className="quran kl-verse-text">{texts.get(loc)?.textClean ?? loc}</span>
    </Link>
  );
}

export default function Kulliyat() {
  useUILang();
  const ar = getUILang() === "ar";
  const ready = useKulliyat();
  const [texts, setTexts] = useState<Map<string, AyahDoc>>(new Map());
  const [theme, setTheme] = useState<number | null>(null);
  const [limit, setLimit] = useState(40);
  useEffect(() => { ayahByLocationMap().then(setTexts); }, []);
  useEffect(() => { setLimit(40); }, [theme]);

  const list = useMemo(() => (ready ? kulliyatList() : []), [ready]);
  const counts = useMemo(() => (ready ? tierCounts() : { kulliya: 0, jamia: 0, tafsil: 0 }), [ready]);
  const meta = ready ? kulliyatMeta() : null;
  const cur = theme ?? list[0]?.theme ?? null;
  const members = useMemo(() => (cur != null ? themeMembers(cur) : null), [cur, ready]);

  if (!ready) {
    return <div className="page page-narrow"><div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div></div>;
  }

  return (
    <div className="page">
      <div className="jw-wrap">
        <header className="jw-header">
          <h1 className="jw-title">{ar ? "الكلّيّات والجوامع والتفصيل" : "Kulliyyāt · Jawāmiʿ · Tafṣīl"}</h1>
          <p className="jw-lead">
            {ar
              ? "تصنيفٌ محسوبٌ لآيات القرآن في مراتبَ متدرّجة، من بيانات القرآن نفسِه: نصِّه وصرفِه ولغتِه وتجاورِ معانيه. كلُّ آيةٍ لها موضع."
              : "A computed classification of every verse into graded tiers, from the Qur'an's own data. Every verse is placed."}
          </p>
          <div className="jw-stats">
            <span className="chip gold"><b>{num(counts.kulliya)}</b> {ar ? "كلّيّة" : "kulliyya"}</span>
            <span className="chip"><b>{num(counts.jamia)}</b> {ar ? "جامعة" : "jāmiʿa"}</span>
            <span className="chip"><b>{num(counts.tafsil)}</b> {ar ? "تفصيل" : "tafṣīl"}</span>
            <span className="chip"><b>{num(meta?.themes ?? 0)}</b> {ar ? "محورًا" : "themes"}</span>
          </div>
        </header>

        <div className="kl-layout">
          <aside className="kl-list">
            {list.map((k) => (
              <button key={k.loc} className={`kl-headbtn${k.theme === cur ? " on" : ""}`} onClick={() => setTheme(k.theme)}>
                <span className="kl-head-ref">{arName(k.loc)}</span>
                <span className="quran kl-head-text">{texts.get(k.loc)?.textClean ?? k.loc}</span>
                <span className="muted kl-head-size">{num(k.size)}</span>
              </button>
            ))}
          </aside>

          <main className="kl-theme">
            {members && (
              <>
                {members.kulliya && (
                  <div className="kl-block kl-block-k">
                    <div className="kl-tier gold">◆ {ar ? "كلّيّة" : "kulliyya"}</div>
                    <VerseRow loc={members.kulliya} texts={texts} cls="k" />
                  </div>
                )}
                {members.jawami.length > 0 && (
                  <div className="kl-block">
                    <div className="kl-tier">{ar ? "جوامع" : "jawāmiʿ"} <span className="muted">· {num(members.jawami.length)}</span></div>
                    {members.jawami.map((loc) => <VerseRow key={loc} loc={loc} texts={texts} cls="j" />)}
                  </div>
                )}
                {members.tafsil.length > 0 && (
                  <div className="kl-block">
                    <div className="kl-tier">{ar ? "تفصيل" : "tafṣīl"} <span className="muted">· {num(members.tafsil.length)}</span></div>
                    {members.tafsil.slice(0, limit).map((loc) => <VerseRow key={loc} loc={loc} texts={texts} />)}
                    {members.tafsil.length > limit && (
                      <button className="chip kl-more" onClick={() => setLimit(limit + 60)}>
                        {ar ? `عرض المزيد (${num(members.tafsil.length - limit)})` : "show more"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
