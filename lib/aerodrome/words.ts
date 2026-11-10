// Every word of Aerodrome on Rails (rails-ops ui-jobs 566): the position
// page's card and six readout lines, the explanation panes and the front
// door. The readout is Uniswap's (lib/uniswap/words.ts), each line the
// holder's figure first, then the pool's; what differs is staking. A staked
// position earns AERO from the pool's gauge in place of trading fees, and its
// NFT is held by the gauge. The faces name no contract or function: those are
// in each figure's receipt (lib/aerodrome/provenance.ts; decision 0059).
//
// Pure: scripts/test/aerodrome.test.mjs reads it.

import {
  day,
  num,
  pct,
  positionNumber,
  share,
  shown,
  type ExplainGroupWords,
  type LineKey,
  type ReadoutLine,
  type Seg,
} from "../uniswap/words";
import type { AeroPosition, PoolAside } from "./position";
import type { AeroDeployment, AeroPositionsRead } from "./types";

const DAY = 86_400;

/** "0.3%" from pips. */
export const feePct = (pips: number): string =>
  `${(pips / 1e4).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;

/** "5 Nov 2026, 18:00 UTC". */
export function dayTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${day(ts)}, ${d.toISOString().slice(11, 16)} UTC`;
}

/** The deployment as a reader names it. */
export const DEPLOYMENT_LABEL: Record<AeroDeployment, string> = {
  initial: "Slipstream",
  caps: "Slipstream (gauge caps)",
  gv3: "Slipstream (gauges v3)",
};

export const LABEL = "Aerodrome";

// ── The page ───────────────────────────────────────────────────────────────

export const POSITION_PAGE = {
  title: (p: AeroPosition) => `${p.base.symbol}/${p.quote.symbol} · Aerodrome · position ${positionNumber(p.id)}`,
  sub: (p: AeroPosition) =>
    `${DEPLOYMENT_LABEL[p.deployment]} · fee ${feePct(p.fees.lp)} · tick spacing ${p.tickSpacing} · Base · ${
      p.staked ? "staked" : "not staked"
    }`,
  unanswered: "The read of this position did not answer. Try again in a minute.",
};

export const CARD_WORDS = {
  heading: "Position summary",
  holds: "Holds now",
  worth: "Worth now",
  uncollected: "Fees not yet collected",
  claimable: "AERO to claim",
  owner: "Staked by",
  holdsTip: "The two tokens the position's liquidity holds at the pool's price now.",
  worthTip: (q: string) => `Both tokens valued in ${q} at the pool's price now.`,
  uncollectedTip: "Fees the position has earned and the owner has not collected yet.",
  claimableTip: "AERO the gauge has paid this position and the wallet that staked it can claim now.",
  ownerTip: "The wallet that staked the position. The gauge holds the position while it is staked.",
  foot: (q: string) => `In ${q}, at the pool's own price. Rails prices nothing in dollars here.`,
  rangeLabel: "The range against the price",
  stakedBadge: "Staked",
  unstakedBadge: "Not staked",
  gaugeOnly: "Staked in the gauge",
};

/** "12.5 AERO, worth 3.1 USDC", or "12.5 AERO" where AERO has no price in the quote. */
export function aeroText(amount: number, value: number | null, q: string): string {
  return value === null ? `${num(amount)} AERO` : `${num(amount)} AERO, worth ${num(value)} ${q}`;
}

/** The card's (i): the status lead is the first group's first bullet (charter §4). */
export function cardExplainer(p: AeroPosition): ExplainGroupWords[] {
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
  ];
  if (p.aero && p.aero.claimable !== null)
    position.push(["The wallet that staked it can claim ", { fig: `${num(p.aero.claimable)} AERO` }, " now."]);
  else if (p.uncollected !== null)
    position.push(["Fees not yet collected come to ", { fig: `${num(p.uncollected)} ${Q}` }, "."]);
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
        [`Every figure is in ${Q}, priced by the pool; AERO is priced through Aerodrome's AERO pools.`],
        ["The two amounts follow the price: as it moves, the position trades one token for the other."],
        p.staked
          ? ["A staked position is held by the pool's gauge, which pays it AERO while it is in range."]
          : ["An unstaked position earns the pool's trading fees while it is in range."],
      ],
    },
  ];
}

// ── The readout: Uniswap's lines (lib/uniswap/words.ts READOUT), Aerodrome's words ──

/** Why a pool figure is set aside, after "set aside: ". */
export function asideText(a: PoolAside, which: "staked" | "unstaked", quote: string): string {
  switch (a.kind) {
    case "empty":
      return `no ${which} liquidity in range now`;
    case "young":
      return "the pool is younger than 30 days";
    case "thin":
      return `under ${quote === "WETH" ? `${a.floor} WETH` : `${a.floor.toLocaleString("en-US")} ${quote}`} of ${which} liquidity in range ${a.at === "now" ? "now" : "30 days ago"}, which inflates the figure`;
    case "spike":
      return "a 30-day figure above 10%, which thin liquidity produces";
  }
}

/** The AERO sentence Miles reads closely: what a staked position earns, and where its fees go. */
export const STAKED_EARNS =
  "A staked position earns AERO in place of trading fees, which go to the voters who direct AERO to this pool.";

/** The holder's earnings over the window, or why there is no figure. */
function earnedText(p: AeroPosition): string | null {
  const Q = p.quote.symbol;
  const w = p.window;
  switch (w.kind) {
    case "no-pool":
      return null;
    case "minted":
      // A gauge's deposit time before the first daily read dates the position earlier; the first
      // figure stands on the first midnight after it.
      if (w.stakedAt !== null && (w.firstSeen === null || w.stakedAt < w.firstSeen))
        return `Minted inside the window and staked on ${day(w.stakedAt)}, so its first 30-day figure is on ${day(Math.ceil(w.stakedAt / DAY) * DAY + 30 * DAY)}.`;
      return w.firstSeen !== null
        ? `Minted inside the window and first read on ${day(w.firstSeen)}, so its first 30-day figure is on ${day(w.firstSeen + 30 * DAY)}.`
        : "Minted inside the window, so Rails states no 30-day figure yet.";
    case "liquidity-changed":
      return "Its liquidity changed inside the window, so Rails does not state its 30-day figure yet.";
    case "staked-inside":
      return w.at !== null
        ? `Staked on ${day(w.at)}, inside the window. No read was taken that day, so Rails states no 30-day AERO figure.`
        : "Staked inside the window, on a day the gauge does not record, so Rails states no 30-day AERO figure.";
    case "unstaked-inside":
      return "It left the gauge inside the window and earns fees only from that day, which the reads do not show, so Rails states no 30-day fee figure.";
    case "whole":
      if (p.aero)
        return p.aero.earned30d !== null
          ? `Earned ${num(p.aero.earned30d)} AERO in the last 30 days${p.aero.earned30dValue !== null && p.aero.earned30d > 0 ? `, worth ${num(p.aero.earned30dValue)} ${Q} now` : ""}.`
          : null;
      return p.fees30d !== null ? `Earned ${num(p.fees30d)} ${Q} in fees in the last 30 days.` : null;
  }
}

/** The holder's claimable AERO, and the penalty while it applies. */
function claimText(p: AeroPosition): string | null {
  const a = p.aero;
  if (!a || a.claimable === null) return null;
  const Q = p.quote.symbol;
  const claim =
    a.claimable > 0 ? `To claim now: ${aeroText(a.claimable, a.claimableValue, Q)}.` : "Nothing to claim now.";
  return a.penalty ? `${claim} ${penaltyText(a.penalty)}` : claim;
}

export const penaltyText = (pen: { bps: number; until: number }): string =>
  `Unstaking before ${dayTime(pen.until)} gives up ${pen.bps >= 10_000 ? "all" : feePct(pen.bps * 100)} of the AERO to claim.`;

/** The pool's two figures: fees per unstaked position, AERO per staked one; the holder's kind first. */
function poolEarnText(p: AeroPosition): string {
  const Q = p.quote.symbol;
  const pool = p.pool30d;
  // Both set aside for one reason: said once.
  if (pool.feesAside && pool.aeroAside && pool.feesAside.kind === pool.aeroAside.kind && pool.feesAside.kind !== "thin")
    return `The pool's fee and AERO figures are set aside: ${asideText(pool.feesAside, "unstaked", Q)}.`;
  if (pool.feesAside?.kind === "thin" && pool.aeroAside?.kind === "thin" && pool.feesAside.at === pool.aeroAside.at)
    return `The pool's fee and AERO figures are set aside: under ${pool.feesAside.floor.toLocaleString("en-US")} ${Q} of unstaked or of staked liquidity in range ${pool.feesAside.at === "now" ? "now" : "30 days ago"}, which inflates them.`;
  const fees =
    pool.feesAside !== null
      ? `The pool's fee figure for an unstaked position is set aside: ${asideText(pool.feesAside, "unstaked", Q)}.`
      : `A full-range unstaked position in this pool earned ${share(pool.fullRangeFees ?? 0)} of its value in fees in 30 days.`;
  const aero =
    pool.aeroAside !== null
      ? `The pool's AERO figure for a staked position is set aside: ${asideText(pool.aeroAside, "staked", Q)}.`
      : pool.fullRangeAero !== null
        ? `A full-range staked position earned ${share(pool.fullRangeAero)} of its value in AERO in 30 days.`
        : "AERO has no price in this pool's quote token, so Rails states no AERO figure for the pool.";
  return p.staked ? `${aero} ${fees}` : `${fees} ${aero}`;
}

/** The six lines in drawing order: Range leads when the position is out of range. */
export function readoutLines(p: AeroPosition): ReadoutLine[] {
  const B = p.base.symbol;
  const Q = p.quote.symbol;
  const s = shown(p);
  const minted = p.window.kind === "minted";

  // Range
  const onlyHolds = p.holds.base === 0 ? Q : p.holds.quote === 0 ? B : null;
  const earns = p.staked ? "earns no AERO" : "earns no fees";
  const now = p.range.full
    ? "In range at every price: the position is full range."
    : p.inRange
      ? `In range: the price, ${num(s.price)} ${s.unit}, sits inside ${num(s.low)} to ${num(s.high)}.`
      : `Out of range, ${s.side} it: the price is ${num(s.price)} ${s.unit}, the range ${num(s.low)} to ${num(s.high)}. It holds only ${onlyHolds ?? "one token"} and ${earns} while the price is outside.`;
  const dir = p.daysInRange;
  const days =
    dir && dir.read > 0
      ? minted
        ? `In range on ${dir.inRange} of ${dir.read} daily reads since it was minted.`
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

  // Fees, or AERO while staked
  const uncollected =
    !p.staked && p.uncollected !== null && p.uncollected > 0 ? `Not yet collected: ${num(p.uncollected)} ${Q}.` : null;
  const fees: ReadoutLine = {
    key: "fees",
    label: p.staked ? "AERO" : "Fees",
    yours:
      [p.staked ? STAKED_EARNS : null, earnedText(p), p.staked ? claimText(p) : uncollected]
        .filter(Boolean)
        .join(" ") || null,
    pool: p.pool30d.fullRangeFees === null ? "The pool is younger than 30 days." : poolEarnText(p),
  };

  // Against holding
  const earnedWord = p.staked ? "the AERO it earned, valued now" : "the fees it earned";
  const against: ReadoutLine = {
    key: "against",
    label: "Against holding",
    yours: minted
      ? "Minted inside the window."
      : p.window.kind === "liquidity-changed"
        ? "Its liquidity changed inside the window, so Rails does not state this yet."
        : p.againstHolding !== null
          ? `${pct(p.againstHolding)} against holding the tokens it held on ${day(p.then.time)}, both valued at today's price${
              p.againstHoldingWithEarnings !== null ? `; ${pct(p.againstHoldingWithEarnings)} with ${earnedWord}` : ""
            }.`
          : null,
    pool: null,
  };

  // Size
  const b = p.pool30d.balances;
  const b30 = p.pool30d.balancesThen;
  const size: ReadoutLine = {
    key: "size",
    label: "Size",
    yours: p.inRange
      ? `${p.shareOfPaying >= 0.0001 ? share(p.shareOfPaying, 2) : "Under 0.01%"} of the ${
          p.staked
            ? "staked liquidity in range now, which shares the pool's AERO"
            : "unstaked liquidity in range now, which shares the pool's fees"
        }.`
      : "None of the liquidity in range now: the position is out of range.",
    pool: b
      ? `The pool holds ${num(b.base)} ${B} and ${num(b.quote)} ${Q}${b30 ? `; 30 days ago ${num(b30.base)} ${B} and ${num(b30.quote)} ${Q}` : ""}.`
      : null,
  };

  // Withdrawals
  const withdrawals: ReadoutLine = {
    key: "withdrawals",
    label: "Withdrawals",
    yours: p.staked
      ? `Can be unstaked from the gauge and withdrawn at any block. The pool has no pause.${
          p.aero?.penalty ? ` ${penaltyText(p.aero.penalty)}` : ""
        }`
      : "Can be withdrawn at any block. The pool has no pause.",
    pool: null,
  };

  // Steward: the swap fee and the unstaked fee, at both ends where they changed.
  const f = p.fees;
  const swap =
    f.lpThen !== null && f.lpThen !== f.lp
      ? `The swap fee is ${feePct(f.lp)}, ${feePct(f.lpThen)} 30 days ago.`
      : `The swap fee is ${feePct(f.lp)}.`;
  const cut = (x: number) => (x > 0 ? feePct(x) : "none");
  const unstaked = p.staked
    ? null
    : f.unstakedThen !== null && f.unstakedThen !== f.unstaked
      ? `The pool's voters take ${cut(f.unstaked)} of an unstaked position's fees now, ${cut(f.unstakedThen)} 30 days ago.`
      : `The pool's voters take ${cut(f.unstaked)} of an unstaked position's fees.`;
  const setBy = p.staked
    ? "Aerodrome sets it through a fee module on the pool's factory, and can change it."
    : "Aerodrome sets both through fee modules on the pool's factory, and can change them.";
  const steward: ReadoutLine = {
    key: "steward",
    label: "Steward",
    yours: null,
    pool: [swap, unstaked, setBy].filter(Boolean).join(" "),
  };

  return p.inRange || p.range.full
    ? [size, fees, range, withdrawals, against, steward]
    : [range, size, fees, withdrawals, against, steward];
}

/** The readout's (i): one group per line, in the lines' order. Each bullet stands alone. */
export function readoutExplainer(p: AeroPosition, order: readonly LineKey[]): ExplainGroupWords[] {
  const groups: Record<LineKey, ExplainGroupWords> = {
    range: {
      title: "Range",
      bullets: [
        [
          p.staked
            ? "A staked position earns AERO only while the pool's price sits inside its range."
            : "A position earns fees only while the pool's price sits inside its range.",
        ],
      ],
    },
    fees: {
      title: p.staked ? "AERO" : "Fees",
      bullets: [
        ["Each swap pays the pool's fee to the unstaked liquidity in range at that moment."],
        ["Staking a position in the pool's gauge earns AERO, Aerodrome's token, at the rate the gauge pays."],
        ["Each week AERO holders who lock their AERO vote on how much AERO each pool's gauge pays out."],
        ["Those voters receive the pool's trading fees from staked liquidity and a share from unstaked liquidity."],
        ["AERO is valued in the pool's quote token through Aerodrome's own AERO pools, at the price now."],
      ],
    },
    against: {
      title: "Against holding",
      bullets: [["Against holding compares the position now with keeping the tokens it held 30 days ago."]],
    },
    size: {
      title: "Size",
      bullets: [
        [
          p.staked
            ? "The position's share is of the staked liquidity in range now, which splits the gauge's AERO."
            : "The position's share is of the unstaked liquidity in range now, which splits the swap fees.",
        ],
      ],
    },
    withdrawals: {
      title: "Withdrawals",
      bullets: p.staked
        ? [["The gauge holds a staked position until the wallet that staked it takes it back."]]
        : [["A Slipstream pool has no step that can stop or charge a withdrawal."]],
    },
    steward: {
      title: "Steward",
      bullets: [["Aerodrome's fee modules can set a pool's fee from swap to swap."]],
    },
  };
  return order.map((k) => groups[k]);
}

// ── The front door and a wallet's positions ────────────────────────────────

export const FRONT_DOOR = {
  line: "A wallet's Aerodrome Slipstream positions on Base, staked or not, each with its range, fees or AERO and pool over the last 30 days.",
  heading: "Aerodrome positions",
  none: "This address holds no Aerodrome Slipstream position with liquidity in it.",
  truncated: "This wallet holds more than 200 positions on one deployment; Rails read the newest 200.",
  unanswered: "The read of this wallet's positions did not answer. Try again in a minute.",
  row: (p: AeroPositionsRead["positions"][number]) =>
    `${positionNumber(p.id)} · ${p.token0.symbol}/${p.token1.symbol} · tick spacing ${p.tickSpacing}`,
  staked: "Staked",
  unstaked: "Not staked",
};
