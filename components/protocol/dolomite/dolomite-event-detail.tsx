"use client";

// Dolomite event detail — adapter onto the shared ChainTruthDetail grid.
// One lane per row (the row IS one balance leg): the token balance
// before→after, par × the market's index at the block, which getAccountWei
// reads there. The transition is built from the row's two emitted absolutes
// (newPar and its lag) at that one index, and the line under it states the
// interest accrued since the previous row. A payload without the index falls
// back to the par axis, labelled "· par".
//
// The narrating liquidation legs additionally carry the forensics card: the
// two legs of the SAME LogLiquidate (paired by log index — one tx can hold
// several liquidations) valued at the core's own getMarketPrice read back AT
// the event's block, with getLiquidationSpreadForPair from the same block as
// the reference constant. The engine sizes the seizure from that constant,
// so a liquidation with collateral to spare lands on it exactly and the card
// audits itself. The archive read is lazy (this panel mounts on expand) and
// cached immutable; a miss keeps the card token-only — the safe state.

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDolomitePrice, otherAccountName } from "@/lib/dolomite/asset-catalog";
import { DolomiteAccountLabel } from "@/components/protocol/dolomite/dolomite-position-card";
import type { DolomiteContext } from "@/lib/shared/types/event-shape";
import {
  ChainTruthDetail,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  parAfterProv,
  parBeforeProv,
  parDeltaProv,
  balanceAfterProv,
  balanceBeforeProv,
  balanceChangeProv,
  dolomiteInterestSincePreviousProv,
  dolomiteLiqAtBlockPriceProv,
  dolomiteLiqLegValueProv,
  dolomiteLiqPremiumProv,
  dolomiteLiqSpreadRefProv,
  type DolomiteCoords,
} from "@/lib/dolomite/event-provenance";
import type { DolomiteEvent } from "@/lib/dolomite/explainer-clauses";
import { formatNumber, formatCompact, formatExact, formatUsdValue } from "@/lib/utils/format";

export interface DolomiteEventDetailProps {
  ctx: DolomiteContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** This row's own event (for log-index pairing) + its same-tx siblings. */
  event?: DolomiteEvent;
  siblings?: DolomiteEvent[];
  /** The page's uint256 account number (decimal STRING) — names the
   *  liquidated account on borrower-side legs for the spread read. */
  accountNumber?: string;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Math.abs(Number(human))));

/** The log index buried in the row's id (`action:txhash:logindex:leg` from the
 *  MV's event_key, `tx-logindex-leg` on the fallback) — the pairing key that
 *  keeps two liquidations in one tx from swapping legs. */
function legLogIndex(id: string): string | null {
  const m = /[:-](\d+)[:-][a-z_]+$/.exec(id);
  return m ? m[1] : null;
}

/** The other leg of the SAME LogLiquidate: same tx, same log index. */
function pairedLeg(
  self: DolomiteEvent,
  siblings: DolomiteEvent[],
  wantedType: DolomiteContext["eventType"],
): DolomiteEvent | undefined {
  const logIndex = legLogIndex(self.id);
  if (logIndex == null) return undefined;
  return siblings.find(
    (s) =>
      s !== self &&
      s.txHash === self.txHash &&
      s.context.data.eventType === wantedType &&
      legLogIndex(s.id) === logIndex,
  );
}

interface AtBlockPrices {
  heldPriceRaw: string;
  owedPriceRaw: string;
  spreadRaw: string | null;
  /** The spread's parts at the same block (Decimal.D256 strings). */
  baseSpreadRaw: string | null;
  heldSpreadPremiumRaw: string | null;
  owedSpreadPremiumRaw: string | null;
  overrideSpreadRaw: string | null;
  /** The account's health at the end of the previous block. */
  healthBefore: number | null;
}

/** The at-block reads for a liquidation row — fetched once on mount (the
 *  detail mounts on expand). `undefined` while loading or after a miss: the
 *  card renders without the forensics block, which is the safe state. */
function useLiqPricesAtBlock(
  enabled: boolean,
  blockNumber: number | undefined,
  heldMarketId: number | undefined,
  owedMarketId: number | undefined,
  liquidAccount: { owner: string; number: string } | undefined,
): AtBlockPrices | undefined {
  const [prices, setPrices] = useState<AtBlockPrices | undefined>(undefined);
  const owner = liquidAccount?.owner;
  const number = liquidAccount?.number;
  useEffect(() => {
    if (!enabled || blockNumber == null || heldMarketId == null || owedMarketId == null) return;
    let live = true;
    const acct = owner != null && number != null ? `&owner=${owner}&account=${number}` : "";
    fetch(`/api/chain/dolomite/liq-price?block=${blockNumber}&held=${heldMarketId}&owed=${owedMarketId}${acct}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && typeof d.heldPriceRaw === "string" && typeof d.owedPriceRaw === "string") {
          setPrices({
            heldPriceRaw: d.heldPriceRaw,
            owedPriceRaw: d.owedPriceRaw,
            spreadRaw: typeof d.spreadRaw === "string" ? d.spreadRaw : null,
            baseSpreadRaw: typeof d.baseSpreadRaw === "string" ? d.baseSpreadRaw : null,
            heldSpreadPremiumRaw: typeof d.heldSpreadPremiumRaw === "string" ? d.heldSpreadPremiumRaw : null,
            owedSpreadPremiumRaw: typeof d.owedSpreadPremiumRaw === "string" ? d.owedSpreadPremiumRaw : null,
            overrideSpreadRaw: typeof d.overrideSpreadRaw === "string" ? d.overrideSpreadRaw : null,
            healthBefore: typeof d.healthBefore === "number" ? d.healthBefore : null,
          });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, blockNumber, heldMarketId, owedMarketId, owner, number]);
  return prices;
}

/** A leg's context is usable for valuation only when the proxy resolved its
 *  market identity — the unresolved fallback renders RAW integers under a
 *  "market #N" symbol, and valuing those would mis-state the leg. */
function legResolved(ctx: DolomiteContext): boolean {
  return ctx.raw?.weiDelta != null && !/^market #/.test(ctx.marketSymbol);
}

/** The valued two-leg breakdown — both legs of one LogLiquidate at the
 *  block's own prices. Undefined until the archive read lands. */
function buildDolomiteLiqForensics(
  held: DolomiteContext,
  owed: DolomiteContext,
  coords: DolomiteCoords,
  atBlock: AtBlockPrices | undefined,
): LiquidationForensicsProps | undefined {
  if (atBlock == null || !legResolved(held) || !legResolved(owed)) return undefined;
  // wei × price ÷ 1e36 — Monetary.Price is scaled 1e(36 − decimals), so the
  // token decimals cancel and the raw integers value exactly.
  const seizedUsd = (Math.abs(Number(held.raw!.weiDelta)) * Number(atBlock.heldPriceRaw)) / 1e36;
  const clearedUsd = (Math.abs(Number(owed.raw!.weiDelta)) * Number(atBlock.owedPriceRaw)) / 1e36;
  if (!Number.isFinite(seizedUsd) || !Number.isFinite(clearedUsd) || seizedUsd <= 0 || clearedUsd <= 0)
    return undefined;

  const heldPrice = Number(atBlock.heldPriceRaw) / 10 ** (36 - held.decimals);
  const owedPrice = Number(atBlock.owedPriceRaw) / 10 ** (36 - owed.decimals);
  const spread = atBlock.spreadRaw != null ? Number(atBlock.spreadRaw) / 1e18 : null;

  return {
    seized: {
      symbol: held.marketSymbol,
      usd: seizedUsd,
      usdProv: dolomiteLiqLegValueProv("seized collateral", held.marketSymbol, coords, {
        amount: `${fmt(held.weiDelta)} ${held.marketSymbol}`,
        price: formatDolomitePrice(heldPrice),
      }),
    },
    cleared: {
      symbol: owed.marketSymbol,
      usd: clearedUsd,
      usdProv: dolomiteLiqLegValueProv("cleared debt", owed.marketSymbol, coords, {
        amount: `${fmt(owed.weiDelta)} ${owed.marketSymbol}`,
        price: formatDolomitePrice(owedPrice),
      }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumLabel: "Seized over cleared",
    premiumProv: dolomiteLiqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
    }),
    ...(spread != null && spread > 0
      ? {
          premiumReference: {
            label: "Liquidation spread",
            value: `+${(spread * 100).toFixed(2)}%`,
            prov: dolomiteLiqSpreadRefProv(coords, {
              heldSym: held.marketSymbol,
              owedSym: owed.marketSymbol,
            }),
          },
        }
      : {}),
    pricePills: [
      {
        symbol: held.marketSymbol,
        priceUsd: heldPrice,
        priceProv: dolomiteLiqAtBlockPriceProv(held.marketSymbol, coords, atBlock.heldPriceRaw),
        note: "oracle at block",
      },
      {
        symbol: owed.marketSymbol,
        priceUsd: owedPrice,
        priceProv: dolomiteLiqAtBlockPriceProv(owed.marketSymbol, coords, atBlock.owedPriceRaw),
        note: "oracle at block",
      },
    ],
    format: { value: formatUsdValue, price: formatDolomitePrice },
  };
}

const pctOf = (raw: string | null): number | null => (raw == null ? null : Number(raw) / 1e18);
const pctText = (f: number): string => `${Number((f * 100).toFixed(2))}%`;

/** Where the liquidation spread comes from, and why the liquidator repaid
 *  the share it did, in words, from the at-block reads. */
function liquidationNotes(
  held: DolomiteContext,
  owed: DolomiteContext,
  atBlock: AtBlockPrices,
  repaidShare: number | null,
): string[] {
  const out: string[] = [];
  const spread = pctOf(atBlock.spreadRaw);
  const base = pctOf(atBlock.baseSpreadRaw);
  const hp = pctOf(atBlock.heldSpreadPremiumRaw);
  const op = pctOf(atBlock.owedSpreadPremiumRaw);
  const override = pctOf(atBlock.overrideSpreadRaw);
  if (spread != null && override != null) {
    out.push(
      `The liquidation spread was ${pctText(spread)}: this account carries a risk override that sets its own spread, in place of the ${base != null ? `${pctText(base)} base spread and ` : ""}market premiums.`,
    );
  } else if (spread != null && base != null && hp != null && op != null) {
    const parts = [
      hp > 0 ? `(1 + ${pctText(hp)} ${held.marketSymbol} spread premium)` : null,
      op > 0 ? `(1 + ${pctText(op)} ${owed.marketSymbol} spread premium)` : null,
    ].filter(Boolean);
    out.push(
      parts.length > 0
        ? `The liquidation spread was ${pctText(spread)}: Dolomite's ${pctText(base)} base spread × ${parts.join(" × ")}. Each market can carry a spread premium, and the seized collateral is worth the repaid debt plus this spread.`
        : `The liquidation spread was ${pctText(spread)}, Dolomite's base spread: neither ${held.marketSymbol} nor ${owed.marketSymbol} carries a spread premium.`,
    );
  }
  const h = atBlock.healthBefore;
  if (repaidShare != null) {
    const half = Math.abs(repaidShare - 0.5) < 0.005;
    const all = repaidShare > 0.995;
    const hText = h != null ? ` The account's health factor at the end of the previous block was ${h.toFixed(3)}.` : "";
    if (half)
      out.push(
        `The liquidator repaid half the debt. Dolomite sets that share: when an account's health factor is 0.95 or above and its collateral market allows partial liquidation, a liquidation clears 50% of the debt instead of all of it.${hText}`,
      );
    else if (all)
      out.push(
        `The liquidator repaid the whole debt. Dolomite clears all of it when the health factor is below 0.95 or the collateral market does not allow partial liquidation.${hText}`,
      );
    else
      out.push(
        `The liquidator repaid ${(repaidShare * 100).toFixed(1)}% of the debt, less than the protocol's cap: the liquidator chose the amount, or the collateral ran out.${hText}`,
      );
  }
  return out;
}

export function DolomiteEventDetail({
  ctx,
  txHash,
  blockNumber,
  wallet,
  event,
  siblings,
  accountNumber,
}: DolomiteEventDetailProps) {
  const coords: DolomiteCoords = {
    txHash,
    blockNumber,
    owner: wallet,
    accountNumber: undefined,
    marketId: ctx.marketId,
  };
  const sym = ctx.marketSymbol;

  // The narrating legs of a liquidation carry the forensics block: the
  // borrower's debt leg (`liquidation`, its held sibling is `seize_out`) and
  // the liquidator's collateral leg (`seize_in`, its owed sibling is
  // `liquidation_payout`).
  const pair =
    event != null && siblings != null
      ? ctx.eventType === "liquidation"
        ? { held: pairedLeg(event, siblings, "seize_out")?.context.data, owed: ctx }
        : ctx.eventType === "seize_in"
          ? { held: ctx, owed: pairedLeg(event, siblings, "liquidation_payout")?.context.data }
          : undefined
      : undefined;
  const bothLegs = pair?.held != null && pair?.owed != null ? { held: pair.held, owed: pair.owed } : undefined;
  const canValue = bothLegs != null && legResolved(bothLegs.held) && legResolved(bothLegs.owed);
  // The LIQUIDATED account, for the account-aware spread read (an override
  // account is seized at its own spread): on the borrower's page it is the
  // page's account; on the liquidator's page it is the held leg's
  // counterparty.
  const liquidAccount =
    ctx.eventType === "liquidation"
      ? wallet != null && accountNumber != null
        ? { owner: wallet, number: accountNumber }
        : undefined
      : bothLegs?.held.counterparty != null && bothLegs.held.counterpartyAccountNumber != null
        ? { owner: bothLegs.held.counterparty, number: bothLegs.held.counterpartyAccountNumber }
        : undefined;
  const atBlock = useLiqPricesAtBlock(
    canValue,
    blockNumber,
    bothLegs?.held.marketId,
    bothLegs?.owed.marketId,
    liquidAccount,
  );
  const forensics =
    bothLegs != null ? buildDolomiteLiqForensics(bothLegs.held, bothLegs.owed, coords, atBlock) : undefined;
  // The share of the debt the liquidation repaid, from the debt leg's own
  // balance before (the borrower's page only: the liquidator's page does not
  // hold the borrower's balance).
  const repaidShare =
    ctx.eventType === "liquidation" && ctx.balanceBefore != null && ctx.weiDelta != null
      ? Math.abs(Number(ctx.weiDelta)) / Math.abs(Number(ctx.balanceBefore)) || null
      : null;
  const notes =
    forensics && bothLegs && atBlock ? liquidationNotes(bothLegs.held, bothLegs.owed, atBlock, repaidShare) : [];

  // The lane states the token balance the core held: par × the market's index
  // at the block (a negative balance IS debt). A payload without the index
  // falls back to the par axis, labelled "· par".
  const onChain = ctx.balanceAfter != null;
  const label = ctx.side === "debt" ? (onChain ? "Debt" : "Debt · par") : onChain ? "Balance" : "Balance · par";

  // Transition: before = the previous emitted absolute at this block's index
  // (or the bare par), change = after − before. Undefined on a zero change.
  let transition: ChainTruthTransition | undefined;
  const afterN = Number(onChain ? ctx.balanceAfter : ctx.parAfter);
  const beforeRaw = onChain ? ctx.balanceBefore : ctx.parBefore;
  const beforeN = beforeRaw != null ? Number(beforeRaw) : null;
  if ((onChain || ctx.parAfter != null) && beforeN != null && Number.isFinite(afterN) && Number.isFinite(beforeN)) {
    // A debt stays below zero on both ends: the lane states magnitudes, so the
    // before reads as the after does and a debt that rose changes by "+".
    const owed = beforeN <= 0 && afterN <= 0 && (beforeN < 0 || afterN < 0);
    const b = owed ? Math.abs(beforeN) : beforeN;
    const changeN = owed ? Math.abs(afterN) - b : afterN - beforeN;
    if (changeN !== 0) {
      const sign = changeN >= 0 ? "+" : "−";
      transition = {
        before: formatCompact(b),
        beforeExact: formatExact(b),
        beforeProv: onChain ? balanceBeforeProv(sym, coords) : parBeforeProv(sym, coords, ctx.raw?.parBefore),
        change: `${sign}${formatCompact(Math.abs(changeN))}`,
        changeExact: `${sign}${formatExact(Math.abs(changeN))}`,
        changeProv: onChain ? balanceChangeProv(sym, coords) : parDeltaProv(sym, coords),
      };
    }
  }

  const stats: ChainTruthStat[] = [
    {
      label,
      value: fmt(onChain ? ctx.balanceAfter : ctx.parAfter),
      symbol: sym,
      prov: onChain ? balanceAfterProv(sym, coords) : parAfterProv(sym, coords, ctx.raw?.parAfter),
      transition,
      ...(ctx.interestSincePrevious
        ? {
            interestSincePrevious: {
              value: ctx.interestSincePrevious,
              prov: dolomiteInterestSincePreviousProv(sym, coords),
            },
          }
        : {}),
    },
  ];

  // A transfer's other side: the account number it came from or went to,
  // linked to that account's own page.
  const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
  const other =
    isTransfer && ctx.counterparty != null && ctx.counterpartyAccountNumber != null
      ? { owner: ctx.counterparty, number: ctx.counterpartyAccountNumber }
      : null;
  const sameWallet = other != null && wallet != null && other.owner === wallet.toLowerCase();

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {other && (
        <p className="mt-2 px-5 text-xs text-rb-500" data-dolomite-other-account="">
          {ctx.eventType === "transfer_in" ? "Came from" : "Went to"}{" "}
          <Link href={`/ethereum/dolomite/${other.owner}/${other.number}`} className="font-medium text-foreground">
            <DolomiteAccountLabel text={otherAccountName(other.number)} accountNumber={other.number} />
          </Link>
          {sameWallet ? " of this wallet" : ` of ${other.owner.slice(0, 6)}…${other.owner.slice(-4)}`}, inside Dolomite:
          no tokens left the protocol.
        </p>
      )}
      {forensics && <LiquidationForensics {...forensics} />}
      {notes.length > 0 && (
        <div className="mt-2 space-y-1 px-5 text-xs text-rb-500" data-dolomite-liq-notes="">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </>
  );
}
