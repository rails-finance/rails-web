// SparkLend prose: the typed loader for content/spark/event-prose.yaml, the
// one file that holds every string a SparkLend event's explanation, the
// position card's explanation and the "?" modals print. The logic that picks a
// template and variant and fills the figures is lib/spark/event-prose.ts; the
// engine is lib/shared/event-prose/engine.ts. A string written here is a
// string the prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { SparkEchoKey } from "@/lib/spark/event-prose";
import raw from "@/content/spark/event-prose.yaml";

export type SparkL5Key =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidation"
  | "transfer"
  | "fallback"
  | "position_open"
  | "position_supply"
  | "position_closed"
  | "position_liquidated"
  | "market";

/** The file's sections beyond the ones every family has. */
interface SparkProseFile extends ProseFile<SparkL5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as SparkProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<SparkL5Key, SparkEchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the generator and the renderers put into a sentence. */
export const SPARK_WORDS = FILE.words;

const POSITION = PROSE.words(FILE.position_words, "position_words");

/** A position_words string as written, for a bullet that draws its {name}s as
 *  nodes (lib/shared/event-prose/nodes.tsx). */
export function positionText(id: string): string {
  return POSITION.text(id);
}

/** A position_words string with each {name} printed as given. */
export function positionWords(id: string, values: Record<string, string | number> = {}): string {
  return POSITION.fill(id, values);
}

/** A "?" modal from the file. */
export function sparkModal(key: SparkL5Key): LearnMoreContent {
  return PROSE.modal(FILE.L5[key]);
}

/** The position card's "?": the open account's, with or without debt, or the
 *  ended account's by how it ended. */
export function sparkPositionModal(status: "open" | "closed" | "liquidated", hasDebt = true) {
  if (status === "liquidated") return sparkModal("position_liquidated");
  if (status === "closed") return sparkModal("position_closed");
  return sparkModal(hasDebt ? "position_open" : "position_supply");
}
