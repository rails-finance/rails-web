// The reader's words for the five provenance classes: the modal the receipt
// head's class dots open (`LadderModal`, components/shared/provenance.tsx) and
// the "Kinds of figure" section of /about/provenance read them from here, so
// the two cannot drift. Each class's line follows the receipt grammar's §2
// (rails-ops standards/provenance-receipts-grammar.md) and §3's plain words.
// Pure, so scripts/test/prov-class-words.test.mjs reads the same strings.

import type { ProvClass } from "@/components/shared/provenance";

/** The modal's name: its title, its dialog label and the end of the opener's
 *  accessible name (ui-jobs 617, call C1). verify-ladder-dots.mjs reads it. */
export const LADDER_TITLE = "What the dots mean";

/** The reader's word for one of the five classes (ui-jobs 617, call C4). Code
 *  keeps `pclass`; the lexicon keeps "kind" for the four-way gate in docs. */
export const KIND_OF_FIGURE = "kind of figure";
export const KINDS_OF_FIGURE = "kinds of figure";

/** Each class's name: the modal's rungs, the receipt head's tooltip and the
 *  page's list. */
export const CLASS_NAMES: Record<ProvClass, string> = {
  emitted: "Emitted",
  state: "State",
  oracle: "Oracle",
  indexed: "Indexed",
  offchain: "Off-chain",
};

/** The modal's first line. */
export const LADDER_INTRO = `Each dot names a ${KIND_OF_FIGURE}, nearest the chain first.`;

/** One line per class, in the grammar's order (nearest the chain first). The
 *  modal adds `modalNote` after the line; /about/provenance says it in its
 *  "Checking a figure" section instead. */
export const CLASS_LINES: readonly { cls: ProvClass; line: string; modalNote?: string }[] = [
  { cls: "emitted", line: "A field in a transaction’s event log. Any block explorer shows it." },
  {
    cls: "state",
    line: "A value a contract returned at a stated block. Any archive node returns it again.",
    modalNote: "A block explorer shows only the current state.",
  },
  { cls: "oracle", line: "A price from a feed on the chain. The feed’s log for that round holds it." },
  { cls: "indexed", line: "Built by Rails’s index from the events it recorded. No third party holds it." },
  {
    cls: "offchain",
    line: "A figure from outside the chain, such as a price from a market data service. Nothing on the chain confirms it.",
  },
];

/** The rule between the classes a reader can check on the chain and the rest. */
export const SPLIT_LINE = "above: checkable on the chain · below: needs Rails";

/** How the head's dots read for a computed figure (grammar §2). */
export const COMPUTED_LINE = `A figure worked out from others is computed. Its head shows one dot for each ${KIND_OF_FIGURE} among its inputs, and it is as checkable as its furthest input.`;

/** The definition leaf (grammar §2; ui-jobs 669, 674). */
export const DEFINITION_LINE =
  "A constant the protocol defines, such as a stablecoin’s $1 face, is not a read and has no dot.";

/** "Kinds of figure" as a heading. */
export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
