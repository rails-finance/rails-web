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
  "The debt as a share of the borrowing limit, which each collateral's borrow factor sets. The account is absorbed at a higher line, set by the liquidate factors.";

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
  const base = { id: "borrowing-limit-used", label: "Borrowing limit used", labelTip: LIMIT_TIP };
  if (!chain) return { head: { ...base, value: null, pending: true }, rows: [] };
  if (chain.debtValue <= 0 || chain.borrowCapacity <= 0 || chain.liquidationCapacity <= 0)
    return { head: { ...base, value: null }, rows: [] };
  const coords = coordsOf(chain);
  const used = capacityShare(chain.debtValue, chain.borrowCapacity);
  const line = capacityShare(chain.debtValue, chain.liquidationCapacity);
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const headroom = Math.max(0, toBase(chain, chain.borrowCapacity - chain.debtValue));
  const rows: PositionPanelRow[] = [
    {
      id: "room-to-borrow",
      label: "Room to borrow",
      tip: "How much more of the base the account can borrow before it reaches its borrowing limit, from the Comet's collateral balances, prices and borrow factors.",
      value: (
        <Prov
          info={capacityProv(
            "Available to borrow",
            "(Σ collateral × price × borrow factor − debt value) ÷ base price",
            coords,
          )}
        >
          <AmountText value={headroom} format="compact" />
        </Prov>
      ),
      asset: { symbol: chain.baseSymbol, address: baseAddress, figure: `${headroom} ${chain.baseSymbol}` },
    },
    {
      id: "absorbed-at",
      label: "Absorbed at",
      tip: "The debt at which the protocol can absorb the account: each collateral's value at the Comet's price times its liquidate factor, in base tokens.",
      value: (
        <>
          <TokenFigure
            symbol={chain.baseSymbol}
            address={baseAddress}
            figure={`${toBase(chain, chain.liquidationCapacity)} ${chain.baseSymbol}`}
          >
            <Prov
              info={capacityProv("Liquidation line", "Σ collateral × price × liquidate factor ÷ base price", coords)}
            >
              <AmountText value={toBase(chain, chain.liquidationCapacity)} format="compact" />
            </Prov>
          </TokenFigure>{" "}
          of debt
        </>
      ),
    },
    {
      id: "absorb-line-reached",
      label: "Absorb line reached",
      tip: "The debt as a share of the absorb line. The Comet's isLiquidatable says whether the account is past it.",
      value: (
        <>
          <Prov info={capacityProv("Debt share of the liquidation line", "debt value ÷ liquidation capacity", coords)}>
            <PanelFigure>{line.text}</PanelFigure>
          </Prov>{" "}
          <Prov info={contractVerdictProv("Liquidation line", "isLiquidatable", coords)}>
            {line.beyond ? "past it" : "reached"}
          </Prov>
        </>
      ),
    },
  ];
  if (dropPct != null)
    rows.push({
      id: "liquidates-on-drop",
      label: "Liquidates on a drop of",
      tip: "How far the collateral's value can fall, every asset together, before the debt reaches the absorb line.",
      value: (
        <Prov info={capacityProv("Drop to the liquidation line", "1 − debt value ÷ liquidation capacity", coords)}>
          {dropPct}%
        </Prov>
      ),
    });
  return {
    head: {
      ...base,
      value: (
        <Prov info={capacityProv("Share of the borrowing limit used", "debt value ÷ borrow capacity", coords)}>
          {used.text}
        </Prov>
      ),
    },
    rows,
  };
}
