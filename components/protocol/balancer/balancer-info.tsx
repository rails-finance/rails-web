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
    term: "BPT",
    definition:
      "BPT, the Balancer Pool Token, is a share of a pool: a claim on the pool's tokens in proportion to the BPT total supply. Adding liquidity mints BPT; removing it burns them.",
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
      "A gauge is a staking contract beside a pool. BPT staked in it is held by the gauge. Balancer's documentation says BAL emissions are halted and the gauge contracts are no longer used for them.",
    sources: [DOCS],
  },
  {
    term: "Recovery mode",
    definition:
      "Recovery mode is a pool state that lets every liquidity provider withdraw their tokens in proportion, without the pool's usual checks, if something in the pool fails.",
    sources: [DOCS],
  },
];

const howItWorks: readonly [ReactNode, ...ReactNode[]] = [
  <>
    A <GlossaryLink term="Pool">pool</GlossaryLink> keeps its tokens in the{" "}
    <GlossaryLink term="Vault">Vault</GlossaryLink>. A provider adds tokens and receives{" "}
    <GlossaryLink term="BPT">BPT</GlossaryLink>; removing liquidity hands the BPT back for a part of each token.
  </>,
  <>
    Each swap pays a fee, part of which stays in the pool, and some pools hold{" "}
    <GlossaryLink term="Yield-bearing token">tokens that earn yield</GlossaryLink>. Both raise what each share is worth
    in the pool&apos;s tokens.
  </>,
  <>
    Swaps change how much of each token the pool holds, so a liquidity provider&apos;s part of each token moves while
    their share of the pool stays the same.
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
            BPT the wallet staked in a pool&apos;s <GlossaryLink term="Gauge">gauge</GlossaryLink> show under the
            pool&apos;s row, with the gauge&apos;s address.
          </li>
          <li>
            The front door counts every BPT holding on {BAL_CHAINS[chainId].name}: one for each address and pool,
            wallets and contracts both, since gauges and routers hold BPT too.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "BPT page",
    body: (
      <p>
        The BPT page shows the wallet&apos;s share of the pool, its part of each token, any BPT staked in the
        pool&apos;s gauge, how the BPT rate moved over the last 30 days, and when the wallet first added. Under it, a
        table sets the wallet and the pool now beside 30 days back.
      </p>
    ),
  },
];

const contracts: InfoReadContract[] = [
  {
    name: "Vault",
    address: BALANCER_VAULT,
    reads:
      "a wallet's BPT in a pool and the BPT total supply, the pool's tokens and its balance of each, its BPT rate, its swap fee and whether it is paused or in recovery; and from its events, every transfer of BPT and the liquidity each wallet added or removed.",
  },
  { name: "Each pool", reads: "its name and symbol." },
  { name: "Each gauge", reads: "the pool it stakes and a wallet's staked BPT." },
  { name: "Each token", reads: "its symbol and decimals." },
];

const reads = (chainId: BalChainId): InfoReads => ({
  contracts: contracts as [InfoReadContract, ...InfoReadContract[]],
  how: `Rails keeps an index of the Vault's events on ${BAL_CHAINS[chainId].name} from its first block: every transfer of BPT, with each mint and burn, and every add and remove of liquidity. The figures are read live: Rails's server reads the Vault and the gauges at the block current when you open a page, and the Vault at ${chainId === 1 ? "a block 30 days back" : "the block at the UTC midnight 30 days back"}. A past block's answers are stored once that block is final, so a later visit reads only the newest block again. To find a wallet's pools, Rails looks up the transfers naming that wallet in the index, reads the Vault's logs from the index's last block to the current one, then reads each pool's share balance and gauge stake now.`,
  notes: [
    "A wallet that stakes its BPT in a gauge sends it to the gauge, so the Vault counts it as the gauge's. Rails reads the gauges the index shows a wallet sending BPT to, and counts a stake where the gauge's pool matches.",
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
