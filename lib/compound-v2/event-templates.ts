// Compound V2 prose: the typed loader for content/compound-v2/event-prose.yaml,
// the one file that holds every string a Compound V2 event's explanation, the
// position card's explanation and the "?" modals print. The logic that picks a
// template and variant and fills the figures is lib/compound-v2/event-prose.ts;
// the engine is lib/shared/event-prose/engine.ts. A string written here is a
// string the prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { CTokenHeadTable } from "@/lib/compound-v2/head-words";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { CompoundV2EchoKey } from "@/lib/compound-v2/event-prose";
import raw from "@/content/compound-v2/event-prose.yaml";

export type CompoundV2L5Key =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "transfer_in"
  | "transfer_out"
  | "liquidation"
  | "seize_out"
  | "seize_in"
  | "seize_burn"
  | "fallback"
  | "position_borrowing"
  | "position_supply"
  | "position_closed"
  | "position_liquidated";

/** The file's sections beyond the ones every family has. */
interface CompoundV2ProseFile extends ProseFile<CompoundV2L5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as CompoundV2ProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<CompoundV2L5Key, CompoundV2EchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the code puts into a sentence or between a list's items. */
export const COMPOUND_V2_WORDS = FILE.words;

/** The timeline head's words (lib/compound-v2/head-words.ts). */
export const COMPOUND_V2_HEAD_WORDS: CTokenHeadTable = {
  sep: COMPOUND_V2_WORDS.t1_sep,
  supplied: COMPOUND_V2_WORDS.t1_supplied,
  withdrew: COMPOUND_V2_WORDS.t1_withdrew,
  borrowed: COMPOUND_V2_WORDS.t1_borrowed,
  repaid: COMPOUND_V2_WORDS.t1_repaid,
  liquidated: COMPOUND_V2_WORDS.t1_liquidated,
  transferred: COMPOUND_V2_WORDS.t1_transferred,
  to: COMPOUND_V2_WORDS.t1_to,
  from: COMPOUND_V2_WORDS.t1_from,
  by: COMPOUND_V2_WORDS.t1_by,
  seizedOut: COMPOUND_V2_WORDS.t1_seized_out,
  seizedIn: COMPOUND_V2_WORDS.t1_seized_in,
  seizeBurn: COMPOUND_V2_WORDS.t1_seize_burn,
  legSent: COMPOUND_V2_WORDS.t1_leg_sent,
  legReceived: COMPOUND_V2_WORDS.t1_leg_received,
  legSeized: COMPOUND_V2_WORDS.t1_leg_seized,
  legRepaid: COMPOUND_V2_WORDS.t1_leg_repaid,
};

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
export function compoundV2Modal(key: CompoundV2L5Key, form: string[] = []): LearnMoreContent {
  return PROSE.modal(FILE.L5[key], form);
}

/** The position card's "?": by how the account stands. */
export function compoundV2PositionModal(opts: {
  status: "open" | "closed" | "liquidated";
  hasDebt?: boolean;
}): LearnMoreContent {
  if (opts.status === "liquidated") return compoundV2Modal("position_liquidated");
  if (opts.status === "closed") return compoundV2Modal("position_closed");
  return compoundV2Modal(opts.hasDebt ? "position_borrowing" : "position_supply");
}
