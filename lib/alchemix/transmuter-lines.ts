// The Transmuter card's sentences, one a leg (the stake or the claim first,
// the NFT's moves after), as plain strings: the card's teaser and pane
// (components/protocol/alchemix/transmuter-event-card.tsx) and, on the server,
// the event page's title, its first sentence (rails-ops decision 0045).

import type { AlchemixV3Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { formatUnitsExact } from "@/lib/utils/format";
import type { TransmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";

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

/** The sentence a claim before maturity owes its reader: what converted, what
 *  came back, what the fee took, and why only part converted. */
export function earlyClaimSentence(
  e: TransmuterEarlyClaim,
  syn: string,
  share: string,
  paidOutRaw: string,
  withWhy = true,
): string {
  return (
    `This claim came ${e.blocksEarly.toLocaleString("en-US")} blocks before maturity, when ${pct(e.termPassed)} of the blocks from the stake to its maturity had passed. ` +
    `${withWhy ? "A stake converts a little every block until it matures, so " : "So "}${plain(e.convertedRaw)} ${syn} had converted and was paid out as ${plain(paidOutRaw)} ${share}. ` +
    `Of the ${plain(e.unconvertedRaw)} ${syn} still to convert, ${plain(e.returnedRaw)} came back as ${syn} and the Transmuter kept ${plain(e.exitFeeRaw)} ${syn}, ${pct(e.exitFeeShare)}, as its early exit fee.`
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
          `${amount("amount_staked")} ${d.syntheticSymbol} went into the Transmuter to be converted at maturity, opening this position.`,
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
          `The claim paid out ${amount("amount_claimed")} ${claimShareSymbol(leg, mytSymbol)} for the part of the stake that had converted, and handed back ${amount("amount_unclaimed")} ${d.syntheticSymbol} that had not.`,
        );
        break;
      case "transmuter_position_poked":
        out.push("The position was poked. A poke updates the Transmuter's accounting and moves no tokens.");
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
