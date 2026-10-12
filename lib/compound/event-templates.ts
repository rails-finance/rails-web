// Compound V3 prose: the typed loader for content/compound/event-prose.yaml,
// the one file that holds every string a Compound V3 event's explanation, the
// position card's explanation and the "?" modals print. The logic that picks a
// template and variant and fills the figures is lib/compound/event-prose.ts;
// the engine is lib/shared/event-prose/engine.ts. A string written here is a
// string the prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { CompoundEchoKey } from "@/lib/compound/event-prose";
import raw from "@/content/compound/event-prose.yaml";

export type CompoundL5Key =
  | "supply"
  | "withdraw"
  | "collateral_in"
  | "collateral_out"
  | "absorb"
  | "transfer_base"
  | "transfer_collateral"
  | "fallback"
  | "position_borrowing"
  | "position_lending"
  | "position_closed"
  | "position_liquidated";

/** The file's sections beyond the ones every family has. */
interface CompoundProseFile extends ProseFile<CompoundL5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as CompoundProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<CompoundL5Key, CompoundEchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the code puts into a sentence or between a list's items. */
export const COMPOUND_WORDS = FILE.words;

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
export function compoundModal(key: CompoundL5Key, form: string[] = []): LearnMoreContent {
  return PROSE.modal(FILE.L5[key], form);
}

/** Which Comet deployment the card belongs to. */
export type CompoundPositionDeployment = "compound" | "compound-base";

/** The position card's "?": by how the position stands, in the deployment's words. */
export function compoundPositionModal(opts: {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  deployment?: CompoundPositionDeployment;
  side?: "lend" | "borrow" | "flat";
}): LearnMoreContent {
  const form = opts.deployment === "compound-base" ? ["base"] : [];
  if (opts.status === "liquidated") return compoundModal("position_liquidated", form);
  if (opts.status === "closed") return compoundModal("position_closed", form);
  return compoundModal(opts.side === "borrow" ? "position_borrowing" : "position_lending", form);
}
