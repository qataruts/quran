/**
 * البيان — تدبر لغة القرآن الخاصة، على طبقتين:
 *  · بطاقات محرَّرة (bayan.json): خريطة استعمالٍ محسوبة حتميًّا (usage_map.py)
 *    جنبًا إلى جنب مع قراءاتٍ منقولة منسوبة — لا تعليل آليًّا.
 *  · مكتبة البيان (bayan-lib-*.json): الكتب المدخلية الخمسة مهيكلةً مجذّرةً
 *    (إسناد سرب ب١ المعتمد بعينة مصونة) — كتابٌ يُجلب عند طلبه، وفهرس أبجدي،
 *    وكل جذرٍ يفتح خريطته الحية في المعجم.
 * Routes: /bayan + /bayan/:id — البناء: scripts/build-bayan-cards.mjs.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { surahNameAr } from "../db";
import { getUILang, num, useUILang } from "../i18n";
import { readPathOf } from "../types";
import PageSearch from "../components/PageSearch";
import { fuzzyMatch } from "../lib/fuzzy";

interface Occ { loc: string; form: string; unit: string; txt: string }
interface Side {
  name: string; total: number; makki: number; madani: number;
  aspects: Record<string, number>; colloc: [string, number][]; occ: Occ[];
}
interface Reading { src: string; quote: string }
interface Card {
  id: string; title: string; type: string; kashf: string;
  readings: Reading[]; sides: Side[]; contrast: Record<string, [string, number][]> | null;
}
interface BayanData { types: Record<string, string>; cards: Card[] }
interface LibEntry { id: string; head: string; roots: string[]; text: string }
interface LibBookMeta { id: string; label: string; count: number }

interface AutoSide { root: string; total: number; makki: number; madani: number; colloc: [string, number][]; occ: { loc: string; form: string; unit: string }[]; capped: boolean }
interface AutoCard { id: string; head: string; roots: string[]; sides: AutoSide[]; contrast: Record<string, [string, number][]>; reading: Reading }

let cache: BayanData | null = null;
let libIndexCache: LibBookMeta[] | null = null;
const libBookCache = new Map<string, LibEntry[]>();
let autoCache: AutoCard[] | null = null;
const autoWaiters: (() => void)[] = [];
function loadAuto(done: () => void) {
  if (autoCache) { done(); return; }
  autoWaiters.push(done);
  if (autoWaiters.length > 1) return;
  fetch(`${import.meta.env.BASE_URL}bayan-auto.json?v=${__DATA_VERSION__}`)
    .then((r) => r.json())
    .then((d: { cards: AutoCard[] }) => { autoCache = d.cards; autoWaiters.splice(0).forEach((f) => f()); })
    .catch(() => { autoCache = []; autoWaiters.splice(0).forEach((f) => f()); });
}

function useBayan(): BayanData | null {
  const [data, setData] = useState<BayanData | null>(cache);
  useEffect(() => {
    if (cache) return;
    fetch(`${import.meta.env.BASE_URL}bayan.json?v=${__DATA_VERSION__}`)
      .then((r) => r.json())
      .then((d: BayanData) => { cache = d; setData(d); })
      .catch(() => setData(null));
  }, []);
  return data;
}

const arName = (loc: string) => `${surahNameAr(Number(loc.split(":")[0]))} ${num(loc.split(":")[1])}`;

/** لوحة طرفٍ واحد: العدّادان ثم المصاحبات ثم المواضع كلها قابلة للطي */
function SidePanel({ s }: { s: Side }) {
  const aspects = Object.entries(s.aspects).filter(([, n]) => n > 0);
  return (
    <details className="by-side">
      <summary>
        <b>{s.name}</b>
        <span className="chip">{num(s.total)} موضعًا</span>
        <span className="chip">مكي {num(s.makki)} · مدني {num(s.madani)}</span>
        {aspects.length > 0 && (
          <span className="chip">{aspects.map(([k, n]) => `${k} ${num(n)}`).join(" · ")}</span>
        )}
      </summary>
      {s.colloc.length > 0 && (
        <p className="by-colloc">
          <b>أعلى المصاحبات:</b> {s.colloc.map(([l, n]) => `${l} ${num(n)}`).join(" · ")}
        </p>
      )}
      <ul className="by-occ">
        {s.occ.map((o, i) => (
          <li key={i}>
            <Link to={readPathOf(o.loc)} className="by-ref">{arName(o.loc)}</Link>{" "}
            <span className="quran">{o.form}</span>
            <span className="by-unit" title="وحدة السياق المعتمدة">{o.unit !== "—" ? ` — ${o.unit}` : ""}</span>
            <div className="by-aya">{o.txt}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function CardPage({ card, types }: { card: Card; types: Record<string, string> }) {
  return (
    <div>
      <p>
        <Link to="/bayan" className="chip">← كل البطاقات</Link>{" "}
        <span className="chip gold">{types[card.type] ?? card.type}</span>
      </p>
      <h2>{card.title}</h2>
      <p className="by-kashf">
        <b>من استعمال المصحف:</b> {card.kashf}
      </p>
      <h3>خريطة الاستعمال المحسوبة</h3>
      {card.sides.map((s) => <SidePanel key={s.name} s={s} />)}
      {card.contrast && (
        <details className="by-side">
          <summary><b>بصمة الافتراق</b> — لمّات تصاحب طرفًا ولا تصاحب الآخر</summary>
          {Object.entries(card.contrast).map(([k, v]) => (
            <p key={k} className="by-colloc"><b>ينفرد {k}:</b> {v.map(([l, n]) => `${l} ${num(n)}`).join(" · ")}</p>
          ))}
        </details>
      )}
      <h3>قراءات مستشهد بها</h3>
      {card.readings.map((r, i) => (
        <blockquote key={i} className="by-reading">
          <p>«{r.quote}»</p>
          <footer>— {r.src}</footer>
        </blockquote>
      ))}
      <details className="by-side">
        <summary><b>منهج البطاقة</b></summary>
        <p className="by-method">
          كل رقمٍ في الخريطة حسابٌ حتميٌّ من نص المصحف والمدونة الصرفية
          الأكاديمية ووحدات السياق المعتمدة، يعاد إنتاجه بسكربتٍ معلنٍ في
          مستودع المشروع؛ والقراءات منقولةٌ بنصها منسوبةً إلى مصادرها —
          الحساب يصف، والمنقول يفسر، والقارئ يتدبر.
        </p>
      </details>
    </div>
  );
}

/** لوحة جذرٍ في بطاقة آلية: عدّادات ومصاحبات ومواضع (بلا نص آية — الرابط للمصحف) */
function AutoSidePanel({ s }: { s: AutoSide }) {
  return (
    <details className="by-side">
      <summary>
        <b>{s.root}</b>
        <span className="chip">{num(s.total)} موضعًا</span>
        <span className="chip">مكي {num(s.makki)} · مدني {num(s.madani)}</span>
        <Link to={`/mujam/${s.root}`} className="chip" onClick={(e) => e.stopPropagation()}>المعجم</Link>
      </summary>
      {s.colloc.length > 0 && (
        <p className="by-colloc"><b>أعلى المصاحبات:</b> {s.colloc.map(([l, n]) => `${l} ${num(n)}`).join(" · ")}</p>
      )}
      <ul className="by-occ">
        {s.occ.map((o, i) => (
          <li key={i}>
            <Link to={readPathOf(o.loc)} className="by-ref">{arName(o.loc)}</Link>{" "}
            <span className="quran">{o.form}</span>
            <span className="by-unit">{o.unit ? ` — ${o.unit}` : ""}</span>
          </li>
        ))}
      </ul>
      {s.capped && <p className="by-intro">عُرضت الأوائل — البقية كاملة في المعجم.</p>}
    </details>
  );
}

function AutoCardPage({ card }: { card: AutoCard }) {
  return (
    <div>
      <p>
        <Link to="/bayan" className="chip">← البيان</Link>{" "}
        <span className="chip" title="ولّدها الحساب من الفهرس المسند — بلا تحرير بشري ولا تعليل آلي">بطاقة آلية التوليد</span>
      </p>
      <h2>{card.head}</h2>
      <p className="by-kashf">خريطتا الجذرين محسوبتان حتميًّا من المصحف، والنص المنقول من مدخل الكتاب — بلا تحريرٍ بشري: الحساب يصف، والمنقول يفسر، والقارئ يتدبر.</p>
      <h3>خريطة الاستعمال المحسوبة</h3>
      {card.sides.map((s) => <AutoSidePanel key={s.root} s={s} />)}
      {card.contrast && Object.values(card.contrast).some((v) => v.length) && (
        <details className="by-side">
          <summary><b>بصمة الافتراق</b></summary>
          {Object.entries(card.contrast).map(([k, v]) => v.length ? (
            <p key={k} className="by-colloc"><b>ينفرد {k}:</b> {v.map(([l, n]) => `${l} ${num(n)}`).join(" · ")}</p>
          ) : null)}
        </details>
      )}
      <h3>القراءة المنقولة</h3>
      <blockquote className="by-reading">
        <p>«{card.reading.quote}»</p>
        <footer>— {card.reading.src}</footer>
      </blockquote>
    </div>
  );
}

/** مدخل المكتبة: الرأس والجذور (كلٌّ يفتح خريطته في المعجم) ثم النص المنقول */
function LibItem({ e, src }: { e: LibEntry; src: string }) {
  return (
    <details className="by-lib-item">
      <summary>
        <b>{e.head}</b>
        {e.roots.map((r) => (
          <Link key={r} to={`/mujam/${r}`} className="chip" title="خريطة الجذر في المعجم">{r}</Link>
        ))}
      </summary>
      <p className="by-lib-text">{e.text} <span className="by-unit">— {src}</span></p>
    </details>
  );
}

/** مكتبة البيان: كتب خمسة تُجلب عند الطلب، فهرس أبجدي، وبحث عابر للكتب */
function BayanLib({ q }: { q: string }) {
  const ar = getUILang() === "ar";
  const [index, setIndex] = useState<LibBookMeta[] | null>(libIndexCache);
  const [bookId, setBookId] = useState("");
  const [letter, setLetter] = useState("");
  const [, force] = useState(0);

  useEffect(() => {
    if (libIndexCache) return;
    fetch(`${import.meta.env.BASE_URL}bayan-lib.json?v=${__DATA_VERSION__}`)
      .then((r) => r.json())
      .then((d: { books: LibBookMeta[] }) => { libIndexCache = d.books; setIndex(d.books); })
      .catch(() => setIndex(null));
  }, []);

  const load = (id: string) => {
    if (libBookCache.has(id)) return;
    fetch(`${import.meta.env.BASE_URL}bayan-lib-${id}.json?v=${__DATA_VERSION__}`)
      .then((r) => r.json())
      .then((d: { entries: LibEntry[] }) => { libBookCache.set(id, d.entries); force((n) => n + 1); })
      .catch(() => { libBookCache.set(id, []); force((n) => n + 1); });
  };
  useEffect(() => { if (bookId) load(bookId); }, [bookId]);
  // البحث يعبر الكتب الخمسة — تُجلب كلها عند أول بحث
  useEffect(() => { if (q.trim() && index) index.forEach((b) => load(b.id)); }, [q, index]);

  const firstTerm = (h: string) =>
    h.replace(/^و?الفرق بين\s+/, "").replace(/^بصيرة ف[ىي]\.*\s*/, "")
      .replace(/^\(?\s*\d+\s*[-–]\s*باب\s+/, "").replace(/^باب\s+/, "")
      .replace(/^ال/, "").replace(/\s+/g, " ").trim();

  const loadedLen = libBookCache.get(bookId)?.length ?? -1;
  const entries = useMemo(() => {
    if (q.trim()) {
      const all: { e: LibEntry; src: string }[] = [];
      for (const b of index ?? []) {
        for (const e of libBookCache.get(b.id) ?? []) {
          if (fuzzyMatch(q, e.head) || e.roots.some((r) => fuzzyMatch(q, r)) || fuzzyMatch(q, e.text))
            all.push({ e, src: b.label });
        }
      }
      return all;
    }
    const b = (index ?? []).find((x) => x.id === bookId);
    let es = libBookCache.get(bookId) ?? [];
    if (letter) es = es.filter((e) => firstTerm(e.head).startsWith(letter));
    return es.map((e) => ({ e, src: b?.label ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, index, bookId, letter, loadedLen]);

  const letters = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of libBookCache.get(bookId) ?? []) {
      const l = firstTerm(e.head).charAt(0);
      if (l) c.set(l, (c.get(l) ?? 0) + 1);
    }
    const ORDER = "ءأإآابتثجحخدذرزسشصضطظعغفقكلمنهوي";
    return [...c.entries()].sort((a, b2) => ORDER.indexOf(a[0]) - ORDER.indexOf(b2[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, loadedLen]);

  const shown = entries.slice(0, 150);
  return (
    <section>
      <p className="by-intro">
        {ar
          ? "كتب البيان المدخلية الخمسة مهيكلةً: كل مدخلٍ نصٌّ منقول منسوب، وجذورُه مسندة إلى جذور المصحف — اختر الكتاب ثم الحرف، أو ابحث في الكتب كلها؛ والجذرُ يفتح خريطته الحية في المعجم."
          : "Five structured entry-books, root-anchored; pick a book and letter, or search across all; tap a root for its live map."}
      </p>
      {!q.trim() && !bookId && (
        <div className="by-grid">
          {(index ?? []).map((b) => {
            const [title, author] = b.label.split("—").map((x) => x.trim());
            return (
              <button key={b.id} className="fr-card by-tile by-book" onClick={() => { setBookId(b.id); setLetter(""); }}>
                <b>{title}</b>
                <span className="by-tile-kashf">{author}</span>
                <span className="chip">{num(b.count)} مدخلًا</span>
              </button>
            );
          })}
        </div>
      )}
      {!q.trim() && bookId && (
        <>
          <p className="by-seg">
            <button className="chip" onClick={() => { setBookId(""); setLetter(""); }}>← {ar ? "كل الكتب" : "all books"}</button>
            <b>{(index ?? []).find((x) => x.id === bookId)?.label}</b>
          </p>
          <p className="by-letters">
            {letters.map(([l, n]) => (
              <button key={l} className={"chip" + (letter === l ? " gold" : "")}
                title={num(n)} onClick={() => setLetter(letter === l ? "" : l)}>{l}</button>
            ))}
          </p>
          {!libBookCache.has(bookId) && <p>…</p>}
          {!letter && libBookCache.has(bookId) && (
            <p className="by-intro">{ar ? "اختر حرفًا من الفهرس، أو اكتب في البحث أعلى الصفحة." : "Pick a letter or search above."}</p>
          )}
        </>
      )}
      {(q.trim() || letter) && shown.map(({ e, src }) => <LibItem key={e.id} e={e} src={src} />)}
      {(q.trim() || letter) && entries.length > shown.length && (
        <p className="by-intro">{ar ? `و${num(entries.length - shown.length)} مدخلًا آخر — ضيّق البحث.` : "narrow your search for more"}</p>
      )}
    </section>
  );
}

export default function Bayan() {
  useUILang();
  const ar = getUILang() === "ar";
  const data = useBayan();
  const { id } = useParams();
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<"cards" | "auto" | "lib">("cards");
  const [, forceAuto] = useState(0);
  useEffect(() => {
    if (seg === "auto" || (id && id.startsWith("auto-"))) loadAuto(() => forceAuto((n) => n + 1));
  }, [seg, id]);

  const cardHits = useMemo(() => {
    if (!data) return [];
    if (!q.trim()) return data.cards;
    return data.cards.filter((c) =>
      fuzzyMatch(q, c.title) || fuzzyMatch(q, c.kashf) || c.sides.some((s) => fuzzyMatch(q, s.name)));
  }, [data, q]);

  if (!data) return <div className="page"><p style={{ padding: 40, textAlign: "center" }}>…</p></div>;

  const card = id ? data.cards.find((c) => c.id === id) : undefined;
  if (id && card) {
    return <div className="page" dir="rtl"><div className="bayan-page"><CardPage card={card} types={data.types} /></div></div>;
  }
  if (id && id.startsWith("auto-")) {
    const ac = autoCache?.find((c) => c.id === id);
    return (
      <div className="page" dir="rtl"><div className="bayan-page">
        {ac ? <AutoCardPage card={ac} /> : <p style={{ padding: 40, textAlign: "center" }}>…</p>}
      </div></div>
    );
  }

  const order = ["farq", "sigha", "mushtarak", "istimal"];
  const showCards = seg === "cards" || q.trim() !== "";
  return (
    <div className="page" dir="rtl">
    <div className="bayan-page">
      <h2>{ar ? "البيان — تدبر لغة القرآن" : "Bayān — the Qur'an's own diction"}</h2>
      <p className="by-intro">
        {ar
          ? "لكل كلمةٍ في التنزيل موضعُها. بطاقاتٌ محرَّرة تجمع خريطةَ استعمالٍ محسوبةً من المصحف كله مع قراءاتِ أعلام اللغة منسوبةً، ومكتبةُ كتبِ البيان مهيكلةً للبحث — نحسب ونعرض، والقارئ يتدبر."
          : "Computed usage maps with attributed classical readings, plus the structured Bayān library."}
      </p>
      <PageSearch value={q} onChange={setQ} placeholder={ar ? "ابحث في البطاقات والمكتبة (كلمة، جذرًا، مصطلحًا)…" : "search cards & library…"} />
      {!q.trim() && (
        <p className="by-tabs">
          <button className={"by-tab" + (seg === "cards" ? " on" : "")} onClick={() => setSeg("cards")}>
            {ar ? "البطاقات المحرَّرة" : "Curated cards"} ({num(data.cards.length)})
          </button>
          <button className={"by-tab" + (seg === "auto" ? " on" : "")} onClick={() => setSeg("auto")}>
            {ar ? "البطاقات الآلية" : "Generated cards"} {autoCache ? `(${num(autoCache.length)})` : "(٤٣٤)"}
          </button>
          <button className={"by-tab" + (seg === "lib" ? " on" : "")} onClick={() => setSeg("lib")}>
            {ar ? "مكتبة البيان — خمسة كتب" : "Bayān library"}
          </button>
        </p>
      )}
      {showCards && order.map((ty) => {
        const cards = cardHits.filter((c) => c.type === ty);
        if (!cards.length) return null;
        return (
          <section key={ty}>
            <h3>{data.types[ty]}</h3>
            <div className="by-grid">
              {cards.map((c) => (
                <Link key={c.id} to={`/bayan/${c.id}`} className="fr-card by-tile">
                  <b>{c.title}</b>
                  <span className="by-tile-kashf">{c.kashf}</span>
                  <span className="chip">{c.sides.map((s) => num(s.total)).join(" · ")} موضعًا</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {(seg === "auto" || q.trim() !== "") && autoCache && (() => {
        const hits = q.trim()
          ? autoCache.filter((c) => fuzzyMatch(q, c.head) || c.roots.some((r) => fuzzyMatch(q, r)))
          : autoCache;
        const lim = hits.slice(0, q.trim() ? 60 : 434);
        if (!hits.length) return null;
        return (
          <section>
            <h3>{ar ? "البطاقات الآلية" : "Generated cards"} <span className="chip" title="ولّدها الحساب من فهرس الفروق المسند — الخريطة حتمية والنص منقول، بلا تحرير بشري">{num(hits.length)}</span></h3>
            <div className="by-grid">
              {lim.map((c) => (
                <Link key={c.id} to={`/bayan/${c.id}`} className="fr-card by-tile">
                  <b>{c.head}</b>
                  <span className="by-tile-kashf">{c.roots.join(" · ")}</span>
                  <span className="chip">{c.sides.map((s) => num(s.total)).join(" · ")} موضعًا</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })()}
      {(seg === "lib" || q.trim() !== "") && (
        <>
          <h3>{ar ? "مكتبة البيان" : "Bayān library"}</h3>
          <BayanLib q={q} />
        </>
      )}
    </div>
    </div>
  );
}
