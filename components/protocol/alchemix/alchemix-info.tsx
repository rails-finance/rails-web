// The Alchemix explorer's /info page, shared by both chains and drawn on the
// typed template (rails-ops standards/info-page-template.md). The deployment
// decides which lines and tabs it names, so neither chain describes the other's.
// Every link is docs.alchemix.fi, checked 200 with its anchor on 2026-11-02.

import Link from "next/link";
import { ProtocolInfoPage, type InfoDocLink, type InfoTerm } from "@/components/shared/protocol-info-page";
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
  const synthetics = and(lines.map((l) => `${l.displayName} against ${l.underlying}`));

  const glossary: [InfoTerm, ...InfoTerm[]] = [
    {
      term: "MYT",
      definition: `The collateral: a share in a Morpho vault that lends out an asset and earns on it (${vaults}). Its value rises as the vault earns and falls if it loses.`,
      sources: [D.myt],
    },
    {
      term: "Synthetic",
      definition: alusdb
        ? `The token a loan mints, one for one against its debt: ${synthetics}. alUSDb is Base's synthetic dollar, a separate token from alUSD on Ethereum.`
        : `The token a loan mints, one for one against its debt: ${synthetics}.`,
      sources: alusdb ? [D.alAssets, D.alUSDb] : [D.alAssets],
    },
    {
      term: "Alchemist",
      definition:
        "The contract that holds a line's loans. Each loan is an NFT, so the wallet holding it may not be the one that opened it.",
      sources: [D.borrow],
    },
    {
      term: "Transmuter",
      definition:
        "The contract where any holder of the synthetic deposits it to turn it back into MYT. A deposit converts a little every block until its term ends.",
      sources: [D.transmuter],
    },
    {
      term: "Set aside for repayment",
      definition:
        "The debt matched to Transmuter deposits as they convert, spread across every open loan by what each owes. Alchemix calls it earmarked debt.",
      sources: [D.transmuter, D.repays],
    },
    {
      term: "Redemption",
      definition:
        "A Transmuter claim clearing the set-aside debt on every open loan of the line, paid with MYT taken from each loan's collateral.",
      sources: [D.selfRepaying, D.transmuter],
    },
    {
      term: "Line",
      definition: `A synthetic and its collateral, with their own Alchemist and Transmuter. This explorer covers the ${lineNames} ${many ? "lines" : "line"}.`,
      sources: [D.selfRepaying],
    },
    {
      term: "Collateralisation",
      definition:
        "The collateral's value in the asset underneath divided by the debt. If a falling share price takes it below the line's liquidation line, anyone can liquidate the loan.",
      sources: [D.liquidation],
    },
  ];

  return (
    <ProtocolInfoPage
      session={deployment.session}
      name="Alchemix"
      tracks={`Every Alchemix V3 loan on ${chain}, on the ${lineNames} ${many ? "lines" : "line"}, and the Transmuter deposits that repay them.${hasV2 ? " The closed V2 accounts are kept as a final record." : ""} Alchemix on other chains is not shown here.`}
      glossary={glossary}
      howItWorks={[
        "The Transmuter repays the loans. As deposits in it convert, debt is set aside across every open loan, and each claim clears it in a redemption.",
        <>
          A loan has three parts, shown here on the {example.displayName} line:
          <ul className={`mt-1 ${UL}`}>
            <li>Collateral: {example.myt} deposited in the Alchemist.</li>
            <li>Loan: {example.displayName} minted against it, up to 90% of the deposit&apos;s value.</li>
            <li>
              Repayment: redemptions over time, or the holder paying back {example.displayName} or {example.myt} at any
              time.
            </li>
          </ul>
        </>,
        "The loan charges no interest. Its debt changes only when the holder mints or repays, or a redemption clears part of it.",
        `Each redemption takes the line's fee from the collateral on top of the debt it clears: ${feePct} on ${chain}.`,
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
                are the loans: one row each, with the debt and collateral the Alchemist states at a block.
              </li>
              <li>
                <Link href={transmuterListingPath(deployment)} className={INLINE_LINK}>
                  Transmuter positions
                </Link>{" "}
                are the repayments: one row per deposit, with the amount, the block it matures at and what its claim
                paid. A claim before then converts the matured part and hands the rest back, less an early exit fee.
              </li>
              {hasV2 && (
                <li>
                  <Link href={v2ListingPath(deployment)} className={INLINE_LINK}>
                    V2 positions
                  </Link>{" "}
                  are accounts on Alchemix V2, which closed on 2 April 2026 when its loans moved to V3. Each shows its
                  final figures.
                </li>
              )}
            </ul>
          ),
        },
        {
          heading: "Position page",
          body: (
            <p>
              The card states the position&apos;s figures read from the chain. The timeline lists each of its events,
              including every redemption that moved it.
            </p>
          ),
        },
        {
          heading: "Lines page",
          body: (
            <p>
              For each line, the number of redemptions it has had and how the explorer gets its figures. A line with
              none is replayed from each loan&apos;s events; from the first redemption on, figures are read from the
              contract at a block.{" "}
              <Link href={`${deployment.basePath}/lines`} className={INLINE_LINK}>
                See the lines
              </Link>
              .
            </p>
          ),
        },
      ]}
      search={`Search takes a wallet address, an ENS name or a position id${hasV2 ? "; the V2 tab takes no id" : ""}. Each tab has its own filters and sorts.`}
      docs={{ label: "Alchemix documentation", href: DOCS }}
    />
  );
}
