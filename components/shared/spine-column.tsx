"use client";

import { useUnreadTokenOf } from "@/components/shared/unread-tokens-context";
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowRightToLine, Clock, Layers, Lock, LogOut } from "lucide-react";

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ArrowFromDot } from "@/components/shared/timeline-spine";
import { RevealTip } from "@/components/shared/reveal-tip";
import { useTimelineScale, SpineVal, fmtSpine } from "@/components/shared/activity-timeline";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { spokenAmount, useSpineRow } from "@/components/shared/mobile-spine";
import { WARNING_TRIANGLE_PATH } from "@/lib/shared/warning-triangle";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";
import type { Tone } from "@/lib/shared/tone";

// ── Icon overrides ──────────────────────────────────────────────────────────

/** Semantic icon that replaces token icons when the event isn't about token flow */
export type SpineIcon =
  | "warning" // A change the owner did not make: redemption, liquidation (caution/critical tone via warningTone). Draws `warningLegs` as nodes; a triangle only where no leg is known
  | "rate-change" // Interest rate / parameter change (% with up/down arrow)
  | "delegate" // Delegation change (users icon with +/- badge)
  | "external" // Third-party action with nothing to draw (pink users icon) — the FALLBACK for `externalParty`; cards pass the flag, not this
  | "mint" // Token minted into existence (e.g. a loan NFT) — plus-in-circle
  | "burn" // Token burned / destroyed (e.g. a settled loan NFT) — flame
  | "extend" // Term renegotiated / duration extended — clock
  | "close" // The holder closed the position in one step with nothing left to draw (e.g. an Alchemix self-liquidation, collateral paying the debt) — lucide `log-out`, neutral ink: a holder action, never a hazard
  | "dead-end" // Debt repaid from the position's own collateral, with nothing else moved — an Alchemix V2 `Liquidate`: the account holder selling their own collateral shares to clear their own debt, never a third party (rails-ops reference/alchemix-v2-frozen-record.md) — lucide `arrow-right-to-line`, neutral ink: a holder action, never a hazard
  | "no-change" // Operation that moved nothing (zero-delta adjust) — equals-in-circle
  | "custody" // Position moved between accounts (a receipt-token transfer run, or a position NFT's transfer: a Liquity V2 Trove, a Polaris position) — the paper plane in a neutral disc, the same custody mark a single row wears as `badge: "send"`
  | "swap" // A position swap: one asset became another under an order the owner signed, both legs staying in the position (rails-ops TO-DO-ui-jobs §15, §19) — a bare arrow-down-up at 45° in its axis hues, the legs stacked on the right flank (`swapLegs`)
  | "market-open" // A market note opened from its spine marker (item 118): the same diamond, filled in the same neutral ink, so the open note is marked on the spine
  | "market" // A market note — a receipted fact about the MARKET between two of the account's own events (components/shared/market-note-row.tsx): hollow diamond, neutral ink, never a party colour
  | "live-window" // The live window between ONE position's last touch and now, pinned in the timeline's head slot (components/protocol/polaris/polaris-since-last-touch.tsx). Its own class, not a market note: the same hollow outline in the same neutral ink — the holder did nothing inside the window, which is what lets its causes be stated as facts — turned square where the note's is a diamond, so the two classes are told apart by shape
  | "none" // No node of its own: a group whose members moved no asset (a run of rate changes), or the boundary, draws no node
  | "moment" // The state card (components/shared/flow-moment-card.tsx) — the position at a moment between its events, where "Show timeline to {date}" cut the timeline: lucide `clock`, neutral ink, not an event
  | "boundary"; // The boundary card (components/shared/timeline-boundary-card.tsx) — a stack of transactions, the events before the oldest drawn row; neutral ink, the last node on the spine

/** The spine's inks: neutral, or a warning tone on a warning node and its
 *  dotted stretch. Delegation signals via the pink glyph badge
 *  (color-grammar.md §4b), never the line. */
export const SPINE_COLORS: Record<"default" | Tone, string> = {
  default: "rgb(101 115 140)", // rb-500
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
 *  (color-grammar.md §5). The arrows stay grey and the token icons keep their
 *  colours. */
export const WARNING_TONE_TEXT: Record<Tone, string> = {
  caution: "text-tone-caution",
  critical: "text-tone-critical",
};

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
  /** Still the owner's, held for them to claim (Liquity V1's collateral
   *  surplus): the token with a lock at its corner, no arrow and no number,
   *  after the legs that left. */
  locked?: boolean;
  value: number;
  symbol: string;
  address?: string;
}

export interface SpineColumnProps {
  /** icon="swap" only — the legs, drawn beside the node while Timeline values
   *  are on (the header keeps them otherwise). */
  swapLegs?: SpineSwapLeg[];
  /** icon="swap" only — tints the glyph in the Lifetime flows tower's hues.
   *  Unset draws the mixed, two-tone glyph. */
  swapAxis?: SpineSwapAxis;
  /** Token rows: 1 for single-asset events, 2 for dual-asset (collateral+debt, swap) */
  tokens?: SpineTokenRow[];
  /** Semantic icon override — replaces token icons entirely */
  icon?: SpineIcon;
  /** The event was executed by a third party (someone other than the position
   *  owner). Overlays the pink external-party badge (color-grammar.md §4b) on
   *  the token icons rather than replacing them: WHO acted annotates the flow,
   *  it doesn't substitute for it. When there are no token rows to draw, falls
   *  back to the standalone `external` glyph so a card never renders a blank
   *  spine slot. A row's own `badge` wins: an explicit check/cross IS that
   *  event's meaning, and the header's "by …" chip names the actor. */
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
  /** icon="warning" only: the legs, top to bottom (the collateral, then the
   *  debt), each drawn as a node pointing out of the position. Unset, the
   *  legs the card's header publishes (`usePublishSpineLegs`) are drawn; with
   *  neither, the triangle stands in. */
  warningLegs?: SpineWarningLeg[];
  /** icon="rate-change": the rate before and after (%), drawn in the right
   *  flank where a row's leg numbers stand ("4.12% → 3.60%"). Unset, the
   *  glyph carries an up or down arrow. */
  rateSpan?: [number, number];
  /** Direction for rate-change arrow or delegate badge */
  iconDirection?: "up" | "down";
  /** The segment below the node stands for events not drawn (a closed
   *  group): dotted, in the warning tone or the neutral ink. Every other
   *  line is solid. */
  undrawn?: boolean;
  /** The first node on the spine. A LINE-END prop, not the tip — the
   *  pulsing dot is `tip`'s alone. The list's line starts at the first node
   *  it finds (spine-line.tsx). */
  isFirst?: boolean;
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
}

export type SpineTip = "above";

/** Which end of the newest row the pulsing dot sits at, provided by the
 *  shared timeline around that ONE row — or around whatever stands in the head
 *  slot above it instead: the live window row, else a live market-note row.
 *  The protocol cards pass
 *  `isFirst`/`isLast` through to <SpineColumn> without knowing about the
 *  tip, so it reaches the column this way; a column with an explicit `tip`
 *  ignores the context. */
export const SpineTipContext = createContext<SpineTip | null>(null);

/** The card's toggle, handed to its spine node (EventCard): the node and its
 *  flank values are a second click target for the header, which stays the one
 *  focusable control. Hovering the node lights the header (`.evt-row` in
 *  app/globals.css). */
export const SpineNodeToggleContext = createContext<{ onToggle: () => void } | null>(null);

/** A warning event's legs, published by the card's header for the card's
 *  spine: the header (ChainTruthRow, a family's own) holds the amounts, the
 *  card's SpineColumn draws them. EventCard provides it. */
export const SpineLegsContext = createContext<{
  legs: SpineWarningLeg[] | null;
  setLegs: (legs: SpineWarningLeg[] | null) => void;
} | null>(null);

const legsKey = (legs: SpineWarningLeg[] | null) =>
  legs ? legs.map((l) => `${l.symbol}|${l.address ?? ""}|${l.value}|${l.locked ? "l" : ""}`).join(";") : "";

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
function MarketNoteIcon({ size, color, filled = false }: { size: number; color: string; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect
        x={11}
        y={11}
        width={10}
        height={10}
        transform="rotate(45 16 16)"
        fill={filled ? color : "none"}
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
 *  the token icon: the asset was transferred to or from another account. It
 *  shares the corner with check / cross / the pink external badge under the
 *  same one-corner rule. Neutral rb fill: a transfer is not a loss, not a gain,
 *  and not a verdict about who acted. */
/** Lock badge: the asset is still the owner's, held for them to claim (a
 *  collateral surplus). Same corner and neutral disc as the custody badge. */
function LockBadge({ size }: { size: number }) {
  const r = Math.round(size * 0.48);
  return (
    <div
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center text-white"
      style={{ width: r, height: r, backgroundColor: "var(--color-rb-500)", border: "2px solid var(--background)" }}
      role="img"
      aria-label="Claimable"
    >
      <Lock size={Math.round(r * 0.6)} strokeWidth={2.5} aria-hidden />
    </div>
  );
}

function SendBadge({ size }: { size: number }) {
  const r = Math.round(size * 0.48);
  return (
    <div
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center text-white"
      style={{ width: r, height: r, backgroundColor: "var(--color-rb-500)", border: "2px solid var(--background)" }}
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
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center text-white"
      style={{ width: r, height: r, backgroundColor: "var(--color-rb-500)", border: "2px solid var(--background)" }}
      role="img"
      aria-label="Swap"
      data-swap-mark="flow"
    >
      <SwapGlyph size={Math.round(r * 0.62)} />
    </div>
  );
}

/** Equals-in-circle for zero-delta operations — muted, states "nothing moved". */
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

/** Two-person glyph for delegation (batch manager join/leave) events */
function UsersIcon({ size, color = "var(--color-rb-500)" }: { size: number; color?: string }) {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/** +/− badge overlaid bottom-right of the delegate glyph — pink, matching
 *  the "Delegate" party branding (pink = external party, color-grammar.md §4).
 *  Plus for a batch-manager join, minus for a leave. */
function DelegateBadge({ size, join }: { size: number; join: boolean }) {
  const r = Math.round(size * 0.5);
  return (
    <div
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center"
      style={{ width: r, height: r, backgroundColor: "#EC4899", border: "2px solid var(--background)" }}
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

/** Third-party-action badge overlaid bottom-right of a token icon — pink, the
 *  external-party tint (color-grammar.md §4b), matching the standalone
 *  `external` glyph it replaces on rows that DO have a flow to draw.
 *
 *  A SINGLE filled silhouette, not the two-person outline `UsersIcon` uses: at
 *  badge scale (~16px circle) a stroked two-person glyph reads as noise, while
 *  a solid single figure stays unambiguous against the check / cross / lock-open
 *  badges it shares the corner with. */
function ExternalBadge({ size }: { size: number }) {
  const r = Math.round(size * 0.5);
  return (
    <div
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center"
      style={{ width: r, height: r, backgroundColor: "#EC4899", border: "2px solid var(--background)" }}
    >
      <svg width={r * 0.72} height={r * 0.72} viewBox="0 0 12 12" fill="white">
        <circle cx="6" cy="3.7" r="2.4" />
        <path d="M6 7c2.42 0 4.2 1.55 4.2 3.5V12H1.8v-1.5C1.8 8.55 3.58 7 6 7Z" />
      </svg>
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
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center"
      style={{ width: r, height: r, backgroundColor: "#22C55E", border: "2px solid var(--background)" }}
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
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center"
      style={{ width: r, height: r, backgroundColor: "#EF4444", border: "2px solid var(--background)" }}
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

/** A warning event's legs, one node each: the token, "→", and the magnitude
 *  in the event's tone. Both point out of the position — the collateral left
 *  it and the debt was cleared — so a redemption reads as a withdraw plus a
 *  repay. */
function WarningLegNodes({
  legs,
  tone,
  showValues,
  filterable,
}: {
  legs: SpineWarningLeg[];
  tone: Tone;
  showValues: boolean;
  filterable: boolean;
}) {
  const scale = useTimelineScale();
  const unreadOf = useUnreadTokenOf();
  return (
    <div className="flex flex-col gap-y-1 items-center" data-spine-legs={legs.length}>
      {legs.map((leg, i) => {
        // A token whose decimals did not load keeps its node and states no figure.
        const txt =
          showValues && isFinite(leg.value) && leg.value !== 0 && !unreadOf(leg.address, leg.symbol)
            ? fmtHeaderMagnitude(Math.abs(leg.value), leg.symbol)
            : "";
        return (
          <div key={i} className="spine-grid" data-spine-leg="">
            <span />
            <span />
            {leg.locked ? (
              <div className="relative" data-spine-leg-locked="">
                <TokenChipIcon
                  symbol={leg.symbol}
                  address={leg.address}
                  size={scale.tokenSize}
                  filterable={filterable}
                />
                <LockBadge size={scale.tokenSize} />
              </div>
            ) : (
              <TokenChipIcon symbol={leg.symbol} address={leg.address} size={scale.tokenSize} filterable={filterable} />
            )}
            {leg.locked ? <span /> : <ArrowFromDot direction="right" size={scale.arrowSize} />}
            {txt && !leg.locked ? (
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
  undrawn,
  isLast,
  tip,
}: SpineColumnProps) {
  const scale = useTimelineScale();
  const contextTip = useContext(SpineTipContext);
  const effectiveTip: SpineTip | null = tip !== undefined ? tip : contextTip;
  const { showTimelineValues } = useTimelineDisplay();
  const unreadOf = useUnreadTokenOf();
  // A timeline row: the phone's segment control takes the legs for its name.
  const spineRow = useSpineRow();
  // A click on the node or its flank values opens and closes the card (on a
  // phone the segment's button lies over them and takes the click).
  const toggleCtx = useContext(SpineNodeToggleContext);
  const nodeToggle = toggleCtx;
  const nodeProps = nodeToggle ? { onClick: nodeToggle.onToggle, "data-spine-node-toggle": "" } : {};
  // A warning node's legs: the card's own, else the ones its header published.
  const publishedLegs = useContext(SpineLegsContext)?.legs ?? null;
  const adverseLegs = icon === "warning" ? (warningLegs ?? publishedLegs) : null;
  const legs = !spineRow
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
  const legsEl = spineRow && legs && (
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
  // Spine flanking values follow the "Timeline values" toggle in both views
  // (interpreted and chain-state): the compact notation is the one-step
  // readability leeway the tier allows (view-tiers.md).
  const spineValues = showTimelineValues;
  // The node's halo takes the page's ground: the list's line (spine-line.tsx)
  // stops 4px short of every glyph.
  const ground = "var(--background)";

  // The lead-in dot takes a warning event's tone. The line is the list's
  // (spine-line.tsx), solid neutral ink, except the dotted stretch that means
  // "events not drawn" below a closed group or the boundary, which takes the
  // tone too: the node marks it (`data-spine-undrawn`), and at the foot of the
  // list the row draws it.
  const effectiveColor = effectiveIcon === "warning" ? warningTone : "default";
  const isDotted = !!undrawn;
  const spineRgb = SPINE_COLORS[isDotted ? effectiveColor : "default"];
  const dotClass = DOT_COLORS[effectiveColor];
  const nodeAttrs = {
    ...(isDotted ? { "data-spine-undrawn": effectiveColor } : {}),
    ...(isLast ? { "data-spine-end": "" } : {}),
  };
  const spineEl = isDotted && isLast && (
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
  // `tip` alone; `isFirst` draws nothing above (see the props).
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
  const nodeRow = (glyph: ReactNode, right?: ReactNode) => <NodeRow glyph={glyph} right={right} />;
  // The node: a glyph that states why there is no flow, else the token rows.
  const node: ReactNode = (() => {
    switch (effectiveIcon) {
      case undefined:
        return null;
      case "warning": {
        // The legs as nodes; the triangle only where the event names none.
        const legs = adverseLegs?.length ? (
          <WarningLegNodes legs={adverseLegs} tone={warningTone} showValues={spineValues} filterable={!nodeToggle} />
        ) : (
          nodeRow(<WarningIcon size={T} color={SPINE_COLORS[warningTone]} />)
        );
        return warningTip ? <RevealTip tip={warningTip}>{legs}</RevealTip> : legs;
      }
      case "rate-change":
        return nodeRow(
          <RateIcon size={T} />,
          rateSpan ? (
            spineValues ? (
              <span
                className="justify-self-start whitespace-nowrap pl-1 text-base font-semibold tabular-nums"
                style={{ gridColumn: "4 / 6" }}
                data-spine-rate=""
              >
                <span className="font-normal text-rb-500">{rateSpan[0].toFixed(2)}%</span>
                <span className="px-1 font-normal text-rb-500" aria-hidden>
                  &rarr;
                </span>
                {rateSpan[1].toFixed(2)}%
              </span>
            ) : undefined
          ) : (
            <>
              <DirectionArrow direction={iconDirection ?? "up"} size={Math.round(scale.arrowSize * 0.7)} />
              <span />
            </>
          ),
        );
      case "delegate":
        // A delegation is a people event, not a rate tweak: a person glyph
        // with a join (+) / leave (−) badge. iconDirection up = join
        // (setInterestBatchManager), down = leave (removeFromBatch).
        return nodeRow(
          <div className="relative">
            <UsersIcon size={T} />
            <DelegateBadge size={T} join={iconDirection !== "down"} />
          </div>,
        );
      case "external":
        // A third-party action with NOTHING TO DRAW: the people glyph in the
        // pink external-party tint (color-grammar.md §4b) stands alone, with
        // no join/leave badge. Where the event moved tokens, the flow renders
        // and this glyph rides it as ExternalBadge instead.
        return nodeRow(<UsersIcon size={T} color="#EC4899" />);
      case "mint":
        return nodeRow(<MintIcon size={T} />);
      case "burn":
        return nodeRow(<BurnIcon size={T} />);
      case "extend":
        return nodeRow(<ExtendIcon size={T} />);
      case "no-change":
        return nodeRow(<NoChangeIcon size={T} />);
      case "custody":
        return nodeRow(<CustodyIcon size={T} />);
      case "swap":
        return nodeRow(
          <SwapIcon size={T} axis={swapAxis} />,
          spineValues && swapLegs?.length ? <SwapLegs legs={swapLegs} /> : undefined,
        );
      case "market":
      case "market-open":
        // A market note's node, among the quietest marks on the column: a
        // small hollow diamond in the spine's neutral ink, no fill, no party
        // colour, no pulse. Nothing happened to the ACCOUNT here. A note
        // opened from its marker fills the diamond in the same ink.
        return nodeRow(
          <MarketNoteIcon size={T} color={SPINE_COLORS.default} filled={effectiveIcon === "market-open"} />,
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
  const rows = effectiveIcon ? [] : (tokens ?? []);
  // The external badge occupies the same bottom-right corner as check/cross, so
  // it takes the same paddingBottom compensation — without it the badge clips
  // into the row below.
  const hasBadge = rows.some((r) => r.badge) || (externalParty && rows.length > 0);
  const tokenRows = rows.map((row, i) => {
    const chip = (
      <TokenChipIcon
        symbol={row.symbol}
        iconOverride={row.iconSymbol}
        address={row.address}
        size={T}
        filterable={!nodeToggle}
      />
    );
    return (
      <NodeRow
        key={i}
        left={
          <>
            <SpineVal
              value={
                spineValues && row.direction === "left" && !unreadOf(row.address, row.symbol) ? row.value : undefined
              }
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
          // One corner, one badge. An explicit row badge WINS over the
          // external one: a check/cross is the event's own meaning (Aave V4's
          // collateral toggle), whereas "a third party did this" is still
          // carried by the header's "by …" chip.
          row.badge || externalParty ? (
            <div className="relative">
              {chip}
              {row.badge === "check" ? (
                <CheckBadge size={T} />
              ) : row.badge === "cross" ? (
                <CrossBadge size={T} />
              ) : row.badge === "send" ? (
                <SendBadge size={T} />
              ) : row.badge === "swap" ? (
                <SwapBadge size={T} />
              ) : (
                <ExternalBadge size={T} />
              )}
            </div>
          ) : (
            chip
          )
        }
        right={
          <>
            {row.direction === "right" ? <ArrowFromDot direction="right" size={scale.arrowSize} /> : <span />}
            <SpineVal
              value={
                spineValues && row.direction === "right" && !unreadOf(row.address, row.symbol) ? row.value : undefined
              }
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
      className="flex max-w-full flex-col items-center relative px-1 pt-4 self-stretch"
      // The spine carries no receipts (TO-DO-mobile-timeline decision 13):
      // its figures re-state the card's, which carries them.
      data-prov-exempt=""
    >
      <div
        data-spine-node=""
        {...nodeAttrs}
        className={`relative z-10${effectiveIcon ? "" : " flex flex-col gap-y-1 items-center"}${nodeToggle ? " cursor-pointer" : ""}`}
        style={{ backgroundColor: ground, boxShadow: `0 0 0 4px ${ground}`, paddingBottom: hasBadge ? 6 : undefined }}
        {...nodeProps}
      >
        {leadIn}
        {effectiveIcon ? node : tokenRows}
      </div>
      <div className="flex-1 relative max-sm:min-h-9">{spineEl}</div>
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
