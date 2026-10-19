"use client";

// The LlamaLend position card's live layer (rails-ops TO-DO-position-card 322),
// from the page's chain read and inside the card's receipts scope, so every
// figure here is inspectable:
//
//   • the third headline: the protocol's own health; below 0 anyone may
//     liquidate, and a Liquidatable panel row says so in CRITICAL red (the
//     line is the protocol's);
//   • the panel's rows: what the AMM holds converted from the collateral (a
//     zero is worth stating: it is a positive claim about the chain, and this
//     explorer's signature figure), the soft-liquidation multiple (how far the
//     price stands above the onset), the collateral the AMM has sold net and
//     any lost to soft-liquidation, and the band figures: where the price
//     stands against the position's bands, the bands' range, the oracle price.
//
// The figures carry no risk colour (feedback-no-opinionated-color). The band
// state is words: "Converting now" and "Fully converted" are the protocol's
// state machine, on the house CAUTION → CRITICAL ladder (2026-07-27).

import type { ReactNode } from "react";
import { Icon } from "@/components/icons/icon";
import { Prov } from "@/components/shared/provenance";
import type { PositionPanelColumns, PositionPanelRow } from "@/components/shared/position-card";
import {
  llamalendBandCountProv,
  llamalendBandEdgeProv,
  llamalendConvertedProv,
  llamalendHealthFullProv,
  llamalendHealthProv,
  llamalendOraclePriceProv,
} from "@/lib/llamalend/live-provenance";
import { llamalendLostProv, llamalendSoldProv } from "@/lib/llamalend/event-provenance";
import { fmtHealth } from "@/lib/llamalend/event-figures";
import { formatExact, formatUnitsExact } from "@/lib/utils/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { TokenFigure } from "@/components/shared/token-figure";
import { AmountText } from "@/components/shared/amount-text";
import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";

/** Health under this (5%) and above 0 carries the near-0 line. */
const HEALTH_NEAR_ZERO = 0.05;

/** Whether the read describes a live loan. */
export function llamalendHasRisk(chain: LlamalendChainResponse): boolean {
  return !chain.chainStale && chain.hasLoan;
}

/** The headline: the protocol's own health. */
export function LlamalendHealth({ chain }: { chain: LlamalendChainResponse }) {
  if (chain.healthFull == null) return null;
  return (
    <Prov info={llamalendHealthFullProv(chain.controller, chain.healthFullRaw)}>{fmtHealth(chain.healthFull)}</Prov>
  );
}

/** Under Health: near 0 the figure alone reads as small, so one plain line
 *  says how close liquidation is. */
export function llamalendHealthSub(chain: LlamalendChainResponse): ReactNode {
  if (!llamalendHasRisk(chain) || chain.healthFull == null) return undefined;
  if (chain.healthFull > 0 && chain.healthFull < HEALTH_NEAR_ZERO)
    return <span className="text-tone-caution">close to 0; below 0 anyone may liquidate it</span>;
  return undefined;
}

/** The panel's rows from the live read: the converted amount, the
 *  soft-liquidation multiple, what the AMM sold and lost on the left; the
 *  liquidatable flag and the band figures on the right. */
export function llamalendRiskRows(
  chain: LlamalendChainResponse,
  {
    lost,
    sold,
  }: {
    /** Collateral lost to soft-liquidation over the position's life, where it
     *  can be stated (llamalendLostToSoftLiq). */
    lost?: number | null;
    /** Collateral the AMM has sold net of buy-backs, on a position in its bands
     *  now (llamalendSoldInBands). */
    sold?: number | null;
  },
): PositionPanelColumns {
  if (!llamalendHasRisk(chain)) return [[], []];
  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];

  left.push({
    id: "converted",
    label: "Converted",
    value: (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        <Prov
          info={llamalendConvertedProv(
            chain.borrowedSymbol,
            chain.convertedCrossCheckExact,
            chain.controller,
            chain.amm,
          )}
        >
          {chain.converted != null ? (
            <TokenFigure
              symbol={chain.borrowedSymbol}
              figure={`${chain.convertedRaw != null ? formatUnitsExact(chain.convertedRaw, chain.borrowedDecimals) : formatExact(chain.converted)} ${chain.borrowedSymbol}`}
            >
              <span
                title={
                  chain.convertedRaw != null
                    ? `${formatUnitsExact(chain.convertedRaw, chain.borrowedDecimals)} — exact`
                    : undefined
                }
              >
                <AmountText value={chain.converted} format="compact" />
              </span>
            </TokenFigure>
          ) : (
            "—"
          )}
        </Prov>
        {chain.inSoftLiq && <span className="text-rb-500">from sold {chain.collateralSymbol}</span>}
        {/* The misleading-figure caution (copy charter §2's one exception): the
            converted figure cannot be trusted as it stands. Plain words, no
            machinery; the receipt on the figure names the two reads. The `null`
            case says nothing (§4: a missing fact is simply absent). */}
        {chain.convertedCrossCheckExact === false && (
          <span className="basis-full text-xs text-tone-caution">
            Unconfirmed: the market gave two different answers, most likely a trade mid-check. Reloading checks it
            again.
          </span>
        )}
      </span>
    ),
    tip: `The ${chain.borrowedSymbol} the AMM holds for this position from collateral it has sold, read from the Controller and checked against the AMM's figure; 0 means no soft-liquidation.`,
  });

  if (chain.health != null)
    left.push({
      id: "price-over-onset",
      label: "Price over onset",
      value: <Prov info={llamalendHealthProv(chain.amm)}>{chain.health.toFixed(3)}×</Prov>,
      tip: "The collateral's oracle price over the price where this position's band begins: 1.0 at the band's top, below 1.0 inside or beneath the bands. Both prices are read from the AMM at the latest block.",
    });
  if (sold != null && sold > 0)
    left.push({
      id: "sold-net",
      label: "Sold by the AMM, net",
      value: <Prov info={llamalendSoldProv(chain.collateralSymbol, chain.controller)}>{formatCompact(sold)}</Prov>,
      asset: { symbol: chain.collateralSymbol, figure: `${formatExact(sold)} ${chain.collateralSymbol}` },
      tip: `${chain.collateralSymbol} the AMM has sold from this position and not bought back: everything deposited, less everything withdrawn, less what the position holds now.`,
    });
  if (lost != null && lost > 0)
    left.push({
      id: "lost-to-soft-liquidation",
      label: "Lost to soft-liquidation",
      value: <Prov info={llamalendLostProv(chain.collateralSymbol, chain.controller)}>{formatCompact(lost)}</Prov>,
      asset: { symbol: chain.collateralSymbol, figure: `${formatExact(lost)} ${chain.collateralSymbol}` },
      tip: `${chain.collateralSymbol} the AMM sold while the price sat in this position's bands and did not buy back, with nothing converted at the latest block and nothing liquidated: deposited, less withdrawn, less held now.`,
    });

  if (chain.healthFull != null && chain.healthFull < 0)
    right.push({
      id: "liquidatable",
      label: "Liquidatable",
      value: (
        <span data-llamalend-liquidatable="" className="inline-flex items-center gap-1 font-semibold text-red-500">
          <Icon name="triangle" size={12} />
          health below 0: anyone may liquidate it now
        </span>
      ),
      tip: "The Controller reads this position's health below 0, so anyone may liquidate it now, whatever the AMM has converted.",
    });

  const { pUp, pDown, priceOracle: price } = chain;
  if (pUp != null && pDown != null && price != null && pUp > 0) {
    // The band edges and the price are in the borrowed token per collateral
    // token, in Liquity V2's price form ("2.43K": two places in K below 10K),
    // with the borrowed token's icon in place of its ticker (ui-jobs 377).
    const p = (v: number) => formatLiquidationPrice(v).replace("$", "");
    const converted = price <= pDown;
    const inBand = !converted && price <= pUp;
    right.push({
      id: "band-state",
      label: "Band state",
      value: converted ? (
        <span className="font-semibold text-red-600 dark:text-red-400">Fully converted</span>
      ) : inBand ? (
        <span className="font-semibold text-tone-caution">Converting now</span>
      ) : (
        <>{Math.round(((price - pUp) / price) * 100)}% from soft-liquidation</>
      ),
      tip: "Where the oracle price stands against this position's bands: above them (the fall left before conversion begins), inside them (the AMM is converting collateral) or below them (all of it converted).",
    });
    right.push({
      id: "bands",
      label: "Bands",
      value: (
        <>
          <Prov info={llamalendBandCountProv(chain.controller)}>
            {chain.bands} band{chain.bands === 1 ? "" : "s"}
          </Prov>
          :{" "}
          <Prov info={llamalendBandEdgeProv("pUp", chain.borrowedSymbol, chain.borrowedIsCrvusd, chain.amm)}>
            <span title={chain.pUpRaw != null ? `${formatUnitsExact(chain.pUpRaw, 18)} (exact, 1e18)` : undefined}>
              {p(pUp)}
            </span>
          </Prov>{" "}
          →{" "}
          <TokenFigure symbol={chain.borrowedSymbol}>
            <Prov info={llamalendBandEdgeProv("pDown", chain.borrowedSymbol, chain.borrowedIsCrvusd, chain.amm)}>
              <span
                title={chain.pDownRaw != null ? `${formatUnitsExact(chain.pDownRaw, 18)} (exact, 1e18)` : undefined}
              >
                {p(pDown)}
              </span>
            </Prov>
          </TokenFigure>
        </>
      ),
      tip: `The bands this position's collateral sits in, from the price where conversion begins to the price where it completes, in ${chain.borrowedSymbol} per ${chain.collateralSymbol}${chain.n1 != null && chain.n2 != null ? ` (n${chain.n1}…${chain.n2})` : ""}. They come from the AMM's A, its base price and the position's ticks.`,
    });
    right.push({
      id: "oracle-price",
      label: "Oracle price",
      asset: {
        symbol: chain.borrowedSymbol,
        figure:
          chain.priceOracleRaw != null
            ? `${formatUnitsExact(chain.priceOracleRaw, 18)} ${chain.borrowedSymbol}`
            : `${formatExact(price)} ${chain.borrowedSymbol}`,
      },
      value: (
        <Prov
          info={llamalendOraclePriceProv(
            chain.collateralSymbol,
            chain.borrowedSymbol,
            chain.borrowedIsCrvusd,
            chain.amm,
          )}
        >
          <span
            title={
              chain.priceOracleRaw != null
                ? `${formatUnitsExact(chain.priceOracleRaw, 18)} (price_oracle, 1e18)`
                : undefined
            }
          >
            {p(price)}
          </span>
        </Prov>
      ),
      tip: `The ${chain.collateralSymbol} price in ${chain.borrowedSymbol}, the AMM's price_oracle at the latest block: the price the conversion trades against.`,
    });
  }
  return [left, right];
}
