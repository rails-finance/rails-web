// About this explorer — Balancer V3 on one chain (ui-jobs 569), drawn on the
// typed template (rails-ops standards/info-page-template.md). The contracts in
// "How Rails reads it" are the ones rails-server's balancer-at-block.ts reads
// and Rails's position index records (decision 0063 point 2).
// Each chain's /info page draws it.

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
import { BAL_CHAINS, type BalChainId } from "@/lib/balancer/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const DOCS = { label: "Balancer V3 documentation", href: "https://docs.balancer.fi" };
const VAULT_DOCS = { label: "The Vault", href: "https://docs.balancer.fi/concepts/vault/" };
const RATE_DOCS = {
  label: "Rate providers",
  href: "https://docs.balancer.fi/concepts/core-concepts/rate-providers.html",
};

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
    term: "Yield-bearing token",
    definition:
      "A yield-bearing token earns yield, so the amount of its underlying asset one token is worth grows. A pool counts it at that rate, which a rate provider contract reports.",
    sources: [RATE_DOCS],
  },
  {
    term: "Gauge",
    definition:
      "A gauge is a staking contract beside a pool. Shares staked in it are held by the gauge. Balancer's documentation says BAL emissions are halted and the gauge contracts are no longer used for them.",
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
    Each swap pays a fee, part of which stays in the pool, and some pools hold{" "}
    <GlossaryLink term="Yield-bearing token">tokens that earn yield</GlossaryLink>. Both raise what each share is worth
    in the pool&apos;s tokens.
  </>,
  <>
    Swaps change how much of each token the pool holds, so a holder&apos;s part of each token moves while their share of
    the pool stays the same.
  </>,
  <>
    Every figure is in the pool&apos;s own tokens. Balancer runs no USD feed, and Rails states no dollar figure here.
  </>,
  <>Rails does not forecast, rate or recommend.</>,
];

const views = (chainId: BalChainId): readonly [InfoView, ...InfoView[]] => [
  {
    heading: "A wallet's pools",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href={BAL_CHAINS[chainId].home} className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see the Balancer V3 pools that wallet holds a share of on {BAL_CHAINS[chainId].name}.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>
            Each row names the pool, the wallet&apos;s share of it and the pool&apos;s tokens, and opens the
            share&apos;s page.
          </li>
          <li>
            Shares the wallet staked in a pool&apos;s <GlossaryLink term="Gauge">gauge</GlossaryLink> show under the
            pool&apos;s row, with the gauge&apos;s address.
          </li>
          <li>
            The front door counts every pool share held on {BAL_CHAINS[chainId].name}: one holding for each address and
            pool, wallets and contracts both, since gauges and routers hold pool shares too.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Pool share page",
    body: (
      <p>
        The pool share page shows the wallet&apos;s share of the pool, its part of each token, any shares staked in the
        pool&apos;s gauge, how the pool&apos;s value per share moved over the last 30 days, and when the wallet first
        added. Under it, one line per measure compares the wallet and the pool now with 30 days back.
      </p>
    ),
  },
];

const contracts: InfoReadContract[] = [
  {
    name: "Vault",
    address: BALANCER_VAULT,
    reads:
      "a wallet's shares of a pool and all the pool's shares, the pool's tokens and its balance of each, its value per share, its swap fee and whether it is paused or in recovery; and from its events, every transfer of pool shares and the liquidity each wallet added or removed.",
  },
  { name: "Each pool", reads: "its name and symbol." },
  { name: "Each gauge", reads: "the pool it stakes and a wallet's staked shares." },
  { name: "Each token", reads: "its symbol and decimals." },
];

const reads = (chainId: BalChainId): InfoReads => ({
  contracts: contracts as [InfoReadContract, ...InfoReadContract[]],
  how: `Rails keeps an index of the Vault's events on ${BAL_CHAINS[chainId].name} from its first block: every transfer of pool shares, with each mint and burn, and every add and remove of liquidity. The figures are read live: Rails's server reads the Vault and the gauges at the block current when you open a page, and the Vault at ${chainId === 1 ? "a block 30 days back" : "the block at the UTC midnight 30 days back"}. A past block's answers are stored once that block is final, so a later visit reads only the newest block again. To find a wallet's pools, Rails looks up the transfers naming that wallet in the index, reads the Vault's logs from the index's last block to the current one, then reads each pool's share balance and gauge stake now.`,
  notes: [
    "A wallet that stakes its shares in a gauge sends them to the gauge, so the Vault counts them as the gauge's. Rails reads the gauges the index shows a wallet sending shares to, and counts a stake where the gauge's pool matches.",
  ],
});

export function BalancerInfo({ chainId }: { chainId: BalChainId }) {
  const chain = BAL_CHAINS[chainId];
  return (
    <ProtocolInfoPage
      session={chain.session}
      tracks={
        <>
          The Rails Balancer V3 explorer shows the Balancer V3 pools a wallet holds a share of on {chain.name}. For each
          one it shows the wallet&apos;s part of the pool&apos;s tokens and the pool over the last 30 days.
        </>
      }
      notCovered="Balancer V2 pools, gauge rewards and veBAL aren't covered here."
      glossary={glossary}
      howItWorks={howItWorks}
      reads={reads(chainId)}
      views={views(chainId)}
      docs={DOCS}
    />
  );
}
