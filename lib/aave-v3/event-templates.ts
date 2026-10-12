// Aave V3 prose: the typed loader for content/aave-v3/event-prose.yaml, the
// one file that holds every string an Aave V3 event's explanation, the
// position card's explanation and the "?" modals print, on Aave V3 Ethereum,
// Aave V3 Base and Seamless. The logic that picks a template and variant and
// fills the figures is lib/aave-v3/event-prose.ts; the engine is
// lib/shared/event-prose/engine.ts. A string written here is a string the
// prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { AaveV3EchoKey } from "@/lib/aave-v3/event-prose";
import raw from "@/content/aave-v3/event-prose.yaml";

export type AaveV3L5Key =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidation"
  | "bad_debt"
  | "transfer"
  | "repay_with_collateral"
  | "collateral_swap"
  | "collateral_swap_cow"
  | "debt_swap"
  | "debt_swap_cow"
  | "withdraw_and_swap"
  | "fallback"
  | "position_open"
  | "position_closed"
  | "position_liquidated"
  | "market";

/** The file's sections beyond the ones every family has. */
interface AaveV3ProseFile extends ProseFile<AaveV3L5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as AaveV3ProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<AaveV3L5Key, AaveV3EchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the generator and the position explanation put into a sentence. */
export const V3_WORDS = FILE.words;

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

/** The deployment a modal is worded for: Aave V3 on Ethereum, on Base, or
 *  Seamless. A modal's `intro_<form>` and `text_<form>` hold its wording. */
export type AaveV3Deployment = "aave-v3" | "aave-v3-base" | "seamless";

const FORM: Record<AaveV3Deployment, string[]> = {
  "aave-v3": [],
  "aave-v3-base": ["base"],
  seamless: ["seamless"],
};

/** A "?" modal from the file, in the deployment's wording. */
export function aaveV3Modal(key: AaveV3L5Key, deployment: AaveV3Deployment = "aave-v3"): LearnMoreContent {
  return PROSE.modal(FILE.L5[key], FORM[deployment]);
}

/** The position card's "?": the open account's, or the ended one's by how it ended. */
export function aaveV3PositionModal(
  status: "open" | "closed" | "liquidated" | "unread",
  deployment: AaveV3Deployment,
  hasDebt = true,
): LearnMoreContent {
  if (status === "liquidated") return aaveV3Modal("position_liquidated", deployment);
  if (status === "closed") return aaveV3Modal("position_closed", deployment);
  return PROSE.modal(FILE.L5.position_open, [...FORM[deployment], ...(hasDebt ? [] : ["no_debt"])]);
}

/** The market overview's "?". */
export function aaveV3MarketModal(deployment: AaveV3Deployment): LearnMoreContent {
  return aaveV3Modal("market", deployment);
}
