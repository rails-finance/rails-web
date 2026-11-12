// About this explorer — Lido on Ethereum (ui-jobs 570), drawn on the typed
// template (rails-ops standards/info-page-template.md). The contracts in "How
// Rails reads it" are the ones rails-server's lido-at-block.ts reads.

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
import { STETH, WITHDRAWAL_QUEUE, WSTETH } from "@/lib/lido/types";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const DOCS = { label: "Lido documentation", href: "https://docs.lido.fi" };
const STETH_DOCS = { label: "stETH and wstETH", href: "https://docs.lido.fi/guides/lido-tokens-integration-guide" };
const QUEUE_DOCS = { label: "Withdrawals", href: "https://docs.lido.fi/contracts/withdrawal-queue-erc721" };

const UL = "list-disc space-y-1 pl-5";

const glossary: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "stETH",
    definition:
      "stETH is Lido's staked ether token. Its balance is shown in ETH and moves at each oracle report, while the holder's shares stay the same.",
    sources: [STETH_DOCS],
  },
  {
    term: "Share",
    definition:
      "Lido counts each holder's stake in shares of all the ether it accounts for. A holder's stETH balance is their shares times the share rate.",
    sources: [STETH_DOCS],
  },
  {
    term: "Share rate",
    definition:
      "The share rate is the ETH one share is worth: all the ether Lido accounts for over all shares. Lido's oracle moves it when it reports the validators' balances, about once a day. It normally rises; slashing or penalties can lower it.",
    sources: [DOCS],
  },
  {
    term: "wstETH",
    definition:
      "wstETH is stETH wrapped into a token that counts shares: one wstETH is one share, so its count stays the same while its worth in ETH moves.",
    sources: [STETH_DOCS],
  },
  {
    term: "Withdrawal request",
    definition:
      "A withdrawal request locks stETH in Lido's withdrawal queue, as an NFT owned by the wallet that made it. An oracle report finalizes it once there is ether to pay it; then the owner claims the ETH with a transaction, at most the stETH locked when the request was made.",
    sources: [QUEUE_DOCS],
  },
];

const howItWorks: readonly [ReactNode, ...ReactNode[]] = [
  <>
    A holder stakes ETH with Lido and receives <GlossaryLink term="stETH">stETH</GlossaryLink>. Lido records the stake
    as <GlossaryLink term="Share">shares</GlossaryLink>.
  </>,
  <>
    About once a day Lido&apos;s oracle reports the validators&apos; balances, and the{" "}
    <GlossaryLink term="Share rate">share rate</GlossaryLink> moves with the rewards. Every holder&apos;s stETH moves
    with it.
  </>,
  <>
    <GlossaryLink term="wstETH">wstETH</GlossaryLink> holds the same shares under a balance that does not change, so its
    worth in ETH moves instead.
  </>,
  <>
    To leave, a holder makes a <GlossaryLink term="Withdrawal request">withdrawal request</GlossaryLink>; once it is
    finalized, the ETH can be claimed.
  </>,
  <>Every figure is in ETH at Lido&apos;s share rate. Rails states no dollar figure here.</>,
  <>Rails does not forecast, rate or recommend.</>,
];

const views: readonly [InfoView, ...InfoView[]] = [
  {
    heading: "A wallet's stake",
    body: (
      <>
        <p>
          Enter a wallet address or ENS name on the{" "}
          <Link href="/ethereum/lido" className={INLINE_LINK}>
            front door
          </Link>{" "}
          to see that wallet&apos;s Lido stake on Ethereum.
        </p>
        <ul className={`${UL} mt-2`}>
          <li>The card states the stake in ETH, its stETH and wstETH apart, and the share rate.</li>
          <li>
            Under it, the stake 30 days back: the shares then and now, with the withdrawal requests that account for a
            change, the share rate then and now, and what the shares earned at the rate&apos;s change.
          </li>
          <li>
            Then the wallet&apos;s withdrawal requests: each one&apos;s stETH, when it was made, and whether it waits or
            is ready to claim.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Lido now",
    body: (
      <p>
        The front door states the ether Lido accounts for, all shares, the share rate and its change over 30 days, and
        the stETH waiting in the withdrawal queue.
      </p>
    ),
  },
];

const contracts: [InfoReadContract, ...InfoReadContract[]] = [
  {
    name: "stETH",
    address: STETH,
    reads:
      "a wallet's shares and stETH balance, the ETH a number of shares is worth, all the ether Lido accounts for, and all shares.",
  },
  { name: "wstETH", address: WSTETH, reads: "a wallet's wstETH balance." },
  {
    name: "WithdrawalQueueERC721",
    address: WITHDRAWAL_QUEUE,
    reads:
      "the withdrawal requests a wallet owns, each one's status, the ETH a finalized one pays on claim, and the stETH the queue has not finalized.",
  },
];

const reads: InfoReads = {
  contracts,
  how: "Rails's server reads these contracts at the block current when you open a page, and at a block 30 days back. A past block's answers are stored once that block is final, so a later visit reads only the newest block again. A wallet's withdrawal requests are listed by the queue for their owner, so Rails reads no events.",
  notes: [
    "Earnings over 30 days are stated only where the wallet's shares are the same at both reads; a stake opened or changed inside the window says so instead.",
    "The share rate moves only at each oracle report, so a figure read between two reports stands at the last report's rate.",
  ],
};

export function LidoInfo() {
  return (
    <ProtocolInfoPage
      session="lido"
      tracks={
        <>
          The Rails Lido explorer shows a wallet&apos;s Lido stake on Ethereum: its stETH and wstETH in ETH, how the
          stake changed over the last 30 days, and its withdrawal requests.
        </>
      }
      guide={
        <>
          Press a figure&apos;s label to read what it means. The (i) under a section says what its figures mean for the
          wallet; open the stake card&apos;s (i), and the ? at its end opens &ldquo;How Lido staking works&rdquo;. A
          section&apos;s ⋮ traces its figures to the chain.
        </>
      }
      notCovered="stVaults (Lido V3's separate vaults, where a staker chooses its own node operator), Lido on other chains, node operators and the LDO token aren't covered here."
      glossary={glossary}
      howItWorks={howItWorks}
      reads={reads}
      views={views}
      docs={DOCS}
    />
  );
}
