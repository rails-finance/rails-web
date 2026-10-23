"use client";

// Aave V3 event head (T1): the card's `head` slot, drawn by the shared
// ChainTruthRow (Ethereum, Base, Seamless).
//
// The timeline's head (mode "row", rails-ops decision 0045) is words: the
// past-participle kind (`aaveFamilyT1Kind`, lib/aave-v3/head-words.ts), a
// transfer's counterparty as its clause, and the chips for what the spine
// cannot show: a swap's venue, the WETH gateway, the treasury, the "by" party.
// The spine carries the figures.
//
// The event page's card (mode "title") maps the signed amount(s) this event
// moved into the shared row spec, each traced via <Prov>; a swap states its two
// legs sold → bought and names its venue as the party.

import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { AssetFlow } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { PartyChip, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { aaveFamilyT1Caption, aaveFamilyT1Kind } from "@/lib/aave-v3/head-words";
import { V3_HEAD_WORDS } from "@/lib/aave-v3/event-templates";
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
import { aaveV3CtLabel, distributorPayout } from "@/lib/aave-v3/event-label";
import { useChainId } from "@/lib/shared/chain-context";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { protocolIconSrc } from "@/lib/shared/protocols";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";

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
  txHash?: string;
  blockNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with
   *  externalBy), and to tell a claimed payout from a received one. */
  wallet?: string;
  /** The event's own token movements, read here for one thing only: the moved
   *  reserve's contract address, which the icon chip needs and the context does
   *  not carry. A curated pool is not a closed one — the Aave DAO lists new
   *  reserves, and the house symbol table only learns about them when someone
   *  edits it. The flow states the contract at the time of the transfer. */
  flows?: AssetFlow[];
  /** Set when this transfer is a liquidation's protocol fee to the Aave
   *  treasury (lib/aave-v3/liquidation-fee.ts): the row names itself so. */
  feeOf?: AaveV3Context;
  /** "row": the timeline's head, in words; "title" (default): the event
   *  page's card, with the figures. */
  mode?: "row" | "title";
}

/** An aToken transfer to a WETH gateway: a withdrawal paid out as ETH
 *  (aaveV3CtLabel). */
function viaGatewayOf(ctx: AaveV3Context, isFee: boolean, chainId: ChainId | undefined | null): boolean {
  const named = getProtocolContract(ctx.counterparty, chainId ?? MAINNET_CHAIN_ID);
  return !isFee && ctx.eventType === "transfer_out" && named?.kind === "gateway";
}

/** The timeline head's words as one line: the phone caption and the row's
 *  accessible name. `owner`: the position's wallet, which tells a claimed
 *  payout from a received one. */
export function aaveV3T1Caption(
  ctx: AaveV3Context,
  isFee: boolean,
  chainId: ChainId | undefined | null,
  owner?: string,
): string {
  const gateway = viaGatewayOf(ctx, isFee, chainId);
  const payout = distributorPayout(ctx, owner, chainId);
  const kind = aaveFamilyT1Kind(
    { eventType: ctx.eventType, fee: isFee, gateway, payout, swapKind: ctx.swap?.kind },
    V3_HEAD_WORDS,
  );
  const transfer = !isFee && !gateway && (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out");
  if (!transfer || !ctx.counterparty) return kind;
  const named = getProtocolContract(ctx.counterparty, chainId ?? MAINNET_CHAIN_ID);
  return aaveFamilyT1Caption(kind, V3_HEAD_WORDS, {
    lead: ctx.eventType === "transfer_out" ? V3_HEAD_WORDS.to : V3_HEAD_WORDS.from,
    address: ctx.counterparty,
    name: named?.name,
  });
}

/** The row's head spec. */
export function useAaveV3HeadSpec({
  ctx,
  txHash,
  blockNumber,
  externalBy,
  wallet,
  flows,
  feeOf,
  mode = "title",
}: AaveV3CtEventHeaderProps): ChainTruthRowSpec {
  const coords: V3Coords = {
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
    pool: useV3Pool(),
  };
  const deltas: ChainTruthDelta[] = [];
  const label = aaveV3CtLabel(ctx, !!feeOf, coords.chainId, wallet);
  const named = getProtocolContract(ctx.counterparty, coords.chainId ?? MAINNET_CHAIN_ID);
  const viaGateway = viaGatewayOf(ctx, !!feeOf, coords.chainId);
  // A liquidation's fee reads as an act with its verb, not as a custody move.
  const isTransferRow = !feeOf && (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out");

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
        // The fee row's spine draws the badged token with no amount, so the
        // header keeps it.
        ...(feeOf ? { noSpineCounterpart: true } : {}),
      });
  }

  // A transfer's counterparty is a named party of the event itself, not a
  // verdict about who acted — the neutral to/from chip, never the pink. A known
  // protocol contract (lib/shared/known-infrastructure.ts) is named with its
  // mark; any other address by ENS where it has a reverse record.
  const transferOut = ctx.eventType === "transfer_out";
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
            prefix: viaGateway ? "via" : transferOut ? "to" : "from",
            address: ctx.counterparty,
            name: feeOf ? V3_HEAD_WORDS.treasury : named?.name,
            icon: feeOf
              ? protocolIconSrc("aave-v3")
              : named?.protocolIcon
                ? protocolIconSrc(named.protocolIcon)
                : undefined,
            prov: transferCounterpartyProv(transferOut ? "out" : "in", coords, ctx.counterparty),
            ens: true,
          }
        : undefined;

  const externalActor =
    externalBy && wallet && ctx.txFrom && ctx.poolCaller
      ? {
          address: externalBy,
          prov: externalActorProv(
            { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, poolCaller: ctx.poolCaller },
            coords,
          ),
        }
      : undefined;

  if (mode === "row") {
    const W = V3_HEAD_WORDS;
    // A withdrawal through the WETH gateway is paid out as ETH; a transfer's
    // counterparty is the clause after "Transferred". The chip prefixes are
    // literals, which check:parties maps to their roles.
    const rowParty = party && viaGateway ? { ...party, prefix: "as ETH via" } : party;
    return {
      label: aaveFamilyT1Kind(
        {
          eventType: ctx.eventType,
          fee: !!feeOf,
          gateway: viaGateway,
          payout: distributorPayout(ctx, wallet, coords.chainId),
          swapKind: ctx.swap?.kind,
        },
        W,
      ),
      critical: isAaveV3LossRow(ctx),
      deltas: [],
      clauses: isTransferRow && rowParty ? [<PartyChip key="party" party={rowParty} />] : undefined,
      party: isTransferRow ? undefined : rowParty,
      externalActor,
    };
  }

  return {
    label,
    critical: isAaveV3LossRow(ctx),
    // A transfer is a custody row: `400 ◎ to 0x…` — the spine's paper
    // plane and the chip's to/from are the verb (see ChainTruthRowSpec).
    custody: isTransferRow,
    deltas,
    party,
    externalActor,
  };
}
