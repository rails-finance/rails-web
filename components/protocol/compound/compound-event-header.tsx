"use client";

// Compound V3 (Comet) event header (chain-state tier) — adapter onto the shared
// ChainTruthRow grammar. Maps the single signed amount this event moved (base for
// supply/withdraw/absorb_debt, a collateral asset otherwise) into the shared row
// spec; traces via <Prov>. No health factor, no USD — those are layers, absent.

import type { AssetFlow, CompoundContext } from "@/lib/shared/types/event-shape";
import { isCompoundBulker } from "@/lib/compound/bulkers";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  movedDeltaProv,
  absorbDebtClearedProv,
  externalActorProv,
  transferCounterpartyProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import { useCometMarket } from "@/lib/compound/deployment-context";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { compoundAbsorbSplit } from "@/lib/compound/row-facts";
import { formatExactDecimal } from "@/lib/utils/format";

export interface CompoundEventHeaderProps {
  actionLabel: string;
  ctx: CompoundContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The account owner, for the receipt's account row (required with externalBy). */
  wallet?: string;
  /** The event's flows, used for one thing: the moved asset's contract. A Comet
   *  names its base and collateral assets by symbol, and the symbol is all the
   *  icon chip gets unless someone has entered that asset in the house table —
   *  at which point the mark depends on a hand-kept list rather than on the
   *  transfer, which recorded the contract outright. */
  flows?: AssetFlow[];
}

export function CompoundEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: CompoundEventHeaderProps) {
  const m = useCometMarket(ctx.market);
  const coords: CompoundCoords = {
    comet: m.comet,
    marketLabel: m.label,
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  const critical = ctx.eventType === "absorb_debt" || ctx.eventType === "absorb_collateral";
  const deltas: ChainTruthDelta[] = [];

  // An absorb's debt row states the debt it cleared, as a fall in the debt,
  // with the same sign as the collateral it seized: both are what the absorb
  // took off the account. Its credit past the debt is in the row's detail.
  const split = compoundAbsorbSplit(ctx);
  const d = split ? -Number(split.cleared) : Number(ctx.assetsDelta) || 0;
  if (d !== 0) {
    const prov = split
      ? absorbDebtClearedProv(ctx.assetSymbol, coords, {
          paidOut: formatExactDecimal(split.paidOut),
          before: formatExactDecimal(split.before),
        })
      : movedDeltaProv(ctx.eventType, ctx.assetSymbol, coords);
    if (prov)
      deltas.push({
        value: d,
        symbol: ctx.assetSymbol,
        address: soleFlowAddress(flows, ctx.assetSymbol),
        prov,
        // The spine's flank direction (compound-event-card DIRECTION): a
        // supply leaves the wallet, a withdraw arrives in it.
        phoneArrow:
          ctx.eventType === "supply" || ctx.eventType === "supply_collateral"
            ? "out"
            : ctx.eventType === "withdraw" || ctx.eventType === "withdraw_collateral"
              ? "in"
              : undefined,
      });
  }

  // Position transfers carry a true counterparty (the other account) — the
  // neutral to/from chip, not the external-actor pink (which is a who-acted
  // verdict). "to" on an _out (we sent), "from" on an _in (we received).
  const transferOut = ctx.eventType === "transfer_out" || ctx.eventType === "transfer_collateral_out";
  const transferIn = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_collateral_in";
  const transferCollateral = ctx.eventType === "transfer_collateral_in" || ctx.eventType === "transfer_collateral_out";
  const party =
    ctx.counterparty != null
      ? {
          prefix: transferOut ? "to" : "from",
          address: ctx.counterparty,
          prov: transferCounterpartyProv(transferOut ? "out" : "in", transferCollateral, coords),
          // Named by ENS where the address has a reverse record.
          ens: true,
        }
      : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical,
        // A transfer is a custody row: `400 ◎ to 0x…` — the spine's paper
        // plane and the chip's to/from are the verb (see ChainTruthRowSpec).
        custody: transferOut || transferIn,
        // The verb carries the direction at every width (the SparkLend rule,
        // TO-DO 184); an absorb keeps its signs.
        unsignedDeltas: !critical,
        deltas,
        party,
        externalActor:
          externalBy && wallet && ctx.txFrom && ctx.funder
            ? {
                address: externalBy,
                prov: externalActorProv(
                  { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, funder: ctx.funder },
                  coords,
                ),
                ...(isCompoundBulker(ctx.funder, coords.chainId)
                  ? {
                      tip: "This account sent the transaction, and the tokens came through Compound's Bulker. Open the row to see whether the wallet acted.",
                    }
                  : {}),
              }
            : undefined,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
