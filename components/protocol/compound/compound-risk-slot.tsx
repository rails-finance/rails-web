"use client";

// The Compound V3 (Comet) position card's risk figures from the page's live
// Comet read, as slots of the shared card (rails-ops TO-DO-position-card 322).
// Comet has two factors per collateral: the borrow factor sets the borrowing
// limit, the liquidate factor the line where an account is absorbed.
//
//   • the headline: the share of the borrowing limit used (debt value ÷ borrow
//     capacity);
//   • panel rows: how much more the account can borrow, where the absorb line
//     sits in base tokens and the share of it reached, and the drop the
//     collateral can take before it (1 − 1/HF, HF = liquidation capacity ÷
//     debt value).
//
// Every figure is in base-token terms, unit-safe in every market (the WETH
// market quotes in ETH). The verdict in words is the Explanation's.

import { formatExact } from "@/lib/utils/format";
import { serverReadOf } from "@/lib/shared/server-head-read";
import { Prov } from "@/components/shared/provenance";
import { AmountText } from "@/components/shared/amount-text";
import { TokenFigure } from "@/components/shared/token-figure";
import type { PositionCardHead, PositionPanelRow } from "@/components/shared/position-card";
import { capacityShare } from "@/lib/shared/capacity-share";
import { capacityProv, contractVerdictProv } from "@/lib/compound/position-provenance";
import type { CompoundCoords } from "@/lib/compound/event-provenance";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { PanelFigure } from "@/components/shared/position-card-panel";

const LIMIT_TIP =
  "The borrow balance as a share of the account's borrowing capacity, which each collateral's Borrow CF (borrow collateral factor) sets. The account becomes liquidatable at a higher level, set by the Liquidation CFs (liquidation collateral factors).";

/** The level is Rails's coinage: Compound's docs name no line or point. */
const POINT_TIP =
  "Liquidation point is Rails's name; Compound's docs name no such level. It is the borrow balance at which the account becomes liquidatable: each collateral's value at the Comet's price feed times its Liquidation CF (liquidation collateral factor), in base tokens.";

const coordsOf = (chain: CompoundMarketChainResponse): CompoundCoords => ({
  comet: chain.comet,
  marketLabel: `c${chain.baseSymbol}v3`,
});

/** Base tokens from a quote-unit value (base price ≈ 1 in the market's own
 *  quote unit, verified on-chain). */
const toBase = (chain: CompoundMarketChainResponse, v: number) => (chain.basePrice > 0 ? v / chain.basePrice : v);

/** A borrower's risk figures: the "Borrowing limit used" headline and the
 *  panel rows on the debt side. `chain` null: the read is still out, so the
 *  headline waits and the rows are absent. `baseAddress` puts the base's icon
 *  after its figures. */
export function compoundRiskSlots(
  chain: CompoundMarketChainResponse | null,
  baseAddress?: string,
): {
  head: PositionCardHead;
  rows: PositionPanelRow[];
} {
  const base = { id: "borrowing-limit-used", label: "Borrowing capacity used", labelTip: LIMIT_TIP };
  if (!chain) return { head: { ...base, value: null, pending: true }, rows: [] };
  if (chain.debtValue <= 0 || chain.borrowCapacity <= 0 || chain.liquidationCapacity <= 0)
    return { head: { ...base, value: null }, rows: [] };
  const coords = coordsOf(chain);
  const readBy = serverReadOf(chain);
  const used = capacityShare(chain.debtValue, chain.borrowCapacity);
  const line = capacityShare(chain.debtValue, chain.liquidationCapacity);
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const headroom = Math.max(0, toBase(chain, chain.borrowCapacity - chain.debtValue));
  const rows: PositionPanelRow[] = [
    {
      id: "room-to-borrow",
      label: "Room to borrow",
      tip: "How much more of the base the account can borrow before it reaches its borrowing capacity, from the Comet's collateral balances, price feeds and Borrow CFs.",
      value: (
        <Prov
          value={formatExact(headroom)}
          info={capacityProv(
            "Available to borrow",
            "(Σ collateral × price × borrow factor − debt value) ÷ base price",
            coords,
            readBy,
          )}
        >
          <AmountText value={headroom} format="compact" />
        </Prov>
      ),
      asset: { symbol: chain.baseSymbol, address: baseAddress, figure: `${headroom} ${chain.baseSymbol}` },
    },
    {
      id: "absorbed-at",
      label: "Liquidation point",
      tip: POINT_TIP,
      value: (
        <>
          <TokenFigure
            symbol={chain.baseSymbol}
            address={baseAddress}
            figure={`${toBase(chain, chain.liquidationCapacity)} ${chain.baseSymbol}`}
          >
            <Prov
              value={formatExact(toBase(chain, chain.liquidationCapacity))}
              info={capacityProv(
                "Liquidation point",
                "Σ collateral × price × Liquidation CF ÷ base price",
                coords,
                readBy,
              )}
            >
              <AmountText value={toBase(chain, chain.liquidationCapacity)} format="compact" />
            </Prov>
          </TokenFigure>{" "}
          of borrow balance
        </>
      ),
    },
    {
      id: "absorb-line-reached",
      label: "Liquidation point reached",
      tip: "The borrow balance as a share of the liquidation point, Rails's name for the level. The Comet's isLiquidatable says whether the account is liquidatable.",
      value: (
        <>
          <Prov
            info={capacityProv(
              "Borrow balance share of the liquidation point",
              "debt value ÷ liquidation capacity",
              coords,
              readBy,
            )}
          >
            <PanelFigure>{line.text}</PanelFigure>
          </Prov>{" "}
          <Prov info={contractVerdictProv("Liquidation point", "isLiquidatable", coords, readBy)}>
            {line.beyond ? "liquidatable" : "reached"}
          </Prov>
        </>
      ),
    },
  ];
  if (dropPct != null)
    rows.push({
      id: "liquidates-on-drop",
      label: "Liquidates on a drop of",
      tip: "How far the collateral's value can fall, every asset together, before the borrow balance reaches the liquidation point.",
      value: (
        <Prov
          info={capacityProv("Drop to the liquidation point", "1 − debt value ÷ liquidation capacity", coords, readBy)}
        >
          {dropPct}%
        </Prov>
      ),
    });
  return {
    head: {
      ...base,
      value: (
        <Prov
          info={capacityProv("Share of the borrowing capacity used", "debt value ÷ borrow capacity", coords, readBy)}
        >
          {used.text}
        </Prov>
      ),
    },
    rows,
  };
}
