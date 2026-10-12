// Liquity V2 event prose: the typed loader for content/liquity-v2/event-prose.yaml,
// the one file that holds every string an event's card, its Copy for LLM block
// and the test exports print. The logic that chooses a template, a variant and
// the sentences, and fills the placeholders, is lib/liquity/event-prose.ts.
// This module holds ids and shapes; a string written here is a string the
// prose writer cannot see (`pnpm check:prose` fails on one).
//
// The `.yaml` import is parsed at build time (scripts/yaml-loader.cjs, wired in
// next.config.ts; scripts/lib/strip-types.mjs for the scripts), so the page
// ships the data, not a parser.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { eventProseEngine, fillWords } from "@/lib/shared/event-prose/engine";
import type { EventTemplate as SharedTemplate, ModalData, ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { EchoKey } from "@/lib/liquity/event-prose";
import raw from "@/content/liquity-v2/event-prose.yaml";

export type L5Key =
  | "adjust"
  | "redemption"
  | "delegation"
  | "interest_rate"
  | "open"
  | "close"
  | "liquidation"
  | "transfer"
  | "fallback";

export type EventTemplate = SharedTemplate<L5Key>;

/** The file's sections beyond the ones every family has. */
interface LiquityProseFile extends ProseFile<L5Key> {
  L1_words: Words;
  L2_words: Words;
  context_words: Words;
  footer_words: Words;
  copy_words: Words;
  action_words: Words;
  page_words: Words;
  L5_words: Words;
  trove_words: Words;
}

const FILE = raw as LiquityProseFile;

/** The shared engine over this file (lib/shared/event-prose/engine.ts). */
export const PROSE = eventProseEngine<L5Key, EchoKey>(FILE, { faq: FAQ_URLS });

/** What each rounding prints. */
export const ROUNDINGS = FILE.roundings;
/** Every placeholder: its default rounding and what it stands for. */
export const PLACEHOLDERS = FILE.placeholders;
/** The header's words. */
export const L1_WORDS = FILE.L1_words;
/** The opened card's words. */
export const L2_WORDS = FILE.L2_words;
/** The Copy for LLM block's context header. */
export const CONTEXT_WORDS = FILE.context_words;
export const FOOTER_WORDS = FILE.footer_words;
/** The Copy for LLM control and the block's own words. */
export const COPY_WORDS = FILE.copy_words;
/** The event page's actions row, under the side column's title. */
export const ACTION_WORDS = FILE.action_words;
/** The event page's paragraph and its card's page controls. */
export const PAGE_WORDS = FILE.page_words;
/** The Trove listing, the Trove page, the run card and the position card's
 *  explanation: the words around the events. Read through troveWords. */
const TROVE_WORDS = FILE.trove_words;
/** Sentences more than one template says. */
export const SHARED_SENTENCES = FILE.shared_sentences;
export const TEMPLATES = FILE.templates;

const TROVE = PROSE.words(TROVE_WORDS, "trove_words");

/** A trove_words string as written, for a bullet that draws its {name}s as
 *  nodes (lib/liquity/trove-nodes.tsx). */
export function troveText(id: string): string {
  return TROVE.text(id);
}

/** A trove_words string with each {name} printed as given. */
export function troveWords(id: string, values: Record<string, string | number> = {}): string {
  return TROVE.fill(id, values);
}

/** The liquidation modal names the branch's minimum; the interest-rate modal
 *  names who controls the trove's rate; the close modal knows a close with no
 *  debt left. */
export interface L5Options {
  collateralType?: string;
  delegated?: boolean;
  delegateName?: string;
  zeroDebt?: boolean;
}

function modal(key: L5Key, o: L5Options = {}): LearnMoreContent {
  const d: ModalData = FILE.L5[key];
  const delegated = key === "interest_rate" && (o.delegated ?? false);
  const form = [...(delegated ? ["delegated"] : []), ...(o.zeroDebt ? ["zero_debt"] : [])];
  let values: Record<string, string> = {};
  if (key === "liquidation") {
    const isETH = o.collateralType === "WETH" || o.collateralType === "ETH";
    values = {
      min_cr: isETH ? "110%" : "120%",
      max_ltv: isETH ? "90.91%" : "83.33%",
      coll_type: o.collateralType ?? FILE.L5_words.coll_type_unknown,
    };
  } else if (delegated) {
    values = {
      delegate: o.delegateName
        ? fillWords(FILE.L5_words.delegate_named, { delegate_name: o.delegateName })
        : FILE.L5_words.delegate_unnamed,
    };
  }
  return PROSE.modal(d, form, values);
}

/** The "?" modal, one per kind of event. */
export const L5 = Object.fromEntries(
  (Object.keys(FILE.L5) as L5Key[]).map((k) => [k, (o?: L5Options) => modal(k, o)]),
) as Record<L5Key, (o?: L5Options) => LearnMoreContent>;
