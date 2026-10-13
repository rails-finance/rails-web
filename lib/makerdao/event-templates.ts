// MakerDAO prose: the typed loader for content/makerdao/event-prose.yaml, the
// one file that holds every string a MakerDAO vault event's explanation, the
// vault card's explanation and the "?" modals print. The logic that picks a
// template and variant and fills the figures is lib/makerdao/event-prose.ts;
// the engine is lib/shared/event-prose/engine.ts. A string written here is a
// string the prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { MakerEchoKey } from "@/lib/makerdao/event-prose";
import raw from "@/content/makerdao/event-prose.yaml";

export type MakerL5Key =
  | "open"
  | "deposit"
  | "withdraw"
  | "generate"
  | "repay"
  | "adjust"
  | "returned"
  | "ownership"
  | "fork"
  | "liquidation"
  | "position_open"
  | "position_closed"
  | "position_liquidated"
  | "rate_step";

/** The file's sections beyond the ones every family has. */
interface MakerProseFile extends ProseFile<MakerL5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as MakerProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<MakerL5Key, MakerEchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the generator puts into a sentence. */
export const MAKER_WORDS = FILE.words;

/** A word with its {name}s filled. */
export const fillText = PROSE.fillText;

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

/** A "?" modal from the file; `usds` takes a LockStake urn's forms. */
export function makerModal(key: MakerL5Key, usds = false): LearnMoreContent {
  return PROSE.modal(FILE.L5[key], usds ? ["usds"] : []);
}

/** The vault card's "?" by the vault's status. */
export function makerPositionModal(status: "open" | "closed" | "liquidated", usds = false): LearnMoreContent {
  if (status === "liquidated") return makerModal("position_liquidated", usds);
  if (status === "closed") return makerModal("position_closed", usds);
  return makerModal("position_open", usds);
}
