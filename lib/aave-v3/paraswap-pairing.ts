// The ParaSwap position swaps on the Base Pools, paired in the replay.
// ----------------------------------------------------------------------------
// On Ethereum the index pairs a position swap into one row (rails-server migs
// 243–254) and the timeline route draws it as one card. The Base lanes have no
// such table: the web replays the wallet's rows (lib/sources/chain/
// aave-v3-events `replayAaveV3Rows`), so the pairing runs there, over the same
// rows, by mig 248's rule — the one arm that needs nothing beyond the Pool's
// events and the aToken transfers. The CoW Protocol routes need the
// settlement's Trade log, which the Base index does not capture, and a
// withdraw and swap needs the adapter's Swapped log; both stay as rows
// (rails-ops TO-DO-ui-jobs §18).
//
// THE RULE (mig 248). Per (transaction, adapter), the rows that adapter made
// for the wallet — aTokens the wallet sent it, and Pool calls whose caller is
// the adapter — must form exactly one swap of the adapter's kind:
//   debt_swap              one borrow (received) and one repay in another
//                          reserve (given), plus at most one repay in the
//                          borrowed reserve (a leftover, netted into the borrow)
//   collateral_swap        one transfer_out (given) and one supply in another
//                          reserve (received), nothing else
//   repay_with_collateral  one transfer_out (given) and one repay in another
//                          reserve (received), plus at most one supply back in
//                          the given reserve (a leftover, netted into the
//                          aTokens sent)
// Any other group keeps its rows, and so does a group whose net leg is zero or
// below. The adapter's identity carries the proof, so an adapter is listed
// only with the evidence for it.

import { BASE_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { AaveV3SwapKind } from "@/lib/shared/types/event-shape";

type ParaswapKind = Extract<AaveV3SwapKind, "collateral_swap" | "debt_swap" | "repay_with_collateral">;

/** The adapters Aave runs against its Base Pool, as the Aave Address Book's
 *  `AaveV3Base` library names them (SWAP_COLLATERAL_ADAPTER,
 *  REPAY_WITH_COLLATERAL_ADAPTER, DEBT_SWAP_ADAPTER). The first two are also in
 *  lib/shared/known-infrastructure.ts under their verified source names. Each
 *  adapter is bound to Aave's Pool, so none of them can make a call on
 *  Seamless's, and Seamless pairs nothing. */
const PARASWAP_ADAPTERS: Partial<Record<ChainId, Record<string, ParaswapKind>>> = {
  [BASE_CHAIN_ID]: {
    "0x2e549104c516b8657a7d888494dfbabd7c70b464": "collateral_swap",
    "0x63dfa7c09dc2ff4030d6b8dc2ce6262bf898c8a4": "repay_with_collateral",
    "0xb12e82df057bf16ecfa89d7d089dc7e5c1dc057b": "debt_swap",
  },
};

/** The fields of a replay row the rule reads. */
export interface ParaswapPairingRow {
  txHash: string;
  kind: string;
  reserve: string;
  amount: bigint;
  poolCaller?: string;
  counterparty?: string;
}

/** One swap: its rows by index into the replay's row list. */
export interface ParaswapSwapGroup {
  kind: ParaswapKind;
  adapter: string;
  given: number;
  received: number;
  /** The row that returned what the swap did not use, and the leg it nets into. */
  leftover?: { row: number; leg: "given" | "received" };
  /** The legs' net change in their reserves. */
  givenNet: bigint;
  receivedNet: bigint;
  /** Every row behind the card, ascending — the last one closes the swap. */
  rows: number[];
}

/** Row index → the swap it belongs to. Empty where the chain lists no adapter. */
export function pairParaswapSwaps(
  rows: readonly ParaswapPairingRow[],
  wallet: string,
  chainId: ChainId,
): Map<number, ParaswapSwapGroup> {
  const out = new Map<number, ParaswapSwapGroup>();
  const adapters = PARASWAP_ADAPTERS[chainId];
  if (!adapters || adapters[wallet]) return out;

  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const adapter =
      r.kind === "transfer_out"
        ? r.counterparty
        : r.kind === "supply" || r.kind === "repay" || r.kind === "borrow"
          ? r.poolCaller
          : undefined;
    if (!adapter || !adapters[adapter]) return;
    const key = `${r.txHash}:${adapter}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  });

  for (const [key, idx] of groups) {
    const adapter = key.slice(key.indexOf(":") + 1);
    const kind = adapters[adapter];
    const of = (k: string) => idx.filter((i) => rows[i].kind === k);
    const outs = of("transfer_out");
    const supplies = of("supply");
    const repays = of("repay");
    const borrows = of("borrow");
    let g: Omit<ParaswapSwapGroup, "rows"> | null = null;

    if (kind === "debt_swap" && borrows.length === 1 && outs.length === 0 && supplies.length === 0) {
      const b = borrows[0];
      const other = repays.filter((i) => rows[i].reserve !== rows[b].reserve);
      const same = repays.filter((i) => rows[i].reserve === rows[b].reserve);
      if (other.length === 1 && same.length <= 1)
        g = {
          kind,
          adapter,
          given: other[0],
          received: b,
          ...(same.length ? { leftover: { row: same[0], leg: "received" as const } } : {}),
          givenNet: rows[other[0]].amount,
          receivedNet: rows[b].amount - (same.length ? rows[same[0]].amount : BigInt(0)),
        };
    } else if (
      kind === "collateral_swap" &&
      outs.length === 1 &&
      supplies.length === 1 &&
      repays.length === 0 &&
      borrows.length === 0 &&
      rows[outs[0]].reserve !== rows[supplies[0]].reserve
    ) {
      g = {
        kind,
        adapter,
        given: outs[0],
        received: supplies[0],
        givenNet: rows[outs[0]].amount,
        receivedNet: rows[supplies[0]].amount,
      };
    } else if (
      kind === "repay_with_collateral" &&
      outs.length === 1 &&
      repays.length === 1 &&
      borrows.length === 0 &&
      supplies.length <= 1 &&
      rows[repays[0]].reserve !== rows[outs[0]].reserve &&
      (supplies.length === 0 || rows[supplies[0]].reserve === rows[outs[0]].reserve)
    ) {
      g = {
        kind,
        adapter,
        given: outs[0],
        received: repays[0],
        ...(supplies.length ? { leftover: { row: supplies[0], leg: "given" as const } } : {}),
        givenNet: rows[outs[0]].amount - (supplies.length ? rows[supplies[0]].amount : BigInt(0)),
        receivedNet: rows[repays[0]].amount,
      };
    }
    if (!g || g.givenNet <= BigInt(0) || g.receivedNet <= BigInt(0)) continue;
    const group: ParaswapSwapGroup = { ...g, rows: [...idx].sort((a, b) => a - b) };
    for (const i of idx) out.set(i, group);
  }
  return out;
}
