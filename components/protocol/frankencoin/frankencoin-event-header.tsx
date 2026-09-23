"use client";

// Frankencoin event header — adapter onto the shared ChainTruthRow grammar.
// Maps each event's own chain figures into the shared row spec; traces via
// <Prov>. The challenge rows carry NEUTRAL party chips whose prefixes say what
// happened ("challenged by") — a challenge is an act AGAINST the position, and
// the copy never reads as an act the owner performed. Deltas on the minting
// family are differences of two emitted absolutes (MintingUpdate carries no
// delta field) and their receipts say so. All units native: ZCHF debt, the
// position's own collateral token.

import type { AssetFlow, FrankencoinContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  changeProv,
  challengeFigureProv,
  deniedProv,
  ownershipProv,
  forcedSaleProv,
  type FrankencoinCoords,
} from "@/lib/frankencoin/event-provenance";

export interface FrankencoinEventHeaderProps {
  actionLabel: string;
  ctx: FrankencoinContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** The event's own movements, consulted for the two contracts this header
   *  names. Frankencoin's positions are minted per collateral by anyone who
   *  puts up the initiative fee, so the collateral side is an open set the
   *  house symbol table was never going to keep up with; ZCHF is fixed and
   *  already resolves, and reads from the same place for consistency. */
  flows?: AssetFlow[];
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function FrankencoinEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  flows,
}: FrankencoinEventHeaderProps) {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  const sym = ctx.collateralSymbol;
  const collAddr = soleFlowAddress(flows, sym);
  const zchfAddr = soleFlowAddress(flows, "ZCHF");

  // Opens (open / clone) + owner adjusts get V2's per-axis grammar: each axis its
  // own imperative verb (Add/Withdraw collateral, Mint/Repay ZCHF), so an open
  // shows a green pill + labeled axes and a combined adjust drops the merged verb.
  // A close keeps its "Close Position" label (per the seam's no-deltas/close rule),
  // and the challenge/auction/forced-sale rows keep their caution labels. Rate
  // pill: skipped this pass — Frankencoin's fixed-at-mint rate isn't on the event
  // context (it lives only in the head overlay).
  const isOpen = ctx.eventType === "open" || ctx.eventType === "clone";
  const isAdjust =
    ctx.eventType === "mint" ||
    ctx.eventType === "repay" ||
    ctx.eventType === "add_collateral" ||
    ctx.eventType === "withdraw_collateral" ||
    ctx.eventType === "adjust";
  const collVerb = (d: number): string => (d > 0 ? "Add" : "Withdraw");
  const debtVerb = (d: number): string => (d > 0 ? "Mint" : "Repay");

  const deltas: ChainTruthDelta[] = [];
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : null;
  // The V1 clone-creation lie: an understated emitted collateral figure must
  // never surface as a moved amount.
  const dColl =
    !ctx.collateralUnderstated && ctx.collateral != null && ctx.collateralBefore != null
      ? num(ctx.collateral) - num(ctx.collateralBefore)
      : null;

  switch (ctx.eventType) {
    case "open":
    case "clone":
      // The opening absolutes ARE the deltas (the ledger starts at zero) — both
      // positive, so the per-axis verbs read Add / Mint beside the green pill.
      if (num(ctx.collateral) > 0)
        deltas.push({
          value: num(ctx.collateral),
          symbol: sym,
          address: collAddr,
          label: collVerb(1),
          axisVerb: true,
          prov: changeProv("collateral", sym, coords),
        });
      if (num(ctx.minted) > 0)
        deltas.push({
          value: num(ctx.minted),
          symbol: "ZCHF",
          address: zchfAddr,
          label: debtVerb(1),
          axisVerb: true,
          prov: changeProv("minted", sym, coords),
        });
      break;
    case "mint":
    case "repay":
      if (dMint != null && dMint !== 0)
        deltas.push({
          value: dMint,
          symbol: "ZCHF",
          address: zchfAddr,
          label: debtVerb(dMint),
          axisVerb: true,
          prov: changeProv("minted", sym, coords),
        });
      break;
    case "add_collateral":
    case "withdraw_collateral":
      if (dColl != null && dColl !== 0)
        deltas.push({
          value: dColl,
          symbol: sym,
          address: collAddr,
          label: collVerb(dColl),
          axisVerb: true,
          prov: changeProv("collateral", sym, coords),
        });
      break;
    case "adjust":
      // Combined owner move: each axis carries its own verb, no merged row label.
      if (dColl != null && dColl !== 0)
        deltas.push({
          value: dColl,
          symbol: sym,
          address: collAddr,
          label: collVerb(dColl),
          axisVerb: true,
          prov: changeProv("collateral", sym, coords),
        });
      if (dMint != null && dMint !== 0)
        deltas.push({
          value: dMint,
          symbol: "ZCHF",
          address: zchfAddr,
          label: debtVerb(dMint),
          axisVerb: true,
          prov: changeProv("minted", sym, coords),
        });
      break;
    case "close":
      // Close keeps its "Close Position" row label + signed deltas.
      if (dColl != null && dColl !== 0)
        deltas.push({ value: dColl, symbol: sym, address: collAddr, prov: changeProv("collateral", sym, coords) });
      if (dMint != null && dMint !== 0)
        deltas.push({ value: dMint, symbol: "ZCHF", address: zchfAddr, prov: changeProv("minted", sym, coords) });
      break;
    case "auction_settlement":
      // The protocol writing the auction down — labeled magnitudes, no signs
      // that could read as acts of the owner.
      if (dColl != null && dColl !== 0)
        deltas.push({
          value: dColl,
          symbol: sym,
          address: collAddr,
          label: "Collateral",
          tone: "caution",
          prov: changeProv("collateral", sym, coords),
        });
      if (dMint != null && dMint !== 0)
        deltas.push({
          value: dMint,
          symbol: "ZCHF",
          address: zchfAddr,
          label: "Debt cleared",
          tone: "caution",
          prov: changeProv("minted", sym, coords),
        });
      break;
    case "adjust_price":
      // The moved axis is the declared price — carried in the detail grid's
      // transition; the header stays a bare action.
      break;
    case "challenge_started":
      if (num(ctx.challengeSize) > 0)
        deltas.push({
          value: num(ctx.challengeSize),
          symbol: sym,
          address: collAddr,
          label: "Challenged",
          tone: "caution",
          prov: challengeFigureProv("size", "started", sym, coords, ctx.raw?.size),
        });
      break;
    case "challenge_averted":
      if (num(ctx.challengeSize) > 0)
        deltas.push({
          value: num(ctx.challengeSize),
          symbol: sym,
          address: collAddr,
          label: "Averted",
          prov: challengeFigureProv("size", "averted", sym, coords, ctx.raw?.size),
        });
      break;
    case "challenge_succeeded":
      if (num(ctx.acquiredCollateral) > 0)
        deltas.push({
          value: num(ctx.acquiredCollateral),
          symbol: sym,
          address: collAddr,
          label: "Sold",
          prov: challengeFigureProv("acquiredCollateral", "succeeded", sym, coords, ctx.raw?.acquiredCollateral),
        });
      if (num(ctx.bid) > 0)
        deltas.push({
          value: num(ctx.bid),
          symbol: "ZCHF",
          address: zchfAddr,
          label: "Bid",
          prov: challengeFigureProv("bid", "succeeded", sym, coords, ctx.raw?.bid),
        });
      break;
    case "forced_sale":
      if (num(ctx.forcedSaleAmount) > 0)
        deltas.push({
          value: num(ctx.forcedSaleAmount),
          symbol: sym,
          address: collAddr,
          label: "Sold",
          tone: "caution",
          prov: forcedSaleProv(sym, coords, ctx.raw?.size),
        });
      break;
    default:
      break;
  }

  // Party chips — the event's own named counterparty, neutral tint.
  const party =
    ctx.eventType === "challenge_started" && ctx.challenger
      ? {
          prefix: "challenged by",
          address: ctx.challenger,
          prov: challengeFigureProv("size", "started", sym, coords, ctx.raw?.size),
        }
      : ctx.eventType === "denied" && ctx.deniedBy
        ? { prefix: "vetoed by", address: ctx.deniedBy, prov: deniedProv(coords) }
        : ctx.eventType === "ownership_transferred" && ctx.newOwner
          ? { prefix: "to", address: ctx.newOwner, prov: ownershipProv(coords) }
          : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: isOpen ? "Open" : isAdjust && deltas.length > 0 ? "" : actionLabel,
        status: isOpen ? "open" : undefined,
        // Terminal-adverse rows tint critical; the challenge's start and the
        // forced sale carry the caution spine from the card composer instead.
        critical: ctx.eventType === "challenge_succeeded" || ctx.eventType === "denied",
        deltas,
        party,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
