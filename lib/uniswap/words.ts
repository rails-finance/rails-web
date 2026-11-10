// Every word of Uniswap on Rails (rails-ops ui-jobs 556): the position page's
// card and six readout lines (door 1), the /start pair step (door 2) and the
// front door. Each line is a windowed figure, the holder's first, then the
// pool's; nothing here rates, forecasts or recommends. The faces name no
// contract or function: those are in each figure's receipt
// (lib/uniswap/provenance.ts; decision 0059).
//
// Pure, with type imports only: scripts/test/uniswap.test.mjs reads it.

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

/** "Uniswap V3". */
export const versionLabel = (v: UniswapVersion): string => `Uniswap ${v.toUpperCase()}`;

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
      side: p.side,
    };
  return {
    price: 1 / p.price,
    then: p.priceThen === null ? null : 1 / p.priceThen,
    low: 1 / p.range.high,
    high: 1 / p.range.low,
    unit: `${p.base.symbol} per ${p.quote.symbol}`,
    side: p.side === "below" ? ("above" as const) : p.side === "above" ? ("below" as const) : p.side,
  };
}

// ── The protocol's cut ─────────────────────────────────────────────────────

const pips = (x: number) => `${(x / 1e4).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;

/** The Steward line's sentence on Uniswap's cut. */
export function cutSentence(c: ProtocolCut): string {
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

export const POSITION_PAGE = {
  title: (p: PoolPosition) =>
    `${p.base.symbol}/${p.quote.symbol} · ${versionLabel(p.version)} · position ${positionNumber(p.id)}`,
  sub: (p: PoolPosition) => `Fee ${feeLabel(p)} · Ethereum${p.hooks ? ` · hook ${short(p.hooks)}` : ""}`,
  notFound: (v: UniswapVersion, id: string) => `${versionLabel(v)} has no position ${positionNumber(id)}.`,
  unanswered: "The read of this position did not answer. Try again in a minute.",
};

export const CARD_WORDS = {
  heading: "Position summary",
  holds: "Holds now",
  worth: "Worth now",
  uncollected: "Fees not yet collected",
  opened: "Opened",
  holdsTip: "The two tokens the position's liquidity holds at the pool's price now.",
  worthTip: (q: string) => `Both tokens valued in ${q} at the pool's price now.`,
  uncollectedTip: "Fees the position has earned and the owner has not collected yet.",
  openedTip: "The day the position took its first deposit.",
  foot: (q: string) => `In ${q}, at the pool's own price. Rails prices nothing in dollars here.`,
  rangeLabel: "The range against the price",
  fullRange: "Full range: the position is in range at every price.",
  rangeText: (low: number, high: number) => `Range ${num(low)} to ${num(high)}`,
  priceText: (price: number, unit: string) => `Price ${num(price)} ${unit}`,
};

/** A bullet's parts: plain text, or a figure the card also shows (drawn bold). */
export type Seg = string | { fig: string };
export interface ExplainGroupWords {
  title: string;
  bullets: Seg[][];
}

/** The card's (i): the status lead is the first group's first bullet (charter §4). */
export function cardExplainer(p: PoolPosition): ExplainGroupWords[] {
  const Q = p.quote.symbol;
  const B = p.base.symbol;
  const s = shown(p);
  const position: Seg[][] = [
    ["This position is worth ", { fig: `${num(p.valueNow)} ${Q}` }, " at the pool's price."],
    [
      "The position holds ",
      { fig: `${num(p.holds.base)} ${B}` },
      " and ",
      { fig: `${num(p.holds.quote)} ${Q}` },
      " now.",
    ],
    ["Fees not yet collected come to ", { fig: `${num(p.uncollected)} ${Q}` }, "."],
  ];
  if (p.opened) position.push(["The position opened on ", { fig: day(p.opened.time) }, "."]);
  position.push(
    p.range.full
      ? ["The position is full range, so it is in range at every price."]
      : [
          "The position's range runs from ",
          { fig: num(s.low) },
          " to ",
          { fig: num(s.high) },
          ` ${s.unit}; the price is `,
          { fig: num(s.price) },
          ".",
        ],
  );
  return [
    { title: "This position", bullets: position },
    {
      title: "How it counts",
      bullets: [
        [`Every figure is in ${Q}, priced by the pool.`],
        ["The two amounts follow the price: as it moves, the position trades one token for the other."],
      ],
    },
  ];
}

// ── Door 1: the readout ────────────────────────────────────────────────────

export type LineKey = "range" | "fees" | "against" | "size" | "withdrawals" | "steward";

export interface ReadoutLine {
  key: LineKey;
  label: string;
  /** The holder's figure, first; null where there is none. */
  yours: string | null;
  /** The pool's figure, after. */
  pool: string | null;
}

export const READOUT = {
  title: "How the position and its pool are doing",
  sub: "Measured from the chain over the last 30 days. Rails does not forecast, rate or recommend.",
  explainerLabel: "explanation of these lines",
};

/** The six lines in drawing order: Range leads when the position is out of range. */
export function readoutLines(p: PoolPosition): ReadoutLine[] {
  const B = p.base.symbol;
  const Q = p.quote.symbol;
  const s = shown(p);
  const opened = p.openedInWindow && p.opened ? p.opened.time : null;

  // Range
  const onlyHolds = p.holds.base === 0 ? Q : p.holds.quote === 0 ? B : null;
  const now = p.range.full
    ? "In range at every price: the position is full range."
    : p.inRange
      ? `In range: the price, ${num(s.price)} ${s.unit}, sits inside ${num(s.low)} to ${num(s.high)}.`
      : `Out of range, ${s.side} it: the price is ${num(s.price)} ${s.unit}, the range ${num(s.low)} to ${num(s.high)}. It holds only ${onlyHolds ?? "one token"} and earns no fees while the price is outside.`;
  const dir = p.daysInRange;
  const days =
    dir && dir.read > 0
      ? opened
        ? `In range on ${dir.inRange} of ${dir.read} daily reads since it opened on ${day(opened)}.`
        : `In range on ${dir.inRange} of the last ${dir.read} days, read once a day.`
      : null;
  const range: ReadoutLine = {
    key: "range",
    label: "Range",
    yours: [now, days].filter(Boolean).join(" "),
    pool:
      s.then !== null
        ? `The price moved ${pct(s.price / s.then - 1, 1)} in 30 days, from ${num(s.then)} to ${num(s.price)} ${s.unit}.`
        : null,
  };

  // Fees
  const feesYours = opened
    ? `Opened on ${day(opened)}, inside the window: its first 30-day figure is on ${day(opened + 30 * 86400)}.`
    : p.liquidityChanged
      ? "Its liquidity changed inside the window, so Rails does not state its 30-day fees yet."
      : p.fees30d !== null
        ? `Earned ${num(p.fees30d)} ${Q} in fees in the last 30 days.`
        : null;
  const uncollected = p.uncollected > 0 ? `Not yet collected: ${num(p.uncollected)} ${Q}.` : null;
  const fees: ReadoutLine = {
    key: "fees",
    label: "Fees",
    yours: [feesYours, uncollected].filter(Boolean).join(" ") || null,
    pool:
      p.pool30d.fullRangeFees !== null
        ? `A full-range position in this pool earned ${share(p.pool30d.fullRangeFees)} of its value in fees in 30 days.`
        : "The pool is younger than 30 days.",
  };

  // Against holding
  const ahYours = opened
    ? "Opened inside the window."
    : p.liquidityChanged
      ? "Its liquidity changed inside the window, so Rails does not state this yet."
      : p.againstHolding !== null && p.againstHoldingWithFees !== null
        ? `${pct(p.againstHolding)} against holding the tokens it held on ${day(p.then.time)}, both valued at today's price; ${pct(p.againstHoldingWithFees)} with the fees it earned.`
        : null;
  const sd = p.sinceDeposit;
  const against: ReadoutLine = {
    key: "against",
    label: "Against holding",
    yours: ahYours,
    pool: sd
      ? `Since its first deposit on ${p.opened ? day(p.opened.time) : "–"}: ${num(sd.deposited.base)} ${B} and ${num(sd.deposited.quote)} ${Q} put in, ${num(sd.holdValue)} ${Q} if held. The position, its unpaid fees and all it has paid out come to ${num(sd.nowWithEverything)} ${Q}: ${pct(sd.nowWithEverything / sd.holdValue - 1)}.`
      : p.version === "v4"
        ? "Since its first deposit: Rails does not read a V4 position's own deposits yet."
        : null,
  };

  // Size
  const b = p.pool30d.balances;
  const b30 = p.pool30d.balancesThen;
  const size: ReadoutLine = {
    key: "size",
    label: "Size",
    yours: p.inRange
      ? `${p.shareOfActive >= 0.0001 ? share(p.shareOfActive, 2) : "Under 0.01%"} of the liquidity in range now.`
      : "None of the liquidity in range now: the position is out of range.",
    pool: b
      ? `The pool holds ${num(b.base)} ${B} and ${num(b.quote)} ${Q}${b30 ? `; 30 days ago ${num(b30.base)} ${B} and ${num(b30.quote)} ${Q}` : ""}.`
      : "Rails does not read a V4 pool's balances yet: V4 keeps every pool in one contract.",
  };

  // Withdrawals
  const removes = p.hookPermissions.some((f) => REMOVE.has(f));
  const withdrawals: ReadoutLine = {
    key: "withdrawals",
    label: "Withdrawals",
    yours: !p.hooks
      ? "Can be withdrawn at any block. The pool has no pause and no hook."
      : removes
        ? `The pool's hook ${short(p.hooks)} runs on every withdrawal and can block it or take from it.`
        : `Can be withdrawn at any block. The pool's hook ${short(p.hooks)} runs on ${list(hookActions(p.hookPermissions))}, and has no permission on withdrawals.`,
    pool: p.hasSubscriber ? "A subscriber contract is notified of the position's changes." : null,
  };

  // Steward
  const steward: ReadoutLine = {
    key: "steward",
    label: "Steward",
    yours: null,
    pool: `${
      p.dynamicFee && p.hooks
        ? `The hook ${short(p.hooks)} sets this pool's fee, ${p.lpFeePct.toLocaleString("en-US", { maximumFractionDigits: 4 })}% now.`
        : `Nobody can change this pool's ${feeLabel(p)} fee.`
    } ${cutSentence(p.protocolCut)}`,
  };

  return p.inRange || p.range.full
    ? [size, fees, range, withdrawals, against, steward]
    : [range, size, fees, withdrawals, against, steward];
}

/** The readout's (i): one group per line, in the lines' order (charter §4, "Product panes follow
 *  the band"). Each bullet says what its line's figure means and stands alone; what the line
 *  already states on the face is not repeated, so the pane fits one phone screen at 390px. */
export function readoutExplainer(p: PoolPosition, order: readonly LineKey[]): ExplainGroupWords[] {
  const groups: Record<LineKey, ExplainGroupWords> = {
    range: {
      title: "Range",
      bullets: [["A position earns fees only while the pool's price sits inside its range."]],
    },
    fees: {
      title: "Fees",
      bullets: [
        ["Each swap pays the pool's fee to the liquidity in range at that moment."],
        ["A donation to the pool counts as a fee in the pool's figure."],
      ],
    },
    against: {
      title: "Against holding",
      bullets: [["Against holding compares the position now with keeping the tokens it held 30 days ago."]],
    },
    size: {
      title: "Size",
      bullets: [["The position's share is of the liquidity in range now, the part that earns fees."]],
    },
    withdrawals: {
      title: "Withdrawals",
      bullets: p.hooks
        ? [["A hook is a contract the pool calls on each action it has permission for."]]
        : [["A pool with no hook has no step that can stop or charge a withdrawal."]],
    },
    steward: {
      title: "Steward",
      bullets: [
        ["Uniswap's governance sets the protocol fee."],
        ...(p.dynamicFee ? [["A dynamic fee is set by the pool's hook and can change at any swap."]] : []),
      ],
    },
  };
  return order.map((k) => groups[k]);
}

// ── Door 1: the front door and a wallet's positions ────────────────────────

export const FRONT_DOOR = {
  line: (v: UniswapVersion) =>
    `A wallet's ${versionLabel(v)} positions on Ethereum, each with its range, fees and pool over the last 30 days.`,
  heading: (v: UniswapVersion) => `${versionLabel(v)} positions`,
  none: (v: UniswapVersion) => `This address holds no ${versionLabel(v)} position with liquidity in it.`,
  other: (v: UniswapVersion, n: number) =>
    `It also holds ${n.toLocaleString("en-US")} ${versionLabel(v)} ${n === 1 ? "position" : "positions"}.`,
  truncated: "The newest 200 are listed.",
  unanswered: "The read of this wallet's positions did not answer. Try again in a minute.",
  row: (p: { id: string; token0: { symbol: string }; token1: { symbol: string }; fee: number }, v: UniswapVersion) =>
    `${positionNumber(p.id)} · ${p.token0.symbol}/${p.token1.symbol} ${v === "v4" && p.fee === 0x800000 ? "dynamic fee" : feeText(p.fee)}`,
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
  intro: (o: PairOrder): string =>
    `${
      o === "size"
        ? "Largest first, by the two balances valued at the pool's price; V4 pools after, since Rails does not read their size yet."
        : o === "fees"
          ? "By what a full-range position earned in fees over the last 30 days, as a share of its value."
          : "By the spread of full-range fees across the three 30-day windows of the last 90 days."
    } A full-range position is the widest; a narrower range earns more while the price is inside it and nothing while it is outside. Rails does not forecast, rate or recommend.`,
  aside: (n: number, all: boolean) =>
    `${all ? "Showing" : "Setting aside"} ${n.toLocaleString("en-US")} ${n === 1 ? "pool" : "pools"} that are empty or thin in range, younger than 30 days, or show a 30-day fee figure above 10%; each card says which.`,
  show: "Show them",
  hide: "Hide them",
  none: (base: string, quote: string) => `No Uniswap pool without a hook takes ${base} and ${quote} at the last read.`,
  unanswered: "The read of these pools did not answer. Try again in a minute.",
  card: {
    title: (base: string, quote: string) => `${base}/${quote}`,
    sub: (c: Pick<PoolCard, "version" | "fee" | "weth">) =>
      `${versionLabel(c.version)} · ${feeText(c.fee)}${c.weth ? " (WETH)" : ""} · Ethereum · no hook`,
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
