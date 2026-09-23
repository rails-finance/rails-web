"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Folder, FolderOpen, Layers } from "lucide-react";

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { DisclosureChevron } from "@/components/shared/expand-chevron";
import { ArrowFromDot } from "@/components/shared/timeline-spine";
import { Prov } from "@/components/shared/provenance";
import { useTimelineScale, SpineVal, fmtSpine, type SpineValProv } from "@/components/shared/activity-timeline";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import type { LinkedHoverHandlers } from "@/hooks/useLinkedHover";

// ── Icon overrides ──────────────────────────────────────────────────────────

/** Semantic icon that replaces token icons when the event isn't about token flow */
export type SpineIcon =
  | "warning" // Passive loss: liquidation, redemption (caution/critical tone via warningTone)
  | "rate-change" // Interest rate / parameter change (% with up/down arrow)
  | "delegate" // Delegation change (users icon with +/- badge)
  | "external" // Third-party action with nothing to draw (pink users icon) — the FALLBACK for `externalParty`; cards pass the flag, not this
  | "mint" // Token minted into existence (e.g. a loan NFT) — plus-in-circle
  | "burn" // Token burned / destroyed (e.g. a settled loan NFT) — flame
  | "extend" // Term renegotiated / duration extended — clock
  | "no-change" // Operation that moved nothing (zero-delta adjust) — equals-in-circle
  | "custody" // Position moved between accounts (a receipt-token transfer run) — the paper plane in a neutral disc, the same custody mark a single row wears as `badge: "send"`
  | "swap" // A position swap: one asset became another under an order the owner signed, both legs staying in the position (rails-ops TO-DO-ui-jobs §15, §19) — a bare arrow-down-up at 45° in its axis hues, the legs stacked on the right flank (`swapLegs`)
  | "market" // A market note — a receipted fact about the MARKET between two of the account's own events (components/shared/market-note-row.tsx): hollow diamond, neutral ink, never a party colour
  | "live-window" // The live window between ONE position's last touch and now, pinned in the timeline's head slot (components/protocol/polaris/polaris-since-last-touch.tsx). Its own class, not a market note: the same hollow outline in the same neutral ink — the holder did nothing inside the window, which is what lets its causes be stated as facts — turned square where the note's is a diamond, so the two classes are told apart by shape
  | "folder" // A chronological chunk of a longer third-party stretch (lib/shared/timeline-chunks.ts) — disclosure chevron + folder in the LEFT flank, dot on the spine, bare count pill right
  | "boundary"; // The boundary card (components/shared/timeline-boundary-card.tsx) — a stack of transactions, the events before the oldest drawn row; neutral ink, the last node on the spine

/** Spine line style encoding agency */
export type SpineVariant = "solid" | "dotted";

/** Spine color tint. The spine line itself carries NO decorative/subsystem
 *  tint — it stays neutral. The only tints are the two §5 adverse tones, which
 *  are the warningTone values (caution = redemption + routine adverse, critical
 *  = liquidation). External-party events (delegation) signal via the pink glyph
 *  badge (color-grammar.md §4b), not the spine line. (The former blue/green/
 *  violet/purple subsystem tints were retired — color variation doesn't belong
 *  on the spine.) */
export type SpineColor = "default" | "caution" | "critical";

const SPINE_COLORS: Record<SpineColor, string> = {
  default: "rgb(101 115 140)", // rb-500
  caution: "var(--caution)", // redemption + all caution (color-grammar.md §5)
  critical: "rgb(239 68 68)", // red-500 — liquidation + critical
};

/** Pulsing dot color matching spine tint */
const DOT_COLORS: Record<SpineColor, string> = {
  default: "bg-green-400",
  caution: "bg-caution-400",
  critical: "bg-red-400",
};

/** Pill classes for the warning label, keyed by warning tone */
const WARNING_PILL_CLASSES: Record<"caution" | "critical", string> = {
  caution: "bg-caution-500/15 text-caution-600 dark:text-caution-400",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
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
  /** Tone for the "warning" triangle — "caution" (orange) for redemption and
   *  every routine adverse event, "critical" (red) for terminal events
   *  (liquidation). The dotted spine + lead-in dot inherit this tone too.
   *  Defaults to "caution". See color-grammar.md §5. */
  warningTone?: "caution" | "critical";
  /** Optional short label rendered in a tinted pill beneath the warning
   *  triangle (e.g. "Redemption", "Liquidation"). Used with icon="warning",
   *  and with icon="folder" for a one-kind folder that keeps its kind's pill
   *  (a liquidations-only chunk). */
  warningLabel?: string;
  /** icon="folder" only — draw the open-folder glyph (the chunk is expanded). */
  folderOpen?: boolean;
  /** icon="folder" only — small glyph on the folder's corner: a chunk whose
   *  members are all one kind wears that kind's mark. */
  folderMark?: ReactNode;
  /** icon="folder" only — member count, rendered in a pill on the right
   *  flank of the spine dot. */
  folderCount?: number;
  /** icon="folder" only — clicking the folder node toggles the chunk open,
   *  the same action as the header. Redundant affordance: the header stays
   *  the accessible control (focus, aria-expanded), so this one carries no
   *  tab stop of its own. */
  onFolderToggle?: () => void;
  /** icon="folder" only — the folder node and the run header are ONE control
   *  in two subtrees, so their hover is linked through the run card's
   *  `useLinkedHover`: `folderLit` draws the node in the hovered tone while
   *  the pointer is over EITHER surface, and `folderHover` reports this
   *  node's own enter/leave back up. */
  folderLit?: boolean;
  folderHover?: LinkedHoverHandlers;
  /** Direction for rate-change arrow or delegate badge */
  iconDirection?: "up" | "down";
  /** Spine line style: solid = user-initiated, dotted = passive/external */
  spine?: SpineVariant;
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
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
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
function MarketNoteIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect
        x={11}
        y={11}
        width={10}
        height={10}
        transform="rotate(45 16 16)"
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
  return (
    <span className="justify-self-start pl-1 flex flex-col gap-1" style={{ gridColumn: "4 / 6" }} data-swap-legs="">
      {legs.map((leg, i) => {
        const txt = fmtSpine(leg.value);
        return (
          <span key={i} className="inline-flex items-center gap-2 text-base font-semibold whitespace-nowrap">
            <TokenChipIcon symbol={leg.symbol} address={leg.address} size={20} />
            {leg.prov ? (
              <Prov echo info={leg.prov.info} value={leg.prov.value} symbol={leg.prov.symbol}>
                {txt}
              </Prov>
            ) : (
              txt
            )}
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
function PulsingDot({ dotClass = "bg-green-400", side }: { dotClass?: string; side: SpineTip }) {
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
function SpineTrailingMask() {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-10"
      style={{ top: 0, bottom: 0, width: 12, backgroundColor: "var(--background)" }}
    />
  );
}

/** The trailing mask's mirror: covers the strip above the first node (the
 *  column's top padding), so nothing reaches down into a spine terminus —
 *  a first row draws no line above itself, whatever stands there. The tip's lead-in sits
 *  above this mask (z-20) when this row is also the newest. */
function SpineLeadingMask() {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-10"
      style={{ top: 0, height: 16, width: 12, backgroundColor: "var(--background)" }}
    />
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
  folderOpen,
  folderMark,
  folderCount,
  onFolderToggle,
  folderLit,
  folderHover,
  iconDirection,
  spine = "solid",
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

  // For warning events the spine + lead-in dot inherit the warning tone so the
  // whole dotted segment reads as caution (orange) / critical (red, liquidation).
  // A folder that carries a warning pill (a liquidations-only chunk) inherits
  // it the same way — the danger register survives the move onto the folder.
  const effectiveColor: SpineColor =
    effectiveIcon === "warning" || (effectiveIcon === "folder" && warningLabel) ? warningTone : color;
  const spineRgb = SPINE_COLORS[effectiveColor];
  const dotClass = DOT_COLORS[effectiveColor];
  const isDotted = spine === "dotted";
  const spineStyle = isDotted
    ? { backgroundImage: `linear-gradient(to bottom, ${spineRgb} 50%, transparent 50%)`, backgroundSize: "1px 6px" }
    : { backgroundColor: spineRgb };
  const spineClasses = "absolute left-1/2 -translate-x-1/2 w-px";

  const spineEl = detached ? (
    // Detached card: spine is bounded by the column itself, no overflow into neighbours.
    <div className={spineClasses} style={{ top: 0, bottom: 0, ...spineStyle }} />
  ) : (
    !isLast && (
      // Overshoot past the card bottom just enough to reach into the *next*
      // icon's halo (where it's masked by var(--background) box-shadow), then
      // stop. Layout assumes the standard sibling spacing — space-y-2 (8px
      // gap) + cardPad (4px) + SpineColumn pt-4 (16px) − halo radius (4px) ≈
      // 24px from this card's bottom to the next halo's top edge; 28px lands
      // a few px inside the halo for clean masking. Any further (the old
      // 100px) and the spine bleeds past the next card entirely, leaving a
      // bare tail visible below the bottom-most event.
      <div className={spineClasses} style={{ top: 0, bottom: "calc(-1 * var(--card-pad) - 28px)", ...spineStyle }} />
    )
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
  const leadingMask = isFirst && !detached && <SpineLeadingMask />;

  // Icon override mode — no token icons, just a semantic icon
  if (effectiveIcon) {
    const iconContent = (() => {
      switch (effectiveIcon) {
        case "warning":
          return (
            <div className="flex flex-col items-center gap-1">
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
              {warningLabel && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide leading-none whitespace-nowrap ${WARNING_PILL_CLASSES[warningTone]}`}
                >
                  {warningLabel}
                </span>
              )}
            </div>
          );
        case "rate-change":
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <RateIcon size={scale.tokenSize} />
              <DirectionArrow direction={iconDirection ?? "up"} size={Math.round(scale.arrowSize * 0.7)} />
              <span />
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
          // A market note's own node. It sits ON the spine like an event's
          // glyph — a note is placed between two of the account's events and
          // the reader has to see which two — but it is deliberately among the
          // quietest marks on the column: a small hollow diamond in the spine's
          // neutral ink, no fill, no party colour and no pulse. Nothing
          // happened to the ACCOUNT here, so nothing on the node may read as an
          // action of its own.
          return (
            <div
              className="grid grid-rows-1 items-center justify-items-center"
              style={{ gridTemplateColumns: scale.gridCols }}
            >
              <span />
              <span />
              <MarketNoteIcon size={scale.tokenSize} color={SPINE_COLORS.default} />
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
        case "folder":
          // The folder sits in the LEFT flank — beside the spine, not on it —
          // so the expanded members' own spine nodes line up to its right and
          // read as the folder's contents. The spine keeps a plain dot (tinted
          // with the folder's tone), and the count rides a pill pulled flush
          // against the dot — the bare number: beside a folder the pill can
          // only mean "this many inside", so the "×" it used to carry was
          // noise (Miles, 2026-09-02). The dashed connector that used to join
          // folder to dot went the same day — the flank position already says
          // which node the folder belongs to. Two dashed stubs run the dot's
          // cell top-to-bottom so the through-spine actually MEETS the dot:
          // the stub starts 4px above the node box — exactly where the
          // previous card's masked overshoot stops being visible — and ends
          // at the box bottom where this card's own spine segment begins (on
          // a terminal collapsed node the lower stub is dropped: no line to
          // nowhere). The whole node toggles on click, same as the header,
          // and the two surfaces hover as one: the node lights while the
          // pointer is over the header and vice versa (`folderLit`, linked
          // through the run card — Miles, 2026-09-03). No native title on the
          // node: the linked hover already says "these open together", and a
          // browser tooltip would be the one hover surface the site does not
          // otherwise use. No warningLabel pill at this level — a collapsed
          // run states its
          // severity through the corner mark and the dot tone, not a repeated
          // label; single-event spine nodes still carry their own pill above.
          //
          // The disclosure mark is a Finder-style chevron to the folder's LEFT
          // — pointing right while closed, down while open — and it is the
          // folder's ONLY chevron: the header's trailing ▾ came off folder
          // rows the same day (Miles, 2026-09-02). Outline grammar: the mark
          // that says "this opens" sits before the thing it opens.
          //
          // The glyph is drawn at the flank's token size, several times the
          // 16px the same lucide folder has elsewhere on the site — so its
          // stroke is pinned in absolute pixels rather than scaled with the
          // box, matching the small icon's weight instead of arriving as a
          // chunky enlargement of it.
          return (
            <div
              className={`group/folder flex flex-col items-center gap-1${onFolderToggle ? " cursor-pointer" : ""}`}
              onClick={onFolderToggle}
              {...folderHover}
            >
              <div
                className="grid grid-rows-1 items-center justify-items-center"
                style={{ gridTemplateColumns: scale.gridCols }}
              >
                {/* pr-5 mirrors SpineVal's left-side cell, so the folder's
                    right edge lines up with the flank values' right edge on
                    the rows around it. */}
                <div
                  className={`justify-self-end pr-5 transition-colors group-hover/folder:text-foreground ${
                    folderLit ? "text-foreground" : "text-rb-500"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <DisclosureChevron isOpen={!!folderOpen} size={14} />
                    {/* The mark anchors to the glyph itself, inside the
                        padded cell, so it stays on the folder's corner. */}
                    <span className="relative inline-flex">
                      {folderOpen ? (
                        <FolderOpen size={scale.tokenSize} strokeWidth={1.25} absoluteStrokeWidth />
                      ) : (
                        <Folder size={scale.tokenSize} strokeWidth={1.25} absoluteStrokeWidth />
                      )}
                      {folderMark && (
                        <span
                          className="absolute -bottom-1 -right-1 inline-flex rounded-full p-px"
                          style={{ backgroundColor: "var(--background)" }}
                        >
                          {folderMark}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
                {/* The arrow column stays empty: the folder and the dot are
                    neighbours, not joined. */}
                <span />
                <div className="relative self-stretch flex items-center justify-center">
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-px"
                    style={{
                      top: -4,
                      bottom: isLast && !detached ? "50%" : 0,
                      backgroundImage: `linear-gradient(to bottom, ${spineRgb} 50%, transparent 50%)`,
                      backgroundSize: "1px 6px",
                    }}
                  />
                  <span className="relative rounded-full" style={{ width: 8, height: 8, backgroundColor: spineRgb }} />
                </div>
                {folderCount != null && (
                  // data-prov-exempt: a folder's member count is an index row
                  // count, not a chain-state figure — the same "event numbers"
                  // class PositionCardMeta's cluster is exempted under. It
                  // matters wherever a timeline is nested inside a page-level
                  // receipts scope (the Vaults position page), where the
                  // coverage tripwire would otherwise ask for a receipt for
                  // "how many rows are in this folder".
                  <span data-prov-exempt="" className="justify-self-start -ml-2" style={{ gridColumn: "4 / 6" }}>
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none whitespace-nowrap text-rb-500 bg-rb-500/10">
                      {folderCount.toLocaleString("en-US")}
                    </span>
                  </span>
                )}
              </div>
            </div>
          );
      }
    })();

    return (
      <div className={"hidden sm:flex flex-col items-center relative px-1 pt-4 self-stretch"}>
        {leadingMask}
        <div
          className="relative z-10"
          style={
            detached ? undefined : { backgroundColor: "var(--background)", boxShadow: "0 0 0 4px var(--background)" }
          }
        >
          {leadIn}
          {iconContent}
        </div>
        <div className="flex-1 relative">
          {spineEl}
          {isLast && !detached && <SpineTrailingMask />}
          {tipBelow}
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
    <div className={"hidden sm:flex flex-col items-center relative px-1 pt-4 self-stretch"}>
      {leadingMask}
      <div
        className="relative z-10 flex flex-col gap-y-1 items-center"
        style={
          detached
            ? { paddingBottom: hasBadge ? 6 : 0 }
            : {
                backgroundColor: "var(--background)",
                boxShadow: "0 0 0 4px var(--background)",
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
              value={spineValues && row.direction === "left" ? row.value : undefined}
              side="left"
              onChange={row.direction === "left" ? row.onValueChange : undefined}
              decimals={row.valueDecimals}
              max={row.valueMax}
              prov={row.prov}
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
              />
            )}
            {row.direction === "right" ? <ArrowFromDot direction="right" size={scale.arrowSize} /> : <span />}
            <SpineVal
              value={spineValues && row.direction === "right" ? row.value : undefined}
              side="right"
              onChange={row.direction === "right" ? row.onValueChange : undefined}
              decimals={row.valueDecimals}
              max={row.valueMax}
              prov={row.prov}
            />
          </div>
        ))}
      </div>
      <div className="flex-1 relative">
        {spineEl}
        {isLast && !detached && <SpineTrailingMask />}
        {tipBelow}
      </div>
    </div>
  );
}
