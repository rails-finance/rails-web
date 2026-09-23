"use client";

// Aave V3 event header (ON-CHAIN VALUES tier) — adapter onto the shared ChainTruthRow
// grammar. Maps the signed amount(s) this event moved into the shared row spec;
// traces via <Prov>. No health factor, no USD, no borrow-rate pill — those are
// layers, absent here (the bespoke aave-v3-event-header carries them, retained).

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { AssetFlow } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  assetsDeltaProv,
  seizedCollateralProv,
  debtRepaidProv,
  writtenOffDebtProv,
  externalActorProv,
  transferDeltaProv,
  transferCounterpartyProv,
  swapVenueParty,
  swapVenueProv,
  swapLegNet,
  swapLegProv,
  swapLegSign,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import { AAVE_V3_SWAP_LABELS } from "@/lib/aave-v3/swap-kinds";
import { useChainId } from "@/lib/shared/chain-context";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { protocolIconSrc } from "@/lib/shared/protocols";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";

const LABELS: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
  swap: "Swap",
  bad_debt_written_off: "Debt written off",
};

/** The primary reserve amount signed by direction: supply/borrow/transfer_in
 *  increase their side (+), withdraw/repay/transfer_out decrease it (−). A
 *  write-off is a debt decrease too: the debt left the position, unpaid. */
export function signedAmount(ctx: AaveV3Context): number {
  const mag = Math.abs(Number(ctx.amount ?? "0")) || 0;
  const neg =
    ctx.eventType === "withdraw" ||
    ctx.eventType === "repay" ||
    ctx.eventType === "transfer_out" ||
    ctx.eventType === "bad_debt_written_off";
  return (neg ? -1 : 1) * mag;
}

/** The two rows where the position lost something to the protocol's own
 *  mechanics rather than moving it: a liquidation, and the write-off of the
 *  debt that liquidation could not cover. Both wear the critical tone. */
export const isAaveV3LossRow = (ctx: AaveV3Context): boolean =>
  ctx.eventType === "liquidation" || ctx.eventType === "bad_debt_written_off";

export interface AaveV3CtEventHeaderProps {
  ctx: AaveV3Context;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's own token movements, read here for one thing only: the moved
   *  reserve's contract address, which the icon chip needs and the context does
   *  not carry. A curated pool is not a closed one — the Aave DAO lists new
   *  reserves, and the house symbol table only learns about them when someone
   *  edits it. The flow states the contract at the time of the transfer. */
  flows?: AssetFlow[];
}

export function AaveV3CtEventHeader({
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: AaveV3CtEventHeaderProps) {
  const coords: V3Coords = {
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
    pool: useV3Pool(),
  };
  const deltas: ChainTruthDelta[] = [];
  const label = (ctx.swap && AAVE_V3_SWAP_LABELS[ctx.swap.kind]) ?? LABELS[ctx.eventType] ?? ctx.eventType;
  const isTransferRow = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";

  if (ctx.eventType === "liquidation") {
    const coll = Number(ctx.liquidatedCollateralAmount ?? "0") || 0;
    if (coll !== 0 && ctx.collateralSymbol)
      deltas.push({
        value: -coll,
        symbol: ctx.collateralSymbol,
        address: soleFlowAddress(flows, ctx.collateralSymbol),
        prov: seizedCollateralProv(
          ctx.collateralSymbol,
          coords,
          ctx.raw?.liquidatedCollateralAmount,
          ctx.origin?.liquidatedCollateralAmount,
        ),
      });
    const debt = Number(ctx.debtToCover ?? "0") || 0;
    if (debt !== 0 && ctx.reserveSymbol)
      deltas.push({
        value: -debt,
        symbol: ctx.reserveSymbol,
        address: soleFlowAddress(flows, ctx.reserveSymbol),
        prov: debtRepaidProv(ctx.reserveSymbol, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover),
      });
  } else if (ctx.eventType === "bad_debt_written_off") {
    // The written-off debt: negative on the debt axis, receipted to the
    // DeficitCreated log it came from, not to a Pool `amount` param.
    const off = Math.abs(Number(ctx.amount ?? "0")) || 0;
    if (off !== 0 && ctx.reserveSymbol)
      deltas.push({
        value: -off,
        symbol: ctx.reserveSymbol,
        address: soleFlowAddress(flows, ctx.reserveSymbol),
        prov: writtenOffDebtProv(ctx.reserveSymbol, coords, ctx.raw?.amount, ctx.origin?.amount),
      });
  } else if (ctx.eventType === "swap" && ctx.swap) {
    // Given, then received (D2): each leg signed on its own axis and receipted
    // as the index row it was.
    const s = ctx.swap;
    const given = Math.abs(Number(ctx.amount ?? "0")) || 0;
    if (given !== 0 && ctx.reserveSymbol)
      deltas.push({
        value: swapLegSign(s.givenAction) * given,
        symbol: ctx.reserveSymbol,
        address: soleFlowAddress(flows, ctx.reserveSymbol),
        prov: swapLegProv(
          ctx.reserveSymbol,
          s.givenAction,
          coords,
          ctx.raw?.amount,
          ctx.origin?.amount,
          s.kind,
          swapLegNet(s, "given"),
          s,
        ),
      });
    const received = Math.abs(Number(s.receivedAmount ?? "0")) || 0;
    if (received !== 0 && s.receivedSymbol)
      deltas.push({
        value: swapLegSign(s.receivedAction, s.kind) * received,
        symbol: s.receivedSymbol,
        address: s.receivedAsset,
        prov: swapLegProv(
          s.receivedSymbol,
          s.receivedAction,
          coords,
          s.raw.receivedAmount,
          s.receivedOrigin,
          s.kind,
          swapLegNet(s, "received"),
          s,
        ),
      });
    // A supply from a swap reads sold → supplied (D2): its one row is the
    // received leg, and the Trade's sell side is the given.
    if (s.kind === "supply_from_swap") deltas.reverse();
  } else {
    const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
    const d = signedAmount(ctx);
    const side = ctx.eventType === "supply" || ctx.eventType === "withdraw" ? "supply" : "debt";
    if (d !== 0 && ctx.reserveSymbol)
      deltas.push({
        value: d,
        symbol: ctx.reserveSymbol,
        address: soleFlowAddress(flows, ctx.reserveSymbol),
        prov: isTransfer
          ? transferDeltaProv(ctx.reserveSymbol, ctx.eventType === "transfer_in" ? "in" : "out", coords)
          : assetsDeltaProv(ctx.reserveSymbol, side, coords, ctx.raw?.amount, ctx.origin?.amount),
      });
  }

  // A transfer's counterparty is a named party of the event itself, not a
  // verdict about who acted — the neutral to/from chip, never the pink. A known
  // protocol contract (lib/shared/known-infrastructure.ts) is named with its
  // mark; any other address by ENS where it has a reverse record.
  const transferOut = ctx.eventType === "transfer_out";
  const named = getProtocolContract(ctx.counterparty, coords.chainId ?? MAINNET_CHAIN_ID);
  // A swap names its venue, "via CoW Protocol" or "via ParaSwap" — never a CoW
  // order's one-order adapter.
  const venue = ctx.swap ? swapVenueParty(ctx.swap, coords.chainId ?? MAINNET_CHAIN_ID) : undefined;
  const party =
    ctx.swap && venue
      ? {
          prefix: "via",
          address: venue.address,
          name: venue.name,
          icon: venue.protocolIcon ? protocolIconSrc(venue.protocolIcon) : undefined,
          prov: swapVenueProv(coords, ctx.swap),
        }
      : ctx.counterparty != null
        ? {
            prefix: transferOut ? "to" : "from",
            address: ctx.counterparty,
            name: named?.name,
            icon: named?.protocolIcon ? protocolIconSrc(named.protocolIcon) : undefined,
            prov: transferCounterpartyProv(transferOut ? "out" : "in", coords, ctx.counterparty),
            ens: true,
          }
        : undefined;

  return (
    <ChainTruthRow
      spec={{
        label,
        critical: isAaveV3LossRow(ctx),
        // A transfer is a custody row: `400 ◎ to 0x…` — the spine's paper
        // plane and the chip's to/from are the verb (see ChainTruthRowSpec).
        custody: isTransferRow,
        deltas,
        party,
        externalActor:
          externalBy && wallet && ctx.txFrom && ctx.poolCaller
            ? {
                address: externalBy,
                prov: externalActorProv(
                  { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, poolCaller: ctx.poolCaller },
                  coords,
                ),
              }
            : undefined,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
