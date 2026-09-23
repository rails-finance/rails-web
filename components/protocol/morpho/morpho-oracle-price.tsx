"use client";

// The market oracle's price on the position card's risk strip, and — where
// the oracle names feeds — when that price was published and how long before
// the read. Every capacity and health figure beside it rests on this price,
// and a MorphoChainlinkOracleV2 does not check its feeds' age, so the age is
// stated where those figures are read. An oracle with no feeds read (another
// kind, or one priced by hand) gets the price alone: nothing about its age.
// No threshold and no warning tone — the strip states the chain's fact
// (lib/morpho/oracle-age.ts).
//
// The market's own page states the same price the same way: MorphoOraclePrice
// is the price and its age without the strip's label, and the card's figure is
// that inside a RiskFigure.

import { Prov } from "@/components/shared/provenance";
import { RiskFigure } from "@/components/shared/risk-footer-strip";
import { formatNumber } from "@/lib/utils/format";
import { useChainId } from "@/lib/shared/chain-context";
import { oracleAge } from "@/lib/morpho/oracle-age";
import {
  morphoLiveLane,
  oracleFeedAgeProv,
  oraclePriceProv,
  type MorphoChainCoords,
} from "@/lib/morpho/position-provenance";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";

/** The fields the price and its age are drawn from — a position's read has
 *  them, and so does a market's. */
export type MorphoOracleRead = Pick<
  MorphoChainPositionResponse,
  | "chainStale"
  | "marketId"
  | "blockNumber"
  | "timestamp"
  | "oracle"
  | "oraclePrice"
  | "oracleFeeds"
  | "oraclePublishedAt"
  | "loanSymbol"
  | "collateralSymbol"
>;

/** The price in loan-token terms, then — where feeds were read — when it was
 *  published and how long before the read. Nothing when there is no price. */
export function MorphoOraclePrice({
  chain,
  lane: laneOverride,
  surface = "card",
}: {
  chain: MorphoOracleRead;
  /** The read the receipts name; the position lane of the route's chain by default. */
  lane?: string;
  surface?: "card" | "market";
}) {
  const routeLane = morphoLiveLane(useChainId());
  const lane = laneOverride ?? routeLane;
  if (chain.chainStale || chain.oraclePrice <= 0) return null;
  const coords: MorphoChainCoords = {
    marketId: chain.marketId,
    marketLabel: `${chain.loanSymbol} / ${chain.collateralSymbol}`,
  };
  const age = oracleAge(chain);
  return (
    <>
      <Prov
        info={oraclePriceProv(
          {
            collSym: chain.collateralSymbol,
            loanSym: chain.loanSymbol,
            oracle: chain.oracle,
            block: chain.blockNumber,
            lane,
            surface,
          },
          coords,
        )}
      >
        {formatNumber(chain.oraclePrice)} {chain.loanSymbol}
      </Prov>
      {age && chain.oracleFeeds && chain.oraclePublishedAt != null && (
        <>
          {" · "}
          {age.feedCount > 1 && <>oldest of {age.feedCount} feeds </>}
          published{" "}
          <Prov
            info={oracleFeedAgeProv(
              {
                feeds: chain.oracleFeeds,
                publishedAt: chain.oraclePublishedAt,
                readTimestamp: chain.timestamp,
                oracle: chain.oracle,
                block: chain.blockNumber,
                lane,
              },
              coords,
            )}
          >
            {age.published}
          </Prov>{" "}
          ({age.age} before this read)
        </>
      )}
    </>
  );
}

export function MorphoOraclePriceFigure({ chain }: { chain: MorphoChainPositionResponse }) {
  if (chain.chainStale || chain.oraclePrice <= 0) return null;
  return (
    <RiskFigure label="Oracle price">
      <MorphoOraclePrice chain={chain} />
    </RiskFigure>
  );
}
