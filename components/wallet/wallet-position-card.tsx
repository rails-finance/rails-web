"use client";

// One open position on the wallet view (rails-ops decision 0050, steps 2 and 3): the
// family's listing card, drawn by the family's own listing component from its
// listing row exactly as its listing draws it, inside one link to the
// position's page (N2). Through `PositionCardEdgeContext` the page names the
// card's protocol and chain for its sidebar (C20), drops the wallet pill and
// the OPEN pill, and keeps AT RISK; under the card, the read's freshness (H6's
// form). Nothing inside the card changes, except that a Stability Pool
// deposit's card states its head read (the deposit now, the collateral owed)
// where the read answered, a Trove's card takes its branch's shutdown from the
// head read (no ratio; an emptied pool's "pool holds 0"), and a fork deposit
// on an emptied branch states the withdrawal under its collateral gain
// (ui-jobs 802).

import Link from "next/link";
import { PositionCardEdgeContext, type PositionCardEdge } from "@/components/shared/position-card-edge";
import { PROTOCOLS } from "@/lib/shared/protocols";
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
import { LiquityPositionCard, viewFromForkSummary } from "@/components/protocol/liquity-family/liquity-position-card";
import { liquityV2TroveCard } from "@/lib/liquity-v2/listing-cards";
import { forkDepositWalletCard } from "@/lib/liquity-fork/deposit-card";
import { SP_DEPLOYMENTS } from "@/lib/liquity-v2/sp-deployment";
import {
  LiquityV1PositionCard,
  viewFromSummary as liquityV1View,
} from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import { LiquityV1DepositCard } from "@/components/protocol/liquity/v1-sp-deposit-card";
import { LiquityV1StakeCard } from "@/components/protocol/liquity/v1-staking-card";
import { stakeNowFromChain } from "@/lib/liquity-v1/staking-math";
import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import { depositNowFromChain as liquityV1DepositNow } from "@/lib/liquity-v1/sp-math";
import { depositNowFromChain as liquityV2DepositNow } from "@/lib/liquity-v2/sp-math";
import { ArbitrumReadCard, CometReadCard } from "@/components/shared/arbitrum-positions-listing";
import { ReadStamp } from "@/components/wallet/read-stamp";
import { chainMeta, BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletCard, WalletPosition } from "@/lib/wallet/types";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import { walletBranchState } from "@/lib/wallet/trove-shutdown";

const BASE_LANE: CompoundCardLane = { chainId: BASE_CHAIN_ID, source: "sweep" };

/** `state`: the position's branch shutdown as the card draws it
 *  (`walletBranchState`). */
function FamilyCard({ card, state }: { card: WalletCard; state: BranchShutdownState | null }) {
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
      return liquityV2TroveCard(card.row, card.prices, state);
    case "liquity-v2-deposit":
      return (
        <LiquityV2DepositCard
          row={card.row}
          surface="listing"
          now={card.head ? liquityV2DepositNow(card.head) : null}
          nowBlock={card.head?.blockNumber}
          shutdown={state}
          onWallet
        />
      );
    case "liquity-v1":
      return (
        <LiquityV1PositionCard
          v={liquityV1View(card.row)}
          surface="listing"
          endedBy={card.row.closedByRedemption ? "redemption" : null}
        />
      );
    case "liquity-v1-deposit":
      return (
        <LiquityV1DepositCard
          row={card.row}
          surface="listing"
          now={card.head ? liquityV1DepositNow(card.head) : null}
          nowBlock={card.head?.blockNumber}
        />
      );
    case "liquity-v1-stake":
      return (
        <LiquityV1StakeCard
          row={card.row}
          surface="listing"
          now={card.head ? stakeNowFromChain(card.head) : null}
          nowBlock={card.head?.blockNumber}
        />
      );
    case "ebisu":
    case "asymmetry":
    case "basedollar":
      return (
        <LiquityPositionCard
          protocol={card.kind}
          surface="listing"
          v={viewFromForkSummary(card.kind, card.row)}
          compact
          shutdown={state}
        />
      );
    case "fork-deposit":
      return forkDepositWalletCard(SP_DEPLOYMENTS[card.fork])(card.row, state);
  }
}

/** A Liquity-family Trove's or deposit's branch, for its shutdown state. */
function branchOf(c: WalletCard): { protocol: string; branch: string } | null {
  switch (c.kind) {
    case "liquity-v2":
      return { protocol: "liquity-v2", branch: c.row.collateralType };
    case "liquity-v2-deposit":
      return { protocol: "liquity-v2", branch: c.row.collateral_type };
    case "ebisu":
    case "asymmetry":
    case "basedollar":
      return { protocol: c.kind, branch: c.row.collateralType };
    case "fork-deposit":
      return { protocol: c.fork, branch: c.row.collateral_type };
    default:
      return null;
  }
}

/** The branch state the card draws: the wallet read's, else the catalog's
 *  record (a head read that failed or timed out). */
const stateOf = (p: WalletPosition): BranchShutdownState | null => {
  const b = branchOf(p.card);
  return b ? walletBranchState(b.protocol, b.branch, p.status, p.shutdown) : null;
};

/** A position is AT RISK past its family's liquidation line, or where the
 *  family says it can be liquidated. */
export const atRisk = (p: WalletPosition): boolean => (p.buffer != null && p.buffer < 0) || p.liquidatable === true;

/** The roster id of a position's explorer, the glyph key. */
export const protocolId = (p: WalletPosition): string =>
  PROTOCOLS.find((e) => e.chainId === p.chain && e.slug === p.family)?.id ?? p.family;

export function WalletPositionCard({ position: p }: { position: WalletPosition }) {
  const chain = chainMeta(p.chain).name;
  const edge: PositionCardEdge = {
    surface: "wallet",
    protocol: { id: protocolId(p), name: p.familyName },
    chain: { id: p.chain, name: chain },
    atRisk: atRisk(p),
    // The Arbitrum cards carry their stored read's block in the card.
    stamp: p.notRead ? (
      // An Aave V3 Base account the chain has not been read for (open point 8).
      <span className="text-[11px] font-medium text-rb-500" data-wallet-not-read="">
        Not read
      </span>
    ) : (
      // A closed position's card states its ending; the read's age is an
      // open position's.
      p.status === "open" &&
      !p.card.kind.endsWith("-arbitrum") &&
      (p.readAtBlock != null || p.readAt != null) && <ReadStamp block={p.readAtBlock} at={p.readAt} inLink />
    ),
  };
  return (
    <div
      data-wallet-position={p.positionId}
      data-family={p.family}
      data-chain={chain.toLowerCase()}
      data-head-read={p.headRead}
    >
      <PositionCardEdgeContext.Provider value={edge}>
        {p.href ? (
          <Link
            href={p.href}
            prefetch={false}
            className="group/listing-row block"
            data-anatomy="N2"
            aria-label={`${p.familyName} on ${chain}${p.market ? `, ${p.market}` : ""}`}
          >
            <FamilyCard card={p.card} state={stateOf(p)} />
          </Link>
        ) : (
          <div
            className="group/listing-row block"
            data-anatomy="N2"
            aria-label={`${p.familyName} on ${chain}${p.market ? `, ${p.market}` : ""}`}
          >
            <FamilyCard card={p.card} state={stateOf(p)} />
          </div>
        )}
      </PositionCardEdgeContext.Provider>
    </div>
  );
}
