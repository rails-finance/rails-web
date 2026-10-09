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

import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import { FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import raw from "@/content/liquity-v2/event-prose.yaml";

export type Rounding =
  | "coll"
  | "coll_trim"
  | "debt"
  | "accrued"
  | "accrued_signed"
  | "amount"
  | "usd"
  | "usd_about"
  | "usd_cents"
  | "ratio"
  | "ratio_whole"
  | "ratio_pair"
  | "rate"
  | "rate_step"
  | "pct_whole"
  | "pct3"
  | "count"
  | "compact"
  | "date"
  | "day_short"
  | "span"
  | "manager"
  | "address"
  | "text";

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

/** One group of an L1 line: words (an `L1_words` id) and figures, printed
 *  with spaces between. A group whose figure the event lacks is left out. */
export type L1Part =
  | { word: string }
  | { figure: string; symbol?: "coll_symbol" | "debt_symbol"; rounding?: Rounding; sign?: boolean };
export type L1Spec = L1Part[][];

export interface SentenceTemplate {
  /** The condition under which the generator says it, for the reader. */
  when: string;
  text: string;
}

export interface EventTemplate {
  id: string;
  /** The context header's event label. */
  title: string;
  /** Operations and state that select it. */
  when: string;
  L5: L5Key;
  variants: Record<string, string>;
  L1: L1Spec;
  sentences: Record<string, SentenceTemplate>;
  /** The order the generator says its sentences in, shared ones included. */
  order: string[];
  /** The liquidation's payout legs, said as a list under the bullets. */
  list?: string[];
  /** Each sentence's group (a `group_words` id): the heading it sits under
   *  when the explanation is grouped (lib/liquity/event-prose.ts, `grouped`). */
  groups: Record<string, string[]>;
  /** Lists of sentences the generator says at most one of; read by the prose
   *  limits check (scripts/check-prose-limits.mjs) for the pane's worst case. */
  alternates?: string[][];
}

/** A modal as the file writes it: links by FAQ id or URL; the interest-rate
 *  modal's delegated forms beside the owner's. */
interface L5Data {
  title: string;
  intro: string;
  intro_delegated?: string;
  intro_zero_debt?: string;
  extraParagraphs?: string[];
  detailsHeading?: string;
  details?: { bold: string; text: string; text_delegated?: string; text_zero_debt?: string }[];
  video?: { label: string; url: string; description: string };
  links?: ({ label: string; faq: keyof typeof FAQ_URLS } | { label: string; url: string })[];
}

type Words = Record<string, string>;

interface ProseFile {
  roundings: Record<Rounding, string>;
  placeholders: Record<string, { rounding: Rounding; means: string }>;
  L1_words: Words;
  L2_words: Words;
  context_words: Words;
  footer_words: Words;
  copy_words: Words;
  action_words: Words;
  page_words: Words;
  group_words: Words;
  L5_words: Words;
  trove_words: Words;
  shared_sentences: Record<string, SentenceTemplate>;
  templates: EventTemplate[];
  L5: Record<L5Key, L5Data>;
}

const FILE = raw as ProseFile;

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
/** The explanation's group headings, in the order the pane shows them. */
export const GROUP_WORDS = FILE.group_words;
/** The Trove listing, the Trove page, the run card and the position card's
 *  explanation: the words around the events. Read through troveWords. */
const TROVE_WORDS = FILE.trove_words;
/** Parts of a sentence the generator joins. */
/** Sentences more than one template says. */
export const SHARED_SENTENCES = FILE.shared_sentences;
export const TEMPLATES = FILE.templates;

/** A modal string's `{name}`s, each printed as given. */
function fillWords(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_0-9]+)\}/g, (_, name: string) => {
    const v = values[name];
    if (v === undefined) throw new Error(`event prose: no value for {${name}} in "${text}"`);
    return v;
  });
}

/** A trove_words string as written, for a bullet that draws its {name}s as
 *  nodes (lib/liquity/trove-nodes.tsx). */
export function troveText(id: string): string {
  const text = TROVE_WORDS[id];
  if (text === undefined) throw new Error(`event prose: no trove_words.${id}`);
  return text;
}

/** A trove_words string with each {name} printed as given. */
export function troveWords(id: string, values: Record<string, string | number> = {}): string {
  return fillWords(troveText(id), Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
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
  const d = FILE.L5[key];
  const delegated = key === "interest_rate" && (o.delegated ?? false);
  const zeroDebt = o.zeroDebt ?? false;
  let intro =
    delegated && d.intro_delegated ? d.intro_delegated : zeroDebt && d.intro_zero_debt ? d.intro_zero_debt : d.intro;
  if (key === "liquidation") {
    const isETH = o.collateralType === "WETH" || o.collateralType === "ETH";
    intro = fillWords(intro, {
      min_cr: isETH ? "110%" : "120%",
      max_ltv: isETH ? "90.91%" : "83.33%",
      coll_type: o.collateralType ?? FILE.L5_words.coll_type_unknown,
    });
  } else if (delegated) {
    intro = fillWords(intro, {
      delegate: o.delegateName
        ? fillWords(FILE.L5_words.delegate_named, { delegate_name: o.delegateName })
        : FILE.L5_words.delegate_unnamed,
    });
  }
  const c: LearnMoreContent = { title: d.title, intro };
  if (d.extraParagraphs) c.extraParagraphs = d.extraParagraphs;
  if (d.detailsHeading) c.detailsHeading = d.detailsHeading;
  if (d.details)
    c.details = d.details.map((x) => ({
      bold: x.bold,
      text: delegated && x.text_delegated ? x.text_delegated : zeroDebt && x.text_zero_debt ? x.text_zero_debt : x.text,
    }));
  if (d.video) c.video = d.video;
  if (d.links)
    c.links = d.links.map((l): LearnMoreLink => ({ label: l.label, url: "faq" in l ? FAQ_URLS[l.faq] : l.url }));
  return c;
}

/** The "?" modal, one per kind of event. */
export const L5 = Object.fromEntries(
  (Object.keys(FILE.L5) as L5Key[]).map((k) => [k, (o?: L5Options) => modal(k, o)]),
) as Record<L5Key, (o?: L5Options) => LearnMoreContent>;
