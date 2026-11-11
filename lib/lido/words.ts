// Every word of Lido on Rails (rails-ops ui-jobs 570): the front door and its
// totals, a wallet's stake card, the 30-day readout and the withdrawal
// requests. Nothing here rates, forecasts or recommends. The faces name no
// contract or function: those are in each figure's receipt
// (lib/lido/provenance.ts; decision 0059).
//
// Pure, with type imports only: scripts/test/lido.test.mjs reads it.

import type { LearnMoreContent } from "../../components/shared/learn-more-modal";
import type { LidoRequestRow, LidoStake, LidoTotals, ShareCause } from "./stake";
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
  line: "Lido stakes ether on Ethereum's validators and gives each depositor stETH, a token whose balance tracks their stake; Rails shows a wallet's stETH and wstETH in ETH, their change over 30 days and their withdrawal requests.",
  totalsTitle: "Lido now",
  pooled: "Ether staked",
  pooledTip:
    "All the ether Lido accounts for, which every stETH share is a claim on: the ether on its validators, and the buffered ether deposited and not yet sent to validators.",
  shares: "Shares",
  sharesTip: "All stETH shares outstanding. One wstETH is one share.",
  rate: "Share rate",
  rateTip:
    "The ETH one stETH share is worth. It moves when Lido's oracle, a committee whose majority must agree, reports the validators' balances, about once a day: normally up, and down after slashing or penalties.",
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
    "stETH held in this wallet. Its balance is the ETH its shares are worth, so it moves at each oracle report.",
  wsteth: "wstETH",
  wstethTip:
    "wstETH held in this wallet. One wstETH is one stETH share, so its count stays the same while its worth in ETH moves.",
  rate: "Share rate",
  rateTip:
    "The ETH one stETH share is worth. It moves at each oracle report, about once a day: normally up, and down after slashing or penalties.",
  none: "This wallet holds no stETH or wstETH now.",
  foot: "Amounts are in ETH. Rails takes dollar values only from an on-chain price feed, and none is wired for stETH yet.",
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
  /** Set where the line states no figure: the window's state. */
  withheld?: "opened" | "changed";
}

/** The Earned line where it states no figure: the reason, on the line. */
export const WINDOW_WORDS = {
  opened: "Not stated: the stake opened inside the 30 days, and Rails reads only their two ends.",
  changed: "Not stated: the shares changed inside the 30 days, and Rails reads only their two ends.",
};

/** "#141400", "#141400 and #141401", "#1, #2 and #3", or a count past three. */
function requestNames(rows: LidoRequestRow[]): string {
  if (rows.length === 1) return `withdrawal request #${rows[0].id} on ${day(rows[0].time).replace(/ \d{4}$/, "")}`;
  if (rows.length > 3) return `${rows.length} withdrawal requests`;
  const ids = rows.map((q) => `#${q.id}`);
  return `withdrawal requests ${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

/** Shares that moved in or out of the wallet beside its requests. */
const moved = (x: number): string =>
  x > 0
    ? `${num(x)} shares moved into the wallet (staked, received or bought)`
    : `${num(-x)} shares moved out of the wallet (sent or sold)`;

/** Why the shares changed, from the requests made since the past read and the rest. */
export function causeText(c: ShareCause): string {
  if (c.fit === "none") return moved(c.rest);
  const into = `${num(c.requested)} shares (${num(c.requestedSteth)} stETH) went into ${requestNames(c.requests)}`;
  return c.fit === "all" ? into : `${into}; ${moved(c.rest).replace(/^\S+ shares/, (m) => `the other ${m}`)}`;
}

/** The readout's lines, in drawing order. */
export function readoutLines(s: LidoStake, thenTime: number): LidoLine[] {
  const on = day(thenTime);
  return [
    {
      key: "shares",
      label: "Shares",
      text:
        s.cause === null
          ? `${num(s.now.shares)} now, the same as on ${on}.`
          : `${num(s.now.shares)} now, against ${num(s.then.shares)} on ${on}: ${causeText(s.cause)}.`,
    },
    {
      key: "rate",
      label: "Share rate",
      text: `${rateText(s.now.rate)} per share now, against ${rateText(s.then.rate)}: ${pct(s.rateGrowth, 3)}.`,
    },
    s.windowState === "ok" && s.earned !== null
      ? {
          key: "earned",
          label: "Earned",
          text:
            s.then.shares === 0
              ? `This wallet held no shares on ${on}.`
              : `${num(s.earned)} ETH: the ${num(s.then.shares)} shares held on ${on}, valued at today's rate less that day's.`,
        }
      : {
          key: "earned",
          label: "Earned",
          text: s.windowState === "opened" ? WINDOW_WORDS.opened : WINDOW_WORDS.changed,
          withheld: s.windowState === "opened" ? "opened" : "changed",
        },
  ];
}

export const REQUESTS = {
  title: "Withdrawal requests",
  sub: "Each request locks stETH in Lido's withdrawal queue until an oracle report finalizes it; then its owner claims the ETH.",
  explainerLabel: "explanation of these requests",
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
  /** What each state means, on the state word. */
  stateTip: {
    waiting: "In Lido's queue until an oracle report finalizes it.",
    claimable: "Finalized: the owner claims this ETH with a transaction.",
    claimed: "Claimed: the ETH was paid out.",
  } as const,
  row: (q: LidoRequestRow) => `${num(q.steth)} stETH, requested ${day(q.time)}`,
  claim: (q: LidoRequestRow) => (q.claimable == null ? null : `${num(q.claimable)} ETH to claim`),
};

export interface ExplainGroupWords {
  title: string;
  bullets: string[];
}

/** How a stake's shares split between its legs: "all as wstETH", "300 as stETH and 101.2 as wstETH". */
function legs(s: LidoStake): string {
  if (s.now.wsteth === 0) return "all as stETH";
  if (s.now.stethShares === 0) return "all as wstETH";
  return `${num(s.now.stethShares)} as stETH and ${num(s.now.wsteth)} as wstETH`;
}

/** The card's (i): this wallet's stake first, then one line of the general lesson. */
export function cardExplainer(s: LidoStake): ExplainGroupWords[] {
  const dust = s.now.shares > 0 && s.now.shares < 1e-4;
  const held =
    s.now.shares === 0
      ? "This wallet holds no stETH or wstETH now."
      : dust
        ? `This wallet holds a remainder under 0.0001 shares, worth ${s.now.eth < 1e-4 ? "under 0.0001" : num(s.now.eth)} ETH.${s.now.stethShares > 0 ? " Sending a whole stETH balance can leave a wei or two behind." : ""}`
        : `This wallet holds ${num(s.now.shares)} shares, ${legs(s)}; at ${rateText(s.now.rate)} a share they are worth ${num(s.now.eth)} ETH.`;
  return [
    {
      title: "This stake",
      bullets: [
        held,
        "The shares stay the same until the wallet moves them; their worth moves with the share rate at each oracle report.",
        ...queued(s),
      ],
    },
  ];
}

/** The card's pointer to the wallet's requests: what sits in the queue, with no total. */
function queued(s: LidoStake): string[] {
  const other = s.now.shares > 0 ? "Another " : "";
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (s.waitingSteth > 0 && s.claimableEth > 0)
    return [
      cap(
        `${other}${num(s.waitingSteth)} stETH waits in Lido's withdrawal queue, and ${num(s.claimableEth)} ETH there is ready to claim, below.`,
      ),
    ];
  if (s.waitingSteth > 0) return [cap(`${other}${num(s.waitingSteth)} stETH waits in Lido's withdrawal queue, below.`)];
  if (s.claimableEth > 0)
    return [cap(`${other}${num(s.claimableEth)} ETH sits in Lido's withdrawal queue, ready to claim, below.`)];
  return [];
}

/** The readout's (i). */
export function readoutExplainer(s: LidoStake): ExplainGroupWords[] {
  return [
    {
      title: "The lines",
      bullets: [
        "Each line compares the block when the page was read with a block 30 days earlier.",
        "Earned is stated only where the wallet held the same shares at both blocks: those shares times the change in the share rate since.",
        ...(s.cause && s.cause.fit !== "all"
          ? ["Wrapping stETH into wstETH, or back, leaves the share count unchanged, so it is not among these moves."]
          : []),
      ],
    },
  ];
}

/** The withdrawal requests' (i): what this wallet's requests mean for it. */
export function requestsExplainer(s: LidoStake): ExplainGroupWords[] {
  const waiting = s.requests.filter((q) => q.state === "waiting");
  const ready = s.requests.filter((q) => q.state === "claimable");
  return [
    {
      title: "These requests",
      bullets: [
        ...(s.waitingSteth > 0
          ? [
              `The ${num(s.waitingSteth)} stETH in ${waiting.length === 1 ? "the waiting request" : `${waiting.length} waiting requests`} left this wallet's shares when ${waiting.length === 1 ? "it was" : "they were"} made, so it is outside Stake now.`,
            ]
          : []),
        "A request pays at most the stETH locked when it was made: rewards while it waits in the queue are not paid.",
        ...(s.claimableEth > 0
          ? [
              `The ${num(s.claimableEth)} ETH ready to claim stays in the queue until the owner claims it with a transaction.`,
            ]
          : ["Once finalized, the ETH stays in the queue until the owner claims it with a transaction."]),
      ],
    },
  ];
}

const DOCS_TOKENS = "https://docs.lido.fi/guides/lido-tokens-integration-guide";
const DOCS_QUEUE = "https://docs.lido.fi/contracts/withdrawal-queue-erc721";
const DOCS_LIDO = "https://docs.lido.fi/contracts/lido";
const DOCS_ORACLE = "https://docs.lido.fi/contracts/accounting-oracle";

/** The stake card's "?" (T4): how Lido staking works, the same on every wallet. */
export const LIDO_LEARN_MORE: LearnMoreContent = {
  title: "How Lido staking works",
  intro:
    "Lido stakes ether on Ethereum's validators for its holders and gives each one stETH. Lido counts each holder's stake in shares of all the ether it accounts for.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Shares and the share rate",
      text: "The share rate is the ETH one share is worth: all the ether Lido accounts for over all shares. Lido's oracle is a committee of members run by node operators the Lido DAO selects; once more than half agree, it reports the validators' balances on chain, normally once a day, and the rate moves at each report. It normally rises; slashing or penalties can lower it, and Lido's docs say daily reports have never been negative.",
      sources: [
        { label: "accounting oracle", url: DOCS_ORACLE },
        { label: "oracle report", url: DOCS_LIDO },
      ],
    },
    {
      bold: "stETH and wstETH",
      text: "stETH states its balance in ETH, so the balance moves at each report while the shares stay put. wstETH counts shares: one wstETH is one share, so its count stays the same while its worth in ETH moves. Wrapping one into the other keeps the shares.",
      sources: [{ label: "wstETH", url: DOCS_TOKENS }],
    },
    {
      bold: "What moves a stETH balance on its own",
      text: "Only the oracle report. Shares change only when they move: staking, sending, receiving, buying, selling or a withdrawal request.",
    },
    {
      bold: "Lido's fee",
      text: "Lido keeps a percentage of the staking rewards as its protocol fee, set by the Lido DAO, so the share rate moves on the rewards after the fee.",
      sources: [{ label: "fees", url: DOCS_TOKENS }],
    },
  ],
  stepsHeading: "Leaving through the withdrawal queue:",
  steps: [
    "The holder requests a withdrawal: the stETH or wstETH is locked in Lido's queue, and an NFT for the request goes to the holder.",
    "An oracle report finalizes requests in order once there is ether to pay them. Lido's docs state no fixed wait.",
    "The NFT's owner claims the ETH with a transaction. A request pays at most the stETH locked when it was made: rewards earned while it waits are not paid.",
  ],
  links: [
    { label: "stETH and wstETH", url: DOCS_TOKENS },
    { label: "Withdrawal queue", url: DOCS_QUEUE },
    { label: "Lido documentation", url: "https://docs.lido.fi" },
  ],
};
