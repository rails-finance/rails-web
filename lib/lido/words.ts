// Every word of Lido on Rails (rails-ops ui-jobs 570): the front door and its
// totals, a wallet's stake card, the 30-day readout and the withdrawal
// requests. Nothing here rates, forecasts or recommends. The faces name no
// contract or function: those are in each figure's receipt
// (lib/lido/provenance.ts; decision 0059).
//
// Pure, with type imports only: scripts/test/lido.test.mjs reads it.

import type { LidoRequestRow, LidoStake, LidoTotals } from "./stake";
import { day, num as uniNum, pct } from "../uniswap/words";

/** An amount: Uniswap's, with a remainder under 0.0001 shown as such (a wallet that moved its stake out keeps wei). */
export const num = (x: number): string => (x !== 0 && Math.abs(x) < 1e-4 ? "<0.0001" : uniNum(x));

export const LABEL = "Lido";

/** ETH per share, to six places. */
export const rateText = (x: number): string =>
  `${x.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ETH`;

/** A signed amount: "+1.5", "−0.25", "0". */
export const signed = (x: number): string => (x === 0 ? "0" : `${x > 0 ? "+" : "−"}${num(Math.abs(x))}`);

export const FRONT_DOOR = {
  line: "A wallet's stETH and wstETH on Ethereum, valued in ETH at Lido's share rate, with its change over the last 30 days and its withdrawal requests.",
  totalsTitle: "Lido now",
  pooled: "Ether staked",
  pooledTip: "All the ether Lido accounts for, staked and buffered, which every stETH share is a claim on.",
  shares: "Shares",
  sharesTip: "All stETH shares outstanding. One wstETH is one share.",
  rate: "Share rate",
  rateTip:
    "The ETH one stETH share is worth. It changes when Lido's oracle reports the validators' balances, about once a day.",
  queue: "Waiting to withdraw",
  queueTip: "stETH in withdrawal requests the queue has not finalized yet.",
  rateSub: (t: LidoTotals) => `${pct(t.rateGrowth, 3)} over 30 days`,
  queueSub: (t: LidoTotals) =>
    `${t.waitingRequests.toLocaleString("en-US")} ${t.waitingRequests === 1 ? "request" : "requests"}`,
  unanswered: "The read of Lido's totals did not answer. Try again in a minute.",
};

export const STAKE_PAGE = {
  heading: "Lido stake",
  sub: "stETH and wstETH on Ethereum",
  unanswered: "The read of this wallet's stake did not answer. Try again in a minute.",
};

export const CARD_WORDS = {
  heading: "Stake summary",
  stake: "Stake now",
  stakeTip: "The wallet's stETH and wstETH together, in ETH at the share rate.",
  steth: "stETH",
  stethTip:
    "stETH held in this wallet. Its balance is the ETH its shares are worth, so it grows at each oracle report.",
  wsteth: "wstETH",
  wstethTip:
    "wstETH held in this wallet. One wstETH is one stETH share, so its count stays the same while its worth in ETH grows.",
  rate: "Share rate",
  rateTip: "The ETH one stETH share is worth. Lido's oracle moves it about once a day.",
  none: "This wallet holds no stETH or wstETH now.",
  foot: "Amounts are in ETH at Lido's share rate. Lido states no dollar price for stETH.",
  sharesSub: (shares: number) => `${num(shares)} shares`,
  wstethSub: (eth: number) => `worth ${num(eth)} ETH`,
  rateSub: (s: LidoStake) => `${pct(s.rateGrowth, 3)} over 30 days`,
};

export const READOUT = {
  title: "How the stake changed over 30 days",
  sub: "Measured from the chain at the head and 30 days back. Rails does not forecast, rate or recommend.",
  explainerLabel: "explanation of these lines",
};

export type LidoLineKey = "shares" | "rate" | "earned";
export interface LidoLine {
  key: LidoLineKey;
  label: string;
  text: string;
}

/** The readout's lines, in drawing order. */
export function readoutLines(s: LidoStake, thenTime: number): LidoLine[] {
  const on = day(thenTime);
  return [
    {
      key: "shares",
      label: "Shares",
      text:
        s.shareChange === 0
          ? `${num(s.now.shares)} now, the same as on ${on}.`
          : `${num(s.now.shares)} now, against ${num(s.then.shares)} on ${on}: a change of ${signed(s.shareChange)} shares.`,
    },
    {
      key: "rate",
      label: "Share rate",
      text: `${rateText(s.now.rate)} per share now, against ${rateText(s.then.rate)}: ${pct(s.rateGrowth, 3)}.`,
    },
    {
      key: "earned",
      label: "Earned",
      text:
        s.then.shares === 0
          ? `This wallet held no shares on ${on}.`
          : `${num(s.earned)} ETH: the ${num(s.then.shares)} shares held on ${on}, valued at today's rate less that day's.`,
    },
  ];
}

export const REQUESTS = {
  title: "Withdrawal requests",
  sub: "Each request locks stETH in Lido's withdrawal queue until the queue finalizes it; then its ETH can be claimed.",
  none: "This wallet has no withdrawal request open or unclaimed.",
  truncated: (count: number, shown: number) =>
    `This wallet owns ${count.toLocaleString("en-US")} withdrawal requests; Rails shows the newest ${shown}.`,
  summary: (s: LidoStake) =>
    [
      s.waitingSteth > 0 ? `${num(s.waitingSteth)} stETH waiting` : null,
      s.claimableEth > 0 ? `${num(s.claimableEth)} ETH ready to claim` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  state: { waiting: "Waiting", claimable: "Ready to claim", claimed: "Claimed" } as const,
  row: (q: LidoRequestRow) => `${num(q.steth)} stETH, requested ${day(q.time)}`,
  claim: (q: LidoRequestRow) => (q.claimable == null ? null : `${num(q.claimable)} ETH to claim`),
};

export interface ExplainGroupWords {
  title: string;
  bullets: string[];
}

/** The card's (i). */
export function cardExplainer(): ExplainGroupWords[] {
  return [
    {
      title: "Shares and the share rate",
      bullets: [
        "Lido counts each holder's stake in shares. A share's worth in ETH, the share rate, rises when Lido's oracle reports the validators' rewards, about once a day.",
        "stETH shows its balance in ETH, so the balance grows while the shares stay the same. wstETH counts shares, so one wstETH is one share and its count stays the same.",
      ],
    },
  ];
}

/** The readout's (i). */
export function readoutExplainer(): ExplainGroupWords[] {
  return [
    {
      title: "The lines",
      bullets: [
        "Each line compares the block when the page was read with a block 30 days earlier.",
        "Earned is the shares the wallet held 30 days back times the rise in the share rate since. Shares that moved in or out in between are stated as a change in shares, and earn nothing in this figure.",
      ],
    },
  ];
}
