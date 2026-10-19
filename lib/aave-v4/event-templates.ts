// Aave V4 prose: the typed loader for content/aave-v4/event-prose.yaml, the
// one file that holds every string an Aave V4 event's explanation, the
// position card's explanation and the "?" modals print, on Aave V4 Ethereum
// and Aave V4 Base. The logic that picks a template and variant and fills the
// figures is lib/aave-v4/event-prose.ts; the engine is
// lib/shared/event-prose/engine.ts. A string written here is a string the
// prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { AaveV4EchoKey } from "@/lib/aave-v4/event-prose";
import { slugifySpoke } from "@/lib/aave-v4/spoke-meta";
import raw from "@/content/aave-v4/event-prose.yaml";

export type AaveV4L5Key =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "collateral_toggle"
  | "liquidation"
  | "fallback"
  | "position"
  | "hubs"
  | "base_hub";

/** The file's sections beyond the ones every family has. */
interface AaveV4ProseFile extends ProseFile<AaveV4L5Key> {
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as AaveV4ProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<AaveV4L5Key, AaveV4EchoKey>(FILE, { doc: FILE.doc_urls });

/** Words the generator puts into a sentence. */
export const V4_WORDS = FILE.words;

/** The timeline head's words (lib/aave-v4/event-label.ts). */
export const AAVE_V4_HEAD_WORDS = {
  sep: V4_WORDS.t1_sep,
  supplied: V4_WORDS.t1_supplied,
  withdrew: V4_WORDS.t1_withdrew,
  borrowed: V4_WORDS.t1_borrowed,
  repaid: V4_WORDS.t1_repaid,
  liquidated: V4_WORDS.t1_liquidated,
  enabled: V4_WORDS.t1_enabled,
  disabled: V4_WORDS.t1_disabled,
  legSeized: V4_WORDS.t1_leg_seized,
  legRepaid: V4_WORDS.t1_leg_repaid,
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
export function aaveV4Modal(key: AaveV4L5Key): LearnMoreContent {
  return PROSE.modal(FILE.L5[key]);
}

/** The position card's "?": the spoke's modal, in that spoke's wording where
 *  the file has it (the slug, `-` written `_`), with the liquidation form for
 *  a position liquidators touched. A spoke the file does not name reads the
 *  general wording. */
export function aaveV4PositionModal(spokeName: string, liquidated = false): LearnMoreContent {
  const slug = slugifySpoke(spokeName);
  const form = slug ? [slug.replace(/-/g, "_")] : [];
  return PROSE.modal(FILE.L5.position, liquidated ? ["liquidated", ...form] : form);
}
