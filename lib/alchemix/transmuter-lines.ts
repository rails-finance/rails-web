// The Transmuter card's sentences, one a leg (the stake or the claim first,
// the NFT's moves after), as plain strings: the card's teaser and pane
// (components/protocol/alchemix/transmuter-event-card.tsx) and, on the server,
// the event page's title, its first sentence (rails-ops decision 0045).

import type { AlchemixV3Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { formatUnitsExact } from "@/lib/utils/format";
import type { TransmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";
import { TRANSMUTER_POKE_SENTENCE } from "@/lib/alchemix/transmuter-words";

export type TransmuterEvent = BaseActivityEvent & { context: { protocol: "alchemix-v3"; data: AlchemixV3Context } };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The vault share a claim paid out in. The claim's own flow names it; the
 *  position's row is the fallback. */
export function claimShareSymbol(claim: TransmuterEvent, mytSymbol: string): string {
  const syn = claim.context.data.syntheticSymbol;
  return claim.flows.find((f) => f.tokenSymbol !== syn)?.tokenSymbol ?? mytSymbol;
}

const plain = (raw: string) => (Number(raw) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (share: number) => `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

/** The sentence a claim before maturity owes its reader: what vested, what
 *  was returned, what the fee took, and why only part vested (TR "Each deposit
 *  vests linearly"; RT "the unvested share is returned as alAssets minus the
 *  early exit fee"). */
export function earlyClaimSentence(
  e: TransmuterEarlyClaim,
  syn: string,
  share: string,
  paidOutRaw: string,
  withWhy = true,
): string {
  return (
    `This claim came ${e.blocksEarly.toLocaleString("en-US")} blocks before maturity, when ${pct(e.termPassed)} of the blocks from the deposit to its maturity had passed. ` +
    `${withWhy ? "A deposit vests a little every block until it matures, so " : "So "}${plain(e.convertedRaw)} ${syn} had vested and was paid out as ${plain(paidOutRaw)} ${share}. ` +
    `Of the ${plain(e.unconvertedRaw)} ${syn} not yet vested, ${plain(e.returnedRaw)} was returned as ${syn} and ${plain(e.exitFeeRaw)} ${syn}, ${pct(e.exitFeeShare)}, was charged as the early exit fee.`
  );
}

/** The transaction in plain words, one sentence a leg. The stake or the claim
 *  leads, since it is what the card is about; the NFT's moves follow in log
 *  order. */
export function transmuterExplainerLines(
  legs: TransmuterEvent[],
  mytSymbol: string,
  early: TransmuterEarlyClaim | null,
): string[] {
  const out: string[] = [];
  const ordered = [
    ...legs.filter((l) => l.context.data.eventType !== "transfer"),
    ...legs.filter((l) => l.context.data.eventType === "transfer"),
  ];
  for (const leg of ordered) {
    const d = leg.context.data;
    const amount = (field: string) => formatUnitsExact(d.raw[field] ?? "0", 18);
    switch (d.eventType) {
      case "transmuter_position_created":
        out.push(
          `${amount("amount_staked")} ${d.syntheticSymbol} was deposited in the Transmuter, opening this position. It vests a little every block until maturity.`,
        );
        break;
      case "transmuter_position_claimed":
        if (early) {
          out.push(
            earlyClaimSentence(early, d.syntheticSymbol, claimShareSymbol(leg, mytSymbol), d.raw.amount_claimed ?? "0"),
          );
          break;
        }
        out.push(
          `The claim paid out ${amount("amount_claimed")} ${claimShareSymbol(leg, mytSymbol)} for the part of the deposit that had vested, and returned ${amount("amount_unclaimed")} ${d.syntheticSymbol} that had not.`,
        );
        break;
      case "transmuter_position_poked":
        out.push(TRANSMUTER_POKE_SENTENCE);
        break;
      case "transfer": {
        const t = d.transfer;
        if (t?.transferType === "mint") out.push(`The Transmuter minted the position's NFT to ${short(t.toAddress)}.`);
        else if (t?.transferType === "burn") out.push("The claim burned the position's NFT, which ends the position.");
        else if (t) out.push(`The position's NFT moved from ${short(t.fromAddress)} to ${short(t.toAddress)}.`);
        break;
      }
      default:
        break;
    }
  }
  return out;
}
