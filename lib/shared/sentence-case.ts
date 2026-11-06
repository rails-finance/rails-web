// A title in sentence case: the first word as written, every later word that
// is plainly capitalised ("Depositing", "Works") lowered. Names keep their
// capitals: a word with capitals past its first letter (USDS, LlamaLend,
// cTokens, V3) stands as written, and so does a protocol's or a chain's name.

import { PROTOCOLS } from "@/lib/shared/protocols";

const NAMES = new Set([
  ...PROTOCOLS.flatMap((p) => p.label.split(/\s+/)).filter((w) => /^[A-Z]/.test(w)),
  "Ethereum",
  "Base",
  "Arbitrum",
  "Sepolia",
  "Savings",
  "Spark",
  "Sky",
  "Transmuter",
  "Safe",
]);

const PLAIN = /^[A-Z][a-z’']*$/;

function lowerWord(word: string): string {
  // Each part of a hyphenated word ("Interest-Rate") on its own; punctuation
  // around it ("(Liquidation)") stays.
  return word
    .split("-")
    .map((part) => {
      const m = /^([^A-Za-z0-9]*)([A-Za-z0-9’']+)([^A-Za-z0-9]*)$/.exec(part);
      if (!m || !PLAIN.test(m[2]) || NAMES.has(m[2])) return part;
      return `${m[1]}${m[2].toLowerCase()}${m[3]}`;
    })
    .join("-");
}

export function sentenceCase(title: string): string {
  const words = title.split(" ");
  return words.map((w, i) => (i === 0 ? w : lowerWord(w))).join(" ");
}
