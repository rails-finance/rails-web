// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Aerodrome Slipstream on Base (ui-jobs 567), drawn on the
// typed template (rails-ops standards/info-page-template.md). The contracts in
// "How Rails reads it" are the ones rails-server's aerodrome-at-block.ts reads.
// Unlaunched with the explorer: infoMetadata adds noindex and the root layout's
// strip covers this route.

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
import { AERODROME_DOCS_AND_CHAIN } from "@/lib/aerodrome/docs-and-chain";
import { AERO_CONTRACTS } from "@/lib/aerodrome/types";
import { DEPLOYMENT_LABEL } from "@/lib/aerodrome/words";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { explorerHref } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("aerodrome");

const DOCS = { label: "Aerodrome documentation", href: "https://aerodrome.finance/docs" };

/** The two pools Rails prices AERO with (rails-server aerodrome-at-block.ts, AERO_PRICE_POOLS). */
const AERO_PRICE_POOLS = {
  usdc: "0x6cDcb1C4A4D1C3C6d054b27AC5B77e89eAFb971d",
  weth: "0x7f670f78B17dEC44d5Ef68a48740b6f8849cc2e6",
} as const;

const UL = "list-disc space-y-1 pl-5";
const UPGRADE = "https://aerodrome.finance/docs/upgrade";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Slipstream",
    definition:
      "Slipstream is Aerodrome's design for pools where each provider's liquidity sits between two prices. Three Slipstream deployments are live, each with its own position manager.",
    sources: [DOCS],
  },
  {
    term: "Position",
    definition:
      "A position is liquidity one provider has placed in a Slipstream pool between two prices, its range. It is an NFT, named by its deployment and its number.",
    sources: [DOCS],
  },
  {
    term: "AERO",
    definition:
      "AERO is Aerodrome's token. Gauges pay it to staked positions, which Aerodrome's docs call AERO emissions.",
    sources: [DOCS],
  },
  {
    term: "Gauge",
    definition:
      "A gauge is the contract beside a pool that pays AERO to the positions staked in it. It holds a staked position until the wallet that staked it takes it back.",
    sources: [DOCS],
  },
  {
    term: "Staking",
    definition:
      "Staking moves a position into its pool's gauge. A staked position earns AERO in place of trading fees.",
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
    <GlossaryLink term="AERO">AERO</GlossaryLink> at the rate the gauge pays.
  </>,
  <>
    Each week veAERO holders vote on how much AERO each pool&apos;s gauge pays out. Those voters receive the pool&apos;s
    trading fees from staked liquidity and a share from unstaked liquidity, a week later by Aerodrome&apos;s docs.
  </>,
  <>
    Aerodrome&apos;s{" "}
    <a href={UPGRADE} className={INLINE_LINK} target="_blank" rel="noopener">
      upgrade guide
    </a>{" "}
    says the upgrade to Aero opens on October 22, 00:00 UTC; liquid AERO converts 1 : 1 and liquid VELO at 0.044.
  </>,
  <>
    Every figure is in the pool&apos;s quote token, the one it prices the other in, at the pool&apos;s price. AERO is
    valued through Aerodrome&apos;s own AERO pools, and Rails states no dollar figure here.
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
          <Link href={explorerHref(8453, "aerodrome")} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see that wallet&apos;s Slipstream positions that hold liquidity, staked or not, on all three deployments.
          Rails reads the newest 200 on each deployment.
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
        drawn against the price. An unstaked position shows its fees not yet collected; a staked one shows the wallet
        that staked it and the AERO it can claim. Under it, six lines compare the position with its pool over the last
        30 days.
      </p>
    ),
  },
];

const deployments = ["initial", "caps", "gv3"] as const;

const contracts: InfoReadContract[] = [
  // The first deployment's rows say what is read; the other two say "the same".
  ...deployments.map((d, i) => ({
    name: `NonfungiblePositionManager, ${DEPLOYMENT_LABEL[d]}`,
    address: AERO_CONTRACTS.nfpm[d],
    reads:
      i === 0
        ? "each position's owner, tokens, tick spacing, range, liquidity and fees owed; and a wallet's positions, by its balance and their index."
        : "the same, for this deployment's positions.",
  })),
  ...deployments.map((d, i) => ({
    name: `CLFactory, ${DEPLOYMENT_LABEL[d]}`,
    address: AERO_CONTRACTS.factory[d],
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
    address: AERO_CONTRACTS.voter,
    reads: "every pool with a gauge, and each pool's gauge, so a wallet's staked positions can be found.",
  },
  {
    name: "Each gauge",
    reads:
      "a wallet's staked positions; and for a staked position, its AERO earned and to claim, and when it was staked.",
  },
  {
    name: "Each gauge factory",
    reads: "the share of the AERO to claim that unstaking early gives up, and the pool's minimum time staked.",
  },
  {
    name: "AERO/USDC pool",
    address: AERO_PRICE_POOLS.usdc,
    reads: "its reserves, to price AERO in USDC.",
  },
  {
    name: "AERO/WETH pool",
    address: AERO_PRICE_POOLS.weth,
    reads: "its reserves, to price AERO in WETH.",
  },
  { name: "Each token", reads: "its symbol and decimals, and the pool's balance of it." },
];

const reads: InfoReads = {
  contracts: contracts as [InfoReadContract, ...InfoReadContract[]],
  how: "Rails's server reads these contracts at the block current when you open a page, and at a block 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again. The Voter's list of gauges is kept for a day.",
  notes: [
    "A gauge keeps no record of which wallet staked a position, so Rails reads the few blocks around the stake for the gauge's deposit events to name that wallet.",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      guide={GUIDE_NO_LEARN_MORE}
      session="aerodrome"
      tracks={
        <>
          The Rails Aerodrome explorer shows a wallet&apos;s Aerodrome Slipstream liquidity positions on Base, staked or
          not. For each one it shows the position&apos;s range, its fees or AERO, and its pool over the last 30 days.
        </>
      }
      notCovered="Aerodrome's basic pools, its AERO locks and its voting aren't covered here."
      glossary={glossary}
      howItWorks={howItWorks}
      reads={reads}
      views={views}
      docsAndChain={AERODROME_DOCS_AND_CHAIN}
      docs={DOCS}
    />
  );
}
