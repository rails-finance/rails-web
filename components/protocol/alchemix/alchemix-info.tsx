// The Alchemix explorer's /info prose, shared by both chains: what the protocol
// is, then what each listing tab holds. The deployment decides which lines and
// tabs it names, so neither chain describes the other's.

import Link from "next/link";
import { transmuterListingPath, v2LinesForChain, v2ListingPath, type AlchemixDeployment } from "@/lib/alchemix/lines";

const LINK = "text-blue-500 hover:underline";

export function AlchemixInfo({ deployment }: { deployment: AlchemixDeployment }) {
  const hasV2 = v2LinesForChain(deployment.chainId).length > 0;
  const lineNames = deployment.lines.map((l) => l.displayName);
  const linesText =
    lineNames.length > 1 ? `${lineNames.slice(0, -1).join(", ")} and ${lineNames.at(-1)}` : lineNames[0];
  return (
    <>
      <p>
        Alchemix lends a synthetic token against a vault share. A borrower deposits a MYT, a share in a Morpho vault
        that lends the asset out and earns on it (mixUSDC holds USDC, mixWETH holds WETH), and mints the matching
        synthetic against it: alUSD against USDC, alETH against WETH, up to 90% of the collateral&apos;s value. The loan
        charges no interest. It is repaid over time by the line&apos;s Transmuter, where holders of the synthetic stake
        it to turn it back into vault shares; as their stakes mature, the Alchemist sets debt aside across every open
        position and clears it when they claim. That clearing is a redemption.
      </p>
      <p>
        A synthetic and its collateral make a line, with its own Alchemist and its own Transmuter. This explorer covers
        the {linesText} {lineNames.length > 1 ? "lines" : "line"}.{" "}
        <Link href={`${deployment.basePath}/lines`} className={LINK}>
          Lines
        </Link>{" "}
        states, for each, how many redemptions it has had and how the explorer gets its figures: replayed from each
        position&apos;s events on a line with none, read from the contract at a block from the first one on.
      </p>
      <p>The listing has a tab for each kind of position.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <Link href={deployment.basePath} className={LINK}>
            Alchemist positions
          </Link>
          : one row per loan. A position is an NFT, so the wallet holding it may not be the one that opened it. Each row
          shows the debt and collateral the Alchemist states for it at a block. Opening one shows its whole history,
          including every redemption that moved it.
        </li>
        <li>
          <Link href={transmuterListingPath(deployment)} className={LINK}>
            Transmuter positions
          </Link>
          : one row per stake of the synthetic in a Transmuter, with the amount staked, the block it matures at and what
          its claim paid out. A stake converts a little every block until it matures; a claim before then converts the
          matured part and hands the rest back.
        </li>
        {hasV2 && (
          <li>
            <Link href={v2ListingPath(deployment)} className={LINK}>
              V2 positions
            </Link>
            : accounts on Alchemix V2, the version before V3. An account there held collateral and debt in one address
            rather than an NFT. Every one closed on 2 April 2026, and each shows its final figures.
          </li>
        )}
      </ul>
      <p>The listing searches by address or position id.</p>
    </>
  );
}
