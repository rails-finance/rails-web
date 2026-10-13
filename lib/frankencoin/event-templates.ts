// Frankencoin prose: the typed loader for content/frankencoin/event-prose.yaml,
// the one file that holds every string a Frankencoin event's explanation, the
// position card's explanation and the "?" modals print. The logic that picks a
// template and variant and fills the figures is lib/frankencoin/event-prose.ts;
// the engine is lib/shared/event-prose/engine.ts. A string written here is a
// string the prose writer cannot see (`pnpm check:prose` fails on one).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { eventProseEngine } from "@/lib/shared/event-prose/engine";
import type { ModalData, ProseFile, Words } from "@/lib/shared/event-prose/types";
import type { FrankencoinEchoKey } from "@/lib/frankencoin/event-prose";
import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
import raw from "@/content/frankencoin/event-prose.yaml";

export type FrankencoinL5Key =
  | "minting"
  | "price"
  | "creation"
  | "ownership"
  | "challenge"
  | "forced_sale"
  | "lifecycle"
  | "fallback"
  | "position_open"
  | "position_closed"
  | "position_denied"
  | "position_expired"
  | "book";

/** A modal whose concepts can be drawn for one form alone (`only: forced`). */
type FrankencoinModalData = Omit<ModalData, "details"> & {
  details?: (NonNullable<ModalData["details"]>[number] & { only?: string })[];
};

/** The file's sections beyond the ones every family has. */
interface FrankencoinProseFile extends Omit<ProseFile<FrankencoinL5Key>, "L5"> {
  L5: Record<FrankencoinL5Key, FrankencoinModalData>;
  words: Words;
  position_words: Words;
  doc_urls: Words;
}

const FILE = raw as FrankencoinProseFile;

/** The shared engine over this file; modal links resolve through `doc_urls`. */
export const PROSE = eventProseEngine<FrankencoinL5Key, FrankencoinEchoKey>(
  FILE as unknown as ProseFile<FrankencoinL5Key>,
  { doc: FILE.doc_urls },
);

/** Words the generator and the position explanation put into a sentence. */
export const FRANKENCOIN_WORDS = FILE.words;

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
export function frankencoinModal(key: FrankencoinL5Key, forms: string[] = []): LearnMoreContent {
  const d = FILE.L5[key];
  const kept = d.details?.filter((x) => !x.only || forms.includes(x.only));
  return PROSE.modal({ ...d, details: kept } as ModalData, forms);
}

/** The modal an event opens: by its kind, a price move inside an adjust, and
 *  whether a settlement row belongs to a forced sale. */
export function frankencoinEventKey(ctx: FrankencoinContext, forcedTx = false): FrankencoinL5Key {
  const priceMoved = ctx.liqPrice != null && ctx.liqPriceBefore != null && ctx.liqPrice !== ctx.liqPriceBefore;
  switch (ctx.eventType) {
    case "open":
    case "clone":
      return "creation";
    case "ownership_transferred":
      return ctx.initialization ? "creation" : "ownership";
    case "adjust":
      return priceMoved ? "price" : "minting";
    case "mint":
    case "repay":
    case "add_collateral":
    case "withdraw_collateral":
      return "minting";
    case "adjust_price":
      return "price";
    case "auction_settlement":
      return forcedTx ? "forced_sale" : "challenge";
    case "challenge_started":
    case "challenge_averted":
    case "challenge_succeeded":
      return "challenge";
    case "forced_sale":
      return "forced_sale";
    case "denied":
    case "close":
      return "lifecycle";
    default:
      return "fallback";
  }
}

/** The event card's "?". */
export function frankencoinEventModal(ctx: FrankencoinContext, forcedTx = false): LearnMoreContent {
  const forms: string[] = [];
  if (ctx.hub === "v1") forms.push("v1");
  if (ctx.eventType === "ownership_transferred" && ctx.initialization) forms.push("handover");
  return frankencoinModal(frankencoinEventKey(ctx, forcedTx), forms);
}

/** The position card's "?": by the card's lifecycle status, and whether a
 *  forced sale ended the position. */
export function frankencoinPositionModal(opts: {
  status: "open" | "closed" | "denied" | "expired";
  forcedSale?: boolean;
  hub?: "v1" | "v2";
}): LearnMoreContent {
  const forms: string[] = [];
  if (opts.forcedSale) forms.push("forced");
  if (opts.hub === "v1") forms.push("v1");
  const key: FrankencoinL5Key =
    opts.status === "closed"
      ? "position_closed"
      : opts.status === "denied"
        ? "position_denied"
        : opts.status === "expired"
          ? "position_expired"
          : "position_open";
  return frankencoinModal(key, forms);
}
