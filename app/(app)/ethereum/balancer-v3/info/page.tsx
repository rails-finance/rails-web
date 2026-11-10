// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Balancer V3 on Ethereum (ui-jobs 569), drawn on the
// typed template (rails-ops standards/info-page-template.md). The contracts in
// "How Rails reads it" are the ones rails-server's balancer-at-block.ts reads.
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
} from "@/components/shared/protocol-info-page";
import { BALANCER_VAULT } from "@/lib/balancer/types";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { explorerHref } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("balancer-v3");

const DOCS = { label: "Balancer V3 documentation", href: "https://docs.balancer.fi" };
const VAULT_DOCS = { label: "The Vault", href: "https://docs.balancer.fi/concepts/vault/" };

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "Vault",
    definition:
      "The Vault is the one contract that holds every Balancer V3 pool's tokens and keeps the count of each pool's shares, on every chain at the same address.",
    sources: [VAULT_DOCS],
  },
  {
    term: "Pool",
    definition:
      "A pool is a set of two to eight tokens that traders swap between, priced by the pool's own formula. Its tokens sit in the Vault.",
    sources: [DOCS],
  },
  {
    term: "Pool share",
    definition:
      "A pool share (BPT, Balancer Pool Token) is a claim on a pool's tokens in proportion to all its shares. Adding liquidity mints shares; removing it burns them.",
    sources: [DOCS],
  },
  {
    term: "Gauge",
    definition:
      "A gauge is a contract beside a pool where holders stake their pool shares to earn BAL and other rewards. Staked shares are held by the gauge.",
    sources: [DOCS],
  },
  {
    term: "Recovery mode",
    definition:
      "Recovery mode is a pool state that lets every holder withdraw their tokens in proportion, without the pool's usual checks, if something in the pool fails.",
    sources: [DOCS],
  },
];

const howItWorks: readonly [ReactNode, ...ReactNode[]] = [
  <>
    A <GlossaryLink term="Pool">pool</GlossaryLink> keeps its tokens in the{" "}
    <GlossaryLink term="Vault">Vault</GlossaryLink>. A provider adds tokens and receives{" "}
    <GlossaryLink term="Pool share">pool shares</GlossaryLink>; removing liquidity hands the shares back for a part of
    each token.
  </>,
  <>
    Each swap pays a fee, part of which stays in the pool, and some pools hold tokens that earn yield. Both raise what
    each share is worth in the pool&apos;s tokens.
  </>,
  <>
    Swaps change how much of each token the pool holds, so a holder&apos;s part of each token moves while their share of
    the pool stays the same.
  </>,
  <>
    Every figure is in the pool&apos;s own tokens. Balancer runs no USD feed, and Rails states no dollar figure here.
  </>,
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's pools",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={explorerHref(1, "balancer-v3")} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see the Balancer V3 pools that wallet holds a share of on Ethereum.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>
            Each row names the pool, the wallet&apos;s share of it and the pool&apos;s tokens, and opens the
            share&apos;s page.
          </li>
          <li>
            Pools are found from the liquidity the wallet added. Pool shares it received by transfer, or staked in a{" "}
            <GlossaryLink term="Gauge">gauge</GlossaryLink>, are not found from its address.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Pool share page",
    body: (
      <p>
        The pool share page shows the wallet&apos;s share of the pool, its part of each token, how the pool&apos;s value
        per share moved over the last 30 days, and when the wallet first added. Under it, one line per measure compares
        the wallet and the pool now with 30 days back.
      </p>
    ),
  },
];

const contracts: InfoReadContract[] = [
  {
    name: "Vault",
    address: BALANCER_VAULT,
    reads:
      "a wallet's shares of a pool and all the pool's shares, the pool's tokens and its balance of each, its value per share, its swap fee and whether it is paused or in recovery; and the liquidity a wallet added or removed, from the Vault's events.",
  },
  { name: "Each pool", reads: "its name and symbol." },
  { name: "Each token", reads: "its symbol and decimals." },
];

const reads: InfoReads = {
  contracts: contracts as [InfoReadContract, ...InfoReadContract[]],
  how: "Rails's server reads the Vault at the block current when you open a page, and at a block 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again. To find a wallet's pools, Rails reads the Vault's record of the liquidity that wallet added since the Vault's first block, then each pool's share balance now.",
  notes: [
    "The Vault records each add with the wallet that received the shares, so one search of its events finds a wallet's pools. A transfer of shares between wallets is not in that record, and a gauge holds the shares staked in it.",
  ],
};

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="balancer-v3"
      tracks={
        <>
          The Rails Balancer V3 explorer shows the Balancer V3 pools a wallet holds a share of on Ethereum. For each one
          it shows the wallet&apos;s part of the pool&apos;s tokens and the pool over the last 30 days.
        </>
      }
      notCovered="Balancer V2 pools, gauges and staked shares, BAL rewards and veBAL aren't covered here."
      glossary={glossary}
      howItWorks={howItWorks}
      reads={reads}
      views={views}
      docs={DOCS}
    />
  );
}
