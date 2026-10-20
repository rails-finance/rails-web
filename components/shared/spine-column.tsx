"use client";

import { useUnreadTokenOf } from "@/components/shared/unread-tokens-context";
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowRightToLine, Clock, Layers, LogOut, TestTube } from "lucide-react";

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { DelegateRatePillShell, GavelGlyph, RatePillShell, UserGlyph } from "@/components/shared/rate-pill";
import { ArrowFromDot } from "@/components/shared/timeline-spine";
import { RevealTip } from "@/components/shared/reveal-tip";
import { useTimelineScale, SpineVal, fmtSpine } from "@/components/shared/activity-timeline";
import { spokenAmount, useSpineRow } from "@/components/shared/mobile-spine";
import { WARNING_TRIANGLE_PATH } from "@/lib/shared/warning-triangle";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";
import type { Tone } from "@/lib/shared/tone";

// ── Icon overrides ──────────────────────────────────────────────────────────

/** Semantic icon that replaces token icons when the event isn't about token flow */
export type SpineIcon =
  | "warning" // A change the owner did not make: redemption, liquidation (caution/critical tone via warningTone). Draws `warningLegs` as nodes; a triangle only where no leg is known
  | "rate-change" // Interest rate / parameter change (% with up/down arrow)
  | "delegate" // Delegation change (user icon with +/- badge)
  | "external" // Third-party action with nothing to draw (pink user icon) — the FALLBACK for `externalParty`; cards pass the flag, not this
  | "mint" // Token minted into existence (e.g. a loan NFT) — plus-in-circle
  | "burn" // Token burned / destroyed (e.g. a settled loan NFT) — flame
  | "extend" // Term renegotiated / duration extended — clock
  | "close" // The holder closed the position in one step with nothing left to draw (e.g. an Alchemix self-liquidation, collateral paying the debt) — lucide `log-out`, neutral ink: a holder action, never a hazard
  | "dead-end" // Debt repaid from the position's own collateral, with nothing else moved — an Alchemix V2 `Liquidate`: the account holder selling their own collateral shares to clear their own debt, never a third party (rails-ops reference/alchemix-v2-frozen-record.md) — lucide `arrow-right-to-line`, neutral ink: a holder action, never a hazard
  | "touch" // A touch that moved nothing the holder chose and rewrote the position's figures (a Polaris CDP's interest and PSM share written in, ui-jobs 404) — lucide `fingerprint-pattern`, neutral ink
  | "no-change" // Operation that moved nothing (zero-delta adjust) — equals-in-circle
  | "custody" // Position moved between accounts (a receipt-token transfer run, or a position NFT's transfer: a Liquity V2 Trove, a Polaris position) — the paper plane in a neutral disc, the same custody mark a single row wears as `badge: "send"`
  | "swap" // A position swap: one asset became another under an order the owner signed, both legs staying in the position (rails-ops TO-DO-ui-jobs §15, §19) — a bare arrow-down-up at 45° in its axis hues, the legs stacked on the right flank (`swapLegs`)
  | "market" // A market note — a receipted fact about the MARKET between two of the account's own events (components/shared/market-note-row.tsx): hollow diamond, neutral ink, never a party colour
  | "live-window" // The live window between ONE position's last touch and now, pinned in the timeline's head slot (components/protocol/polaris/polaris-since-last-touch.tsx). Its own class, not a market note: the same hollow outline in the same neutral ink — the holder did nothing inside the window, which is what lets its causes be stated as facts — turned square where the note's is a diamond, so the two classes are told apart by shape
  | "none" // No node of its own: a group whose members moved no asset (a run of rate changes), or the boundary, draws no node
  | "moment" // The state card (components/shared/flow-moment-card.tsx) — the position at a moment between its events, where "Sync to chart" cut the timeline: lucide `clock`, neutral ink, not an event
  | "boundary"; // The boundary card (components/shared/timeline-boundary-card.tsx) — a stack of transactions, the events before the oldest drawn row; neutral ink, the last node on the spine

/** The spine's inks: neutral; a warning tone on a warning node and its
 *  dotted stretch; the external-party pink (color-grammar.md §4b) on the
 *  dotted stretch below a third party's act on the position. */
export type SpineInk = "default" | "party" | Tone;
export const SPINE_COLORS: Record<SpineInk, string> = {
  default: "rgb(101 115 140)", // rb-500
  party: "var(--color-pink-500)",
  caution: "var(--tone-caution)",
  critical: "var(--tone-critical)",
};

/** Pulsing dot color matching the node's tone */
const DOT_COLORS: Record<"default" | Tone, string> = {
  default: "bg-green-400",
  caution: "bg-caution-400",
  critical: "bg-red-400",
};

/** The tone a warning leg's magnitude takes, and the T1 word with it
 *  (color-grammar.md §5). The flank triangle takes the tone too (ui-jobs 331);
 *  the token icons keep their colours. */
export const WARNING_TONE_TEXT: Record<Tone, string> = {
  caution: "text-tone-caution",
  critical: "text-tone-critical",
};

// ── Who acted ───────────────────────────────────────────────────────────────

/** Who acted, the badge in the node's top-left corner (ui-jobs 408; rails-ops
 *  `standards/detail-page-anatomy.md`, "The spine", "Three marks"): the owner
 *  draws none; a third party (a delegate, a batch manager, a keeper, a
 *  liquidator) the person glyph; governance the gavel, both on party pink; the
 *  protocol (a formula or the market set it) the test tube on neutral ink. */
export type SpineActor = "owner" | "third-party" | "protocol" | "governance";

// ── Vertical order ──────────────────────────────────────────────────────────

/** THE SPINE'S VERTICAL ORDER: rows read bottom to top in the order the acts
 *  happen, what goes into the position below what comes out, and legs going
 *  the same way in the card's order from the bottom up, so collateral sits
 *  below debt (rails-ops reference/shared-event-card-spec.md §1, "Spine
 *  order"). Returns the rows top to bottom. */
const IN_FIRST = (r: SpineTokenRow) => (r.direction === "right" ? 0 : r.direction === "left" ? 2 : 1);
function bottomUp(rows: readonly SpineTokenRow[]): SpineTokenRow[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => IN_FIRST(a.row) - IN_FIRST(b.row) || a.i - b.i)
    .reverse()
    .map((x) => x.row);
}

// ── Token row descriptor ────────────────────────────────────────────────────

export interface SpineTokenRow {
  /** Token symbol for the icon */
  symbol: string;
  /** Resolve the icon under a different symbol — a receipt token wearing its
   *  underlying's mark (see TokenChipIcon's iconOverride). */
  iconSymbol?: string;
  /** Token contract address — fallback for icon lookup via Trust Wallet CDN */
  address?: string;
  /** Arrow direction: left = toward wallet, right = toward protocol. Leave
   *  it unset for a CUSTODY move (a receipt-token transfer to or from another
   *  account): the two flanks are the two directions the spine has — out to
   *  the wallet, in to the protocol — and a transfer is neither. The row then
   *  draws no arrow and no flank value; pair it with `badge: "send"` and let
   *  the header say the amount and the counterparty. */
  direction?: "left" | "right";
  /** Optional flanking value shown beside the arrow */
  value?: number | string;
  /** The symbol printed after the flanking value (opt-in; the icon alone
   *  identifies the token elsewhere). */
  unit?: string;
  /** Whole units below a million on the flanking value (SpineVal `full`). */
  fullValue?: boolean;
  /** The flanking value as shown, where the family states amounts at its own
   *  precision. Wins over `fullValue`. Default: the compact spine form. */
  display?: string;
  /** Optional badge overlay on the token icon. "check"/"cross" are an
   *  event's own meaning (a collateral toggle); "send" is the custody mark —
   *  the paper plane in a neutral disc, the asset changed hands. "swap" is the
   *  swap mark on a flow: a withdraw and swap, whose value left the position
   *  (rails-ops TO-DO-ui-jobs §15, D3). */
  badge?: "check" | "cross" | "send" | "swap";
  /** When set, the flanking value renders as a click-to-edit input. Used by
   *  simulator cards so the spine values are interactive in sim mode. */
  onValueChange?: (v: number) => void;
  /** Decimals for the inline edit input (defaults to 4). */
  valueDecimals?: number;
  /** Inclusive upper bound for the inline edit input. */
  valueMax?: number;
  /** The leg's verb in the phone spine view's spoken label ("0.5 ETH
   *  withdrawn"). Unset reads by direction: "to the wallet", "into the
   *  position". */
  verb?: string;
}

/** One leg of a position swap, stacked on the swap node's right flank: the
 *  token and the amount it moved, given first. */
export interface SpineSwapLeg {
  symbol: string;
  address?: string;
  value: number;
}

/** The position axis a swap's legs sit on: both supplied (a collateral swap),
 *  both debt (a debt swap), or one of each (a repay with collateral). */
export type SpineSwapAxis = "supply" | "debt" | "mixed";

// ── Props ───────────────────────────────────────────────────────────────────

/** One leg of a warning event (a redemption, a liquidation): the token that
 *  left the position, drawn as a node with "→" and the magnitude on the
 *  right ("2 →" on the collateral, "6K →" on the debt it cleared). */
export interface SpineWarningLeg {
  /** The header's word for the leg ("Cleared"), for the spoken label. */
  label?: string;
  value: number;
  symbol: string;
  address?: string;
}

export interface SpineColumnProps {
  /** icon="swap" only — the legs, drawn beside the node. */
  swapLegs?: SpineSwapLeg[];
  /** icon="swap" only — tints the glyph in the Lifetime flows tower's hues.
   *  Unset draws the mixed, two-tone glyph. */
  swapAxis?: SpineSwapAxis;
  /** Token rows: 1 for single-asset events, 2 for dual-asset (collateral+debt,
   *  swap), collateral first. Drawn by `bottomUp`. */
  tokens?: SpineTokenRow[];
  /** Semantic icon override — replaces token icons entirely */
  icon?: SpineIcon;
  /** The event was executed by a third party (someone other than the position
   *  owner): the node takes the third party's badge (`actor`) on the token
   *  icons rather than replacing them. When there are no token rows to draw,
   *  falls back to the standalone `external` glyph so a card never renders a
   *  blank spine slot. */
  externalParty?: boolean;
  /** Tone of a warning event — "caution" (orange) for a change to the
   *  owner's position the owner did not make (a redemption, every routine
   *  adverse event); "critical" (red) for terminal events (liquidation). The
   *  legs' magnitudes, a closed group's dotted stretch and the lead-in dot
   *  take it. Defaults
   *  to "caution". See color-grammar.md §5. */
  warningTone?: Tone;
  /** Optional hover/tap tip on a warning node: what the kind means. */
  warningTip?: ReactNode;
  /** icon="warning" only: the legs, collateral first, then the debt, drawn
   *  bottom to top (the collateral below, the debt above), each a node
   *  pointing out of the position. Unset, the legs the card's header
   *  publishes (`usePublishSpineLegs`) are drawn; with neither, the triangle
   *  stands in. */
  warningLegs?: SpineWarningLeg[];
  /** icon="rate-change", "delegate", or a rate note's "market": the rate before and after (%). The
   *  right flank, where a row's leg numbers stand, states the rate after
   *  ("0.50%") in a rate pill with no sign, an up or down arrow beside the
   *  node where the rate moved from a prior rate. Unset, the glyph carries
   *  the arrow alone. With `tokens` (an opening), the % node stands below the
   *  token rows with the rate on its flank. */
  rateSpan?: [number, number];
  /** The flank's arrow where a group's members set it: "up" or "down" when
   *  every change went that way, "both" (a neutral double-headed arrow)
   *  otherwise. Overrides the direction `rateSpan` gives. */
  rateMoves?: "up" | "down" | "both";
  /** Who set the flank's rate: a delegate, governance (a market note's rate
   *  governance set) or the protocol's formula. Any of the three draws the
   *  pill in pink and gives the rate node its badge (third party, governance,
   *  protocol): the rate-change icon, a rate note, or the % leg under token
   *  rows, whose discs stay the row's actor's. Unset, the neutral pill of an
   *  owner's rate. */
  rateTone?: "delegate" | "governance" | "formula";
  /** Who acted: the badge in the node's top-left corner, for every node of the
   *  row. Unset reads it from the row: `rateTone` on a rate node, then a third party's act (`dotted`, `externalParty`, a row
   *  whose card names another actor, a warning node), and a market note's
   *  node is the protocol's; otherwise the owner, who draws no badge. */
  actor?: SpineActor;
  /** The receipt the flank's rate traces: `echo` where another figure on the
   *  card registers it (the detail grid's rate). */
  rateProv?: { info: Provenance; value: string; echo?: boolean };
  /** Direction for rate-change arrow (none drawn when unset) or delegate
   *  badge */
  iconDirection?: "up" | "down";
  /** The event, or the group's events, were not actioned by the owner (a
   *  third party's, or the protocol's): the line runs dotted from this node
   *  to the next, in the warning tone or the neutral ink (mobile decision 18).
   *  A warning node, `externalParty` and a row whose card names another actor
   *  (`SpineRowSlot.byOwner` false) are dotted without it. */
  dotted?: boolean;
  /** The boundary card: the events before the oldest drawn row, a dotted
   *  stretch inside the row below the node. */
  undrawn?: boolean;
  /** The last node on the spine: the list's line ends at it
   *  (`data-spine-end`). */
  isLast: boolean;
  /** THE TIP OF THE TIMELINE — the newest event — and the one thing that
   *  draws the pulsing dot: a lead-in line and the dot above the node, which
   *  is the top row (newest first, the only order a timeline has).
   *
   *  The dot marks the newest event, never a list position: the boundary
   *  glyph, the oldest row and a pinned card never carry it. Undefined reads
   *  <SpineTipContext>, which the shared timeline provides around the newest
   *  row alone; null refuses it. */
  tip?: SpineTip | null;
  /** The node alone, no padding above it and no stretch of line below: a
   *  phone note row's node, drawn above its card (note-gap.tsx). */
  bare?: boolean;
}

export type SpineTip = "above";

/** Which end of the newest row the pulsing dot sits at, provided by the
 *  shared timeline around that ONE row — or around whatever stands in the head
 *  slot above it instead: the live window row, else a live market-note row.
 *  The protocol cards pass `isLast` through to <SpineColumn> without knowing
 *  about the tip, so it reaches the column this way; a column with an explicit `tip`
 *  ignores the context. */
export const SpineTipContext = createContext<SpineTip | null>(null);

/** A warning event's legs, published by the card's header for the card's
 *  spine: the header (ChainTruthRow, a family's own) holds the amounts, the
 *  card's SpineColumn draws them. EventCard provides it. */
export const SpineLegsContext = createContext<{
  legs: SpineWarningLeg[] | null;
  setLegs: (legs: SpineWarningLeg[] | null) => void;
} | null>(null);

const legsKey = (legs: SpineWarningLeg[] | null) =>
  legs ? legs.map((l) => `${l.symbol}|${l.address ?? ""}|${l.value}`).join(";") : "";

/** The state EventCard holds for SpineLegsContext. */
export function useSpineLegsState() {
  const [legs, setLegsState] = useState<SpineWarningLeg[] | null>(null);
  const setLegs = (next: SpineWarningLeg[] | null) =>
    setLegsState((prev) => (legsKey(prev) === legsKey(next) ? prev : next));
  return { legs, setLegs };
}

/** Hand a warning event's legs to the card's spine (no-op outside a card). */
export function usePublishSpineLegs(legs: SpineWarningLeg[] | null) {
  const ctx = useContext(SpineLegsContext);
  const setLegs = ctx?.setLegs;
  const key = legsKey(legs);
  // Before paint, so the node never draws its fallback first.
  useLayoutEffect(() => {
    setLegs?.(legs);
    // `key` stands for `legs`: a new array with the same legs is no change.
  }, [setLegs, key]);
}

// ── Icon SVGs ───────────────────────────────────────────────────────────────

function WarningIcon({ size, color = "var(--tone-caution)" }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={WARNING_TRIANGLE_PATH} />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function RateIcon({ size, color = "var(--color-rb-500)" }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

/** The market note's node: a 10px hollow diamond centred on the spine line, in
 *  the spine's neutral ink. Drawn at the flank's token size so it sits on the
 *  same centre as every other glyph, with the diamond itself small enough that
 *  the row reads as an annotation beside the timeline rather than a row of it.
 *  The stroke is pinned in absolute pixels. */
function MarketNoteIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect
        x={11}
        y={11}
        width={10}
        height={10}
        transform="rotate(45 16 16)"
        fill="none"
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The live window's node: the market note's square, left on its edges. Same
 *  box, same neutral ink, same 1px pinned stroke, same hollow interior — the
 *  register says "nothing happened to the account", and the window's whole
 *  claim is that the holder did nothing inside it. What differs is the
 *  silhouette, which is what a reader can use while the two rows sit adjacent
 *  in the head slot: an upright square at rest against the note's pivoted one.
 *  Side 11 to the diamond's 10, because the pivoted square's wider bounding
 *  extent otherwise leaves this one reading as the smaller mark.
 *
 *  It takes the tip of the spine (`liveHoldsTip`), so the flat top edge is the
 *  first thing on the column: the lead-in line meets it square and stops,
 *  where a vertex would run the line into a point. */
function LiveWindowIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x={10.5} y={10.5} width={11} height={11} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The paper plane (Lucide `send`) — the custody mark. Drawn at its native 45°:
 *  on the spine a HORIZONTAL glyph is a flow arrow (left to the wallet, right
 *  into the protocol), and a transfer is neither, so the plane keeps its tilt
 *  and sits in a disc rather than on a flank. Stroke inherits `currentColor`. */
function SendGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  );
}

/** The custody node for a run of transfers — the plane in a token-sized
 *  neutral disc. The position changed hands, nothing entered or left the
 *  protocol, so the disc is rb, never a valence colour. Same glyph as the
 *  single row's `badge: "send"`, so one mark means custody everywhere. */
function CustodyIcon({ size }: { size: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white"
      style={{ width: size, height: size, backgroundColor: "var(--color-rb-500)" }}
    >
      <SendGlyph size={Math.round(size * 0.5)} />
    </div>
  );
}

/** The swap mark — two offset harpoons, one each way. Not the full ⇄, which is
 *  the mixed-folder badge (lib/shared/run-folders.tsx). */
function SwapGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5h22l-6-6" />
      <path d="M27 19.5H5l6 6" />
    </svg>
  );
}

/** The Lifetime flows tower's axis hues (chain-truth-tower.tsx): blue the
 *  supplied side, green the debt. */
const AXIS_BLUE = "var(--color-blue-500)";
const AXIS_GREEN = "var(--color-green-400)";

/** The swap node — lucide `arrow-down-up` turned 45°, bare: a disc at token
 *  size read as one more asset on the spine (rails-ops TO-DO-ui-jobs §19). The
 *  arrows take the axis the legs sit on — both blue for a collateral swap,
 *  both green for a debt swap, and for a repay with collateral the down arrow
 *  blue (the aTokens given) and the up arrow green (the debt repaid). */
function SwapIcon({ size, axis = "mixed" }: { size: number; axis?: SpineSwapAxis }) {
  const down = axis === "debt" ? AXIS_GREEN : AXIS_BLUE;
  const up = axis === "supply" ? AXIS_BLUE : AXIS_GREEN;
  const glyph = Math.round(size * 0.8);
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Swap"
      data-swap-mark="node"
      data-swap-axis={axis}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: "rotate(45deg)" }}
        aria-hidden="true"
      >
        <g stroke={down}>
          <path d="m3 16 4 4 4-4" />
          <path d="M7 20V4" />
        </g>
        <g stroke={up}>
          <path d="m21 8-4-4-4 4" />
          <path d="M17 4v16" />
        </g>
      </svg>
    </div>
  );
}

/** The swap's legs on the node's right flank, one row each, given first: the
 *  token, then the compact amount. */
function SwapLegs({ legs }: { legs: SpineSwapLeg[] }) {
  const unreadOf = useUnreadTokenOf();
  return (
    <span className="justify-self-start pl-1 flex flex-col gap-1" style={{ gridColumn: "4 / 6" }} data-swap-legs="">
      {legs.map((leg, i) => {
        // A leg whose decimals did not load keeps its token and states no figure.
        const txt = unreadOf(leg.address, leg.symbol) ? "" : fmtSpine(leg.value);
        return (
          <span key={i} className="inline-flex items-center gap-2 text-base font-semibold whitespace-nowrap">
            <TokenChipIcon symbol={leg.symbol} address={leg.address} size={20} />
            {txt}
          </span>
        );
      })}
    </span>
  );
}

/** Custody badge — the plane in a small neutral disc, overlaid bottom-right of
 *  the token icon: the asset was transferred to or from another account. A
 *  row carries one of check / cross / swap / send in that corner; the actor's
 *  badge takes the top-left. Neutral rb fill: a transfer is not a loss, not a
 *  gain, and not a verdict about who acted.
 *
 *  Every corner badge draws its 2px ring of page ground as a box-shadow,
 *  outside the disc, so the glyph has the whole disc. */
function SendBadge({ size }: { size: number }) {
  const r = Math.round(size * 0.48);
  return (
    <div
      className="absolute bottom-0 right-0 rounded-full flex items-center justify-center text-white"
      style={{ width: r, height: r, backgroundColor: "var(--color-rb-500)", boxShadow: "0 0 0 2px var(--background)" }}
    >
      <SendGlyph size={Math.round(r * 0.58)} />
    </div>
  );
}

/** Swap badge — the harpoons in a small neutral disc on a token that left the
 *  position through an order, beside the flank value it keeps. Same corner and
 *  rule as the custody badge. */
function SwapBadge({ size }: { size: number }) {
  const r = Math.round(size * 0.48);
  return (
    <div
      className="absolute bottom-0 right-0 rounded-full flex items-center justify-center text-white"
      style={{ width: r, height: r, backgroundColor: "var(--color-rb-500)", boxShadow: "0 0 0 2px var(--background)" }}
      role="img"
      aria-label="Swap"
      data-swap-mark="flow"
    >
      <SwapGlyph size={Math.round(r * 0.62)} />
    </div>
  );
}

/** Equals-in-circle for zero-delta operations — muted, states "nothing moved". */
/** lucide `fingerprint-pattern` (not in the installed lucide-react): a touch. */
function TouchIcon({ size, color = "var(--color-rb-500)" }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </svg>
  );
}

function NoChangeIcon({ size, color = "var(--color-rb-500)" }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="8.5" y1="10" x2="15.5" y2="10" />
      <line x1="8.5" y1="14" x2="15.5" y2="14" />
    </svg>
  );
}

function DirectionArrow({ direction, size }: { direction: "up" | "down"; size: number }) {
  const color = direction === "up" ? "#22C55E" : "#EF4444";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "up" ? (
        <>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </>
      ) : (
        <>
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </>
      )}
    </svg>
  );
}

/** A group's rate arrow where its changes went both ways: one vertical shaft
 *  with a head at each end, in the spine's neutral ink. */
function BothWaysArrow({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-rb-500)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18" />
      <path d="m7 8 5-5 5 5" />
      <path d="m7 16 5 5 5-5" />
    </svg>
  );
}

/** One-person glyph for delegation (batch manager join/leave) events */
function UserIcon({ size, color = "var(--color-rb-500)" }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** +/− badge overlaid bottom-right of the delegate glyph, in the glyph's
 *  neutral ink: the pink belongs to the actor's badge. Plus for a
 *  batch-manager join, minus for a leave. */
function DelegateBadge({ size, join }: { size: number; join: boolean }) {
  const r = Math.round(size * 0.5);
  return (
    <div
      className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
      style={{ width: r, height: r, backgroundColor: "var(--color-rb-500)", boxShadow: "0 0 0 2px var(--background)" }}
    >
      <svg
        width={r * 0.6}
        height={r * 0.6}
        viewBox="0 0 12 12"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        {join && <path d="M6 2.5v7" />}
        <path d="M2.5 6h7" />
      </svg>
    </div>
  );
}

/** Who acted, overlaid top-left of the node (ui-jobs 408): the person glyph
 *  for a third party and the gavel for governance on party pink, the test
 *  tube for the protocol on the spine's neutral ink. The owner draws none.
 *  The top-left corner is the actor's alone; check / cross / send / swap keep
 *  the bottom-right. The badge sits off the node, 12px to the left and 2px
 *  up, so the node's own glyph stays whole under it. */
function ActorBadge({ size, actor }: { size: number; actor: SpineActor }) {
  if (actor === "owner") return null;
  const r = Math.round(size * 0.5);
  const g = Math.round(r * 0.6);
  return (
    <div
      className="absolute rounded-full flex items-center justify-center text-white"
      style={{
        top: -2,
        left: -12,
        width: r,
        height: r,
        backgroundColor: actor === "third-party" || actor === "governance" ? "#EC4899" : "var(--color-rb-500)",
        boxShadow: "0 0 0 2px var(--background)",
      }}
      data-spine-actor-badge={actor}
    >
      {actor === "third-party" ? (
        <UserGlyph size={g} />
      ) : actor === "governance" ? (
        <GavelGlyph size={g} />
      ) : (
        // Turned 45°: upright at badge size the tube and its liquid line read
        // as an exclamation mark.
        <TestTube size={g + 1} strokeWidth={2.5} style={{ transform: "rotate(45deg)" }} aria-hidden="true" />
      )}
    </div>
  );
}

// Mint — a token brought into existence (the loan NFT). Plus-in-circle reads as
// "created", pairing with the flame (burn). Neutral rb-500 (a lifecycle marker,
// not a valence signal).
function MintIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-rb-500)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  );
}

// Burn — a token destroyed (the loan NFT once the loan settles). Flame is the
// universal burn glyph; neutral rb-500.
function BurnIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-rb-500)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

// Extend — a loan's term renegotiated / duration pushed out. A clock reads as
// "time changed"; neutral rb-500.
function ExtendIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-rb-500)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/** Green circle with white checkmark — overlaid bottom-right of token icon */
function CheckBadge({ size }: { size: number }) {
  const r = Math.round(size * 0.48);
  return (
    <div
      className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
      style={{ width: r, height: r, backgroundColor: "#22C55E", boxShadow: "0 0 0 2px var(--background)" }}
    >
      <svg width={r * 0.6} height={r * 0.6} viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.5L5 9L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Red circle with white X — overlaid bottom-right of token icon */
function CrossBadge({ size }: { size: number }) {
  const r = Math.round(size * 0.4);
  return (
    <div
      className="absolute bottom-0 right-0 rounded-full flex items-center justify-center"
      style={{ width: r, height: r, backgroundColor: "#EF4444", boxShadow: "0 0 0 2px var(--background)" }}
    >
      <svg width={r * 0.55} height={r * 0.55} viewBox="0 0 12 12" fill="none">
        <path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** Pulsing dot for the newest event in an active timeline — color matches spine tint */
export function PulsingDot({ dotClass = "bg-green-400", side }: { dotClass?: string; side: SpineTip }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 10, height: 10 }} data-spine-tip={side}>
      <span className={`absolute inline-flex h-full w-full rounded-full ${dotClass} opacity-50 animate-ping`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
    </div>
  );
}

/** The phone spine view's spoken legs, for the card button's name: "7,500
 *  BOLD repaid, 2 rETH withdrawn". */
function spokenLegs(rows: SpineTokenRow[], unreadOf: ReturnType<typeof useUnreadTokenOf>): string | null {
  const legs = rows.flatMap((r) => {
    if (unreadOf(r.address, r.symbol)) return [];
    const v = typeof r.value === "string" ? parseFloat(r.value) : r.value;
    if (v == null || !isFinite(v) || v === 0) return [];
    const verb =
      r.verb ?? (r.direction === "left" ? "to the wallet" : r.direction === "right" ? "into the position" : "");
    return [`${spokenAmount(v)} ${r.symbol} ${verb}`.trim()];
  });
  return legs.length ? legs.join(", ") : null;
}

/** The spine view's spoken legs for a warning node: "0.631 WETH cleared,
 *  1,177 BOLD reduced". */
function spokenWarningLegs(legs: SpineWarningLeg[], unreadOf: ReturnType<typeof useUnreadTokenOf>): string | null {
  const said = legs.flatMap((l) =>
    !unreadOf(l.address, l.symbol) && isFinite(l.value) && l.value !== 0
      ? [`${spokenAmount(Math.abs(l.value))} ${l.symbol}${l.label ? ` ${l.label.toLowerCase()}` : ""}`]
      : [],
  );
  return said.length ? said.join(", ") : null;
}

/** A taken leg's ring: its stroke and the ground left between it and the token. */
const RING_WIDTH = 2;
const RING_GAP = 2;

/** A warning event's legs, one node each: the token, "→", and the magnitude
 *  in the event's tone. Both point out of the position — the collateral left
 *  it and the debt was cleared — so a redemption reads as a withdraw plus a
 *  repay. Drawn bottom to top in the order given (`bottomUp`'s rule): the
 *  collateral below, the debt above.
 *
 *  A leg wears a ring in the tone's ink at the node size, the token drawn
 *  smaller inside it with a gap of page ground, so the node's footprint and
 *  the line's halo hold (ui-jobs 331). A node is an order the actor gave
 *  (redeem ETH for LUSD, seize the collateral), never what the order left
 *  behind: Liquity V1's redemption surplus drew here as a locked node until
 *  Miles ruled it out (20 Oct 2026); it is the head's clause and the sheet's. */
function WarningLegNodes({
  legs,
  tone,
  filterable,
  actor,
}: {
  legs: SpineWarningLeg[];
  tone: Tone;
  filterable: boolean;
  actor: SpineActor;
}) {
  const scale = useTimelineScale();
  const unreadOf = useUnreadTokenOf();
  return (
    <div className="flex flex-col gap-y-1 items-center" data-spine-legs={legs.length}>
      {[...legs].reverse().map((leg, i) => {
        // A token whose decimals did not load keeps its node and states no figure.
        const txt =
          isFinite(leg.value) && leg.value !== 0 && !unreadOf(leg.address, leg.symbol)
            ? fmtHeaderMagnitude(Math.abs(leg.value), leg.symbol)
            : "";
        return (
          <div key={i} className="spine-grid" data-spine-leg="">
            <span />
            <span />
            <span
              className="relative flex items-center justify-center rounded-full shrink-0"
              style={{
                width: scale.tokenSize,
                height: scale.tokenSize,
                border: `${RING_WIDTH}px solid ${SPINE_COLORS[tone]}`,
              }}
              data-spine-ring={tone}
            >
              <TokenChipIcon
                symbol={leg.symbol}
                address={leg.address}
                size={scale.tokenSize - 2 * (RING_WIDTH + RING_GAP)}
                filterable={filterable}
              />
              <ActorBadge size={scale.tokenSize} actor={actor} />
            </span>
            <ArrowFromDot direction="right" size={scale.arrowSize} color={SPINE_COLORS[tone]} />
            {txt ? (
              <span
                className={`text-base font-semibold whitespace-nowrap justify-self-start pl-5 ${WARNING_TONE_TEXT[tone]}`}
                data-spine-leg-value=""
              >
                {txt}
              </span>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SpineColumn ─────────────────────────────────────────────────────────────

export function SpineColumn({
  tokens,
  swapLegs,
  swapAxis,
  icon,
  externalParty,
  warningTone = "caution",
  warningTip,
  warningLegs,
  iconDirection,
  rateSpan,
  rateMoves,
  rateTone,
  rateProv,
  actor: actorProp,
  dotted,
  undrawn,
  isLast,
  tip,
  bare,
}: SpineColumnProps) {
  const scale = useTimelineScale();
  const contextTip = useContext(SpineTipContext);
  const effectiveTip: SpineTip | null = tip !== undefined ? tip : contextTip;
  const unreadOf = useUnreadTokenOf();
  // The row: its controls take the legs for their name, and where the whole
  // row is the card's click target the token chips drop their filter click.
  const spineRow = useSpineRow();
  const rowTarget = !!spineRow?.target;
  // A warning node's legs: the card's own, else the ones its header published.
  const publishedLegs = useContext(SpineLegsContext)?.legs ?? null;
  const adverseLegs = icon === "warning" ? (warningLegs ?? publishedLegs) : null;
  const legs = !spineRow?.legsId
    ? null
    : !icon && tokens?.length
      ? spokenLegs(tokens, unreadOf)
      : adverseLegs?.length
        ? spokenWarningLegs(adverseLegs, unreadOf)
        : icon === "swap" && swapLegs?.length
          ? swapLegs
              .filter((l) => !unreadOf(l.address, l.symbol))
              .map((l) => `${spokenAmount(l.value)} ${l.symbol}`)
              .join(", ") || null
          : null;
  // The legs as spoken, for the row's controls to name themselves with.
  const legsEl = spineRow?.legsId && legs && (
    <span id={spineRow.legsId} hidden>
      : {legs}
    </span>
  );
  // ── The spine is never empty; the icon states WHY there is no flow ────────
  //
  // A card reaches this component with no token rows for many reasons unrelated
  // to each other — a zero-delta adjust, a seizure, an NFT lifecycle row, an
  // ownership handover — and every one of them used to render an empty slot: a
  // hole in the timeline where the spine's own glyph should be. So the fallback
  // is resolved here, once, rather than in each of the ~19 cards.
  //
  // Order matters. An explicit `icon` always wins (liquidation stays a red
  // triangle no matter who pulled the trigger). Then `externalParty` beats the
  // zero-delta default: on a third-party row that moved nothing, WHO acted is
  // the more informative fact, and it is the only fact the card still has to
  // show. Only a row that is neither falls through to `no-change`.
  const effectiveIcon: SpineIcon | undefined =
    icon ?? (tokens?.length ? undefined : externalParty ? "external" : "no-change");
  // The node's halo takes the page's ground: the list's line (spine-line.tsx)
  // stops 4px short of every glyph.
  const ground = "var(--background)";

  // The lead-in dot takes a warning event's tone. The line is the list's
  // (spine-line.tsx): solid neutral ink beside what the owner actioned, dotted
  // beside what they did not, in the tone (mobile decision 18). The node marks
  // it (`data-spine-dotted`); the boundary's stretch the row draws itself.
  // A third party's act (`dotted`, `externalParty`, a row whose card names
  // another actor) runs dotted in the party pink; a warning keeps its tone.
  const effectiveColor = effectiveIcon === "warning" ? warningTone : "default";
  const byParty = !!dotted || !!externalParty || spineRow?.byOwner === false;
  // Who acted: the badge in the node's top-left corner. A warning is a change the
  // owner did not make (a redemption, a liquidation): a third party's.
  // `rateTone` names who set the rate, so it badges the rate node alone: an
  // icon node (a rate change, a rate note) and the % leg under token rows.
  // Token rows read the row's own third-party signals. An explicit `actor`
  // speaks for the whole row.
  const ownActor: SpineActor =
    actorProp ??
    (byParty || effectiveIcon === "warning" ? "third-party" : effectiveIcon === "market" ? "protocol" : "owner");
  const rateActor: SpineActor =
    actorProp ??
    (rateTone === "delegate"
      ? "third-party"
      : rateTone === "governance"
        ? "governance"
        : rateTone === "formula"
          ? "protocol"
          : ownActor);
  const actor: SpineActor = effectiveIcon ? rateActor : ownActor;
  // The nodes that state an event take the badge; the people node of a third
  // party with nothing to draw is the mark already, a delegation's node keeps
  // its join/leave badge, and the boundary, the state card and the live
  // window are no one's act.
  const NO_BADGE: (SpineIcon | undefined)[] = ["external", "delegate", "live-window", "moment", "boundary", "none"];
  const badged = !NO_BADGE.includes(effectiveIcon);
  const shownActor: SpineActor = badged ? actor : "owner";
  /** A glyph with the actor's badge in its corner. */
  const withBadge = (glyph: ReactNode) =>
    shownActor === "owner" ? (
      glyph
    ) : (
      <div className="relative">
        {glyph}
        <ActorBadge size={scale.tokenSize} actor={shownActor} />
      </div>
    );
  const isDotted = byParty || !!undrawn || effectiveIcon === "warning";
  const lineInk: SpineInk = effectiveIcon === "warning" ? warningTone : byParty ? "party" : "default";
  const spineRgb = SPINE_COLORS[isDotted ? lineInk : "default"];
  const dotClass = DOT_COLORS[effectiveColor];
  const nodeAttrs = {
    ...(isDotted ? { "data-spine-dotted": lineInk } : {}),
    ...(badged ? { "data-spine-badge": shownActor } : {}),
    ...(isLast ? { "data-spine-end": "" } : {}),
  };
  const spineEl = undrawn && isLast && (
    <div
      className="absolute left-1/2 w-px -translate-x-1/2"
      style={{
        top: 0,
        bottom: 8,
        backgroundImage: `linear-gradient(to bottom, ${spineRgb} 50%, transparent 50%)`,
        backgroundSize: "1px 6px",
      }}
    />
  );

  // The tip above: a lead-in line and the pulsing dot above the newest event's
  // node — absolutely positioned so it doesn't push the icon down. Drawn by
  // `tip` alone.
  const leadIn = effectiveTip === "above" && (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
      style={{ bottom: "100%", paddingBottom: 4 }}
    >
      <PulsingDot dotClass={dotClass} side="above" />
      <div className="w-px" style={{ height: 12, backgroundColor: spineRgb }} />
    </div>
  );
  const T = scale.tokenSize;
  /** A node row: the glyph on the spine, and what stands on its right flank
   *  (two empty cells unless given). The grid is `.spine-grid`. */
  const nodeRow = (glyph: ReactNode, right?: ReactNode) => <NodeRow glyph={withBadge(glyph)} right={right} />;
  /** The right flank of a rate node: the rate after, to two decimals, at the
   *  leg values' x (`SpineVal`'s pl-5); the arrow column points up or down
   *  where the rate moved from a prior rate, and stays empty with none.
   *  data-spine-rate carries the direction. */
  const rateFlank = ([before, after]: [number, number]) => {
    const delta = after - before;
    const moved = before > 0 && Math.abs(delta).toFixed(2) !== "0.00";
    const direction = rateMoves ?? (!moved ? "flat" : delta > 0 ? "up" : "down");
    const text = `${after.toFixed(2)}%`;
    const pill = (body: ReactNode) =>
      rateTone ? <DelegateRatePillShell>{body}</DelegateRatePillShell> : <RatePillShell>{body}</RatePillShell>;
    return (
      <>
        {direction === "flat" ? (
          <span />
        ) : direction === "both" ? (
          <BothWaysArrow size={Math.round(scale.arrowSize * 0.7)} />
        ) : (
          <DirectionArrow direction={direction} size={Math.round(scale.arrowSize * 0.7)} />
        )}
        <span
          className="justify-self-start whitespace-nowrap pl-5 leading-[0] tabular-nums"
          data-spine-rate={direction}
        >
          {pill(
            rateProv ? (
              <Prov echo={rateProv.echo} info={rateProv.info} value={rateProv.value}>
                {text}
              </Prov>
            ) : (
              text
            ),
          )}
        </span>
      </>
    );
  };
  // The node: a glyph that states why there is no flow, else the token rows.
  const node: ReactNode = (() => {
    switch (effectiveIcon) {
      case undefined:
        return null;
      case "warning": {
        // The legs as nodes; the triangle only where the event names none.
        const legs = adverseLegs?.length ? (
          <WarningLegNodes legs={adverseLegs} tone={warningTone} filterable={!rowTarget} actor={shownActor} />
        ) : (
          nodeRow(<WarningIcon size={T} color={SPINE_COLORS[warningTone]} />)
        );
        return warningTip ? <RevealTip tip={warningTip}>{legs}</RevealTip> : legs;
      }
      case "rate-change": {
        if (rateSpan) return nodeRow(<RateIcon size={T} />, rateFlank(rateSpan));
        return nodeRow(
          <RateIcon size={T} />,
          iconDirection ? (
            <>
              <DirectionArrow direction={iconDirection} size={Math.round(scale.arrowSize * 0.7)} />
              <span />
            </>
          ) : undefined,
        );
      }
      case "delegate":
        // A delegation is a people event, not a rate tweak: a person glyph
        // with a join (+) / leave (−) badge. iconDirection up = join
        // (setInterestBatchManager), down = leave (removeFromBatch).
        // A join's `rateSpan` puts the delegate's rate on the right flank.
        return nodeRow(
          <div className="relative">
            <UserIcon size={T} />
            <DelegateBadge size={T} join={iconDirection !== "down"} />
          </div>,
          rateSpan ? rateFlank(rateSpan) : undefined,
        );
      case "external":
        // A third-party action with NOTHING TO DRAW: the person glyph in the
        // pink external-party tint (color-grammar.md §4b) stands alone, with
        // no join/leave badge. Where the event moved tokens, the flow renders
        // and the person glyph rides it as the actor badge instead.
        return nodeRow(<UserIcon size={T} color="#EC4899" />);
      case "mint":
        return nodeRow(<MintIcon size={T} />);
      case "burn":
        return nodeRow(<BurnIcon size={T} />);
      case "extend":
        return nodeRow(<ExtendIcon size={T} />);
      case "no-change":
        return nodeRow(<NoChangeIcon size={T} />);
      case "touch":
        return nodeRow(<TouchIcon size={T} />);
      case "custody":
        return nodeRow(<CustodyIcon size={T} />);
      case "swap":
        return nodeRow(
          <SwapIcon size={T} axis={swapAxis} />,
          swapLegs?.length ? <SwapLegs legs={swapLegs} /> : undefined,
        );
      case "market":
        // A market note's node, among the quietest marks on the column: a
        // small hollow diamond in the spine's neutral ink, no fill, no party
        // colour, no pulse. Nothing happened to the ACCOUNT here.
        // A rate note (ui-jobs 399) puts the rate after on the flank, as a
        // rate change does.
        return nodeRow(
          <MarketNoteIcon size={T} color={SPINE_COLORS.default} />,
          rateSpan ? rateFlank(rateSpan) : undefined,
        );
      case "live-window":
        // The live window's node: the note's register (the account did
        // nothing here), differing in SHAPE alone, which is what tells the two
        // classes apart where they stand together in the head slot.
        return nodeRow(<LiveWindowIcon size={T} color={SPINE_COLORS.default} />);
      case "close":
        return nodeRow(
          <LogOut size={T} strokeWidth={1.5} absoluteStrokeWidth color="var(--color-rb-500)" aria-hidden="true" />,
        );
      case "dead-end":
        return nodeRow(
          <ArrowRightToLine
            size={T}
            strokeWidth={1.5}
            absoluteStrokeWidth
            color="var(--color-rb-500)"
            aria-hidden="true"
          />,
        );
      case "moment":
        // The state card's node: a clock in the boundary's neutral ink. The
        // card states a moment, which no transaction made.
        return nodeRow(
          <Clock size={T} strokeWidth={1.25} absoluteStrokeWidth color="var(--color-rb-500)" aria-hidden="true" />,
        );
      case "boundary":
        // The boundary row's node: a stack (lucide `layers`) standing for the
        // events before the oldest drawn row. Neutral ink, no pulse.
        return nodeRow(
          <Layers size={T} strokeWidth={1.25} absoluteStrokeWidth color="var(--color-rb-500)" aria-hidden="true" />,
        );
      case "none":
        // A group with no asset legs, or the boundary card: no node.
        return null;
    }
  })();

  // Token flow mode — 1 or 2 rows of token icons with directional arrows.
  // A market node may carry token rows beneath it: the share a protocol-wide
  // act moved into this position (the PSM's, ui-jobs 402).
  const rows = effectiveIcon && effectiveIcon !== "market" ? [] : (tokens ?? []);
  // A bottom-right badge (check / cross / swap / send) takes a paddingBottom
  // compensation; without it the badge clips into the row below.
  // A market node's token rows (the PSM's share) leave the actor's badge to
  // the diamond above them.
  const rowActor: SpineActor = effectiveIcon ? "owner" : shownActor;
  const hasBadge = rows.some((r) => r.badge);
  const tokenRows = bottomUp(rows).map((row, i) => {
    const chip = (
      <TokenChipIcon
        symbol={row.symbol}
        iconOverride={row.iconSymbol}
        address={row.address}
        size={T}
        filterable={!rowTarget}
      />
    );
    return (
      <NodeRow
        key={i}
        left={
          <>
            <SpineVal
              value={row.direction === "left" && !unreadOf(row.address, row.symbol) ? row.value : undefined}
              side="left"
              onChange={row.direction === "left" ? row.onValueChange : undefined}
              decimals={row.valueDecimals}
              max={row.valueMax}
              unit={row.unit}
              full={row.fullValue}
              text={row.display}
            />
            {row.direction === "left" ? <ArrowFromDot direction="left" size={scale.arrowSize} /> : <span />}
          </>
        }
        glyph={
          // The row's own badge (Aave V4's collateral toggle, an order, a
          // transfer) bottom-right; who acted top-left, on every row.
          row.badge || rowActor !== "owner" ? (
            <div className="relative">
              {chip}
              {row.badge === "check" ? (
                <CheckBadge size={T} />
              ) : row.badge === "cross" ? (
                <CrossBadge size={T} />
              ) : row.badge === "swap" ? (
                <SwapBadge size={T} />
              ) : row.badge ? (
                <SendBadge size={T} />
              ) : null}
              <ActorBadge size={T} actor={rowActor} />
            </div>
          ) : (
            chip
          )
        }
        right={
          <>
            {row.direction === "right" ? <ArrowFromDot direction="right" size={scale.arrowSize} /> : <span />}
            <SpineVal
              value={row.direction === "right" && !unreadOf(row.address, row.symbol) ? row.value : undefined}
              side="right"
              onChange={row.direction === "right" ? row.onValueChange : undefined}
              decimals={row.valueDecimals}
              max={row.valueMax}
              unit={row.unit}
              full={row.fullValue}
              text={row.display}
            />
          </>
        }
      />
    );
  });

  return (
    <div
      className={`flex max-w-full flex-col items-center relative px-1 ${bare ? "" : "pt-4 self-stretch"}`}
      // The spine carries no receipts of its own (TO-DO-mobile-timeline
      // decision 13): its figures re-state the card's, which carries them.
      // The rate pill on a rate flank echoes the card's rate receipt.
      data-prov-exempt=""
    >
      <div
        data-spine-node=""
        {...nodeAttrs}
        className={`relative z-10${effectiveIcon && !(effectiveIcon === "market" && rows.length) ? "" : " flex flex-col gap-y-1 items-center"}`}
        style={{ backgroundColor: ground, boxShadow: `0 0 0 4px ${ground}`, paddingBottom: hasBadge ? 6 : undefined }}
      >
        {leadIn}
        {effectiveIcon ? node : tokenRows}
        {effectiveIcon === "market" && tokenRows}
        {!effectiveIcon && rateSpan && (
          <NodeRow
            glyph={
              <div className="relative" data-spine-rate-leg={rateActor}>
                <RateIcon size={T} />
                <ActorBadge size={T} actor={rateActor} />
              </div>
            }
            right={rateFlank(rateSpan)}
          />
        )}
      </div>
      {!bare && <div className="flex-1 relative max-sm:min-h-9">{spineEl}</div>}
      {legsEl}
    </div>
  );
}

/** One row of the spine's node: the left flank (a value and an arrow), the
 *  glyph on the spine, the right flank. Each flank is two empty cells unless
 *  given. The five columns are `.spine-grid` (app/globals.css). */
function NodeRow({ left, glyph, right }: { left?: ReactNode; glyph: ReactNode; right?: ReactNode }) {
  return (
    <div className="spine-grid">
      {left ?? (
        <>
          <span />
          <span />
        </>
      )}
      {glyph}
      {right ?? (
        <>
          <span />
          <span />
        </>
      )}
    </div>
  );
}
