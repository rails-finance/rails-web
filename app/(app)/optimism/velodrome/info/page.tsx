// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Velodrome Slipstream on Optimism (ui-jobs 578), drawn on
// the typed template (rails-ops standards/info-page-template.md). The contracts in
// "How Rails reads it" are VELODROME_OPTIMISM's in rails-server's
// aerodrome-at-block.ts (lib/aerodrome/sites.ts here). Unlaunched with the
// explorer: infoMetadata adds noindex and the root layout's strip covers this route.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReadContract,
  type InfoReads,
  type InfoTerm,
  type InfoView,
  GUIDE_NO_LEARN_MORE,
} from "@/components/shared/protocol-info-page";
import { VELODROME } from "@/lib/aerodrome/sites";
import { DEPLOYMENT_LABEL } from "@/lib/aerodrome/words";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { ProvSection } from "@/components/shared/section-menu";

export const metadata = infoMetadata("velodrome");

const DOCS = VELODROME.docs;
const UL = "list-disc space-y-1 pl-5";
const UPGRADE = "https://velodrome.finance/docs/upgrade";
const REWARD_GAUGE = "0xded023B976de3bbe6aEA56678564e992113f8Ea1";

/** The one gauge read for the reward token after the upgrade (13 Nov 2026, ui-jobs 647). */
const REWARD_TOKEN_READ: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: 159_483_363 },
  contract: { name: "Slipstream gauge, wstETH/USDC", address: REWARD_GAUGE },
  summary: `Reward token — the Voter's gauges(0xEE1baC98527a9fDd57fcCf967817215B083cE1F0) is this gauge, and its rewardToken() is ${VELODROME.reward.address}, VELO, at Optimism block 159,483,363.`,
  via: "Voter.gauges(pool), gauge.rewardToken() @ block 159,483,363, read 13 Nov 2026",
  verify: {
    kind: "recompute",
    text: `To check: ask any Optimism archive node for rewardToken() on ${REWARD_GAUGE} at block 159,483,363.`,
  },
};

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  // Velodrome's docs never use the word (rails-ops reference/official-docs/velodrome.md), so the
  // term cites the contract that names it: name() on the initial position manager, read 13 Nov 2026.
  {
    term: "Slipstream",
    definition:
      "Slipstream is the name in Velodrome's contracts for pools where each provider's liquidity sits between two prices. Two Slipstream deployments are live on Optimism, each with a position manager.",
    sources: [
      {
        kind: "contract",
        address: VELODROME.nfpm.initial!,
        carries: 'NonfungiblePositionManager, name() "Slipstream Position NFT v1.2" at block 159,483,363',
      },
    ],
  },
  {
    term: "Position",
    definition:
      "A position is liquidity one provider has placed in a Slipstream pool between two prices, its range. It is an NFT, named by its deployment and its number.",
    sources: [DOCS],
  },
  {
    term: "VELO",
    definition:
      "VELO is Velodrome's token. Gauges pay it to staked positions, which Velodrome's docs call VELO emissions.",
    sources: [DOCS],
  },
  {
    term: "Gauge",
    definition:
      "A gauge is the contract beside a pool that pays VELO to the positions staked in it. It holds a staked position until the wallet that staked it takes it back.",
    sources: [DOCS],
  },
  {
    term: "Staking",
    definition:
      "Staking moves a position into its pool's gauge. A staked position earns VELO in place of trading fees.",
    sources: [DOCS],
  },
];

const howItWorks: readonly [ReactNode, ...ReactNode[]] = [
  <>
    A <GlossaryLink term="Slipstream">Slipstream</GlossaryLink> pool holds two tokens and prices one in the other. A
    provider deposits both into a <GlossaryLink term="Position">position</GlossaryLink> with a range, a lower and an
    upper price, and it earns only while the pool&apos;s price sits inside that range.
  </>,
  <>
    An unstaked position earns a share of each swap&apos;s fee. A position{" "}
    <GlossaryLink term="Staking">staked</GlossaryLink> in its pool&apos;s{" "}
    <GlossaryLink term="Gauge">gauge</GlossaryLink> earns no fees; it earns{" "}
    <GlossaryLink term="VELO">VELO</GlossaryLink> at the rate the gauge pays.
  </>,
  <>
    Each week veVELO holders vote on how much VELO each pool&apos;s gauge pays out. Those voters receive the pool&apos;s
    trading fees from staked liquidity and a share from unstaked liquidity.
  </>,
  // The read: rails-ops reference/official-docs/velodrome.md, "Read on chain, no disagreement". The docs
  // say "opens"; Rails reports it in the past. The block is in the receipt.
  <ProvSection key="upgrade" scope="velodrome-upgrade" as="div" className="contents">
    Velodrome&apos;s{" "}
    <a href={UPGRADE} className={INLINE_LINK} target="_blank" rel="noopener">
      upgrade guide
    </a>{" "}
    says the upgrade to Aero opened on 22 October, 00:00 UTC, and that liquid VELO converts to AERO at 0.044.{" "}
    <Prov info={REWARD_TOKEN_READ}>
      The wstETH/USDC pool&apos;s gauge, the one gauge checked, still names VELO as its reward token.
    </Prov>
    <ProvInspectorLayer />
  </ProvSection>,
  <>
    Every figure is in the pool&apos;s quote token, the one it prices the other in, at the pool&apos;s price. VELO is
    valued through Velodrome&apos;s own VELO pools, and Rails states no dollar figure here.
  </>,
  <>Rails does not forecast, rate or recommend.</>,
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's positions",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={VELODROME.route} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see that wallet&apos;s Slipstream positions that hold liquidity, staked or not, on both deployments. Rails
          reads the newest 200 on each deployment.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>Each row names the position&apos;s number, its two tokens and its tick spacing.</li>
          <li>Each row says whether the position is staked, and opens the position&apos;s page.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "Position page",
    body: (
      <p>
        The position page shows the two tokens the position holds now and their worth in the quote token, with its range
        drawn against the price. An unstaked position shows its fees not yet collected; a staked one shows the VELO it
        can claim. Under it, six lines compare the position with its pool over the last 30 days.
      </p>
    ),
  },
];

const contracts: InfoReadContract[] = [
  // The first deployment's rows say what is read; the second says "the same".
  ...VELODROME.deployments.map((d, i) => ({
    name: `NonfungiblePositionManager, ${DEPLOYMENT_LABEL[d]}`,
    address: VELODROME.nfpm[d]!,
    reads:
      i === 0
        ? "each position's owner, tokens, tick spacing, range, liquidity and fees owed; and a wallet's positions, by its balance and their index."
        : "the same, for this deployment's positions.",
  })),
  ...VELODROME.deployments.map((d, i) => ({
    name: `CLFactory, ${DEPLOYMENT_LABEL[d]}`,
    address: VELODROME.factory[d]!,
    reads:
      i === 0 ? "the pool for a position's two tokens and tick spacing." : "the same, for this deployment's pools.",
  })),
  {
    name: "Each pool",
    reads:
      "its price, its swap fee and the share it takes from unstaked liquidity's fees, its liquidity in range and the staked part of it, its fee and reward growth, the ticks at the position's two range edges, and its gauge.",
  },
  {
    name: "Voter",
    address: VELODROME.voter,
    reads: "every pool with a gauge, and each pool's gauge, so a wallet's staked positions can be found.",
  },
  {
    name: "Each gauge",
    reads: "a wallet's staked positions; and for a staked position, the VELO settled to it and its reward growth.",
  },
  {
    name: "Each gauge factory",
    reads:
      "the share of the VELO to claim that unstaking early gives up, and the pool's minimum time staked. Where it does not answer, no penalty is shown.",
  },
  { name: "VELO/USDC pool", address: VELODROME.rewardPools.usdc, reads: "its reserves, to price VELO in USDC." },
  { name: "VELO/WETH pool", address: VELODROME.rewardPools.weth, reads: "its reserves, to price VELO in WETH." },
  { name: "Each token", reads: "its symbol and decimals, and the pool's balance of it." },
];

const reads: InfoReads = {
  contracts: contracts as [InfoReadContract, ...InfoReadContract[]],
  how: "Rails's server reads these contracts at the block current when you open a page, and at a block 30 days back, the first block of that UTC midnight. A past block's answers are stored once that block is final, so a later visit reads only the newest block again. The Voter's list of gauges is kept for a day.",
  notes: [
    "A gauge keeps no record of which wallet staked a position. On Optimism Rails does not yet read the deposit's logs to name that wallet, so a staked position's page shows it as held by the gauge, and its VELO to claim is worked out from the gauge's reads: the VELO settled at its last update plus the reward growth inside its range since. The gauge's own earned() needs the wallet, so it is not asked.",
    "A wallet's staked positions are found by asking each Slipstream gauge which positions that wallet has staked, so the wallet page lists them with the wallet's own.",
    "rails-server answers VELO's two price pools under the field named aero, its name on Base, where the same reader serves Aerodrome.",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      guide={GUIDE_NO_LEARN_MORE}
      session="velodrome"
      tracks={
        <>
          The Rails Velodrome explorer shows a wallet&apos;s Velodrome Slipstream liquidity positions on Optimism,
          staked or not. For each one it shows the position&apos;s range, its fees or VELO, and its pool over the last
          30 days.
        </>
      }
      notCovered="Velodrome's basic pools, its VELO locks and its voting aren't covered here. Not indexed yet on Optimism: a listing of positions and each position's history arrive when Rails indexes Velodrome there."
      glossary={glossary}
      howItWorks={howItWorks}
      reads={reads}
      views={views}
      docs={DOCS}
    />
  );
}
