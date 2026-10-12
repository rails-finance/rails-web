// Polaris prose: the typed loader for content/polaris/event-prose.yaml, the
// one file that holds every string a Polaris event's explanation, the position
// card's explanation and the "?" modals print. The logic that picks a template
// and variant and fills the figures is lib/polaris/event-prose.ts; the engine
// is lib/shared/event-prose/engine.ts. A string written here is a string the
// prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { PolarisEchoKey } from "@/lib/polaris/event-prose";
import raw from "@/content/polaris/event-prose.yaml";

export type PolarisL5Key =
  | "open"
  | "adjust"
  | "close"
  | "liquidation"
  | "transfer"
  | "fallback"
  | "position_open"
  | "position_closed"
  | "position_liquidated"
  | "market"
  | "price_gap"
  | "rate_step";

/** The file's sections beyond the ones every family has. */
interface PolarisProseFile extends ProseFile<PolarisL5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as PolarisProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<PolarisL5Key, PolarisEchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the code puts into a sentence or between a list's items. */
export const POLARIS_WORDS = FILE.words;

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
export function polarisModal(key: PolarisL5Key): LearnMoreContent {
  return PROSE.modal(FILE.L5[key]);
}

/** The position card's "?": by how the CDP stands. */
export function polarisPositionModal(status: "open" | "closed" | "liquidated"): LearnMoreContent {
  return polarisModal(
    status === "liquidated" ? "position_liquidated" : status === "closed" ? "position_closed" : "position_open",
  );
}
