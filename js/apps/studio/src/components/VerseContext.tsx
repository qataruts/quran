/**
 * The selected ayah's place in our maps — its موضوع (topic + section), its
 * محكمة, whether it's itself a جامعة (kind/grade), and its network role
 * (تفصيل out/in, فروق twins). All from the unified verse-index; the reader taps
 * a verse and sees where it sits — no tafsīr.
 */
import { Link } from "react-router-dom";
import { getUILang, num, useUILang } from "../i18n";
import { useVerseIndex, verseInfo } from "../mawdui";
import { classOf, themeName, useKulliyat } from "../kulliyat";

export default function VerseContext({ location }: { location: string | null }) {
  useUILang();
  const ready = useVerseIndex();
  const kReady = useKulliyat();
  if (!location || !ready) return null;
  const info = verseInfo(location);
  const cls = kReady ? classOf(location) : null;
  const topic = cls ? themeName(cls.theme) : null;
  if (!topic && !info?.twins) return null;
  const ar = getUILang() === "ar";

  return (
    <div className="vc">
      <div className="vc-title">{ar ? "موضع الآية" : "This verse in the maps"}</div>

      {topic && cls && (
        <Link to={`/mawdui/${cls.theme}`} className="vc-row">
          <span className="vc-lbl">{ar ? "المحور" : "محور"}</span>
          <span className="vc-body">
            <span className="vc-val">{topic}</span>
            <span className="vc-sub">{ar ? "محورٌ محسوب" : "computed محور"}</span>
          </span>
        </Link>
      )}

      {info && info.twins > 0 && (
        <div className="vc-net">
          <Link to="/furuq" className="chip link">
            {ar ? `${num(info.twins)} فرق تنزيل` : `${info.twins} furūq`}
          </Link>
        </div>
      )}
    </div>
  );
}
