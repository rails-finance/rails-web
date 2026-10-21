"use client";

// One open position on the wallet view (rails-ops decision 0050, steps 2 and 3): the
// family's listing card, drawn by the family's own listing component from its
// listing row exactly as its listing draws it, inside one link to the
// position's page (N2). The page adds the chain's name at the card's edge and
// AT RISK on the pill through `PositionCardEdgeContext`, and the read's
// freshness under the card (H6's form); nothing inside the card.

import Link from "next/link";
import { PositionCardEdgeContext } from "@/components/shared/position-card";
import {
  AaveV3PositionCard,
  notCollateralOf,
  viewFromSummary as aaveView,
} from "@/components/protocol/aave-v3/aave-v3-position-card";
import { AAVE_V3_BASE_CARD_DEPLOYMENT } from "@/lib/aave-v3-base/position-provenance";
import {
  CompoundPositionCard,
  viewFromSummary as compoundView,
  type CompoundCardLane,
} from "@/components/protocol/compound/compound-position-card";
import { COMPOUND_SWEPT_VOCABULARY } from "@/lib/compound/swept-tower-provenance";
import { MorphoPositionCard, viewFromSummary as morphoView } from "@/components/protocol/morpho/morpho-position-card";
import { SparkPositionCard, viewFromSummary as sparkView } from "@/components/protocol/spark/spark-position-card";
import { FluidPositionCard, viewFromSummary as fluidView } from "@/components/protocol/fluid/fluid-position-card";
import { MakerVaultCard, viewFromSummary as makerView } from "@/components/protocol/makerdao/makerdao-vault-card";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import { ArbitrumReadCard, CometReadCard } from "@/components/shared/arbitrum-positions-listing";
import { ReadStamp } from "@/components/wallet/read-stamp";
import { chainMeta, BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletCard, WalletPosition } from "@/lib/wallet/types";

const BASE_LANE: CompoundCardLane = { chainId: BASE_CHAIN_ID, source: "sweep" };

function FamilyCard({ card }: { card: WalletCard }) {
  switch (card.kind) {
    case "aave-v3":
      return card.lane === "base" ? (
        <AaveV3PositionCard
          v={aaveView(card.row)}
          deployment={AAVE_V3_BASE_CARD_DEPLOYMENT}
          peaks={false}
          notCollateral={notCollateralOf(card.row)}
        />
      ) : (
        <AaveV3PositionCard v={aaveView(card.row)} notCollateral={notCollateralOf(card.row)} />
      );
    case "aave-v3-arbitrum":
      return <ArbitrumReadCard row={card.row} family="aave-v3" />;
    case "compound-v3":
      return card.lane === "base" ? (
        <CompoundPositionCard
          v={compoundView(card.row)}
          vocab={COMPOUND_SWEPT_VOCABULARY}
          session="compound-base"
          lane={BASE_LANE}
          peaks={false}
        />
      ) : (
        <CompoundPositionCard v={compoundView(card.row)} />
      );
    case "compound-v3-arbitrum":
      return card.comet ? (
        <CometReadCard row={card.row} comet={card.comet} />
      ) : (
        <ArbitrumReadCard row={card.row} family="compound-v3" />
      );
    case "morpho":
      return <MorphoPositionCard v={morphoView(card.row)} />;
    case "morpho-arbitrum":
      return <ArbitrumReadCard row={card.row} family="morpho" />;
    case "spark":
      return (
        <SparkPositionCard
          v={sparkView(card.row)}
          surface="listing"
          notCollateral={card.row.notCollateral ? new Set(card.row.notCollateral) : null}
        />
      );
    case "fluid":
      return <FluidPositionCard v={fluidView(card.row)} surface="listing" />;
    case "makerdao":
      return <MakerVaultCard v={makerView(card.row)} surface="listing" />;
    case "liquity-v2":
      return (
        <LiquityPositionCard
          protocol="liquity-v2"
          surface="listing"
          v={viewFromTroveSummary(card.row, card.prices)}
          compact
        />
      );
  }
}

/** A position is AT RISK past its family's liquidation line, or where the
 *  family says it can be liquidated. */
export const atRisk = (p: WalletPosition): boolean => (p.buffer != null && p.buffer < 0) || p.liquidatable === true;

export function WalletPositionCard({ position: p }: { position: WalletPosition }) {
  const chain = chainMeta(p.chain).name;
  return (
    <div
      data-wallet-position={p.positionId}
      data-family={p.family}
      data-chain={chain.toLowerCase()}
      data-head-read={p.headRead}
    >
      <PositionCardEdgeContext.Provider value={{ chain, atRisk: atRisk(p) }}>
        <Link
          href={p.href}
          prefetch={false}
          className="group/listing-row block"
          data-anatomy="N2"
          aria-label={`${p.familyName} on ${chain}${p.market ? `, ${p.market}` : ""}`}
        >
          <FamilyCard card={p.card} />
        </Link>
      </PositionCardEdgeContext.Provider>
      {/* An Aave V3 Base account the chain has not been read for (open point 8). */}
      {p.notRead ? (
        <div className="mt-1 flex justify-end pr-2">
          <span className="text-[11px] font-medium text-rb-500" data-wallet-not-read="">
            Not read
          </span>
        </div>
      ) : (
        /* The Arbitrum cards carry their stored read's block in the card. */
        !p.card.kind.endsWith("-arbitrum") &&
        (p.readAtBlock != null || p.readAt != null) && (
          <div className="mt-1 flex justify-end pr-2">
            <ReadStamp block={p.readAtBlock} at={p.readAt} />
          </div>
        )
      )}
    </div>
  );
}
