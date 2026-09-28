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
        price: formatNumber(heldPrice),
      }),
    },
    cleared: {
      symbol: owed.marketSymbol,
      usd: clearedUsd,
      usdProv: dolomiteLiqLegValueProv("cleared debt", owed.marketSymbol, coords, {
        amount: `${fmt(owed.weiDelta)} ${owed.marketSymbol}`,
        price: formatNumber(owedPrice),
      }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: dolomiteLiqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
    }),
    ...(spread != null && spread > 0
      ? {
          premiumReference: {
            label: "Engine spread at block",
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
  };
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
    const changeN = afterN - beforeN;
    if (changeN !== 0) {
      const sign = changeN >= 0 ? "+" : "−";
      transition = {
        before: formatCompact(beforeN),
        beforeExact: formatExact(beforeN),
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

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
