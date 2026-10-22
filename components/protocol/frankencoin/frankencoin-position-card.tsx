"use client";

// Frankencoin position card: one Position contract, drawn by the shared
// position card (components/shared/position-card.tsx; rails-ops
// TO-DO-position-card 322). `useFrankencoinCardSlots` builds the slots from
// the position's view and the page's live read; `PositionCard` draws them on
// the position page and in the listing row.
//
// THE GRAIN IS THE CONTRACT: the card is one Position clone, the address is
// the identity and the owner a mutable fact. UNITS ARE NATIVE: collateral in
// the position's token (per-token decimals from the row; four observed
// collaterals are decimals=0), debt in ZCHF. There is NO USD line and no
// dollar anywhere: Frankencoin runs no oracle, and the one price on the card,
// the liquidation price, is OWNER-DECLARED, labelled so, in ZCHF per token.
//
// STATUS IS TWO-AXIS. The tag says closed, denied or expired; a live
// position has none. The challenge history is the other axis: an open
// position that survived a challenge stays an open card, its tally in the
// panel (named as challenges, never "liquidations"), and a running challenge
// is the notice above the headlines. There is NO health headline and no
// invented health factor: the declared price, the challenges, the expiry and
// the cooldown carry the risk, as panel rows.
//
// The card view builds from EITHER lane: `viewFromSummary` (the index row,
// the latest MintingUpdate absolutes) or `viewFromChain` (the live overlay,
// the position's slots at head, the primary truth on the detail page).

import { ListingTag } from "@/components/shared/listing-tag";
import { TokenFigure } from "@/components/shared/token-figure";
import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Hash, Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardCounters,
  type PositionCardHead,
  type PositionCardMenu,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { RevealTip } from "@/components/shared/reveal-tip";
import { AssetAmount } from "@/components/shared/asset-amount";
import { WalletPill } from "@/components/shared/wallet-pill";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { Icon } from "@/components/icons/icon";
import { formatUnitsExact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { latestAbsoluteProv, peakAbsoluteProv, lifetimeFlowProv } from "@/lib/frankencoin/event-provenance";
import type { FrankencoinLifetimeDebt } from "@/lib/frankencoin/flows";
import { fmtZchf, phaseText } from "@/lib/frankencoin/figures";
import {
  liveMintedProv,
  liveCollateralProv,
  liveLiqPriceProv,
  liveInterestProv,
} from "@/lib/frankencoin/live-provenance";
import { ppmToPct, shortAddress } from "@/lib/frankencoin/asset-catalog";
import { frankencoinPositionModal } from "@/lib/frankencoin/event-templates";
import type { Provenance } from "@/components/shared/provenance";
import type { FrankencoinPositionSummary, FrankencoinPositionStatus } from "@/lib/sources/api/frankencoin-positions";
import type { FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";
import { AmountText } from "@/components/shared/amount-text";
import { formatDate, formatDayMonth } from "@/lib/date";
import { PanelFigure } from "@/components/shared/position-card-panel";

export interface FrankencoinPositionView {
  /** Lowercased Position contract address — the identity. */
  position: string;
  hub: "v1" | "v2";
  owner: string | null;
  isClone: boolean;
  /** The original a clone was cloned from — chain lane only. */
  original?: string | null;
  collateralSymbol: string;
  collateralDecimals: number;
  /** NULL ≠ zero on the index lane: the ledger never spoke (direct-transferred
   *  collateral is invisible to events) — rendered a dash; the chain lane
   *  corrects at head. */
  collateral: number | null;
  collateralRaw: string | null;
  minted: number;
  mintedRaw: string | null;
  /** Owner-declared liquidation price, ZCHF per whole token. */
  liqPrice: number | null;
  /** The API speaks open/closed/denied; "expired" exists ONLY on the chain
   *  lane (expiration is not an event fact — the overlay is its sole source). */
  status: FrankencoinPositionStatus | "expired";
  challengeCount: number;
  everChallenged: boolean;
  /** Closed-card headlines (lifetime maxima); null when the index lacks them. */
  peakCollateral: number | null;
  peakMinted: number | null;
  /** From the chain overlay ONLY — the API carries no expiration. */
  expiration: number | null;
  lastActivityAt: number | null;
  txCount: number;
  /** Which lane the figures assert: the live overlay or the indexed ledger. */
  basis: "chain" | "index";
  /** The position's fixed annual interest (ppm) — chain lane only. */
  annualInterestPPM: number | null;
  /** The reserve share held against the debt, ZCHF — chain lane only. */
  reserveHeld?: number | null;
}

/** How a terminal position ended, from its timeline: the forced sale that
 *  sold its collateral and the denial, each with its time. */
export interface FrankencoinEnding {
  /** The forced sale that sold collateral (the last one that did). */
  forcedAt: number | null;
  deniedAt: number | null;
  /** The position closed in a challenge sale's transaction. */
  closedByChallenge?: boolean;
}

/** The card's lifecycle vocabulary: the API's three + the chain-only
 *  "expired" (expiration is head state, never an API fact). */
export type FrankencoinCardStatus = FrankencoinPositionStatus | "expired";

/** The tag on an ended position; a live one has none. */
const STATUS: Record<Exclude<FrankencoinCardStatus, "open">, PositionCardStatus> = {
  closed: { word: "Closed", tone: "muted" },
  denied: { word: "Denied", tone: "muted" },
  expired: { word: "Expired", tone: "muted" },
};

const collProv = (v: FrankencoinPositionView): Provenance =>
  v.basis === "chain"
    ? liveCollateralProv(v.collateralSymbol, v.position)
    : latestAbsoluteProv("collateral", v.collateralSymbol, v.collateralDecimals);

const mintedProv = (v: FrankencoinPositionView): Provenance =>
  v.basis === "chain" ? liveMintedProv(v.position) : latestAbsoluteProv("minted", "ZCHF", 18);

const liqPriceProv = (v: FrankencoinPositionView): Provenance =>
  v.basis === "chain"
    ? liveLiqPriceProv(v.collateralSymbol, v.collateralDecimals, v.position)
    : latestAbsoluteProv("price", v.collateralSymbol, v.collateralDecimals);

/** The position's contract address, which is its identity. */
function PositionAddress({ v }: { v: FrankencoinPositionView }) {
  return (
    <span className="text-xs text-rb-500 tabular-nums">
      <RevealTip
        tip="The position's contract address. Every Frankencoin position is a contract of its own."
        label="Position contract address"
        focusable
        className="focus-ring rounded-sm"
      >
        {shortAddress(v.position)}
      </RevealTip>
    </span>
  );
}

/** The position-grain identity: the contract address + which hub + lineage,
 *  each explained on hover or tap. */
function PositionIdentity({
  v,
  cloneParent,
  listing = false,
}: {
  v: FrankencoinPositionView;
  cloneParent?: string | null;
  /** A listing row: the address goes to the card's right-end `tag`, so only
   *  the hub and lineage are drawn here. */
  listing?: boolean;
}) {
  const hubTip =
    v.hub === "v1"
      ? "Minting Hub V1 (2023), the first of Frankencoin's two hubs. It opened this position and runs its challenges."
      : "Minting Hub V2 (2024), the current hub. It opened this position and runs its challenges and, after expiry, the sale of its collateral.";
  return (
    <span className="text-xs text-rb-500 tabular-nums">
      {!listing && (
        <>
          <PositionAddress v={v} />
          <span className="mx-1 text-rb-400">·</span>
        </>
      )}
      <RevealTip tip={hubTip} label={hubTip} focusable className="focus-ring rounded-sm">
        {v.hub === "v1" ? "Hub V1" : "Hub V2"}
      </RevealTip>
      <span className="mx-1 text-rb-400">·</span>
      {v.isClone ? (
        <RevealTip
          tip={cloneTip(v.original ?? null, cloneParent ?? null)}
          label="Clone"
          focusable
          className="focus-ring rounded-sm"
        >
          clone
        </RevealTip>
      ) : (
        <RevealTip tip={ORIGINAL_TIP} label="Original" focusable className="focus-ring rounded-sm">
          original
        </RevealTip>
      )}
    </span>
  );
}

const ORIGINAL_TIP =
  "An original: it proposed its own terms, paid the opening fee and faced a veto window before it could mint. A clone copies an original's terms and shares its minting limit.";

/** The clone chip's tip: the position it was cloned from and, when that is
 *  not the family's original, the original too. */
function cloneTip(root: string | null, parent: string | null): string {
  if (parent && root && parent !== root)
    return `A clone: cloned from ${shortAddress(parent)}, a clone of the family's original ${shortAddress(root)}. It is a position of its own, started at ${shortAddress(parent)}'s declared price on the original's other terms, and shares the family's minting limit.`;
  const of = parent ?? root;
  return `A clone${of ? ` of ${shortAddress(of)}` : ""}: a position of its own on that original's terms, sharing its minting limit.`;
}

/** The listing's challenge marker after the counts: caution triangle and
 *  count, named as challenges (Frankencoin's vocabulary). The position
 *  page states the tally in the panel or the closed card's Challenges. */
function ChallengeMarker({ count }: { count: number }) {
  if (count <= 0) return null;
  const title = `Challenged ${count} time${count === 1 ? "" : "s"}`;
  return (
    <RevealTip tip={title} label={title} className="text-caution-400 text-xs">
      <Icon name="triangle" size={12} />
      <span className="ml-1 font-semibold">{count}</span>
    </RevealTip>
  );
}

/** A closed card's lifetime line under its highest debt: the peak above is
 *  one moment, this is the whole life (the Lifetime flows panel's debt side). */
function LifetimeDebtLine({ side }: { side: FrankencoinLifetimeDebt }) {
  const minted = side.minted;
  const repaid = side.repaid;
  const cleared = side.cleared;
  const allRepaid = !cleared && Math.abs(repaid - minted) <= Math.max(1e-9, minted * 1e-12);
  return (
    <span className="tabular-nums">
      <Prov info={lifetimeFlowProv("minted", "ZCHF")}>
        <span>{fmtZchf(minted)} ZCHF</span>
      </Prov>{" "}
      minted over its life
      {allRepaid ? (
        <>, all repaid</>
      ) : (
        <>
          : {fmtZchf(repaid)} repaid
          {cleared && (
            <>
              , {fmtZchf(cleared.amount)} {cleared.label}
            </>
          )}
        </>
      )}
    </span>
  );
}

/** The position's rows at the head of the card's ⋮ (ui-jobs 308 point 2):
 *  its contract address with a copy, and a link to its page. */
function FrankencoinMenuRows({ position }: { position: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const icon = (key: string, glyph: ReactNode) => (copied === key ? <Check size={16} /> : glyph);
  return (
    <>
      <ToolsMenuItem
        icon={icon("position", <Hash size={16} />)}
        title={`Position ${shortAddress(position)}`}
        subtitle={copied === "position" ? "Copied" : "Copy the position's contract address"}
        onClick={() => copy("position", position)}
      />
      <ToolsMenuItem
        icon={icon("link", <Link2 size={16} className="-rotate-45" />)}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}/ethereum/frankencoin/${position}`)}
      />
    </>
  );
}

/** Days to a future expiry, in words. */
function daysLeft(expiration: number): string {
  const days = (expiration - Date.now() / 1000) / 86400;
  if (days <= 0) return "passed";
  if (days < 1) return "in less than a day";
  const n = Math.round(days);
  return `in ${n} day${n === 1 ? "" : "s"}`;
}

export interface FrankencoinPositionCardProps {
  v: FrankencoinPositionView;
  /** `detail` on the position page (receipts, panel, (i), ⋮); `listing` in a row. */
  surface?: "listing" | "detail";
  /** The position a clone was cloned from (PositionOpened's parent), where the
   *  timeline has it; `v.original` is the family's original. */
  cloneParent?: string | null;
  /** How a terminal position ended, where the timeline says. */
  ending?: FrankencoinEnding | null;
  /** The debt's lifetime totals, for a closed card's lifetime line. */
  lifetimeDebt?: FrankencoinLifetimeDebt | null;
  /** The page's live read of the position contract: the running challenge,
   *  the phase length and the minting cooldown. */
  live?: FrankencoinChainResponse | null;
  /** The challenge tally from the index, or null while it has not landed. */
  challengeTally?: number | null;
  /** The (i) pane's prose. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes; `null` leaves the position's rows and the
   *  provenance row. */
  exports?: PositionCardExports | null;
}

/** Frankencoin's slots for the shared position card: Collateral and Debt,
 *  the panel, the tag, the ⋮ and the counters. */
export function useFrankencoinCardSlots({
  v,
  surface = "detail",
  cloneParent,
  ending,
  lifetimeDebt,
  live,
  challengeTally = null,
  explanation,
  viewHref,
  exports,
}: FrankencoinPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const ended = v.status !== "open";
  const status = v.status === "open" ? null : STATUS[v.status];
  const sym = v.collateralSymbol;

  const identity = detail ? (
    <PositionIdentity v={v} cloneParent={cloneParent} />
  ) : (
    <span className="flex flex-wrap items-center gap-2">
      {v.owner && <WalletPill wallet={v.owner} ensName={null} filterProtocol="frankencoin" bookmark />}
      <PositionIdentity v={v} cloneParent={cloneParent} listing />
    </span>
  );
  const tag = detail ? undefined : <ListingTag id={<PositionAddress v={v} />} />;

  const counters: PositionCardCounters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    // The foot strip reads transactions, then the age (ui-jobs 270).
    ...(detail ? { order: "age-last" as const } : { extra: <ChallengeMarker count={v.challengeCount} /> }),
  };

  // A running challenge stays in view above the headlines, on any position
  // still holding collateral.
  const challenged = live && v.status !== "closed" ? (live.challengedAmount ?? 0) : 0;
  const notice =
    challenged > 0 ? (
      <div className="notice-caution flex items-start gap-2 p-3 mb-2 text-sm text-caution-700 dark:text-caution-400">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Under challenge: {live?.challengedAmount} {sym} in auction
        </p>
      </div>
    ) : undefined;

  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;

  if (ended) {
    // The latest absolutes are back at zero for an ended position, so the
    // headlines are what the ledger recorded at its height: lifetime maxima
    // where the index carries them, a dash otherwise.
    const forcedAt = ending?.forcedAt ?? null;
    const deniedAt = v.status === "denied" ? (ending?.deniedAt ?? null) : null;
    const closedAt = deniedAt ?? (v.status === "closed" && forcedAt != null ? forcedAt : v.lastActivityAt);
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        value:
          v.peakCollateral != null && v.peakCollateral > 0 ? (
            <Prov info={peakAbsoluteProv("collateral", sym)}>
              <AssetAmount value={v.peakCollateral} symbol={sym} />
            </Prov>
          ) : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        value:
          v.peakMinted != null && v.peakMinted > 0 ? (
            <Prov info={peakAbsoluteProv("minted", "ZCHF")}>
              <AssetAmount value={v.peakMinted} symbol="ZCHF" />
            </Prov>
          ) : null,
        sub:
          v.status === "closed" && lifetimeDebt && lifetimeDebt.minted > 0 ? (
            <LifetimeDebtLine side={lifetimeDebt} />
          ) : (
            "minted ZCHF"
          ),
      },
    ];
    const dates: PositionCardOutcome["dates"] = [];
    if (closedAt) dates.push({ at: closedAt });
    if (v.expiration != null && v.expiration > 0) dates.push({ label: "Expiry", at: v.expiration });
    outcome = {
      // How it ended: a denial on its date, a forced sale on the sale's date.
      word:
        v.status === "denied"
          ? "Denied"
          : v.status === "expired"
            ? "Expired"
            : forcedAt != null
              ? "Forced sale"
              : "Closed",
      dates: dates.length ? dates : undefined,
      footnote:
        v.status === "closed" && ending?.closedByChallenge ? (
          <div className="text-xs text-rb-500 mt-0.5">A challenge sale closed it</div>
        ) : undefined,
      // A denied position later force-sold says so beside it.
      extra:
        v.status === "denied" && forcedAt != null
          ? {
              label: "Then",
              value: (
                <>
                  <div className="text-lg font-bold mt-2 text-rb-500">Forced sale</div>
                  <div className="text-xs text-rb-500 mt-0.5">{formatDate(forcedAt)}</div>
                </>
              ),
            }
          : {
              label: "Challenges",
              value: (
                <div className="text-lg font-bold mt-2 text-rb-500">
                  {v.challengeCount === 0 ? "Never challenged" : v.challengeCount}
                </div>
              ),
            },
    };
  } else {
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        // NULL collateral = the ledger never spoke: a dash, never a zero (the
        // chain lane corrects at head on the detail page).
        value:
          v.collateral != null && v.collateral > 0 ? (
            <Prov info={collProv(v)}>
              <AssetAmount
                value={v.collateral}
                symbol={sym}
                exact={v.collateralRaw != null ? formatUnitsExact(v.collateralRaw, v.collateralDecimals) : undefined}
              />
            </Prov>
          ) : null,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        value:
          v.minted > 0 ? (
            <Prov info={mintedProv(v)}>
              <AssetAmount
                value={v.minted}
                symbol="ZCHF"
                exact={v.mintedRaw != null ? formatUnitsExact(v.mintedRaw, 18) : undefined}
              />
            </Prov>
          ) : null,
        sub: "minted ZCHF",
      },
    ];
  }

  const common = { status, heads, identity, notice, counters, outcome };
  if (!detail) return { ...common, surface: "listing", menu: null, tag };

  const menu: PositionCardMenu = {
    leading: () => <FrankencoinMenuRows position={v.position} />,
    exports: exports ?? null,
  };
  const detailCommon = {
    ...common,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: frankencoinPositionModal({
      status: v.status,
      forcedSale: ended ? ending?.forcedAt != null : undefined,
      hub: v.hub,
    }),
    menu,
  };
  if (outcome) return { ...detailCommon, outcome };

  // The panel: the collateral side's risk on the left (the declared price,
  // the room it leaves, the challenges), the debt's terms on the right.
  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];
  const lane = v.basis === "chain" ? "the position's price() at the latest block" : "the latest MintingUpdate";
  if (v.liqPrice != null && v.liqPrice > 0) {
    left.push({
      id: "liquidation-price",
      label: "Liquidation price",
      value: (
        <>
          <Prov info={liqPriceProv(v)} value={String(v.liqPrice)}>
            <span>
              <PanelFigure>
                <AmountText value={v.liqPrice} format="compact" />
              </PanelFigure>{" "}
              ZCHF/{sym}
            </span>
          </Prov>{" "}
          (owner-declared)
        </>
      ),
      tip: `The liquidation price the owner declared, in ZCHF per ${sym}, from ${lane}. A challenge auction tests it.`,
    });
    if (v.collateral != null && v.collateral * v.liqPrice - v.minted > -0.005) {
      left.push({
        id: "headroom",
        label: "Headroom",
        value: <AmountText value={Math.max(0, v.collateral * v.liqPrice - v.minted)} format="compact" />,
        asset: { symbol: "ZCHF" },
        tip: "The ZCHF more debt the collateral backs at the declared liquidation price: the collateral at that price, less the debt.",
      });
    }
  }
  if (live && challenged === 0 && challengeTally != null) {
    left.push({
      id: "challenges",
      label: "Challenges",
      value:
        challengeTally === 0 ? (
          "Never challenged"
        ) : (
          <>
            <PanelFigure>{challengeTally}</PanelFigure>, none running
          </>
        ),
      tip: "How many times anyone has challenged the position's declared price, from its indexed history.",
    });
  }
  if (live?.challengePeriod != null && live.challengePeriod > 0) {
    left.push({
      id: "challenge-phases",
      label: "Challenge phases",
      value: (
        <>
          <PanelFigure>{phaseText(live.challengePeriod)}</PanelFigure> each
        </>
      ),
      tip: "The length of each of a challenge's two phases, from the position's challengePeriod() at the latest block.",
    });
  }
  if (v.annualInterestPPM != null) {
    right.push({
      id: "interest",
      label: "Interest",
      value: (
        <>
          <Prov info={liveInterestProv(v.hub, v.position)}>
            <PanelFigure>{ppmToPct(v.annualInterestPPM).toFixed(2)}%</PanelFigure>
          </Prov>{" "}
          a year, charged at each mint
        </>
      ),
      tip: "The yearly rate a mint pays on today's terms, from the position's annualInterestPPM() at the latest block. Frankencoin charges it up front at each mint.",
    });
  }
  if (v.minted > 0 && v.reserveHeld != null && v.reserveHeld > 0) {
    right.push({
      id: "repay",
      label: "Repays in full",
      value: (
        <TokenFigure symbol="ZCHF">
          <AmountText value={v.minted - v.reserveHeld} format="compact" />
        </TokenFigure>
      ),
      tip: "The ZCHF that repays the debt: the rest of the debt is the reserve share held back at minting, which repaying returns.",
    });
  }
  if (v.expiration != null && v.expiration > 0) {
    right.push({
      id: "expiry",
      label: "Expires",
      value: (
        <>
          <PanelFigure>{formatDate(v.expiration)}</PanelFigure>, {daysLeft(v.expiration)}
        </>
      ),
      tip: "When the position expires, from its expiration() at the latest block. It is fixed for the life of the position.",
    });
  }
  const cooling = live?.cooldownActive && live.cooldownUntil != null;
  if (live && (cooling || !live.mintingDisabledForGood)) {
    right.push({
      id: "cooldown",
      label: "Minting cooldown",
      value: cooling ? (
        <>
          until <PanelFigure>{formatDayMonth(live.cooldownUntil as number)}</PanelFigure>
        </>
      ) : (
        "None"
      ),
      tip: "Minting and withdrawals pause for a cooldown after the owner raises the declared price, read from the position at the latest block.",
    });
  }
  return { ...detailCommon, outcome: undefined, panel: [left, right] };
}

/** The Frankencoin position card: its slots, drawn by the shared card. */
export function FrankencoinPositionCard(props: FrankencoinPositionCardProps) {
  return <PositionCard slots={useFrankencoinCardSlots(props)} />;
}

/** Build a card view from the listing summary row (the indexed ledger). */
export function viewFromSummary(s: FrankencoinPositionSummary): FrankencoinPositionView {
  return {
    position: s.position,
    hub: s.hub,
    owner: s.owner,
    isClone: s.isClone,
    collateralSymbol: s.collateralSymbol,
    collateralDecimals: s.collateralDecimals,
    collateral: s.collateral,
    collateralRaw: s.collateralRaw,
    minted: s.minted,
    mintedRaw: s.mintedRaw,
    liqPrice: s.liqPrice,
    status: s.status,
    challengeCount: s.challengeCount,
    everChallenged: s.everChallenged,
    peakCollateral: s.peakCollateral,
    peakMinted: s.peakMinted,
    // The API carries NO expiration (a constructor fact, zero-RPC tier) —
    // the chain overlay is its sole source; listing cards simply omit expiry.
    expiration: null,
    lastActivityAt: s.lastActivityAt,
    txCount: s.txCount,
    basis: "index",
    annualInterestPPM: null,
  };
}

/** Build a card view from the live chain overlay — the detail page's primary
 *  truth: every figure is the position's own slot at head. The lifecycle can
 *  only say what head state shows (open / closed / expired); DENIED is an
 *  indexed fact (PositionDenied is not head-observable) and arrives by merge. */
export function viewFromChain(c: FrankencoinChainResponse): FrankencoinPositionView {
  return {
    position: c.position,
    hub: c.hub,
    owner: c.owner,
    isClone: c.isClone,
    original: c.original,
    collateralSymbol: c.collateralSymbol ?? (c.collateralToken ? shortAddress(c.collateralToken) : "—"),
    collateralDecimals: c.collateralDecimals ?? 0,
    // A failed balanceOf stays null → a dash, never a fabricated zero.
    collateral: c.collateral,
    collateralRaw: c.collateralRaw,
    minted: c.minted ?? 0,
    mintedRaw: c.mintedRaw,
    liqPrice: c.liqPrice,
    status: c.isClosed ? "closed" : c.expired ? "expired" : "open",
    challengeCount: 0,
    everChallenged: (c.challengedAmount ?? 0) > 0,
    peakCollateral: null,
    peakMinted: null,
    expiration: c.expiration,
    lastActivityAt: null,
    txCount: 0,
    basis: "chain",
    annualInterestPPM: c.annualInterestPPM,
    reserveHeld: c.reserveHeld,
  };
}

/** Merge the indexed summary into a chain-first view: the chain keeps every
 *  head figure (the primary truth); the index contributes what head state
 *  cannot say — the DENIED lifecycle, the challenge tallies, activity meta.
 *  ⚠️ Index-status is NEVER asserted equal to chain-status (the replay
 *  disagrees with head on measured edge positions — no-ledger opens, a 1-wei
 *  forced-sale remainder): apart from DENIED, the chain's lifecycle wins. */
export function mergeChainAndSummary(
  chain: FrankencoinPositionView,
  summary: FrankencoinPositionSummary,
): FrankencoinPositionView {
  return {
    ...chain,
    status: summary.status === "denied" ? "denied" : chain.status,
    challengeCount: summary.challengeCount,
    everChallenged: summary.everChallenged || chain.everChallenged,
    peakCollateral: summary.peakCollateral,
    peakMinted: summary.peakMinted,
    lastActivityAt: summary.lastActivityAt,
    txCount: summary.txCount,
  };
}
