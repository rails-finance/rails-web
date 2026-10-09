// The shapes every family's event-prose strings file shares
// (content/<family>/event-prose.yaml; rails-ops decision 0036). A family's
// loader reads its file as `ProseFile` plus the word sections it adds, and its
// generator returns `EventProseCore` plus the levels it adds (Liquity V2's L1,
// L2 and footer). The engine that fills and orders the sentences is
// ./engine.ts.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

/** Every rounding the engine prints (./roundings.ts). A file's `roundings`
 *  section describes the ones its placeholders use. */
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
  | "text"
  | "units4"
  | "units2"
  | "ratio_frac"
  | "token"
  | "token_leg"
  | "token_pos"
  | "hf"
  | "pct_plain"
  | "compound_amount"
  | "number"
  | "usd_value";

export type ProseValue = number | string | null;

/** One run of a sentence's text: words, or the figure a placeholder filled. */
export interface ProseSeg<E extends string = string> {
  text: string;
  /** The placeholder this text fills. */
  name?: string;
  /** "bold", or the family's key for the receipt the figure echoes. */
  emph?: E | "bold";
  /** A ratio pair: the page bolds whichever form the viewer's ratio setting shows. */
  pair?: { cr: string; ltv: string };
  /** An address the page links to the explorer. */
  address?: string;
  tone?: "manager" | "address";
}

export interface ProseSentence<E extends string = string> {
  sentence_id: string;
  text: string;
  uses: string[];
  segs: ProseSeg<E>[];
  /** The `group_words` id it sits under; set only when the explanation is
   *  grouped (engine `grouped`). */
  group?: string;
}

export interface SentenceTemplate {
  /** The condition under which the generator says it, for the reader. */
  when: string;
  text: string;
}

/** One group of an L1 line: words (an `L1_words` id) and figures, printed
 *  with spaces between. A group whose figure the event lacks is left out. */
export type L1Part = { word: string } | { figure: string; symbol?: string; rounding?: Rounding; sign?: boolean };
export type L1Spec = L1Part[][];

export interface EventTemplate<K extends string = string> {
  id: string;
  /** The context header's event label. */
  title: string;
  /** Operations and state that select it. */
  when: string;
  L5: K;
  variants: Record<string, string>;
  /** The header line, where the family prints it from the file. */
  L1?: L1Spec;
  sentences: Record<string, SentenceTemplate>;
  /** The order the generator says its sentences in, shared ones included. */
  order: string[];
  /** Payout legs, said as a list under the bullets. */
  list?: string[];
  /** Each sentence's group (a `group_words` id): the heading it sits under
   *  when the explanation is grouped. */
  groups: Record<string, string[]>;
  /** Lists of sentences the generator says at most one of; read by the prose
   *  limits check (scripts/check-prose-limits.mjs) for the pane's worst case. */
  alternates?: string[][];
}

/** A Quick Link as the file writes it: an id in the family's link table
 *  (`faq`, or `doc` for a table in the file), or a URL. */
export type ModalLink =
  | { label: string; faq: string }
  | { label: string; doc: string }
  | { label: string; url: string };

/** A "?" modal as the file writes it. A field with a suffix (`intro_delegated`,
 *  `text_zero_debt`) is that field's form for one kind of position. */
export interface ModalData {
  title: string;
  intro: string;
  [form: `intro_${string}`]: string | undefined;
  extraParagraphs?: string[];
  stepsHeading?: string;
  steps?: string[];
  detailsHeading?: string;
  /** `sources`: where the concept's claim comes from, linked after it. */
  details?: ({ bold: string; text: string; sources?: ModalLink[] } & {
    [form: `text_${string}`]: string | undefined;
  })[];
  video?: { label: string; url: string; description: string };
  links?: ModalLink[];
}

export type Words = Record<string, string>;

/** The sections every family's file has. */
export interface ProseFile<K extends string = string> {
  roundings: Partial<Record<Rounding, string>>;
  placeholders: Record<string, { rounding: Rounding; means: string }>;
  group_words: Words;
  shared_sentences: Record<string, SentenceTemplate>;
  templates: EventTemplate<K>[];
  L5: Record<K, ModalData>;
}

/** What every family's generator returns for one event. */
export interface EventProseCore<K extends string = string, E extends string = string> {
  template: { id: string; variant: string; version: string };
  title: string;
  /** The explanation's sentences, in order; the card's teaser is the first. */
  L4: ProseSentence<E>[];
  /** Payout legs, under the bullets. */
  list: ProseSentence<E>[];
  L5: { key: K; content: LearnMoreContent };
  values: Record<string, ProseValue>;
}
