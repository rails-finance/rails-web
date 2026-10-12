// Liquity V1 prose: the typed loader for content/liquity-v1/event-prose.yaml,
// the one file that holds every string a Liquity V1 event's explanation, the
// position card's explanation and the "?" modals print. The logic that picks a
// template and variant and fills the figures is lib/liquity-v1/event-prose.ts;
// the engine is lib/shared/event-prose/engine.ts. A string written here is a
// string the prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ModalData, ModalLink, ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { LiquityV1EchoKey } from "@/lib/liquity-v1/event-prose";
import raw from "@/content/liquity-v1/event-prose.yaml";

export type LiquityV1L5Key =
  | "open"
  | "adjust"
  | "close"
  | "redemption"
  | "liquidation"
  | "fallback"
  | "position_open"
  | "position_closed"
  | "position_redeemed"
  | "position_liquidated"
  | "flows";

/** The file's sections beyond the ones every family has. */
interface LiquityV1ProseFile extends ProseFile<LiquityV1L5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
  info: ModalData;
  claim_links: ModalLink[];
}

const FILE = raw as LiquityV1ProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<LiquityV1L5Key, LiquityV1EchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the generator puts into a sentence. */
export const V1_WORDS = FILE.words;

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
export function liquityV1Modal(key: LiquityV1L5Key): LearnMoreContent {
  return PROSE.modal(FILE.L5[key]);
}

/** How a closed life ended, from its final event. */
export type LiquityV1EndedBy = "owner" | "redemption";

/** The position card's "?": the open Trove's, or the ended life's by how it ended. */
export function liquityV1PositionModal(status: "open" | "closed" | "liquidated", endedBy?: LiquityV1EndedBy | null) {
  if (status === "liquidated") return liquityV1Modal("position_liquidated");
  if (status === "closed") return liquityV1Modal(endedBy === "redemption" ? "position_redeemed" : "position_closed");
  return liquityV1Modal("position_open");
}

/** The info page's "About Liquity V1". */
export function liquityV1InfoModal(): LearnMoreContent {
  return PROSE.modal(FILE.info);
}

/** The Quick Links of the shared "Claim collateral" modal on a Liquity V1
 *  Trove (lib/shared/learn-more-content.ts liquityCollSurplusClaimContent). */
export function liquityV1ClaimLinks(): LearnMoreLink[] {
  return FILE.claim_links.map((l) => ({ label: l.label, url: PROSE.linkUrl(l) }));
}
