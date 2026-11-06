// DEV ONLY. Until production's aave_v4_position_swaps is filled, `?swaps=1`
// answers with no pairs. With NEXT_PUBLIC_AAVE_V4_SWAPS_FIXTURE=1 on a dev
// server, fetchAaveV4Timeline merges the 17 pairs a local run of the pairing
// worker found (dev-swaps-fixture.json, the rows readAaveV4Swaps selects) into
// the answer, with the server's merge (rails-server
// api/src/services/aave-v4-swaps.ts `mergeAaveV4Swaps`, ported as is). The
// caller imports this module only when NODE_ENV is not production, so a
// production build drops it. An answer that already holds merged pairs is
// left alone.

import { formatUnits } from "viem";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV4Context, AaveV4Swap } from "@/lib/shared/types/protocols/aave-v4";
import rows from "./dev-swaps-fixture.json";

interface SwapRow {
  wallet: string;
  tx_hash: string;
  given_log_index: number;
  received_log_index: number;
  kind: AaveV4Swap["kind"];
  route: string;
  exact: boolean;
  clone: string;
  order_uid: string;
  trade_sell_token: string;
  trade_buy_token: string;
  trade_sell_amount: string;
  trade_buy_amount: string;
  trade_fee_amount: string;
  given_symbol: string | null;
  given_decimals: number | null;
  received_symbol: string | null;
  received_decimals: number | null;
}

const ROWS = rows as SwapRow[];

const eventKey = (txHash: string, logIndex: number) => `${txHash.toLowerCase()}-${logIndex}`;

function side(token: string, raw: string, symbol: string | null, decimals: number | null): AaveV4Swap["sell"] {
  return { token, symbol: symbol ?? null, amount: decimals == null ? null : formatUnits(BigInt(raw), decimals), raw };
}

function merge(events: BaseActivityEvent[], swaps: SwapRow[]): { events: BaseActivityEvent[]; merged: number } {
  const index = new Map<string, number>();
  events.forEach((e, i) => {
    if (e.context?.protocol !== "aave-v4") return;
    index.set(eventKey(e.txHash, Number(e.id.slice(e.id.lastIndexOf("-") + 1))), i);
  });
  const replaced = new Map<number, BaseActivityEvent>();
  const dropped = new Set<number>();
  for (const s of swaps) {
    const gi = index.get(eventKey(s.tx_hash, s.given_log_index));
    const ri = index.get(eventKey(s.tx_hash, s.received_log_index));
    if (
      gi === undefined ||
      ri === undefined ||
      dropped.has(gi) ||
      dropped.has(ri) ||
      replaced.has(gi) ||
      replaced.has(ri)
    )
      continue;
    const given = events[gi];
    const received = events[ri];
    const later = gi > ri ? given : received;
    const givenData = given.context!.data as AaveV4Context;
    const laterData = later.context!.data as AaveV4Context;
    const sellIsGiven = s.kind !== "debt_swap";
    const swap: AaveV4Swap = {
      kind: s.kind,
      route: s.route,
      givenEventId: given.id,
      receivedEventId: received.id,
      clone: s.clone,
      orderUid: s.order_uid,
      exact: s.exact,
      sell: side(
        s.trade_sell_token,
        s.trade_sell_amount,
        sellIsGiven ? s.given_symbol : s.received_symbol,
        sellIsGiven ? s.given_decimals : s.received_decimals,
      ),
      buy: side(
        s.trade_buy_token,
        s.trade_buy_amount,
        sellIsGiven ? s.received_symbol : s.given_symbol,
        sellIsGiven ? s.received_decimals : s.given_decimals,
      ),
      feeRaw: s.trade_fee_amount,
      received,
    };
    replaced.set(Math.max(gi, ri), {
      ...given,
      context: {
        protocol: "aave-v4",
        data: { ...givenData, allSupplies: laterData.allSupplies, allDebts: laterData.allDebts, swap },
      },
    });
    dropped.add(Math.min(gi, ri));
  }
  const out: BaseActivityEvent[] = [];
  events.forEach((e, i) => {
    if (!dropped.has(i)) out.push(replaced.get(i) ?? e);
  });
  return { events: out, merged: replaced.size };
}

/** The answer with the fixture's pairs for this wallet merged in. */
export function applyDevSwapsFixture<
  T extends { events: BaseActivityEvent[]; swaps?: { paired: number; merged: number } },
>(wallet: string, answer: T): T {
  if ((answer.swaps?.merged ?? 0) > 0) return answer;
  const mine = ROWS.filter((r) => r.wallet === wallet.toLowerCase());
  if (mine.length === 0) return answer;
  const { events, merged } = merge(answer.events, mine);
  return { ...answer, events, swaps: { paired: mine.length, merged } };
}
