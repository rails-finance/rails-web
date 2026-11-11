// About this explorer — Uniswap V3 and V4 on Ethereum, Base and Arbitrum, and
// PancakeSwap V3 on Base and Arbitrum (ui-jobs 567, 568, 573, 575), drawn on
// the typed template (rails-ops standards/info-page-template.md). One page for
// every version and chain: they differ in the contracts Rails reads, V4's
// hooks, PancakeSwap's farm, and whether the chain's reads include a
// position's history. The glossary links each protocol's documentation; the
// contracts in "How Rails reads it" are the ones rails-server's
// uniswap-at-block.ts reads.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReads,
  type InfoTerm,
  type InfoView,
} from "@/components/shared/protocol-info-page";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { uniExplorer, type UniChainId, type UniDeployment, type UniProtocol } from "@/lib/uniswap/deployments";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { versionLabel } from "@/lib/uniswap/words";

const DOCS = "https://developers.uniswap.org/docs";
const CONCENTRATED = {
  label: "Concentrated liquidity",
  href: `${DOCS}/get-started/concepts/liquidity-providers/concentrated-liquidity`,
};
const FEES = { label: "Fees", href: `${DOCS}/get-started/concepts/fees` };
const HOOKS = { label: "Hooks", href: `${DOCS}/protocols/v4/concepts/hooks` };
const POOL_MANAGER = { label: "PoolManager", href: `${DOCS}/protocols/v4/concepts/poolmanager` };
const CAKE_DOCS = "https://docs.pancakeswap.finance";
const CAKE_LIQUIDITY = { label: "Liquidity pools", href: `${CAKE_DOCS}/earn/pancakeswap-pools/liquidity-guide` };
const CAKE_FARMS = { label: "Yield farming", href: `${CAKE_DOCS}/earn/yield-farming` };
const CAKE_APR = {
  label: "How V3 APR is calculated",
  href: `${CAKE_DOCS}/welcome-to-pancakeswap/how-to-guides/v3-v2-migration/how-v3-apr-is-calculated`,
};

const UL = "list-disc space-y-1 pl-5";

function glossary(version: UniswapVersion, d: UniDeployment): readonly [InfoTerm, ...InfoTerm[]] {
  if (d.protocol === "pancakeswap")
    return [
      {
        term: "Position",
        definition:
          "A position is liquidity one provider has placed in a pool between two prices. It holds the pool's two tokens and is an NFT, a token its owner's wallet holds.",
        sources: [CAKE_LIQUIDITY],
      },
      {
        term: "Range",
        definition:
          "A position's range is its lower and upper price. The position earns fees only while the pool's price sits inside it.",
        sources: [CAKE_LIQUIDITY],
      },
      {
        term: "Swap fee",
        definition: "The swap fee is a share of every trade, paid to the liquidity in range at the moment of the swap.",
        sources: [CAKE_APR],
      },
      {
        term: "Uncollected fees",
        definition:
          "Fees a position has earned wait in the position until its owner collects them, and are not added to its liquidity.",
        sources: [CAKE_APR],
      },
      {
        term: "Farm",
        definition:
          "PancakeSwap's farm pays CAKE to positions staked in it while they are in range. A staked position keeps earning its swap fees, and the farm holds its NFT for the wallet that staked it.",
        sources: [CAKE_FARMS, CAKE_APR],
      },
    ];
  return [
    {
      term: "Position",
      definition:
        "A position is liquidity one provider has placed in a pool between two prices. It holds the pool's two tokens and is an NFT, a token its owner's wallet holds.",
      sources: [CONCENTRATED],
    },
    {
      term: "Range",
      definition:
        "A position's range is its lower and upper price. The position earns fees only while the pool's price sits inside it.",
      sources: [CONCENTRATED],
    },
    {
      term: "Swap fee",
      definition: "The swap fee is a share of every trade, paid to the liquidity in range at the moment of the swap.",
      sources: [FEES],
    },
    {
      term: "Uncollected fees",
      definition:
        "Fees a position has earned wait in the position until its owner collects them, and are not added to its liquidity.",
      sources: [FEES],
    },
    ...(version === "v4"
      ? [
          {
            term: "PoolManager",
            definition: "The PoolManager is the one Uniswap V4 contract that holds every pool and its state.",
            sources: [POOL_MANAGER] as const,
          },
          {
            term: "Hook",
            definition:
              "A hook is a contract attached to one pool, which the pool calls on each action it has permission for, such as a swap or a withdrawal.",
            sources: [HOOKS] as const,
          },
        ]
      : []),
  ];
}

function howItWorks(version: UniswapVersion, d: UniDeployment): readonly [ReactNode, ...ReactNode[]] {
  const label = versionLabel(version, d.protocol);
  return [
    <>
      A {label} pool holds two tokens and prices one in the other. A provider deposits both into a{" "}
      <GlossaryLink term="Position">position</GlossaryLink> with a <GlossaryLink term="Range">range</GlossaryLink>, a
      lower and an upper price. Outside its range a position holds only one of the two tokens and earns nothing.
    </>,
    <>
      Each swap pays the pool&apos;s <GlossaryLink term="Swap fee">swap fee</GlossaryLink> to the liquidity in range at
      that moment. The fees wait in the position as{" "}
      <GlossaryLink term="Uncollected fees">uncollected fees</GlossaryLink> until its owner collects them.
    </>,
    ...(version === "v4"
      ? [
          <>
            Every {label} pool lives in one contract, the <GlossaryLink term="PoolManager">PoolManager</GlossaryLink>. A
            pool may have a <GlossaryLink term="Hook">hook</GlossaryLink>, which can set a dynamic fee that changes from
            swap to swap.
          </>,
        ]
      : []),
    ...(d.masterChef
      ? [
          <>
            A provider may stake a position in PancakeSwap&apos;s <GlossaryLink term="Farm">farm</GlossaryLink>, which
            pays CAKE on top of the swap fees while the position is in range. The farm holds the position&apos;s NFT,
            and only the wallet that staked it can harvest, collect, withdraw or unstake.
          </>,
        ]
      : []),
    <>
      Every figure is in the pool&apos;s quote token, the one it prices the other in, at the pool&apos;s price.{" "}
      {d.protocolName} runs no dollar price feed, so Rails states no dollar figure here
      {d.masterChef ? "; CAKE is stated in CAKE" : ""}.
    </>,
  ];
}

function views(version: UniswapVersion, d: UniDeployment): readonly [InfoView, ...InfoView[]] {
  const label = versionLabel(version, d.protocol);
  const otherVersion: UniswapVersion = version === "v3" ? "v4" : "v3";
  const other = d.versions.includes(otherVersion) ? versionLabel(otherVersion, d.protocol) : null;
  return [
    {
      heading: "A wallet's positions",
      body: (
        <>
          <p>
            Enter a wallet address or ENS name on the{" "}
            <Link href={uniExplorer(d.protocol, d.chainId, version).route} className={INLINE_LINK}>
              front door
            </Link>{" "}
            to see that wallet&apos;s {label} positions that hold liquidity, newest first. A wallet with more than 200
            shows the newest 200{other ? `, and the page also counts its ${other} positions` : ""}.
            {d.masterChef ? " The positions the wallet staked in the farm are listed with it, marked staked." : ""}
          </p>
          <ul className={`${UL} mt-2`}>
            <li>Each row names the position&apos;s number, its two tokens and its fee.</li>
            <li>Each row opens the position&apos;s page.</li>
          </ul>
        </>
      ),
    },
    {
      heading: "Position page",
      body: (
        <p>
          The position page shows the two tokens the position holds now, their worth in the quote token, its fees not
          yet collected{d.masterChef ? ", its CAKE not yet harvested where it is staked" : ""}
          {d.history ? " and the day it opened" : ""}, with its range drawn against the price. Under it,{" "}
          {d.masterChef ? "seven" : "six"} lines compare the position with its pool over the last 30 days: range, fees,
          {d.masterChef ? " CAKE," : ""} against holding, size, withdrawals and steward.
        </p>
      ),
    },
  ];
}

function reads(version: UniswapVersion, d: UniDeployment): InfoReads {
  const how =
    "Rails's server reads these contracts at the block current when you open a page, and at a block 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.";
  // Base's keyless gateway answers no log filter over its whole life, so there Rails reads no
  // position's events: no deposits, no "since its first deposit" and no opening day.
  const notes = d.history
    ? undefined
    : ([
        <>
          On {d.chainName}, Rails does not read a position&apos;s events yet, so a position page shows no opening day
          and no figure since its first deposit.
        </>,
      ] as const);
  if (version === "v3")
    return {
      contracts: [
        {
          name: "NonfungiblePositionManager",
          address: d.v3Npm,
          reads: d.history
            ? "each position's owner, pool, range, liquidity and fees owed; a wallet's positions, by its balance and their index; and a position's deposits, withdrawals and fee collections, from its events."
            : "each position's owner, pool, range, liquidity and fees owed; and a wallet's positions, by its balance and their index.",
        },
        ...(d.masterChef
          ? [
              {
                name: "MasterChefV3",
                address: d.masterChef,
                reads:
                  "whether it holds a position, the wallet that staked it and its CAKE not yet harvested; and a wallet's staked positions, by its balance and their index.",
              },
            ]
          : []),
        {
          name: "Each pool",
          reads: "its price, its liquidity in range, its fee growth, and the ticks at the position's two range edges.",
        },
        { name: "Each token", reads: "its symbol and decimals, and the pool's balance of it." },
      ],
      how,
      ...(notes ? { notes } : {}),
    };
  return {
    contracts: [
      {
        name: "PositionManager",
        address: d.v4PositionManager ?? "",
        reads:
          "each position's owner, its pool (two tokens, fee, tick spacing and hook) and its liquidity; a wallet's positions, from the position NFTs sent to it, each checked against its current owner.",
      },
      {
        name: "StateView",
        address: d.v4StateView ?? "",
        reads:
          "each pool's price, fee, liquidity in range and fee growth, and the position's fee growth inside its range.",
      },
      { name: "Each token", reads: "its symbol and decimals." },
    ],
    how,
    // Arc (ui-jobs 577): a V4 pool's address(0) side is the chain's gas coin, USDC there.
    ...(d.native.symbol !== "ETH"
      ? {
          notes: [
            <>
              On {d.chainName}, {d.native.symbol} is the gas coin. A V4 pool can hold it as the chain&apos;s native
              coin, counted in {d.native.decimals} decimals, or through its ERC-20 at {d.wrapped.address}, counted in{" "}
              {d.wrapped.decimals}. The two are one balance, and Rails names both {d.native.symbol}.
            </>,
          ] as const,
        }
      : {}),
  };
}

export function UniswapInfoPage({
  version,
  protocol = "uniswap",
  chainId = 1,
}: {
  version: UniswapVersion;
  protocol?: UniProtocol;
  chainId?: UniChainId;
}) {
  const x = uniExplorer(protocol, chainId, version);
  const d = x.deployment;
  const label = versionLabel(version, protocol);
  return (
    <ProtocolInfoPage
      session={x.id as SessionProtocol}
      tracks={
        <>
          The Rails {label} explorer shows a wallet&apos;s {label} liquidity positions on {d.chainName}
          {d.masterChef ? ", staked in PancakeSwap's farm or not" : ""}. For each one it shows the position&apos;s
          range, its fees and its pool over the last 30 days.
        </>
      }
      notCovered={`${label} on other chains isn't covered here.`}
      glossary={glossary(version, d)}
      howItWorks={howItWorks(version, d)}
      reads={reads(version, d)}
      views={views(version, d)}
      docs={
        protocol === "pancakeswap"
          ? { label: "PancakeSwap documentation", href: CAKE_DOCS }
          : { label: `${label} documentation`, href: `${DOCS}/protocols/${version}/overview` }
      }
    />
  );
}
