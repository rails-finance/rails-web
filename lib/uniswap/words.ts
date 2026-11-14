// Every word of Uniswap on Rails (rails-ops ui-jobs 556): the position page's
// card and six readout lines (door 1), the /start pair step (door 2) and the
// front door. Each line is a windowed figure, the holder's first, then the
// pool's; nothing here rates, forecasts or recommends. The faces name no
// contract or function: those are in each figure's receipt
// (lib/uniswap/provenance.ts; decision 0059).
//
// Pure, with type imports only: scripts/test/uniswap.test.mjs reads it.

import { protocolName, uniDeployment, type UniProtocol } from "./deployments";
import type { HookFlag, PoolPosition, ProtocolCut } from "./position";
import type { AsideReason, PairOrder, PoolCard } from "./pairs";
import type { UniswapVersion } from "./types";

// ── Numbers ────────────────────────────────────────────────────────────────

/** A figure to four significant digits, grouped; tiny figures keep their digits. */
export function num(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return "–";
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e9) return `${(x / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 })} bn`;
  if (a >= 1e6) return `${(x / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} M`;
  if (a >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return x.toLocaleString("en-US", { maximumSignificantDigits: sig });
}

/** "+1.25%", "−3.10%", "0.00%". */
export function pct(x: number, digits = 2): string {
  const s = (x * 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const zero = Number(s.replace(/[^0-9.]/g, "")) === 0;
  return `${zero ? "" : x > 0 ? "+" : "−"}${s.replace("-", "")}%`;
}

/** A share, unsigned: "0.312%". */
export const share = (x: number, digits = 3): string => pct(x, digits).replace("+", "");

/** A change against holding, stated the docs' way as a loss: a position worth 1.2% less reads "1.20%",
 *  and one the fees carried past holding reads below zero. */
export const loss = (x: number): string => pct(x === 0 ? 0 : -x).replace("+", "");

/** "9 Nov 2026" from unix seconds. */
export function day(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "0x1234…abcd". */
export const short = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** "#1,083,471". */
export const positionNumber = (id: string): string => `#${Number(id).toLocaleString("en-US")}`;

/** "Uniswap V3", "PancakeSwap V3". */
export const versionLabel = (v: UniswapVersion, protocol: UniProtocol = "uniswap"): string =>
  `${protocolName(protocol)} ${v.toUpperCase()}`;

/** The chain a position's or a card's pool is on: "Ethereum", "Base". */
const chainName = (p: { protocol: UniProtocol; chainId: number }) => uniDeployment(p.protocol, p.chainId).chainName;

const feeText = (fee: number) => `${(fee / 1e4).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;

/** "0.3%", or "set by its hook, 3% now" for a dynamic fee. */
export function feeLabel(p: Pick<PoolPosition, "fee" | "dynamicFee" | "lpFeePct">): string {
  return p.dynamicFee
    ? `set by its hook, ${p.lpFeePct.toLocaleString("en-US", { maximumFractionDigits: 4 })}% now`
    : feeText(p.fee);
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Prices as shown: quote per base, flipped to base per quote when that would read below 0.001. */
export function shown(p: Pick<PoolPosition, "price" | "priceThen" | "range" | "base" | "quote" | "side">) {
  if (p.price >= 0.001)
    return {
      price: p.price,
      then: p.priceThen,
      low: p.range.low,
      high: p.range.high,
      unit: `${p.quote.symbol} per ${p.base.symbol}`,
      /** The token priced, and the token it is priced in. */
      of: p.base.symbol,
      in: p.quote.symbol,
      side: p.side,
    };
  return {
    price: 1 / p.price,
    then: p.priceThen === null ? null : 1 / p.priceThen,
    low: 1 / p.range.high,
    high: 1 / p.range.low,
    unit: `${p.base.symbol} per ${p.quote.symbol}`,
    of: p.quote.symbol,
    in: p.base.symbol,
    side: p.side === "below" ? ("above" as const) : p.side === "above" ? ("below" as const) : p.side,
  };
}

// ── The protocol's cut ─────────────────────────────────────────────────────

const pips = (x: number) => `${(x / 1e4).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;

const bps = (x: number) => `${(x / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** The Steward line's sentence on the protocol's cut. */
export function cutSentence(c: ProtocolCut): string {
  if (c.version === "pancake-v3") {
    const { s0: a, s1: b } = c;
    if (!a && !b) return "PancakeSwap takes none of this pool's fees.";
    if (a === b) return `PancakeSwap takes ${bps(a)} of the swap fees, out of what liquidity providers earn.`;
    return `PancakeSwap takes ${bps(a)} of fees paid in one token and ${bps(b)} in the other, out of what liquidity providers earn.`;
  }
  if (c.version === "v3") {
    const { d0: a, d1: b } = c;
    if (!a && !b) return "Uniswap takes none of this pool's fees.";
    if (a === b) return `Uniswap takes 1/${a} of the swap fees, out of what liquidity providers earn.`;
    return `Uniswap takes ${a ? `1/${a}` : "none"} of fees paid in one token and ${b ? `1/${b}` : "none"} in the other, out of what liquidity providers earn.`;
  }
  const { p0: a, p1: b } = c;
  if (!a && !b) return "Uniswap charges no protocol fee on this pool.";
  return a === b
    ? `Uniswap adds a ${pips(a)} protocol fee to each swap, paid by the swapper on top of the pool's fee.`
    : `Uniswap adds a ${pips(a)} or ${pips(b)} protocol fee to each swap, by direction, paid by the swapper on top of the pool's fee.`;
}

/** A pair card's protocol fee: "1/4 of LP fees", "0.05% added to swaps", "none". */
export function cutShort(c: ProtocolCut): string {
  if (c.version === "pancake-v3") return c.s0 ? `${bps(c.s0)} of swap fees` : "none";
  if (c.version === "v3") return c.d0 ? `1/${c.d0} of LP fees` : "none";
  return c.p0 ? `${pips(c.p0)} added to swaps` : "none";
}

// ── The hook ───────────────────────────────────────────────────────────────

const HOOK_ACTION: Record<HookFlag, string> = {
  beforeInitialize: "the pool's creation",
  afterInitialize: "the pool's creation",
  beforeAddLiquidity: "deposits",
  afterAddLiquidity: "deposits",
  afterAddLiquidityReturnsDelta: "deposits",
  beforeRemoveLiquidity: "withdrawals",
  afterRemoveLiquidity: "withdrawals",
  afterRemoveLiquidityReturnsDelta: "withdrawals",
  beforeSwap: "swaps",
  afterSwap: "swaps",
  beforeSwapReturnsDelta: "swaps",
  afterSwapReturnsDelta: "swaps",
  beforeDonate: "donations",
  afterDonate: "donations",
};

/** The actions a hook runs on, in plain words, each once. */
export const hookActions = (perms: readonly HookFlag[]): string[] => [...new Set(perms.map((f) => HOOK_ACTION[f]))];

const REMOVE = new Set<HookFlag>(["beforeRemoveLiquidity", "afterRemoveLiquidity", "afterRemoveLiquidityReturnsDelta"]);

// ── Door 1: the page ───────────────────────────────────────────────────────

/** A protocol's own word for the same figure (decision 0065): Uniswap's docs collect fees, PancakeSwap's
 *  claim them and call them trading fees. The terms are in each protocol's Terms table in rails-ops
 *  `reference/official-docs/`. */
export const TERMS: Record<UniProtocol, { uncollected: string; earned: string; collected: string }> = {
  uniswap: { uncollected: "Uncollected fees", earned: "Swap fees", collected: "collected" },
  pancakeswap: { uncollected: "Unclaimed fees", earned: "Trading fees", collected: "claimed" },
};

export const POSITION_PAGE = {
  title: (p: PoolPosition) =>
    `${p.base.symbol}/${p.quote.symbol} · ${versionLabel(p.version, p.protocol)} · position ${positionNumber(p.id)}`,
  /** The pool's identity: its fee tier (a dynamic fee moves, so its figure is in the readout), the chain
   *  and the hook. */
  sub: (p: PoolPosition) =>
    `${p.dynamicFee ? "Dynamic fee" : `Fee ${feeText(p.fee)}`} · ${chainName(p)}${p.hooks ? ` · hook ${short(p.hooks)}` : ""}`,
  notFound: (v: UniswapVersion, id: string, protocol: UniProtocol = "uniswap") =>
    `${versionLabel(v, protocol)} has no position ${positionNumber(id)}.`,
  unanswered: "The read of this position did not answer. Try again in a minute.",
};

/** A position with no liquidity: the card says Closed and the readout drops its rows. */
export const isClosed = (p: Pick<PoolPosition, "liquidity">): boolean => BigInt(p.liquidity) === BigInt(0);

/** The token a position out of range holds, or null where it holds both. */
const onlyHolds = (p: Pick<PoolPosition, "holds" | "base" | "quote">): string | null =>
  p.holds.base === 0 ? p.quote.symbol : p.holds.quote === 0 ? p.base.symbol : null;

export const CARD_WORDS = {
  heading: "Position summary",
  holds: "Tokens",
  worth: "Value",
  uncollected: (pr: UniProtocol) => TERMS[pr].uncollected,
  holdsTip: "The two tokens the position's liquidity holds at the pool's price now.",
  worthTip: (q: string) => `Both tokens valued in ${q} at the pool's price now.`,
  uncollectedTip: (pr: UniProtocol) => `Fees the position has earned and the owner has not ${TERMS[pr].collected} yet.`,
  /** A staked PancakeSwap position: MasterChefV3's recorded staker collects its fees. */
  uncollectedTipStaked: (staker: string, pr: UniProtocol = "pancakeswap") =>
    `Fees the position has earned and its staker, ${short(staker)}, has not ${TERMS[pr].collected} yet.`,
  cake: "Pending CAKE",
  cakeTip: "CAKE rewards PancakeSwap's farm has paid this staked position that the staker has not harvested yet.",
  /** PancakeSwap: whether the position is staked in the farm, beside its number. */
  staked: "Staked",
  unstaked: "Not staked",
  closed: "Closed",
  closedTip: "The position holds no liquidity now.",
  outOfRange: "Out of range",
  outOfRangeTip: "The pool's price is outside the position's range.",
  rangeLabel: "Range",
  fullRange: "Full range",
  rangeText: (low: number, high: number) => `Range ${num(low)} to ${num(high)}`,
  priceText: (price: number, unit: string) => `Price ${num(price)} ${unit}`,
};

/** The card's status word: Closed with no liquidity, Out of range outside it, none while in range. */
export function cardStatus(
  p: Pick<PoolPosition, "liquidity" | "inRange" | "range">,
): { word: string; tip: string } | null {
  if (isClosed(p)) return { word: CARD_WORDS.closed, tip: CARD_WORDS.closedTip };
  if (!p.inRange && !p.range.full) return { word: CARD_WORDS.outOfRange, tip: CARD_WORDS.outOfRangeTip };
  return null;
}

/** A bullet's parts: plain text, or a figure the card also shows (drawn bold). */
export type Seg = string | { fig: string };
export interface ExplainGroupWords {
  title: string;
  bullets: Seg[][];
}

/** The range against the price: where the price sits, and what that means out of range. */
export function rangeBullets(
  p: Pick<PoolPosition, "range" | "inRange" | "holds" | "base" | "quote" | "price" | "priceThen" | "side">,
  earns: string,
): Seg[][] {
  if (p.range.full) return [["The position is full range, so it is in range at every price."]];
  const s = shown(p);
  const out: Seg[][] = [
    ["The position's range runs from ", { fig: num(s.low) }, " to ", { fig: num(s.high) }, ` ${s.unit}.`],
    ["The pool's price is ", { fig: num(s.price) }, p.inRange ? ", inside the range." : `, ${s.side} the range.`],
  ];
  if (!p.inRange) out.push([`It holds only ${onlyHolds(p) ?? "one token"} and ${earns} while the price is outside.`]);
  out.push(["The two amounts follow the price: as it moves, the position trades one token for the other."]);
  return out;
}

/** The card's (i) (rails-ops standards/prose-limits-and-zones.md 3.3: Holdings, Risk, History). */
export function cardExplainer(p: PoolPosition): ExplainGroupWords[] {
  const Q = p.quote.symbol;
  const B = p.base.symbol;
  const closed = isClosed(p);
  const holdings: Seg[][] = closed
    ? [["This position holds no liquidity now."]]
    : [
        ["This position is worth ", { fig: `${num(p.valueNow)} ${Q}` }, " at the pool's price."],
        ["It holds ", { fig: `${num(p.holds.base)} ${B}` }, " and ", { fig: `${num(p.holds.quote)} ${Q}` }, " now."],
      ];
  if (!closed || p.uncollected > 0)
    holdings.push([`${TERMS[p.protocol].uncollected} come to `, { fig: `${num(p.uncollected)} ${Q}` }, "."]);
  if (p.staked)
    holdings.push([
      "The position is staked in PancakeSwap's farm, with ",
      { fig: `${num(p.staked.pendingCake)} ${p.staked.cake.symbol}` },
      " not yet harvested.",
    ]);
  else if (p.staked === null) holdings.push(["Not staked in PancakeSwap's farm, so it earns no CAKE."]);
  const history: Seg[][] = p.opened ? [["The position was minted on ", { fig: day(p.opened.time) }, "."]] : [];
  return [
    { title: "Holdings", bullets: holdings },
    { title: "Risk", bullets: closed ? [] : rangeBullets(p, "earns no fees") },
    { title: "History", bullets: history },
  ].filter((g) => g.bullets.length > 0);
}

// ── Door 1: the readout, a then / now table (components/shared/then-now-table.tsx) ──

/** A row's key: what its receipt traces (lib/uniswap/provenance.ts `lineProv`). */
export type RowKey =
  | `token:${0 | 1}`
  | "days"
  | "earned"
  | "against"
  | "withEarned"
  | "deposits"
  | "share"
  | "penalty"
  | "withdrawals"
  | "subscriber"
  | "minted"
  | "price"
  | "move"
  | `balance:${0 | 1}`
  | "balances"
  | "fullRange"
  | "fullRangeReward"
  | "lpFee"
  | "swapFee"
  | "protocolFee";

export interface PoolRow {
  key: RowKey;
  /** Whose figure it is: the receipt's side. */
  part: "yours" | "pool";
  label: string;
  /** The figure at the past block; null where the row has none. */
  then: string | null;
  now: string;
  /** A fact with no past side by nature (a change, a setting): its past cell stays blank. */
  single?: true;
  /** One line under the label, up to eight words, lower case: why a figure moved or a cell is empty. */
  note?: string;
}
export interface PoolTable {
  /** The past column's date; null where the pool had no state 30 days back. */
  then: string | null;
  groups: { title: string; rows: PoolRow[] }[];
}

export const READOUT = {
  /** The section's heading: the window where the pool has a past read, the present where it has none. */
  title: (t: Pick<PoolTable, "then">) => (t.then ? "Last 30 days" : "Pool now"),
  now: "Now",
  position: "This position",
  pool: "The pool",
  explainerLabel: "explanation of this table",
};

/** Why a 30-day figure is empty, in a few words under its row. */
export const WINDOW_NOTE = {
  minted: "minted inside the 30 days",
  changed: "liquidity changed inside the 30 days",
  /** A position minted inside the window, with its opening day: when its first figure lands. */
  firstOn: (ts: number) => `first figure on ${day(ts)}`,
};

/** The two token rows of a position or a pool: a past amount and a present one. */
export function tokenRows(
  part: "yours" | "pool",
  b: string,
  q: string,
  now: { base: number; quote: number },
  then: { base: number; quote: number } | null,
  note?: string,
): PoolRow[] {
  return [
    {
      key: part === "yours" ? "token:0" : "balance:0",
      part,
      label: b,
      then: then ? num(then.base) : null,
      now: num(now.base),
      ...(note ? { note } : {}),
    },
    {
      key: part === "yours" ? "token:1" : "balance:1",
      part,
      label: q,
      then: then ? num(then.quote) : null,
      now: num(now.quote),
    },
  ];
}

/** The price rows: the pool's price at both blocks, and its change. */
export function priceRows(
  p: Pick<PoolPosition, "price" | "priceThen" | "range" | "base" | "quote" | "side">,
): PoolRow[] {
  const s = shown(p);
  return [
    {
      key: "price",
      part: "pool",
      label: `${s.of} price`,
      then: s.then !== null ? `${num(s.then)} ${s.in}` : null,
      now: `${num(s.price)} ${s.in}`,
    },
    ...(s.then !== null
      ? [
          {
            key: "move",
            part: "pool",
            label: "Price change",
            then: null,
            now: pct(s.price / s.then - 1, 1),
            single: true,
          } as PoolRow,
        ]
      : []),
  ];
}

/** The share of the liquidity in range that earns: "0.12%", "under 0.01%", "0%" out of range. */
export const shareText = (inRange: boolean, x: number): string =>
  !inRange ? "0%" : x >= 0.0001 ? share(x, 2) : "under 0.01%";

/** The days-in-range row, where the daily reads cover the position. */
export function daysRow(d: { inRange: number; read: number } | null, since: string | null): PoolRow[] {
  return d && d.read > 0
    ? [
        {
          key: "days",
          part: "yours",
          label: "Days in range",
          then: null,
          now: `${d.inRange} of ${d.read}`,
          single: true,
          note: since ? `one read a day since ${since}` : "one read a day",
        },
      ]
    : [];
}

/** The protocol's cut as a figure, with its note: "1/4" of the LPs' fee, "0.05%" added to a swap. */
export function cutCell(c: ProtocolCut): { now: string; note?: string } {
  if (c.version === "pancake-v3") {
    if (!c.s0 && !c.s1) return { now: "None" };
    return {
      now: c.s0 === c.s1 ? bps(c.s0) : `${bps(c.s0)} or ${bps(c.s1)}`,
      note: "of the swap fee, from LPs' share",
    };
  }
  if (c.version === "v3") {
    if (!c.d0 && !c.d1) return { now: "None" };
    const f = (d: number) => (d ? `1/${d}` : "0");
    return { now: c.d0 === c.d1 ? f(c.d0) : `${f(c.d0)} or ${f(c.d1)}`, note: "of the swap fee, from LPs' share" };
  }
  if (!c.p0 && !c.p1) return { now: "None" };
  return { now: c.p0 === c.p1 ? pips(c.p0) : `${pips(c.p0)} or ${pips(c.p1)}`, note: "added to each swap's fee" };
}

/** The readout as a table: the position's rows, then the pool's. */
export function readoutTable(p: PoolPosition): PoolTable {
  const B = p.base.symbol;
  const Q = p.quote.symbol;
  const opened = p.openedInWindow && p.opened ? p.opened.time : null;
  // Without the chain's history (Base) a position opened inside the window has no opening day, and
  // the daily reads before it opened are not its own.
  const newInWindow = !opened && p.openedInWindow;
  const why = opened
    ? WINDOW_NOTE.firstOn(opened + 30 * 86400)
    : newInWindow
      ? WINDOW_NOTE.minted
      : p.liquidityChanged
        ? WINDOW_NOTE.changed
        : undefined;
  const earned: PoolRow = {
    key: "earned",
    part: "yours",
    label: TERMS[p.protocol].earned,
    then: null,
    now: p.fees30d !== null ? `${num(p.fees30d)} ${Q}` : "—",
    single: true,
    ...(p.fees30d === null && why ? { note: why } : {}),
  };
  const against: PoolRow[] =
    p.againstHolding !== null && p.againstHoldingWithFees !== null
      ? [
          {
            key: "against",
            part: "yours",
            label: "Impermanent loss",
            then: null,
            now: loss(p.againstHolding),
            single: true,
          },
          {
            key: "withEarned",
            part: "yours",
            label: "With fees",
            then: null,
            now: loss(p.againstHoldingWithFees),
            single: true,
          },
        ]
      : [];
  const sd = p.sinceDeposit;
  const deposits: PoolRow[] = sd
    ? [
        {
          key: "deposits",
          part: "yours",
          label: "Against deposits",
          then: null,
          now: pct(sd.nowWithEverything / sd.holdValue - 1),
          single: true,
          note: "fees and payouts counted, since first deposit",
        },
      ]
    : p.version === "v4" || !p.historyRead
      ? [
          {
            key: "deposits",
            part: "yours",
            label: "Against deposits",
            then: null,
            now: "—",
            single: true,
            note: p.version === "v4" ? "deposits not read for V4" : `deposits not read on ${chainName(p)}`,
          },
        ]
      : [];
  const removes = p.hookPermissions.some((f) => REMOVE.has(f));
  const withdrawals: PoolRow = {
    key: "withdrawals",
    part: "yours",
    label: "Withdrawals",
    then: null,
    now: p.hooks && removes ? "Via hook" : "Open",
    single: true,
    ...(p.staked
      ? { note: "by the staker, through the farm" }
      : p.hooks
        ? { note: removes ? "the hook runs on each withdrawal" : "the hook has no withdrawal permission" }
        : {}),
  };
  const closed = isClosed(p);
  const position: PoolRow[] = [
    ...tokenRows(
      "yours",
      B,
      Q,
      p.holds,
      p.holdsThen,
      // Said once: the fees row carries the same reason where it has it.
      p.holdsThen === null && p.priceThen !== null && why !== WINDOW_NOTE.minted ? WINDOW_NOTE.minted : undefined,
    ),
    ...daysRow(newInWindow || closed ? null : p.daysInRange, opened ? day(opened) : null),
    earned,
    ...against,
    ...deposits,
  ];
  // An open position's present: its share of the liquidity that earns, and how it comes out.
  const open: PoolRow[] = closed
    ? []
    : [
        {
          key: "share",
          part: "yours",
          label: "Active liquidity share",
          then: null,
          now: shareText(p.inRange, p.shareOfActive),
          single: true,
          ...(p.inRange ? {} : { note: "out of range" }),
        },
        withdrawals,
        ...(p.hasSubscriber
          ? [{ key: "subscriber", part: "yours", label: "Subscriber", then: null, now: "Yes", single: true } as PoolRow]
          : []),
      ];
  const minted: PoolRow[] = p.opened
    ? [{ key: "minted", part: "yours", label: "Minted", then: null, now: day(p.opened.time), single: true }]
    : [];

  const b = p.pool30d.balances;
  const cut = cutCell(p.protocolCut);
  const pool: PoolRow[] = [
    ...priceRows(p),
    ...(b
      ? tokenRows("pool", B, Q, b, p.pool30d.balancesThen)
      : [
          {
            key: "balances",
            part: "pool",
            label: "Balances",
            then: null,
            now: "—",
            single: true,
            note: "one contract holds every V4 pool",
          } as PoolRow,
        ]),
    {
      key: "fullRange",
      part: "pool",
      label: "Full range fees",
      then: null,
      now: p.pool30d.fullRangeFees !== null ? share(p.pool30d.fullRangeFees) : "—",
      single: true,
      ...(p.pool30d.fullRangeFees === null ? { note: "pool under 30 days old" } : {}),
    },
    ...(p.dynamicFee && p.hooks
      ? [
          {
            key: "lpFee",
            part: "pool",
            label: "LP fee",
            then: null,
            now: `${p.lpFeePct.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`,
            single: true,
            note: "set by its hook",
          } as PoolRow,
        ]
      : []),
    {
      key: "protocolFee",
      part: "pool",
      label: "Protocol fee",
      then: null,
      now: cut.now,
      single: true,
      ...(cut.note ? { note: cut.note } : {}),
    },
  ];
  // A position with no liquidity at either block has no rows: the section is the pool's alone.
  const held = !isClosed(p) || (p.holdsThen !== null && (p.holdsThen.base > 0 || p.holdsThen.quote > 0));
  return {
    then: p.priceThen !== null ? day(p.then.time) : null,
    groups: [
      ...(held ? [{ title: READOUT.position, rows: [...position, ...open, ...minted] }] : []),
      { title: READOUT.pool, rows: pool },
    ],
  };
}

/** The readout's (i): how the columns compare, then what the position's rows and the pool's mean. */
export function readoutExplainer(p: PoolPosition): ExplainGroupWords[] {
  const Q = p.quote.symbol;
  const opened = p.openedInWindow && p.opened ? p.opened.time : null;
  const newInWindow = !opened && p.openedInWindow;
  const sd = p.sinceDeposit;
  const removes = p.hookPermissions.some((f) => REMOVE.has(f));
  const position: Seg[][] = [
    ["Each swap pays the pool's fee to the liquidity in range at that moment."],
    ...(opened
      ? [[`Minted on ${day(opened)}, inside the window: its first 30-day figure is on ${day(opened + 30 * 86400)}.`]]
      : newInWindow
        ? [["It did not exist 30 days ago, so it has no 30-day figure yet."]]
        : p.liquidityChanged
          ? [["Its liquidity changed inside the window, so it has no 30-day figure yet."]]
          : []),
    [
      "Impermanent loss is how much less the position is worth now than the tokens it held 30 days ago, both at today's price.",
      "With fees takes the 30-day fees off that loss. Below zero, the fees outweighed it.",
    ],
    ...(sd
      ? [
          [
            `Since its first deposit${p.opened ? ` on ${day(p.opened.time)}` : ""}, what went in comes to `,
            { fig: `${num(sd.holdValue)} ${Q}` },
            " if held.",
          ],
          [
            "The position, its unpaid fees and all it has paid out come to ",
            { fig: `${num(sd.nowWithEverything)} ${Q}` },
            ".",
          ],
        ]
      : []),
    ["The position's share is of the liquidity in range now, the part that earns fees."],
    p.staked
      ? ["PancakeSwap's farm holds a staked position, and only its staker can withdraw it, at any block."]
      : !p.hooks
        ? ["The pool has no pause and no hook, so nothing can stop or charge a withdrawal."]
        : removes
          ? [`The pool's hook ${short(p.hooks)} runs on every withdrawal and can block it or take from it.`]
          : [
              `The pool's hook ${short(p.hooks)} runs on ${list(hookActions(p.hookPermissions))}, and has no permission on withdrawals.`,
            ],
    ...(p.staked ? [["The pool has no pause and no hook, so nothing can stop or charge a withdrawal."]] : []),
    ...(p.hasSubscriber ? [["A subscriber contract is notified of the position's changes."]] : []),
    ...(p.staked
      ? [["A staked position keeps earning the pool's swap fees, and earns CAKE while it is in range."]]
      : []),
  ];
  const pool: Seg[][] = [
    ["Full range fees: what a full-range position in this pool earned in fees in 30 days, as a share of its value."],
    ["A donation to the pool counts as a fee in the pool's figure."],
    p.dynamicFee && p.hooks
      ? [`The hook ${short(p.hooks)} sets this pool's fee, and can change it at any swap.`]
      : [`Nobody can change this pool's ${feeLabel(p)} fee.`],
    [
      cutSentence(p.protocolCut),
      p.protocol === "pancakeswap"
        ? " The owner of PancakeSwap's factory sets the protocol fee."
        : " Uniswap's governance sets the protocol fee.",
    ],
  ];
  return [
    {
      title: "How it compares",
      bullets:
        p.priceThen !== null
          ? [["The first column is a block 30 days back, on the date shown."], ["Now is the block this page read."]]
          : [["The pool is younger than 30 days, so the table shows now only."]],
    },
    { title: READOUT.position, bullets: isClosed(p) && !p.holdsThen ? [] : position },
    { title: READOUT.pool, bullets: pool },
  ].filter((g) => g.bullets.length > 0);
}

// ── Door 1: the front door and a wallet's positions ────────────────────────

export const FRONT_DOOR = {
  line: (v: UniswapVersion, protocol: UniProtocol = "uniswap", chainId = 1) =>
    `A wallet's ${versionLabel(v, protocol)} positions on ${uniDeployment(protocol, chainId).chainName}, each with its range, fees and pool over the last 30 days.`,
  /** PancakeSwap's door adds its farm. */
  stakedLine: "Positions staked in PancakeSwap's farm are listed under the wallet that staked them.",
  heading: (v: UniswapVersion, protocol: UniProtocol = "uniswap") => `${versionLabel(v, protocol)} positions`,
  none: (v: UniswapVersion, protocol: UniProtocol = "uniswap") =>
    `This address holds no ${versionLabel(v, protocol)} position with liquidity in it.`,
  other: (v: UniswapVersion, n: number, protocol: UniProtocol = "uniswap") =>
    `It also holds ${n.toLocaleString("en-US")} ${versionLabel(v, protocol)} ${n === 1 ? "position" : "positions"}.`,
  truncated: "The newest 200 are listed.",
  unanswered: "The read of this wallet's positions did not answer. Try again in a minute.",
  row: (p: { id: string; token0: { symbol: string }; token1: { symbol: string }; fee: number }, v: UniswapVersion) =>
    `${positionNumber(p.id)} · ${p.token0.symbol}/${p.token1.symbol} ${v === "v4" && p.fee === 0x800000 ? "dynamic fee" : feeText(p.fee)}`,
  staked: "staked",
};

// ── Door 2: the /start pair step ───────────────────────────────────────────

const floorText = (quote: string, floor: number) =>
  quote === "ETH" ? `${floor} ETH` : `${floor.toLocaleString("en-US")} ${quote}`;

export function asideText(a: AsideReason, quote: string): string {
  switch (a.kind) {
    case "empty":
      return "no liquidity in range now";
    case "young":
      return "younger than 30 days";
    case "thin-now":
      return `under ${floorText(quote, a.floor)} in range now`;
    case "thin-then":
      return `under ${floorText(quote, a.floor)} in range at one of the reads 30, 60 or 90 days back, which inflates a fee figure`;
    case "small":
      return `under ${floorText(quote, a.floor)} in size`;
    case "spike":
      return "a 30-day fee figure above 10%, which thin liquidity or donations to the pool produce";
  }
}

export const PAIR_DOOR = {
  listQuestion: "Which two?",
  listLine: "Each opens the Uniswap pools that take them.",
  chip: (base: string, quote: string) => `${base} and ${quote}`,
  heading: (base: string, quote: string) => `Pools that take ${base} and ${quote}`,
  orderLabel: "Order by",
  orders: {
    size: "Largest",
    fees: "Highest 30-day fees",
    range: "Narrowest 90-day fee range",
  } as Record<PairOrder, string>,
  /** `v4`: whether V4 pools can be among the cards (the order's note on them). */
  intro: (o: PairOrder, v4 = true): string =>
    `${
      o === "size"
        ? v4
          ? "Largest first, by the two balances valued at the pool's price; V4 pools after, since Rails does not read their size yet."
          : "Largest first, by the two balances valued at the pool's price."
        : o === "fees"
          ? "By what a full-range position earned in fees over the last 30 days, as a share of its value."
          : "By the spread of full-range fees across the three 30-day windows of the last 90 days."
    } A full-range position is the widest; a narrower range earns more while the price is inside it and nothing while it is outside. Rails does not forecast, rate or recommend.`,
  aside: (n: number, all: boolean) =>
    `${all ? "Showing" : "Setting aside"} ${n.toLocaleString("en-US")} ${n === 1 ? "pool" : "pools"} that are empty or thin in range, younger than 30 days, or show a 30-day fee figure above 10%; each card says which.`,
  show: "Show them",
  hide: "Hide them",
  none: (base: string, quote: string, protocol: UniProtocol = "uniswap") =>
    `No ${protocolName(protocol)} pool without a hook takes ${base} and ${quote} at the last read.`,
  unanswered: "The read of these pools did not answer. Try again in a minute.",
  card: {
    title: (base: string, quote: string) => `${base}/${quote}`,
    sub: (c: Pick<PoolCard, "version" | "fee" | "weth" | "wrappedSymbol" | "protocol" | "chainId">) =>
      `${versionLabel(c.version, c.protocol)} · ${feeText(c.fee)}${c.weth ? ` (${c.wrappedSymbol})` : ""} · ${chainName(c)} · no hook`,
    fees: "Full-range fees, 30 days",
    feesRange: (low: number, high: number) => `${share(low)} to ${share(high)} in each 30 days of 90`,
    noRange: "No 90-day range",
    size: "Size",
    sizeNotRead: "Not read yet",
    sizeChange: (x: number) => `${pct(x, 1)} in 30 days`,
    noChange: "No 30-day figure",
    price: "Price, 30 days",
    protocolFee: "Protocol fee",
    aside: (a: AsideReason, quote: string) => `Set aside: ${asideText(a, quote)}.`,
  },
};
