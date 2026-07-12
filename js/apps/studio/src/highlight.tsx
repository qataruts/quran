/**
 * highlightVerse — wrap the words of a verse that match a search query in a
 * <mark>, so the searched term is visible in the results. Arabic-aware: ignores
 * diacritics, tatweel, and alef/hamza/ya/ta variants, and strips FTS syntax
 * (quotes, trailing *). Used by every place that lists verses for a query.
 */
import type { ReactNode } from "react";

const stripQuery = (s: string) => s.replace(/["'*]/g, " ");
/** drop diacritics/tatweel + fold alef/hamza/ya/ta variants */
const norm = (s: string) =>
  s
    .replace(/[ً-ْٰـٓ-ٕ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");

export function highlightVerse(text: string, query: string): ReactNode {
  const terms = norm(stripQuery(query))
    .split(/\s+/)
    .map((w) => w.replace(/^(?:و|ف|ب|ك|ل|ال)+/, "")) // shed common leading particles
    .filter((w) => w.length >= 2);
  if (terms.length === 0) return text;

  const tokens = text.split(/(\s+)/); // keep the whitespace tokens
  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok) || !tok) return tok;
    const nt = norm(tok);
    const hit = terms.some((t) => nt.includes(t) || (t.length >= 3 && t.includes(nt) && nt.length >= 3));
    return hit ? (
      <mark key={i} className="hl">
        {tok}
      </mark>
    ) : (
      <span key={i}>{tok}</span>
    );
  });
}
