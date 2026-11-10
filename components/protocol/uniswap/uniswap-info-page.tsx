// About this explorer — Uniswap V3 and V4 on Ethereum (ui-jobs 567), drawn on
// the typed template (rails-ops standards/info-page-template.md). One page for
// both versions: they differ in the contracts Rails reads and in V4's hooks.
// The glossary links Uniswap's developer documentation; the contracts in
// "How Rails reads it" are the ones rails-server's uniswap-at-block.ts reads.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoReads,
  type InfoTerm,
  type InfoView,
} from "@/components/shared/protocol-info-page";
import { explorerHref } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { UNISWAP_CONTRACTS } from "@/lib/uniswap/provenance";
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

const UL = "list-disc space-y-1 pl-5";

function glossary(version: UniswapVersion): readonly [InfoTerm, ...InfoTerm[]] {
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

function howItWorks(version: UniswapVersion): readonly [ReactNode, ...ReactNode[]] {
  const label = versionLabel(version);
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
    <>
      Every figure is in the pool&apos;s quote token, the one it prices the other in, at the pool&apos;s price. Uniswap
      runs no dollar price feed, so Rails states no dollar figure here.
    </>,
  ];
}

function views(version: UniswapVersion): readonly [InfoView, ...InfoView[]] {
  const label = versionLabel(version);
  const other = versionLabel(version === "v3" ? "v4" : "v3");
  return [
    {
      heading: "A wallet's positions",
      body: (
        <>
          <p>
            Enter a wallet address or ENS name on the{" "}
            <Link href={explorerHref(1, `uniswap-${version}`)} className={INLINE_LINK}>
              front door
            </Link>{" "}
            to see that wallet&apos;s {label} positions that hold liquidity, newest first. A wallet with more than 200
            shows the newest 200, and the page also counts its {other} positions.
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
          yet collected and the day it opened, with its range drawn against the price. Under it, six lines compare the
          position with its pool over the last 30 days: range, fees, against holding, size, withdrawals and steward.
        </p>
      ),
    },
  ];
}

function reads(version: UniswapVersion): InfoReads {
  const how =
    "Rails's server reads these contracts at the block current when you open a page, and at a block 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again.";
  if (version === "v3")
    return {
      contracts: [
        {
          name: "NonfungiblePositionManager",
          address: UNISWAP_CONTRACTS.v3Npm,
          reads:
            "each position's owner, pool, range, liquidity and fees owed; a wallet's positions, by its balance and their index; and a position's deposits, withdrawals and fee collections, from its events.",
        },
        {
          name: "Each pool",
          reads: "its price, its liquidity in range, its fee growth, and the ticks at the position's two range edges.",
        },
        { name: "Each token", reads: "its symbol and decimals, and the pool's balance of it." },
      ],
      how,
    };
  return {
    contracts: [
      {
        name: "PositionManager",
        address: UNISWAP_CONTRACTS.v4PositionManager,
        reads:
          "each position's owner, its pool (two tokens, fee, tick spacing and hook) and its liquidity; a wallet's positions, from the position NFTs sent to it, each checked against its current owner.",
      },
      {
        name: "StateView",
        address: UNISWAP_CONTRACTS.v4StateView,
        reads:
          "each pool's price, fee, liquidity in range and fee growth, and the position's fee growth inside its range.",
      },
      { name: "Each token", reads: "its symbol and decimals." },
    ],
    how,
  };
}

export function UniswapInfoPage({ version }: { version: UniswapVersion }) {
  const label = versionLabel(version);
  return (
    <ProtocolInfoPage
      session={version === "v3" ? "uniswap-v3" : "uniswap-v4"}
      tracks={
        <>
          The Rails {label} explorer shows a wallet&apos;s {label} liquidity positions on Ethereum. For each one it
          shows the position&apos;s range, its fees and its pool over the last 30 days.
        </>
      }
      notCovered={`${label} on other chains isn't covered here.`}
      glossary={glossary(version)}
      howItWorks={howItWorks(version)}
      reads={reads(version)}
      views={views(version)}
      docs={{
        label: `${label} documentation`,
        href: `${DOCS}/protocols/${version}/overview`,
      }}
    />
  );
}
