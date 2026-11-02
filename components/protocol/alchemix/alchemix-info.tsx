// The Alchemix explorer's /info page, shared by both chains and drawn on the
// typed template (rails-ops standards/info-page-template.md). The deployment
// decides which lines and tabs it names, so neither chain describes the other's.
// Every link is docs.alchemix.fi, checked 200 with its anchor on 2026-11-02.

import Link from "next/link";
import {
  GlossaryLink,
  ProtocolInfoPage,
  type InfoDocLink,
  type InfoTerm,
} from "@/components/shared/protocol-info-page";
import { transmuterListingPath, v2LinesForChain, v2ListingPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const DOCS = "https://docs.alchemix.fi";

const D = {
  borrow: { label: "Take a loan", href: `${DOCS}/user/tutorials/borrowing-in-alchemix` },
  borrowLimit: { label: "Key information", href: `${DOCS}/user/tutorials/borrowing-in-alchemix#key-information` },
  repays: { label: "What repays the debt", href: `${DOCS}/user/tutorials/borrowing-in-alchemix#what-repays-the-debt` },
  myt: { label: "The MYT", href: `${DOCS}/user/concepts/myt-and-yield#what-is-the-myt` },
  alAssets: { label: "alAssets", href: `${DOCS}/user/concepts/alAssets` },
  alUSDb: { label: "alUSDb on Base", href: `${DOCS}/user/concepts/alAssets#alusdb-on-base` },
  transmuter: { label: "The Transmuter", href: `${DOCS}/user/concepts/transmuter#how-transmutations-flow` },
  selfRepaying: { label: "Self-repaying loans", href: `${DOCS}/user/concepts/self-repaying-loans` },
  liquidation: { label: "Liquidations", href: `${DOCS}/user/concepts/liquidations#what-can-trigger-liquidation` },
} satisfies Record<string, InfoDocLink>;

const UL = "list-disc space-y-1 pl-5";

function and(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0];
}

export function AlchemixInfoPage({ deployment }: { deployment: AlchemixDeployment }) {
  const hasV2 = v2LinesForChain(deployment.chainId).length > 0;
  const lines = deployment.lines;
  const many = lines.length > 1;
  const lineNames = and(lines.map((l) => l.displayName));
  const chain = deployment.chainId === 1 ? "Ethereum" : "Base";
  const example = lines[0];
  const feePct = `${(lines[0].protocolFeeBps / 100).toString()}%`;
  const alusdb = lines.some((l) => l.key === "base-alusdb");
  const vaults = and([...new Set(lines.map((l) => `${l.myt} holds ${l.underlying}`))]);
  const synthKinds = lines.some((l) => l.underlying === "WETH")
    ? "alETH tracks the price of ETH, and the dollar tokens track the dollar."
    : "It tracks the dollar.";
  const synthetics = and(lines.map((l) => `${l.displayName} against ${l.underlying}`));

  const glossary: [InfoTerm, ...InfoTerm[]] = [
    {
      term: "Line",
      definition: `A line is one synthetic together with its collateral, and it has its own Alchemist and Transmuter. This explorer covers the ${lineNames} ${many ? "lines" : "line"}.`,
      sources: [D.selfRepaying],
    },
    {
      term: "Transmuter",
      definition:
        "The Transmuter is the contract where any holder of the synthetic can deposit that token to exchange it for MYT. A deposit converts a little every block, the chain's unit of time, until its term ends.",
      sources: [D.transmuter],
    },
    {
      term: "Set aside for repayment",
      definition:
        "Set-aside debt is the part of the debt that converting Transmuter deposits have repaid, shared across every open loan in proportion to what each owes.",
      sources: [D.transmuter, D.repays],
    },
    {
      term: "Redemption",
      definition:
        "A redemption is a depositor's claim in the Transmuter. It swaps the depositor's tokens for MYT taken from the collateral of the line's open loans, which repays the set-aside debt on all of them.",
      sources: [D.selfRepaying, D.transmuter],
    },
    {
      term: "MYT",
      definition: `An MYT is a token that stands for a share of a pool of one asset, which a Morpho vault lends out to earn a return (${vaults}). It is the collateral of a loan, and each line has its own. Its value rises as the pool earns and falls if the pool loses money.`,
      sources: [D.myt],
    },
    {
      term: "Alchemist",
      definition:
        "The Alchemist is the contract that holds a line's loans. Each loan is an NFT, so it can be transferred, and the wallet holding it may not be the one that opened it.",
      sources: [D.borrow],
    },
    {
      term: "Synthetic",
      definition: alusdb
        ? `A synthetic is the token a loan creates when it is opened, one for each unit of its debt: ${synthetics}. ${synthKinds} alUSDb is Base's synthetic dollar, a separate token from alUSD on Ethereum.`
        : `A synthetic is the token a loan creates when it is opened, one for each unit of its debt: ${synthetics}. ${synthKinds}`,
      sources: alusdb ? [D.alAssets, D.alUSDb] : [D.alAssets],
    },
    {
      term: "Collateralisation",
      definition:
        "Collateralisation is the collateral's value in the asset underneath, divided by the debt. If a falling share price takes it below the minimum the line requires, anyone can liquidate the loan, which takes enough of the holder's collateral to bring the loan back under its maximum. The rest of the collateral stays.",
      sources: [D.liquidation],
    },
  ];

  return (
    <ProtocolInfoPage
      session={deployment.session}
      name="Alchemix"
      tracks={
        <>
          The Rails Alchemix explorer shows every self-repaying Alchemix V3 loan on {chain}, on the {lineNames}{" "}
          {many ? "lines" : "line"}, and the history of each one. It also shows{" "}
          <Link href={transmuterListingPath(deployment)} className={INLINE_LINK}>
            the Transmuter
          </Link>
          , where deposits convert into collateral and repay those loans
          {hasV2 && (
            <>
              , and the{" "}
              <Link href={v2ListingPath(deployment)} className={INLINE_LINK}>
                closed V2 accounts
              </Link>
              , which are kept as a final record
            </>
          )}
          .
        </>
      }
      notCovered="Alchemix on other chains isn't covered here."
      glossary={glossary}
      howItWorks={[
        <>
          <GlossaryLink term="Line">A line</GlossaryLink> pairs a synthetic token with its collateral, the asset locked
          to back a loan. A loan on a line lets you borrow that token against the collateral, and it repays itself over
          time with no payments from the borrower. The repayment comes from the{" "}
          <GlossaryLink term="Transmuter">Transmuter</GlossaryLink>, where any holder of the token can deposit it to
          exchange it for collateral.
        </>,
        <>
          As deposits convert, the matching debt is{" "}
          <GlossaryLink term="Set aside for repayment">set aside</GlossaryLink> across every open loan, so each borrower
          shares the repayment in proportion to what they owe. When a depositor claims, a{" "}
          <GlossaryLink term="Redemption">redemption</GlossaryLink> swaps the depositor's tokens for collateral taken
          from the loans, which repays debt on all of them.
        </>,
        <>
          A loan has three parts, shown here on the {example.displayName} line:
          <ul className={`mt-1 ${UL}`}>
            <li>
              Collateral: {example.myt} (this line&apos;s <GlossaryLink term="MYT">MYT</GlossaryLink> token) deposited
              in the <GlossaryLink term="Alchemist">Alchemist</GlossaryLink>.
            </li>
            <li>
              Loan: {example.displayName} (the <GlossaryLink term="Synthetic">synthetic</GlossaryLink>) created against
              the collateral. You can borrow up to 90% of the deposit&apos;s value, the loan-to-value limit.
            </li>
            <li>
              Repayment: redemptions over time, or the holder paying back {example.displayName} or {example.myt} at any
              time.
            </li>
          </ul>
        </>,
        "The loan charges no interest. Its debt changes only when the holder borrows more or repays, or when a redemption clears part of it.",
        `Each redemption also charges a protocol fee of ${feePct} of the collateral that pays off the debt, taken from the borrowers' collateral and sent to Alchemix's fee receiver.`,
      ]}
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>
                <Link href={deployment.basePath} className={INLINE_LINK}>
                  Alchemist positions
                </Link>{" "}
                are the loans. Each loan has one row, with the debt and collateral the Alchemist states at a block, the
                chain's unit of time.
              </li>
              <li>
                <Link href={transmuterListingPath(deployment)} className={INLINE_LINK}>
                  Transmuter positions
                </Link>{" "}
                list the deposits that repay the loans. Each deposit has one row, with its amount, the block at which it
                finishes converting (its term ends) and what its claim paid. Claiming earlier pays out only the part
                converted so far, returns the unconverted tokens and charges an early exit fee.
              </li>
              {hasV2 && (
                <li>
                  <Link href={v2ListingPath(deployment)} className={INLINE_LINK}>
                    V2 positions
                  </Link>{" "}
                  are accounts on Alchemix V2, which closed on 2 April 2026 when its loans moved to V3. Each account
                  shows its final figures.
                </li>
              )}
            </ul>
          ),
        },
        {
          heading: "Position page",
          body: (
            <p>
              The card shows the loan&apos;s figures, read from the chain. The timeline lists each of its events,
              including every redemption that changed it.
            </p>
          ),
        },
        {
          heading: "Lines page",
          body: (
            <p>
              This page shows how many redemptions each line has had. A redemption changes every open loan of the line
              at once, so after a line&apos;s first redemption the explorer reads each loan&apos;s figures from the
              contract, because after a redemption a loan&apos;s own events no longer add up to its figures.
              <Link href={`${deployment.basePath}/lines`} className={INLINE_LINK}>
                See the lines
              </Link>{" "}
              to check how many redemptions each has had.
            </p>
          ),
        },
      ]}
      search={`You can search by wallet address, ENS name or loan id${hasV2 ? ", except on the V2 tab, which takes no id" : ""}. Each tab has its own filters and sorts.`}
      docs={{ label: "Alchemix documentation", href: DOCS }}
    />
  );
}
