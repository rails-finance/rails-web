"use client";

// MakerDAO event header (chain-state tier) — adapter onto the shared ChainTruthRow
// grammar. Maps the frob/grab deltas (signed dink collateral, and the debt
// dart × rate at the block) into the shared row spec; each value traces via <Prov>. No collateral
// ratio, no APR — those are layers, absent from the baseline.

import type { AssetFlow, MakerDAOContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import {
  dinkProv,
  debtDeltaOf,
  externalActorProv,
  giveDstProv,
  giveOwnerProv,
  ownerBeforeProv,
  type MakerCoords,
} from "@/lib/makerdao/event-provenance";
import type { MakerTxContext } from "@/lib/makerdao/chain-history-types";
import type { MakerOwnershipStep } from "@/lib/makerdao/vault-history";
import { ownerChipText } from "@/lib/makerdao/ownership-prose";

export interface MakerDAOEventHeaderProps {
  actionLabel: string;
  ctx: MakerDAOContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The vault owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's own movements, read for the DEBT row's ERC-20 — DAI on a
   *  CdpManager vault, USDS on a LockStake urn, and the join names which. The
   *  dink row above takes nothing from here on purpose: a Vat position is
   *  identified by its ilk rather than by a contract, so the collateral leg's
   *  flow carries no token to pass on, and that chip goes on resolving from its
   *  symbol exactly as it does today. */
  flows?: AssetFlow[];
  /** A give row: the owner before and after, and its transaction's read. */
  ownership?: MakerOwnershipStep;
  txContext?: MakerTxContext;
}

/** T1's head row spec (the card's `head` slot). */
export function useMakerHeadSpec({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
  ownership,
  txContext,
}: MakerDAOEventHeaderProps): ChainTruthRowSpec {
  const coords: MakerCoords = { txHash, blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;

  // Opens + owner adjusts get V2's per-axis grammar: each axis its own imperative
  // verb from the Vat vocabulary (Deposit/Withdraw dink, Generate/Repay dart) —
  // an open shows a green pill + labeled axes; a combined frob drops the merged
  // "Deposit & Generate" verb and lets the two axes carry it. The stability fee is
  // per-ilk governance, not owner-chosen, so no rate pill. Only a frob touches the
  // urn's ink/art; grab (liquidation) keeps its signed deltas.
  const isOpen = !!ctx.isOpen;
  const isFork = ctx.eventType === "fork-out" || ctx.eventType === "fork-in";
  const isAdjust = ctx.eventType === "frob" && !isOpen;
  const perAxis = isOpen || isAdjust;

  const deltas: ChainTruthDelta[] = [];
  if (dink !== 0) {
    deltas.push({
      value: dink,
      symbol: ctx.collateralSymbol,
      prov: dinkProv(ctx.collateralSymbol, coords),
      ...(perAxis ? { label: dink > 0 ? "Deposit" : "Withdraw", axisVerb: true } : {}),
    });
  }
  if (dart !== 0) {
    // DAI on CdpManager vaults, USDS on LockStake urns (same Vat art unit).
    const debt = debtDeltaOf(ctx, ilkDebtSymbol(ctx.ilk), coords);
    deltas.push({
      value: debt.value,
      symbol: ilkDebtSymbol(ctx.ilk),
      address: soleFlowAddress(flows, ilkDebtSymbol(ctx.ilk)),
      prov: debt.prov,
      ...(debt.suffix ? { suffix: debt.suffix } : {}),
      // A fork moves the debt WITH the collateral — nothing is minted or burned
      // — so the card draws only the collateral chip and leaves this figure to
      // the header. Say so, or the ≥sm hand-off hides it into a spine row that
      // was never going to exist and the debt silently disappears at desktop.
      ...(isFork ? { noSpineCounterpart: true } : {}),
      ...(perAxis ? { label: dart > 0 ? "Generate" : "Repay", axisVerb: true } : {}),
    });
  }

  // The receipt names the owner the verdict was judged against — the owner IN
  // FORCE at this event's block (ownerAt, era-aware), which a later give may
  // have replaced as the vault's current owner.
  const ownerForReceipt = ctx.ownerAt ?? wallet;

  // give rows: the new owner as a neutral "to 0x…" chip. Prefer the resolved
  // EOA (the person); fall back to the dst holder (often a proxy).
  const giveTo = ctx.eventType === "give" ? (ctx.giveDstOwner ?? ctx.giveDst) : undefined;
  const toChip = ownership ? ownerChipText(ownership.after, txContext) : null;
  const fromChip = ownership ? ownerChipText(ownership.before, txContext) : null;

  return {
    label: isOpen ? "Open" : isAdjust && deltas.length > 0 ? "" : actionLabel,
    status: isOpen ? "open" : undefined,
    critical: ctx.eventType === "grab" || ctx.eventType.startsWith("lse-"),
    deltas,
    fromParty:
      fromChip && fromChip.address
        ? { prefix: "from", address: fromChip.address, name: fromChip.name, prov: ownerBeforeProv(coords) }
        : undefined,
    party: giveTo
      ? {
          prefix: "to",
          address: toChip?.address || giveTo,
          ...(toChip?.name ? { name: toChip.name } : {}),
          prov: ctx.giveDstOwner ? giveOwnerProv(coords) : giveDstProv(coords),
        }
      : undefined,
    externalActor:
      externalBy && ownerForReceipt && ctx.txFrom && ctx.txTo
        ? {
            address: externalBy,
            prov: externalActorProv({ owner: ownerForReceipt, txFrom: ctx.txFrom, txTo: ctx.txTo }, coords),
          }
        : undefined,
  };
}
