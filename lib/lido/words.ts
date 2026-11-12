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
  line: "Lido stakes ether on Ethereum's validators and gives each depositor stETH, a token whose balance tracks their stake. Look up a wallet to see its stETH and wstETH in ETH, and its withdrawal requests.",
  totalsTitle: "Lido now",
  pooled: "Total pooled ether",
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
  stake: "Stake",
  stakeTip: "The wallet's stETH and wstETH together, in ETH at the share rate.",
  steth: "stETH",
  stethTip:
    "stETH held in this wallet. Its balance is the ETH its shares are worth, so it moves at each oracle report, which Lido calls a rebase.",
  wsteth: "wstETH",
  wstethTip:
    "wstETH held in this wallet. One wstETH is one stETH share, so its count stays the same while its worth in ETH moves.",
  rate: "Share rate",
  rateTip:
    "The ETH one stETH share is worth. It moves at each oracle report, about once a day: normally up, and down after slashing or penalties.",
  none: "This wallet holds no stETH or wstETH now.",
  closed: "Closed",
  sharesSub: (shares: number) => `${num(shares)} shares`,
  wstethSub: (eth: number) => `worth ${num(eth)} ETH`,
  rateSub: (s: LidoStake) => `${pct(s.rateGrowth, 3)} over 30 days`,
};

export const READOUT = {
  title: "Last 30 days",
  now: "Now",
  wallet: "This wallet",
  lido: "Lido",
  explainerLabel: "explanation of this table",
};

export type LidoLineKey = "shares" | "rate" | "earned";
export interface LidoRow {
  key: LidoLineKey;
  label: string;
  /** The figure at the past block; null on a row with no past side. */
  then: string | null;
  now: string;
  single?: true;
  /** One line under the label, up to eight words: why the shares moved, or why Earned is empty. */
  note?: string;
  /** Set where Earned states no figure: the window's state. */
  withheld?: "opened" | "changed";
}
export interface LidoTable {
  /** The past column's date. */
  then: string;
  groups: { title: string; rows: LidoRow[] }[];
}

/** Why Earned states no figure, in the table's (i). */
export const WINDOW_WORDS = {
  opened: "Earned has no figure: the stake opened inside the 30 days, and the page reads only their two ends.",
  changed: "Earned has no figure: the shares changed inside the 30 days, and the page reads only their two ends.",
};

/** "#141400", "#141400 and #141401", "#1, #2 and #3", or a count past three. */
function requestNames(rows: LidoRequestRow[]): string {
  if (rows.length === 1) return `withdrawal request #${rows[0].id} on ${day(rows[0].time).replace(/ \d{4}$/, "")}`;
  if (rows.length > 3) return `${rows.length} withdrawal requests`;
  const ids = rows.map((q) => `#${q.id}`);
  return `withdrawal requests ${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1]}`;
}

/** Shares that moved in or out of the wallet beside its requests, with their ETH at the current rate. */
const moved = (x: number, eth: number, other: boolean): string =>
  x > 0
    ? `${other ? "the other " : ""}${num(x)} shares (${num(eth)} ETH) came into the wallet by transfers this page does not trace`
    : `${other ? "the other " : ""}${num(-x)} shares (${num(-eth)} ETH) left the wallet by transfers this page does not trace`;

/** Why the shares changed, from the requests made since the past read and the rest. */
export function causeText(c: ShareCause): string {
  if (c.fit === "none") return moved(c.rest, c.restEth, false);
  const into = `${num(c.requested)} shares (${num(c.requestedSteth)} stETH) went into ${requestNames(c.requests)}`;
  return c.fit === "all" ? into : `${into}; ${moved(c.rest, c.restEth, true)}`;
}

/** Why the shares moved, in a few words under the row; the (i) gives the full account. */
export function causeNote(c: ShareCause): string {
  const to = c.requests.length === 1 ? `request #${c.requests[0].id}` : `${c.requests.length} requests`;
  const rest = `${signed(c.rest)} by transfer`;
  if (c.fit === "none") return rest;
  return c.fit === "all" ? `${num(c.requested)} to ${to}` : `${num(c.requested)} to ${to}, ${rest}`;
}

/** Why Earned is empty, in a few words under the row. */
export const WINDOW_NOTE = {
  opened: "stake opened inside the 30 days",
  changed: "shares changed inside the 30 days",
};

/** The readout as a table: a past column and a present one, the wallet's rows, then Lido's. */
export function readoutTable(s: LidoStake, thenTime: number): LidoTable {
  const stated = s.windowState === "ok" && s.earned !== null && s.then.shares > 0;
  return {
    then: day(thenTime),
    groups: [
      {
        title: READOUT.wallet,
        rows: [
          {
            key: "shares",
            label: "Shares",
            then: num(s.then.shares),
            now: num(s.now.shares),
            ...(s.cause ? { note: causeNote(s.cause) } : {}),
          },
          {
            key: "earned",
            label: "Earned",
            then: null,
            now: stated ? `${num(s.earned as number)} ETH` : "—",
            single: true,
            ...(s.windowState === "ok" ? {} : { withheld: s.windowState, note: WINDOW_NOTE[s.windowState] }),
          },
        ],
      },
      {
        title: READOUT.lido,
        rows: [
          { key: "rate", label: "Share rate", then: rateText(s.then.rate), now: rateText(s.now.rate) },
          { key: "rate", label: "Rate change", then: null, now: pct(s.rateGrowth, 3), single: true },
        ],
      },
    ],
  };
}

export const REQUESTS = {
  title: "Withdrawal requests",
  what: "Each request locks stETH in Lido's withdrawal queue until an oracle report finalizes it. Its owner then claims the ETH.",
  explainerLabel: "explanation of these requests",
  none: "This wallet has no withdrawal request open or unclaimed.",
  truncated: (count: number, shown: number) =>
    `This wallet owns ${count.toLocaleString("en-US")} withdrawal requests; Rails shows the newest ${shown}.`,
  summary: (s: LidoStake) =>
    [
      s.waitingSteth > 0 ? `${num(s.waitingSteth)} stETH not finalized` : null,
      s.claimableEth > 0 ? `${num(s.claimableEth)} ETH claimable` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  state: { waiting: "Not finalized", claimable: "Claimable", claimed: "Claimed" } as const,
  /** What each state means, on the state word. */
  stateTip: {
    waiting: (q: LidoRequestRow) =>
      `In Lido's queue until an oracle report finalizes it; it then pays up to ${num(q.steth)} ETH.`,
    claimable: "Finalized: the owner claims this ETH with a transaction.",
    claimed: "Claimed: the ETH was paid out.",
  },
  tip: (q: LidoRequestRow): string => {
    const t = REQUESTS.stateTip[q.state];
    return typeof t === "string" ? t : t(q);
  },
  row: (q: LidoRequestRow) => `${num(q.steth)} stETH, requested ${day(q.time)}`,
  claim: (q: LidoRequestRow) => (q.claimable == null ? null : `${num(q.claimable)} ETH to claim`),
};

export interface ExplainGroupWords {
  title: string;
  bullets: string[];
}

/** A stake held in one leg: "all as stETH", "all as wstETH". */
const leg = (s: LidoStake): string => (s.now.wsteth === 0 ? "all as stETH" : "all as wstETH");

/** The card's (i): this wallet's stake first, then one line of the general lesson. */
export function cardExplainer(s: LidoStake): ExplainGroupWords[] {
  const dust = s.now.shares > 0 && s.now.shares < 1e-4;
  const held =
    s.now.shares === 0
      ? "This wallet holds no stETH or wstETH now."
      : dust
        ? `This wallet holds a remainder under 0.0001 shares, worth ${s.now.eth < 1e-4 ? "under 0.0001" : num(s.now.eth)} ETH.${s.now.stethShares > 0 ? " Sending a whole stETH balance can leave a wei or two behind." : ""}`
        : s.now.wsteth > 0 && s.now.stethShares > 0
          ? `This wallet holds ${num(s.now.shares)} shares at ${rateText(s.now.rate)} a share: its ${num(s.now.stethEth)} stETH and ${num(s.now.wsteth)} wstETH (worth ${num(s.now.wstethEth)} ETH) make the ${num(s.now.eth)} ETH stake.`
          : `This wallet holds ${num(s.now.shares)} shares, ${leg(s)}; at ${rateText(s.now.rate)} a share they are worth ${num(s.now.eth)} ETH.`;
  return [
    {
      title: "This stake",
      bullets: [
        held,
        "The shares stay the same until the wallet moves them; their worth moves with the share rate at each oracle report.",
        ...queued(s),
        ...(s.now.shares > 0 ? ["Amounts are in ETH, so ETH's dollar price is outside this page."] : []),
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
        `${other}${num(s.waitingSteth)} stETH waits in Lido's withdrawal queue, and ${num(s.claimableEth)} ETH there is claimable, below.`,
      ),
    ];
  if (s.waitingSteth > 0) return [cap(`${other}${num(s.waitingSteth)} stETH waits in Lido's withdrawal queue, below.`)];
  if (s.claimableEth > 0)
    return [cap(`${other}${num(s.claimableEth)} ETH sits in Lido's withdrawal queue, claimable, below.`)];
  return [];
}

/** Why the share rate moved over the window, by the sign of its change; none where it did not move. */
export function rateCause(growth: number): string | null {
  if (growth > 0) return "The share rate rose because oracle reports added the validators' rewards, after Lido's fee.";
  if (growth < 0) return "The share rate fell because an oracle report recorded a loss, such as slashing or penalties.";
  return null;
}

/** What a stated Earned figure is; none where Earned states no figure or no change. */
export function earnedMeaning(s: LidoStake): string | null {
  if (s.windowState !== "ok" || s.earned === null || s.earned === 0 || s.then.shares === 0) return null;
  return s.earned > 0
    ? "Earned is the rise in the shares' worth in ETH as oracle reports added the validators' rewards, after Lido's fee, to the share rate. Nothing was paid out: it stays in the stake until the stETH or wstETH is sold or withdrawn. It is in ETH, so ETH's dollar price is outside it."
    : "Earned is the fall in the shares' worth in ETH at the share rate. It is in ETH, so ETH's dollar price is outside it.";
}

/** The readout's (i): how the columns compare, then this wallet's rows, Earned, and Lido's rate. */
export function readoutExplainer(s: LidoStake): ExplainGroupWords[] {
  const why = rateCause(s.rateGrowth);
  const earned = earnedMeaning(s);
  const cause = s.cause ? causeText(s.cause) : null;
  const groups: ExplainGroupWords[] = [
    {
      title: "How it compares",
      bullets: ["The first column is a block 30 days back, on the date shown.", "Now is the block this page read."],
    },
    {
      title: READOUT.wallet,
      bullets: [
        ...(cause ? [`The shares changed: ${cause}.`] : ["The shares are the same at both blocks."]),
        ...(s.cause && s.cause.fit !== "all"
          ? ["Wrapping stETH into wstETH, or back, leaves the share count unchanged, so it is not among these moves."]
          : []),
      ],
    },
    {
      title: "Earned",
      bullets: [
        ...(s.windowState === "ok"
          ? ["Earned is the shares held at both blocks, times the change in the share rate between them."]
          : [WINDOW_WORDS[s.windowState]]),
        ...(s.windowState === "ok" && s.then.shares === 0 ? ["This wallet held no shares at the first block."] : []),
        ...(earned ? earned.split(/(?<=\.) /).slice(1) : []),
      ],
    },
    { title: READOUT.lido, bullets: why ? [why] : [] },
  ];
  return groups.filter((g) => g.bullets.length > 0);
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
              `The ${num(s.waitingSteth)} stETH in ${waiting.length === 1 ? "the request not yet finalized" : `${waiting.length} requests not yet finalized`} left this wallet's shares when ${waiting.length === 1 ? "it was" : "they were"} made, so it is outside Stake now.`,
            ]
          : []),
        "A request pays at most the stETH locked when it was made: rewards while it waits in the queue are not paid.",
        ...(waiting.length > 0 ? ["Lido's docs state no fixed wait for finalizing."] : []),
        ...(s.claimableEth > 0
          ? [
              `The ${num(s.claimableEth)} claimable ETH stays in the queue until the owner claims it with a transaction.`,
            ]
          : ["Once finalized, the ETH stays in the queue until the owner claims it with a transaction."]),
        REQUESTS.what,
      ],
    },
  ];
}

const DOCS_TOKENS = "https://docs.lido.fi/guides/lido-tokens-integration-guide";
const DOCS_QUEUE = "https://docs.lido.fi/contracts/withdrawal-queue-erc721";
const DOCS_LIDO = "https://docs.lido.fi/contracts/lido";
const DOCS_ORACLE = "https://docs.lido.fi/contracts/accounting-oracle";
const ETH_SLASHING = "https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/rewards-and-penalties/";

/** The stake card's "?" (T4): how Lido staking works, the same on every wallet. */
export const LIDO_LEARN_MORE: LearnMoreContent = {
  title: "How Lido staking works",
  intro:
    "Lido stakes ether on Ethereum's validators for its holders and gives each one stETH. Lido counts each holder's stake in shares of all the ether it accounts for.",
  detailsHeading: "Key concepts:",
  details: [
    {
      bold: "Shares and the share rate",
      text: "The share rate is the ETH one share is worth: all the ether Lido accounts for over all shares. Lido's oracle is a committee of members run by node operators the Lido DAO selects; once more than half agree, it reports the validators' balances on chain, normally once a day, and the rate moves at each report. It normally rises; slashing (Ethereum removing a validator that proposed or attested dishonestly, with a loss of its staked ether) or penalties can lower it, and Lido's docs say daily reports have never been negative.",
      sources: [
        { label: "accounting oracle", url: DOCS_ORACLE },
        { label: "oracle report", url: DOCS_LIDO },
        { label: "slashing", url: ETH_SLASHING },
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
    {
      bold: "Leaving on a market",
      text: "stETH and wstETH also trade on markets, such as Curve's stETH/ETH pool, where their price can differ from the share rate, so the withdrawal queue above is one way to leave.",
      sources: [{ label: "liquidity venues", url: DOCS_TOKENS }],
    },
  ],
  stepsHeading: "Leaving through the withdrawal queue:",
  steps: [
    "The holder requests a withdrawal: the stETH or wstETH is locked in Lido's queue, and an unstETH NFT for the request goes to the holder.",
    "An oracle report finalizes requests in order once there is ether to pay them. Lido's docs state no fixed wait.",
    "The NFT's owner claims the ETH with a transaction. A request pays at most the stETH locked when it was made: rewards earned while it waits are not paid.",
  ],
  links: [
    { label: "stETH and wstETH", url: DOCS_TOKENS },
    { label: "Withdrawal queue", url: DOCS_QUEUE },
    { label: "Lido documentation", url: "https://docs.lido.fi" },
  ],
};
