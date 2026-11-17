// The words of a Polaris stability-pool deposit's timeline row: the label of
// one DepositOperation (or one transfer of the deposit NFT) and the sentences
// its Explanation states, from the row's fields.

import { exactUnits, big } from "./sp-loan-math";
import type { PolarisDepositEventRow } from "@/lib/sources/api/polaris-sp-loans";

const ZERO = BigInt(0);

export function spEventLabel(r: PolarisDepositEventRow): string {
  if (r.event_type === "transfer") return "Transferred";
  const change = big(r.top_up_or_withdrawal);
  if (r.operation === 2) return "Claimed";
  if (big(r.deposit_before) === ZERO && change > ZERO) return "Opened";
  if (r.operation === 1 && big(r.new_deposit) === ZERO) return "Withdrew all";
  if (change > ZERO) return "Deposited";
  if (change < ZERO) return "Withdrew";
  return "Claimed";
}

const amt = (v: bigint, symbol: string) => `${exactUnits(v)} ${symbol}`;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The row's sentences, each one fact. `holder` is the deposit NFT's holder
 *  (no deposit NFT has changed hands, so it held it at every touch); a vault
 *  holder names the vault, and a sender other than the holder is named. */
export function spEventSentences(
  r: PolarisDepositEventRow,
  stable: string,
  holder: string | null,
  vaultSymbol: string | null,
): string[] {
  if (r.event_type === "transfer") {
    return [`The deposit NFT moved from ${r.from_addr ?? "an unknown holder"} to ${r.to_addr ?? "an unknown holder"}.`];
  }
  const out: string[] = [];
  const whoLower = vaultSymbol ? `the ${vaultSymbol} vault` : "the holder";
  const who = whoLower.charAt(0).toUpperCase() + whoLower.slice(1);
  const change = big(r.top_up_or_withdrawal);
  if (change > ZERO) out.push(`${who} deposited ${amt(change, stable)}.`);
  if (change < ZERO) out.push(`${who} withdrew ${amt(-change, stable)}.`);
  if (r.tx_from && holder && r.tx_from.toLowerCase() !== holder.toLowerCase())
    out.push(`${short(r.tx_from)} sent the transaction.`);
  const loss = big(r.deposit_loss);
  if (loss > ZERO)
    out.push(
      `Liquidations since the previous touch had used ${amt(loss, stable)} of the deposit; this touch wrote it.`,
    );
  const gain = big(r.stable_gain_since);
  const claimed = big(r.stable_gain_claimed);
  if (gain > ZERO)
    out.push(
      claimed === gain
        ? `It paid ${amt(gain, stable)} of yield, all claimed.`
        : claimed > ZERO
          ? `It paid ${amt(gain, stable)} of yield and claimed ${amt(claimed, stable)}; the rest stays in the deposit.`
          : `It paid ${amt(gain, stable)} of yield, kept in the deposit.`,
    );
  const bc = big(r.bc_gain_since);
  const bcClaimed = big(r.bc_gain_claimed);
  if (bc > ZERO || bcClaimed > ZERO)
    out.push(
      bcClaimed > ZERO
        ? `It paid ${amt(bc, "pETH")} from liquidations and ${whoLower} claimed ${amt(bcClaimed, "pETH")}.`
        : `It paid ${amt(bc, "pETH")} from liquidations, stashed for a later claim.`,
    );
  return out;
}
