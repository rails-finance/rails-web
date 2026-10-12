// Morpho prose: the typed loader for content/morpho/event-prose.yaml, the one
// file that holds every string a Morpho event's explanation, the position
// card's explanation and the "?" modals print (Ethereum and Base). The logic
// that picks a template and variant and fills the figures is
// lib/morpho/event-prose.ts; the engine is lib/shared/event-prose/engine.ts.
// A string written here is a string the prose writer cannot see
// (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ModalData, ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { MorphoEchoKey } from "@/lib/morpho/event-prose";
import raw from "@/content/morpho/event-prose.yaml";

export type MorphoL5Key =
  | "supply_collateral"
  | "withdraw_collateral"
  | "borrow"
  | "repay"
  | "liquidation"
  | "fallback"
  | "position_open"
  | "position_closed"
  | "position_liquidated";

/** A modal whose concepts can be drawn for one form alone (`only: pt`). */
type MorphoModalData = Omit<ModalData, "details"> & {
  details?: (NonNullable<ModalData["details"]>[number] & { only?: string })[];
};

/** The file's sections beyond the ones every family has. */
interface MorphoProseFile extends Omit<ProseFile<MorphoL5Key>, "L5"> {
  L5: Record<MorphoL5Key, MorphoModalData>;
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as MorphoProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<MorphoL5Key, MorphoEchoKey>(FILE as unknown as ProseFile<MorphoL5Key>, {
  doc: FILE.doc_urls,
});

/** Words the generator and the position explanation put into a sentence. */
export const MORPHO_WORDS = FILE.words;

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

/** A "?" modal from the file. `forms` names the variants to draw (an
 *  `intro_<form>` or `text_<form>` field, the first present winning) and the
 *  concepts marked `only: <form>` to keep. */
export function morphoModal(key: MorphoL5Key, forms: string[] = []): LearnMoreContent {
  const d = FILE.L5[key];
  const kept = d.details?.filter((x) => !x.only || forms.includes(x.only));
  return PROSE.modal({ ...d, details: kept } as ModalData, forms);
}

/** What a modal varies with beyond its form: whether the market's collateral
 *  token is a Pendle principal token, which adds that concept. */
export interface MorphoModalForms {
  pt?: boolean;
}

/** The modal an event kind opens. */
export function morphoEventKey(eventType: string): MorphoL5Key {
  switch (eventType) {
    case "borrow":
    case "repay":
    case "withdraw_collateral":
    case "supply_collateral":
    case "liquidation":
      return eventType;
    default:
      return "fallback";
  }
}

/** The event card's "?": by the kind of event. */
export function morphoEventModal(eventType: string, opts: MorphoModalForms = {}): LearnMoreContent {
  return morphoModal(morphoEventKey(eventType), opts.pt ? ["pt"] : []);
}

/** What the position card's "?" varies with. */
export interface MorphoPositionModalOpts extends MorphoModalForms {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  base?: boolean;
  hasDebt?: boolean;
  /** What the terminal card's debt peak is: the highest owed at an event,
   *  interest included ("owed"), the principal peak ("principal"), or not
   *  recorded on this read ("unrecorded", a listed row). */
  peakDebt?: "owed" | "principal" | "unrecorded";
}

/** The position card's "?": the open position's, or the ended life's. */
export function morphoPositionModal(opts: MorphoPositionModalOpts): LearnMoreContent {
  const forms: string[] = [];
  if (opts.pt) forms.push("pt");
  if (opts.status === "closed" || opts.status === "liquidated") {
    if (opts.peakDebt === "owed" || opts.peakDebt === "unrecorded") forms.push(opts.peakDebt);
    return morphoModal(opts.status === "closed" ? "position_closed" : "position_liquidated", forms);
  }
  if (opts.base) forms.push("base");
  if (!opts.hasDebt) forms.push("no_debt");
  return morphoModal("position_open", forms);
}
