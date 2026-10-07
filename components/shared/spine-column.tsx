"use client";

import { useUnreadTokenOf } from "@/components/shared/unread-tokens-context";
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { ArrowRightToLine, Clock, Layers, Lock, LogOut } from "lucide-react";

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ArrowFromDot } from "@/components/shared/timeline-spine";
import { RevealTip } from "@/components/shared/reveal-tip";
import { useTimelineScale, SpineVal, fmtSpine, type SpineValProv } from "@/components/shared/activity-timeline";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import type { LinkedHoverHandlers } from "@/hooks/useLinkedHover";
import { SPINE_LINE_OVERSHOOT, spineLineKey, spokenAmount, useSpineRow } from "@/components/shared/mobile-spine";
import { WARNING_TRIANGLE_PATH } from "@/lib/shared/warning-triangle";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";

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

/** Spine color tint. The spine line itself carries NO decorative/subsystem
 *  tint — it stays neutral. The only tints are the two §5 adverse tones, the
 *  warningTone values: caution for a change to the owner's position the owner
 *  did not make (a redemption, a force repay, a tick rebalance), critical for
 *  a liquidation. Delegation signals via the pink glyph badge
 *  (color-grammar.md §4b), not the spine line. (The former blue/green/
 *  violet/purple subsystem tints were retired — color variation doesn't belong
 *  on the spine.) */
export type SpineColor = "default" | "caution" | "critical";

/** The warning triangle's tones. */
export type WarningTone = "caution" | "critical";

export const SPINE_COLORS: Record<SpineColor, string> = {
  default: "rgb(101 115 140)", // rb-500
  caution: "var(--caution)", // a change the owner did not make: redemption + routine adverse (color-grammar.md §5)
  critical: "rgb(239 68 68)", // red-500 — liquidation + critical
};

/** Pulsing dot color matching spine tint */
const DOT_COLORS: Record<SpineColor, string> = {
  default: "bg-green-400",
  caution: "bg-caution-400",
  critical: "bg-red-400",
};

/** The tone a warning leg's magnitude takes, and the T1 word with it
 *  (color-grammar.md §5): caution orange for a redemption, red-500 for a
 *  liquidation. The arrows stay grey and the token icons keep their colours. */
export const WARNING_TONE_TEXT: Record<WarningTone, string> = {
  caution: "text-caution-600 dark:text-caution-400",
  critical: "text-red-500",
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
  /** Receipt identity for the flanking value — echoes the figure into the
   *  receipt the card already registers (the header change value), so the
   *  locator pulse includes the spine figure. Pass it ONLY when the spine
   *  value IS that receipt's figure (e.g. no redistribution/fee component
   *  separating them) — a false pairing is worse than none. */
  prov?: SpineValProv;
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
  /** Echo of the header's leg receipt (see SpineTokenRow.prov). */
  prov?: SpineValProv;
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
  /** Echo the figure into the receipt the header's figure traces. */
  prov?: SpineValProv;
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
   *  spine slot. Pair with spine="dotted". A row's own `badge` wins — an
   *  explicit check/cross IS that event's meaning, and the dotted spine still
   *  carries the external signal. */
  externalParty?: boolean;
  /** Tone of a warning event — "caution" (orange) for a change to the
   *  owner's position the owner did not make (a redemption, every routine
   *  adverse event); "critical" (red) for terminal events (liquidation). The
   *  legs' magnitudes, the dotted spine and the lead-in dot take it. Defaults
   *  to "caution". See color-grammar.md §5. */
  warningTone?: WarningTone;
  /** The kind's name ("Redemption", "Liquidation"). A warning node draws no
   *  pill (T1 states the word). */
  warningLabel?: string;
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
  /** Spine color tint — encodes subsystem or event category */
  color?: SpineColor;
  /** The first node on the spine: nothing is drawn above it (a leading mask
   *  covers the strip above the node). A LINE-END prop, not the tip — the
   *  pulsing dot is `tip`'s alone. */
  isFirst?: boolean;
  /** The last node on the spine: no trailing segment, and a mask over the
   *  strip below the node. */
  isLast: boolean;
  /** THE TIP OF THE TIMELINE — the newest event — and the one thing that
   *  draws the pulsing dot. "above": a lead-in line and the dot above the
   *  node, which is the top row. "below": a short line below the node and the
   *  dot, in place of the trailing mask.
   *
   *  ⚠️ NOTHING PRODUCES "below" TODAY. It was the oldest-first arm's tip, and
   *  that order was removed from every timeline on 2026-09-12 (see
   *  useTimelineEvents's header for why). The variant is kept because this is
   *  a PRIMITIVE and its axis has two ends — a view that draws a stretch from
   *  the middle of a history will need the far one — not because a caller is
   *  reaching it. Check before assuming a change here is visible anywhere.
   *
   *  The dot marks the newest event, never a list position: the boundary
   *  glyph, the oldest row and a pinned card never carry it. Undefined reads
   *  <SpineTipContext>, which the shared timeline provides around the newest
   *  row alone; null refuses it. */
  tip?: SpineTip | null;
  /** Detached column — no trailing spine and no trailing background mask. Used by the simulator card, which no longer sits in the timeline. */
  detached?: boolean;
}

export type SpineTip = "above" | "below";

/** Which end of the newest row the pulsing dot sits at, provided by the
 *  shared timeline around that ONE row — or around whatever stands in the head
 *  slot above it instead: the live window row, else a live market-note row.
 *  The protocol cards pass
 *  `isFirst`/`isLast` through to <SpineColumn> without knowing about the
 *  tip, so it reaches the column this way; a column with an explicit `tip`
 *  ignores the context. */
export const SpineTipContext = createContext<SpineTip | null>(null);

/** The card's toggle, handed to its spine node (EventCard, desktop list):
 *  the node and its flank values are a second click target for the header,
 *  which stays the one focusable control. The hover handlers light the
 *  header while the pointer is on the node (`useLinkedHover`). */
export const SpineNodeToggleContext = createContext<{
  onToggle: () => void;
  hover: LinkedHoverHandlers;
} | null>(null);

/** A warning event's legs, published by the card's header for the card's
 *  spine: the header (ChainTruthRow, a family's own) holds the amounts, the
 *  card's SpineColumn draws them. EventCard provides it. */
export const SpineLegsContext = createContext<{
  legs: SpineWarningLeg[] | null;
  setLegs: (legs: SpineWarningLeg[] | null) => void;
} | null>(null);

const legsKey = (legs: SpineWarningLeg[] | null) =>
  legs ? legs.map((l) => `${l.symbol}|${l.address ?? ""}|${l.value}|${l.prov?.value ?? ""}`).join(";") : "";

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

function WarningIcon({ size, color = "var(--caution)" }: { size: number; color?: string }) {
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
 *  The stroke is pinned in absolute pixels (the folder glyph's rule). */
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
 *  token, then the compact amount echoing the header's receipt. */
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

/** Covers the spine tail from the previous card that extends into the space below
 *  the last card's icon. Bounded by the flex-1 parent (which spans from the icon's
 *  bottom to the card's bottom) so it never bleeds past the card boundary. */
function SpineTrailingMask({ ground = "var(--background)" }: { ground?: string }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-10"
      style={{ top: 0, bottom: 0, width: 12, backgroundColor: ground }}
    />
  );
}

/** The trailing mask's mirror: covers the strip above the first node (the
 *  column's top padding), so nothing reaches down into a spine terminus —
 *  a first row draws no line above itself, whatever stands there. The tip's lead-in sits
 *  above this mask (z-20) when this row is also the newest. */
function SpineLeadingMask({ ground = "var(--background)" }: { ground?: string }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-10"
      style={{ top: 0, height: 16, width: 12, backgroundColor: ground }}
    />
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
  tone: WarningTone;
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
          <div
            key={i}
            className="grid items-center justify-items-center"
            style={{ gridTemplateColumns: scale.gridCols }}
            data-spine-leg=""
          >
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
  warningLabel,
  warningTip,
  warningLegs,
  iconDirection,
  rateSpan,
  undrawn,
  color = "default",
  isFirst,
  isLast,
  tip,
  detached,
}: SpineColumnProps) {
  const scale = useTimelineScale();
  const contextTip = useContext(SpineTipContext);
  const effectiveTip: SpineTip | null = tip !== undefined ? tip : contextTip;
  const { showTimelineValues } = useTimelineDisplay();
  const unreadOf = useUnreadTokenOf();
  // The phone spine view: the card's caption sits on the line below the node,
  // and the card's segment button is the only control: the chips drop their
  // filter, and the card stops the pointer reaching the flank values.
  const spineRow = useSpineRow();
  // Desktop: a click on the node or its flank values opens and closes the
  // card. The folder node keeps its toggle; the phone view's segment is a
  // button already.
  const toggleCtx = useContext(SpineNodeToggleContext);
  const nodeToggle = !spineRow && !detached ? toggleCtx : null;
  const nodeProps = nodeToggle
    ? { onClick: nodeToggle.onToggle, ...nodeToggle.hover, "data-spine-node-toggle": "" }
    : {};
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
  const setLegs = spineRow?.setLegs;
  useEffect(() => {
    setLegs?.(legs);
  }, [setLegs, legs]);
  const captionEl = spineRow && (
    <div className="relative z-10 flex justify-center pt-1.5 pb-2.5" data-spine-caption="">
      {spineRow.caption}
    </div>
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
  // Spine flanking values follow the "Timeline values" toggle in BOTH views. The
  // chain-state (monochrome) view is no longer special-cased: it carries the same
  // compact flanking notation as the interpreted one (compact display is the
  // one-step readability leeway the tier allows — view-tiers.md; the exact figure
  // still rides the provenance trace). The ≥sm / <sm hand-off to the card header
  // is owned by the layout (the `hidden sm:flex` spine column), not this flag.
  const spineValues = showTimelineValues;
  // The masks and the node's halo take the page's ground.
  const ground = "var(--background)";

  // The lead-in dot takes a warning event's tone. The line is solid neutral
  // ink, except the dotted segment that means "events not drawn" (a closed
  // group, the boundary), which takes the tone too.
  const effectiveColor: SpineColor = effectiveIcon === "warning" ? warningTone : color;
  const isDotted = !!undrawn;
  const spineRgb = SPINE_COLORS[isDotted ? effectiveColor : "default"];
  const dotClass = DOT_COLORS[effectiveColor];
  const spineStyle = isDotted
    ? { backgroundImage: `linear-gradient(to bottom, ${spineRgb} 50%, transparent 50%)`, backgroundSize: "1px 6px" }
    : { backgroundColor: spineRgb };
  const spineClasses = "absolute left-1/2 -translate-x-1/2 w-px";
  // The phone spine view: an opened card carries this line past itself.
  const lineKey = !detached && !isLast ? spineLineKey(isDotted, spineRgb) : null;
  const setLine = spineRow?.setLine;
  useEffect(() => {
    setLine?.(lineKey);
  }, [setLine, lineKey]);

  const spineEl = detached ? (
    // Detached card: spine is bounded by the column itself, no overflow into neighbours.
    <div className={spineClasses} style={{ top: 0, bottom: 0, ...spineStyle }} />
  ) : isLast ? (
    // A closed group at the end of the list keeps its undrawn segment, inside
    // the row.
    isDotted && <div className={spineClasses} style={{ top: 0, bottom: 8, ...spineStyle }} />
  ) : (
    // Overshoot past the card bottom just enough to reach into the *next*
    // icon's halo (where it's masked by var(--background) box-shadow), then
    // stop. Layout assumes the standard sibling spacing — space-y-2 (8px
    // gap) + cardPad (4px) + SpineColumn pt-4 (16px) − halo radius (4px) ≈
    // 24px from this card's bottom to the next halo's top edge; 28px lands
    // a few px inside the halo for clean masking. Any further (the old
    // 100px) and the spine bleeds past the next card entirely, leaving a
    // bare tail visible below the bottom-most event.
    // The line is also what a market-note marker gap below lengthens
    // (`useExtendLineAbove`), so it is marked and reads the var: in the
    // phone spine view as `data-spine-line`, in the list view as
    // `data-list-line` (item 118's stacked desktop markers).
    <div
      className={spineClasses}
      data-spine-line={spineRow ? "" : undefined}
      data-list-line={spineRow ? undefined : ""}
      style={{ top: 0, bottom: SPINE_LINE_OVERSHOOT, ...spineStyle }}
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
  // The tip below (the bottom row): a short line down from the node, then the
  // dot — in the strip the trailing mask covers. Unreached today; see the
  // `tip` prop's own doc.
  const tipBelow = effectiveTip === "below" && (
    <div className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center" style={{ top: 0 }}>
      <div className="w-px" style={{ height: 12, backgroundColor: spineRgb }} />
      <div style={{ paddingTop: 4 }}>
        <PulsingDot dotClass={dotClass} side="below" />
      </div>
    </div>
  );
  const leadingMask = isFirst && !detached && <SpineLeadingMask ground={ground} />;

  // Icon override mode — no token icons, just a semantic icon
  if (effectiveIcon) {
    const iconContent = (() => {
      switch (effectiveIcon) {
        case "warning": {
          // The legs as nodes; the triangle only where the event names none.
          const node = adverseLegs?.length ? (
            <WarningLegNodes
              legs={adverseLegs}
              tone={warningTone}
              showValues={spineValues}
              filterable={!spineRow && !nodeToggle}
            />
          ) : (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <WarningIcon size={scale.tokenSize} color={SPINE_COLORS[warningTone]} />
              <span />
              <span />
            </div>
          );
          return warningTip ? <RevealTip tip={warningTip}>{node}</RevealTip> : node;
        }
        case "rate-change":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <RateIcon size={scale.tokenSize} />
              {rateSpan ? (
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
                ) : (
                  <>
                    <span />
                    <span />
                  </>
                )
              ) : (
                <>
                  <DirectionArrow direction={iconDirection ?? "up"} size={Math.round(scale.arrowSize * 0.7)} />
                  <span />
                </>
              )}
            </div>
          );
        case "delegate":
          return (
            // A delegation is a people event, not a rate tweak — render a
            // person glyph with a join (+) / leave (−) badge so it reads
            // distinctly from the rate-change "%↑". iconDirection up = join
            // (setInterestBatchManager), down = leave (removeFromBatch).
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <div className="relative">
                <UsersIcon size={scale.tokenSize} />
                <DelegateBadge size={scale.tokenSize} join={iconDirection !== "down"} />
              </div>
              <span />
              <span />
            </div>
          );
        case "external":
          return (
            // A third-party action with NOTHING TO DRAW — no token row, so the
            // people glyph in the pink external-party tint (color-grammar.md
            // §4b) stands alone. Unlike the delegate icon it carries no
            // join/leave badge: nothing was delegated, an outside party simply
            // acted on the position. Where the event DID move tokens, the flow
            // renders and this glyph rides it as ExternalBadge instead.
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <UsersIcon size={scale.tokenSize} color="#EC4899" />
              <span />
              <span />
            </div>
          );
        case "mint":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <MintIcon size={scale.tokenSize} />
              <span />
              <span />
            </div>
          );
        case "burn":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <BurnIcon size={scale.tokenSize} />
              <span />
              <span />
            </div>
          );
        case "extend":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <ExtendIcon size={scale.tokenSize} />
              <span />
              <span />
            </div>
          );
        case "no-change":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <NoChangeIcon size={scale.tokenSize} />
              <span />
              <span />
            </div>
          );
        case "custody":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <CustodyIcon size={scale.tokenSize} />
              <span />
              <span />
            </div>
          );
        case "swap":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <SwapIcon size={scale.tokenSize} axis={swapAxis} />
              {spineValues && swapLegs?.length ? (
                <SwapLegs legs={swapLegs} />
              ) : (
                <>
                  <span />
                  <span />
                </>
              )}
            </div>
          );
        case "market":
        case "market-open":
          // A market note's own node. It sits ON the spine like an event's
          // glyph — a note is placed between two of the account's events and
          // the reader has to see which two — but it is deliberately among the
          // quietest marks on the column: a small hollow diamond in the spine's
          // neutral ink, no fill, no party colour and no pulse. Nothing
          // happened to the ACCOUNT here, so nothing on the node may read as an
          // action of its own. A note opened from its marker fills the diamond
          // in the same ink, which marks the open note on the spine.
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <MarketNoteIcon
                size={scale.tokenSize}
                color={SPINE_COLORS.default}
                filled={effectiveIcon === "market-open"}
              />
              <span />
              <span />
            </div>
          );
        case "live-window":
          // The live window's node — the note's register, because the same
          // thing is true of both: the account did nothing here. So it keeps
          // the hollow outline and the neutral ink and takes no fill, no tint
          // and no pulse, and differs in SHAPE alone. On a CDP carrying both,
          // the window and the live notes stand together in the head slot, and
          // the shape is what tells a reader the classes apart there — putting
          // the notes away and watching one row survive is not a way to learn
          // it.
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <LiveWindowIcon size={scale.tokenSize} color={SPINE_COLORS.default} />
              <span />
              <span />
            </div>
          );
        case "close":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <LogOut
                size={scale.tokenSize}
                strokeWidth={1.5}
                absoluteStrokeWidth
                color="var(--color-rb-500)"
                aria-hidden="true"
              />
              <span />
              <span />
            </div>
          );
        case "dead-end":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <ArrowRightToLine
                size={scale.tokenSize}
                strokeWidth={1.5}
                absoluteStrokeWidth
                color="var(--color-rb-500)"
                aria-hidden="true"
              />
              <span />
              <span />
            </div>
          );
        case "moment":
          // The state card's node: a clock (lucide `clock`) in the boundary's
          // neutral ink, where an event row shows its token. The card states
          // a moment, which no transaction made.
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <Clock
                size={scale.tokenSize}
                strokeWidth={1.25}
                absoluteStrokeWidth
                color="var(--color-rb-500)"
                aria-hidden="true"
              />
              <span />
              <span />
            </div>
          );
        case "boundary":
          // The boundary card's node: a stack (lucide `layers`) standing for
          // the events before the oldest drawn row, where an event row shows
          // its token. Neutral ink, no pulse, no pill on the flank — the
          // count rides the card header's own number-pill slot so it lines up
          // with the row numbers above it. Drawn at the flank's token size
          // with the stroke pinned in absolute pixels, the folder's rule.
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <Layers
                size={scale.tokenSize}
                strokeWidth={1.25}
                absoluteStrokeWidth
                color="var(--color-rb-500)"
                aria-hidden="true"
              />
              <span />
              <span />
            </div>
          );
        case "none":
          // A group with no asset legs, or the boundary: the group node alone.
          return null;
      }
    })();

    return (
      <div
        className={`${spineRow ? "flex max-w-full" : "hidden sm:flex"} flex-col items-center relative px-1 pt-4 self-stretch`}
        // The spine carries no receipts (TO-DO-mobile-timeline decision 13):
        // its figures re-state the card's, which carries them.
        data-prov-exempt=""
      >
        {leadingMask}
        <div
          className={`relative z-10${nodeToggle ? " cursor-pointer" : ""}`}
          style={detached ? undefined : { backgroundColor: ground, boxShadow: `0 0 0 4px ${ground}` }}
          {...nodeProps}
        >
          {leadIn}
          {iconContent}
        </div>
        <div className="flex-1 relative">
          {spineEl}
          {isLast && !detached && !isDotted && <SpineTrailingMask ground={ground} />}
          {tipBelow}
          {captionEl}
        </div>
      </div>
    );
  }

  // Token flow mode — 1 or 2 rows of token icons with directional arrows
  const rows = tokens ?? [];
  // The external badge occupies the same bottom-right corner as check/cross, so
  // it takes the same paddingBottom compensation — without it the badge clips
  // into the row below.
  const hasBadge = rows.some((r) => r.badge) || (externalParty && rows.length > 0);

  return (
    <div
      className={`${spineRow ? "flex max-w-full" : "hidden sm:flex"} flex-col items-center relative px-1 pt-4 self-stretch`}
      data-prov-exempt=""
    >
      {leadingMask}
      <div
        className={`relative z-10 flex flex-col gap-y-1 items-center${nodeToggle ? " cursor-pointer" : ""}`}
        {...nodeProps}
        style={
          detached
            ? { paddingBottom: hasBadge ? 6 : 0 }
            : {
                backgroundColor: ground,
                boxShadow: `0 0 0 4px ${ground}`,
                paddingBottom: hasBadge ? 6 : 0,
              }
        }
      >
        {leadIn}
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid items-center justify-items-center"
            style={{ gridTemplateColumns: scale.gridCols }}
          >
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
            {/* One corner, one badge. An explicit row badge WINS over the
                external one: a check/cross is the event's own meaning (Aave
                V4's collateral toggle), whereas "a third party did this" is
                still carried by the dotted spine and the header's "by …" chip. */}
            {row.badge || externalParty ? (
              <div className="relative">
                <TokenChipIcon
                  symbol={row.symbol}
                  iconOverride={row.iconSymbol}
                  address={row.address}
                  size={scale.tokenSize}
                  filterable={!spineRow && !nodeToggle}
                />
                {row.badge === "check" ? (
                  <CheckBadge size={scale.tokenSize} />
                ) : row.badge === "cross" ? (
                  <CrossBadge size={scale.tokenSize} />
                ) : row.badge === "send" ? (
                  <SendBadge size={scale.tokenSize} />
                ) : row.badge === "swap" ? (
                  <SwapBadge size={scale.tokenSize} />
                ) : (
                  <ExternalBadge size={scale.tokenSize} />
                )}
              </div>
            ) : (
              <TokenChipIcon
                symbol={row.symbol}
                iconOverride={row.iconSymbol}
                address={row.address}
                size={scale.tokenSize}
                filterable={!spineRow && !nodeToggle}
              />
            )}
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
          </div>
        ))}
      </div>
      <div className="flex-1 relative">
        {spineEl}
        {isLast && !detached && !isDotted && <SpineTrailingMask ground={ground} />}
        {tipBelow}
        {captionEl}
      </div>
    </div>
  );
}
