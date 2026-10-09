// Moonwell prose: the typed loader for content/moonwell/event-prose.yaml, the
// one file that holds every string a Moonwell event's explanation, the
// position card's explanation and the "?" modals print, on Ethereum and on
// Base. The logic that picks a template and variant and fills the figures is
// lib/moonwell/event-prose.ts; the engine is lib/shared/event-prose/engine.ts.
// A string written here is a string the prose writer cannot see
// (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { MoonwellEchoKey } from "@/lib/moonwell/event-prose";
import raw from "@/content/moonwell/event-prose.yaml";

export type MoonwellL5Key =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidation"
  | "transfer_in"
  | "transfer_out"
  | "fallback"
  | "position_open"
  | "position_supply"
  | "position_closed"
  | "position_liquidated";

/** The file's sections beyond the ones every family has. */
interface MoonwellProseFile extends ProseFile<MoonwellL5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as MoonwellProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<MoonwellL5Key, MoonwellEchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the generator and the renderers put into a sentence. */
export const MOONWELL_WORDS = FILE.words;

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
export function moonwellModal(key: MoonwellL5Key): LearnMoreContent {
  return PROSE.modal(FILE.L5[key]);
}

/** The position card's "?": the open account's, with or without debt, or the
 *  ended account's by how it ended. */
export function moonwellPositionModal(status: "open" | "closed" | "liquidated" | "unread", hasDebt = true) {
  if (status === "liquidated") return moonwellModal("position_liquidated");
  if (status === "closed") return moonwellModal("position_closed");
  return moonwellModal(hasDebt ? "position_open" : "position_supply");
}
