// Every word of Aerodrome on Rails (rails-ops ui-jobs 566, 594): the position
// page's card, its then / now readout table, the explanation panes and the
// front door. The table's shape is Uniswap's (lib/uniswap/words.ts
// `readoutTable`), the position's rows first, then the pool's; what differs is
// staking. A staked position earns AERO from the pool's gauge in place of
// swap fees, and its NFT is held by the gauge. The faces name no contract or
// function: those are in each figure's receipt (lib/aerodrome/provenance.ts;
// decision 0059).
//
// Pure: scripts/test/aerodrome.test.mjs reads it.

import {
  cardStatus,
  day,
  daysRow,
  num,
  pct,
  positionNumber,
  priceRows,
  rangeBullets,
  READOUT,
  share,
  shareText,
  tokenRows,
  WINDOW_NOTE,
  type ExplainGroupWords,
  type PoolRow,
  type PoolTable,
  type Seg,
  loss,
} from "../uniswap/words";
import type { AeroPosition, PoolAside } from "./position";
import { AERODROME, type SlipstreamSite } from "./sites";
import type { AeroPositionsRead, SlipstreamDeployment } from "./types";

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
export const DEPLOYMENT_LABEL: Record<SlipstreamDeployment, string> = {
  initial: "Slipstream",
  caps: "Slipstream (gauge caps)",
  gv3: "Slipstream (gauges v3)",
  gv2: "Slipstream (gauges v2)",
};

// ── The page ───────────────────────────────────────────────────────────────

export const POSITION_PAGE = {
  title: (p: AeroPosition) => `${p.base.symbol}/${p.quote.symbol} · ${p.site.label} · position ${positionNumber(p.id)}`,
  /** The pool's identity: its deployment, tick spacing and chain. Its fee can change, so the readout
   *  carries it; whether the position is staked is beside its number on the card. */
  sub: (p: AeroPosition) => `${DEPLOYMENT_LABEL[p.deployment]} · tick spacing ${p.tickSpacing} · ${p.site.chainName}`,
  unanswered: "The read of this position did not answer. Try again in a minute.",
};

/** The card's words on a site: AERO on Base, VELO on Optimism. */
export const cardWords = (site: SlipstreamSite) => {
  const R = site.reward.symbol;
  return {
    heading: "Position summary",
    holds: "Tokens",
    worth: "Value",
    uncollected: "Uncollected fees",
    claimable: `${R} to claim`,
    owner: "Staked by",
    holdsTip: "The two tokens the position's liquidity holds at the pool's price now.",
    worthTip: (q: string) => `Both tokens valued in ${q} at the pool's price now.`,
    uncollectedTip: "Fees the position has earned and the owner has not collected yet.",
    claimableTip: `${R} the gauge has paid this position and the wallet that staked it can claim now.`,
    ownerTip: site.namesDepositor
      ? "The wallet that staked the position. The gauge holds the position while it is staked."
      : "The gauge holds the position while it is staked.",
    /** Under an empty Staked by: why no wallet is named. */
    ownerNone: site.namesDepositor ? "no wallet found" : `not named on ${site.chainName}`,
    rangeLabel: "Range",
    stakedBadge: "Staked",
    unstakedBadge: "Not staked",
  };
};

/** The card's status word: Closed, Out of range, or none (Uniswap's). */
export const aeroStatus = (p: AeroPosition) => cardStatus(p);

/** The card's (i) (rails-ops standards/prose-limits-and-zones.md 3.3: Holdings, Risk). */
export function cardExplainer(p: AeroPosition): ExplainGroupWords[] {
  const Q = p.quote.symbol;
  const B = p.base.symbol;
  const R = p.site.reward.symbol;
  const closed = BigInt(p.liquidity) === BigInt(0);
  const holdings: Seg[][] = closed
    ? [["This position holds no liquidity now."]]
    : [
        ["This position is worth ", { fig: `${num(p.valueNow)} ${Q}` }, " at the pool's price."],
        ["It holds ", { fig: `${num(p.holds.base)} ${B}` }, " and ", { fig: `${num(p.holds.quote)} ${Q}` }, " now."],
      ];
  if (p.aero && p.aero.claimable !== null)
    holdings.push(["The wallet that staked it can claim ", { fig: `${num(p.aero.claimable)} ${R}` }, " now."]);
  else if (p.uncollected !== null && (!closed || p.uncollected > 0))
    holdings.push(["Uncollected fees come to ", { fig: `${num(p.uncollected)} ${Q}` }, "."]);
  // "while it is in range" is the read, for both states: on Velodrome #2064266 (staked, in range on 0 of
  // 30 daily reads) the pool's reward and fee growth inside the range were unchanged across the 30 days,
  // and grew on the in-range #131184 (rails-ops reference/official-docs/velodrome.md, 13 Nov 2026).
  holdings.push(
    p.staked
      ? [`A staked position is held by the pool's gauge, which pays it ${R} while it is in range.`]
      : ["An unstaked position earns the pool's swap fees while it is in range."],
  );
  return [
    { title: "Holdings", bullets: holdings },
    { title: "Risk", bullets: closed ? [] : rangeBullets(p, p.staked ? `earns no ${R}` : "earns no fees") },
  ].filter((g) => g.bullets.length > 0);
}

// ── The readout: Uniswap's then / now table, Aerodrome's rows ─────────────

/** Why a pool figure is set aside, after "set aside: ", in the readout's (i). */
export function asideText(a: PoolAside, which: "staked" | "unstaked", quote: string): string {
  switch (a.kind) {
    case "empty":
      return `no ${which} liquidity in range now`;
    case "young":
      return "the pool is younger than 30 days";
    case "thin":
      return `under ${floorText(a.floor, quote)} of ${which} liquidity in range ${a.at === "now" ? "now" : "30 days ago"}, which inflates the figure`;
    case "spike":
      return "a 30-day figure above 10%, which thin liquidity produces";
  }
}

const floorText = (floor: number, quote: string) =>
  quote === "WETH" ? `${floor} WETH` : `${floor.toLocaleString("en-US")} ${quote}`;

/** Why a pool figure is set aside, in a few words under its row. */
export function asideNote(a: PoolAside, which: "staked" | "unstaked", quote: string): string {
  switch (a.kind) {
    case "empty":
      return `no ${which} liquidity in range`;
    case "young":
      return "pool under 30 days old";
    case "thin":
      return `under ${floorText(a.floor, quote)} ${which} in range ${a.at === "now" ? "now" : "then"}`;
    case "spike":
      return "above 10%, from thin liquidity";
  }
}

/** The AERO sentence Miles reads closely: what a staked position earns, and where its fees go. */
export const stakedEarns = (site: SlipstreamSite): string =>
  `A staked position earns ${site.reward.symbol} in place of trading fees, which go to the voters who direct ${site.reward.symbol} to this pool.`;
export const STAKED_EARNS = stakedEarns(AERODROME);

/** Why the position has no 30-day figure, in full, for the (i); null where it has one. */
export function windowText(p: AeroPosition): string | null {
  const R = p.site.reward.symbol;
  const w = p.window;
  switch (w.kind) {
    case "no-pool":
    case "whole":
      return null;
    case "minted":
      // A gauge's deposit time before the first daily read dates the position earlier; the first
      // figure stands on the first midnight after it.
      if (w.stakedAt !== null && (w.firstSeen === null || w.stakedAt < w.firstSeen))
        return `Minted inside the window and staked on ${day(w.stakedAt)}, so its first 30-day figure is on ${day(firstOn(w.stakedAt))}.`;
      return w.firstSeen !== null
        ? `Minted inside the window and first read on ${day(w.firstSeen)}, so its first 30-day figure is on ${day(w.firstSeen + 30 * DAY)}.`
        : "Minted inside the window, so it has no 30-day figure yet.";
    case "liquidity-changed":
      return "Its liquidity changed inside the window, so it has no 30-day figure yet.";
    case "staked-inside":
      return w.at !== null
        ? `Staked on ${day(w.at)}, inside the window; no read was taken that day, so it has no 30-day ${R} figure.`
        : `Staked inside the window, on a day the gauge does not record, so it has no 30-day ${R} figure.`;
    case "unstaked-inside":
      return "It left the gauge inside the window and earns fees only from that day, which the reads do not show, so it has no 30-day fee figure.";
  }
}

const firstOn = (stakedAt: number) => Math.ceil(stakedAt / DAY) * DAY + 30 * DAY;

/** Why the position has no 30-day figure, in a few words under its row. */
function windowNote(p: AeroPosition): string | undefined {
  const w = p.window;
  switch (w.kind) {
    case "no-pool":
      return "pool under 30 days old";
    case "whole":
      return undefined;
    case "minted":
      if (w.stakedAt !== null && (w.firstSeen === null || w.stakedAt < w.firstSeen))
        return WINDOW_NOTE.firstOn(firstOn(w.stakedAt));
      return w.firstSeen !== null ? WINDOW_NOTE.firstOn(w.firstSeen + 30 * DAY) : WINDOW_NOTE.minted;
    case "liquidity-changed":
      return WINDOW_NOTE.changed;
    case "staked-inside":
      return "staked inside the 30 days";
    case "unstaked-inside":
      return "left the gauge inside the 30 days";
  }
}

export const penaltyText = (pen: { bps: number; until: number }, reward: string = "AERO"): string =>
  `Claiming or unstaking before ${dayTime(pen.until)} gives up ${pen.bps >= 10_000 ? "all" : feePct(pen.bps * 100)} of the ${reward} to claim.`;

/** The pool's two figures in full, for the (i): fees per unstaked position, AERO per staked one, the
 *  holder's kind first, and why either is set aside. */
export function poolEarnText(p: AeroPosition): string[] {
  const Q = p.quote.symbol;
  const R = p.site.reward.symbol;
  const pool = p.pool30d;
  // A young pool: the table's (i) says so once, under How it compares.
  if (pool.fullRangeFees === null) return [];
  // Both set aside for one reason: said once.
  if (pool.feesAside && pool.aeroAside && pool.feesAside.kind === pool.aeroAside.kind && pool.feesAside.kind !== "thin")
    return [`The pool's fee and ${R} figures are set aside: ${asideText(pool.feesAside, "unstaked", Q)}.`];
  if (pool.feesAside?.kind === "thin" && pool.aeroAside?.kind === "thin" && pool.feesAside.at === pool.aeroAside.at)
    return [
      `The pool's fee and ${R} figures are set aside: under ${pool.feesAside.floor.toLocaleString("en-US")} ${Q} of unstaked or of staked liquidity in range ${pool.feesAside.at === "now" ? "now" : "30 days ago"}, which inflates them.`,
    ];
  const fees =
    pool.feesAside !== null
      ? `The pool's fee figure for an unstaked position is set aside: ${asideText(pool.feesAside, "unstaked", Q)}.`
      : "Full range fees: what a full-range unstaked position in this pool earned in fees in 30 days, as a share of its value.";
  const aero =
    pool.aeroAside !== null
      ? `The pool's ${R} figure for a staked position is set aside: ${asideText(pool.aeroAside, "staked", Q)}.`
      : pool.fullRangeAero !== null
        ? `Full range ${R}: what a full-range staked position earned in ${R} in 30 days, as a share of its value.`
        : `${R} has no price in this pool's quote token, so the pool has no ${R} figure.`;
  return p.staked ? [aero, fees] : [fees, aero];
}

/** The readout as a table: the position's rows, then the pool's. */
export function readoutTable(p: AeroPosition): PoolTable {
  const B = p.base.symbol;
  const Q = p.quote.symbol;
  const R = p.site.reward.symbol;
  const closed = BigInt(p.liquidity) === BigInt(0);
  const minted = p.window.kind === "minted";
  const why = windowNote(p);
  const a = p.aero;

  const earned: PoolRow = p.staked
    ? {
        key: "earned",
        part: "yours",
        label: `${R} rewards`,
        then: null,
        now: a && a.earned30d !== null ? `${num(a.earned30d)} ${R}` : "—",
        single: true,
        ...(a && a.earned30d !== null
          ? a.earned30dValue !== null && a.earned30d > 0
            ? { note: `worth ${num(a.earned30dValue)} ${Q} now` }
            : {}
          : why
            ? { note: why }
            : {}),
      }
    : {
        key: "earned",
        part: "yours",
        label: "Swap fees",
        then: null,
        now: p.fees30d !== null ? `${num(p.fees30d)} ${Q}` : "—",
        single: true,
        ...(p.fees30d === null && why ? { note: why } : {}),
      };
  const against: PoolRow[] =
    p.againstHolding !== null
      ? [
          {
            key: "against",
            part: "yours",
            label: "Impermanent loss",
            then: null,
            now: loss(p.againstHolding),
            single: true,
          },
          ...(p.againstHoldingWithEarnings !== null
            ? [
                {
                  key: "withEarned",
                  part: "yours",
                  label: p.staked ? `With ${R}` : "With fees",
                  then: null,
                  now: loss(p.againstHoldingWithEarnings),
                  single: true,
                } as PoolRow,
              ]
            : []),
        ]
      : [];
  const open: PoolRow[] = closed
    ? []
    : [
        {
          key: "share",
          part: "yours",
          label: p.staked ? "Staked liquidity share" : "Unstaked liquidity share",
          then: null,
          now: shareText(p.inRange, p.shareOfPaying),
          single: true,
          ...(p.inRange ? {} : { note: "out of range" }),
        },
        ...(a?.penalty
          ? [
              {
                key: "penalty",
                part: "yours",
                label: "Unstake penalty",
                then: null,
                now: a.penalty.bps >= 10_000 ? "All" : feePct(a.penalty.bps * 100),
                single: true,
                note: `until ${dayTime(a.penalty.until)}`,
              } as PoolRow,
            ]
          : []),
        {
          key: "withdrawals",
          part: "yours",
          label: "Withdrawals",
          then: null,
          now: "Open",
          single: true,
          ...(p.staked ? { note: "unstake from the gauge first" } : {}),
        },
      ];
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
    ...daysRow(closed ? null : p.daysInRange, minted ? "minted" : null),
    earned,
    ...against,
    ...open,
  ];

  const pool30 = p.pool30d;
  const young = pool30.fullRangeFees === null;
  const feesRow: PoolRow = {
    key: "fullRange",
    part: "pool",
    label: "Full range fees",
    then: null,
    now: young || pool30.feesAside ? "—" : share(pool30.fullRangeFees ?? 0),
    single: true,
    ...(young
      ? { note: "pool under 30 days old" }
      : pool30.feesAside
        ? { note: asideNote(pool30.feesAside, "unstaked", Q) }
        : {}),
  };
  const rewardRow: PoolRow = {
    key: "fullRangeReward",
    part: "pool",
    label: `Full range ${R}`,
    then: null,
    now: young || pool30.aeroAside || pool30.fullRangeAero === null ? "—" : share(pool30.fullRangeAero),
    single: true,
    ...(young
      ? { note: "pool under 30 days old" }
      : pool30.aeroAside
        ? { note: asideNote(pool30.aeroAside, "staked", Q) }
        : pool30.fullRangeAero === null
          ? { note: `${R} has no price in ${Q}` }
          : {}),
  };
  const f = p.fees;
  const cut = (x: number) => (x > 0 ? feePct(x) : "None");
  const b = pool30.balances;
  const pool: PoolRow[] = [
    ...priceRows(p),
    ...(b ? tokenRows("pool", B, Q, b, pool30.balancesThen) : []),
    ...(p.staked ? [rewardRow, feesRow] : [feesRow, rewardRow]),
    {
      key: "swapFee",
      part: "pool",
      label: "Swap fee",
      then: f.lpThen !== null ? feePct(f.lpThen) : null,
      now: feePct(f.lp),
    },
    ...(p.staked
      ? []
      : [
          {
            key: "protocolFee",
            part: "pool",
            label: "Protocol fee",
            then: f.unstakedThen !== null ? cut(f.unstakedThen) : null,
            now: cut(f.unstaked),
          } as PoolRow,
        ]),
  ];
  const held = !closed || (p.holdsThen !== null && (p.holdsThen.base > 0 || p.holdsThen.quote > 0));
  return {
    then: p.priceThen !== null ? day(p.then.time) : null,
    groups: [...(held ? [{ title: READOUT.position, rows: position }] : []), { title: READOUT.pool, rows: pool }],
  };
}

/** The readout's (i): how the columns compare, then what the position's rows and the pool's mean. */
export function readoutExplainer(p: AeroPosition): ExplainGroupWords[] {
  const R = p.site.reward.symbol;
  const P = p.site.label;
  const closed = BigInt(p.liquidity) === BigInt(0);
  const wt = windowText(p);
  const position: Seg[][] = [
    [
      p.staked
        ? stakedEarns(p.site)
        : "Each swap pays the pool's fee to the unstaked liquidity in range at that moment.",
    ],
    ...(wt ? [[wt]] : []),
    [
      "Impermanent loss is how much less the position is worth now than the tokens it held 30 days ago, both at today's price.",
      "The row under it takes the 30-day earnings off that loss. Below zero, they outweighed it.",
    ],
    [
      p.staked
        ? `The position's share is of the staked liquidity in range now, which splits the gauge's ${R}.`
        : "The position's share is of the unstaked liquidity in range now, which splits the swap fees.",
    ],
    ...(p.aero?.penalty ? [[penaltyText(p.aero.penalty, R)]] : []),
    p.staked
      ? ["The gauge holds a staked position until the wallet that staked it takes it back, at any block."]
      : ["A Slipstream pool has no pause and no step that can stop or charge a withdrawal."],
  ];
  const pool: Seg[][] = [
    ...poolEarnText(p).map((t): Seg[] => [t]),
    ...(p.staked ? [] : [["Protocol fee: the share of an unstaked position's fees the pool's voters take."]]),
    [
      p.staked
        ? `${P} sets the swap fee through a fee module on the pool's factory, and can change it from swap to swap.`
        : `${P} sets both fees through fee modules on the pool's factory, and can change them from swap to swap.`,
    ],
  ];
  return [
    {
      title: "How it compares",
      bullets:
        p.priceThen !== null
          ? [
              ["The first column is the block at a UTC midnight 30 days back, on the date shown."],
              ["Now is the block this page read."],
            ]
          : [["The pool is younger than 30 days, so the table shows now only."]],
    },
    { title: READOUT.position, bullets: closed && !p.holdsThen ? [] : position },
    { title: READOUT.pool, bullets: pool },
  ].filter((g) => g.bullets.length > 0);
}

// ── The front door and a wallet's positions ────────────────────────────────

/** The front door's and the wallet page's words on a site. */
export const frontDoorWords = (site: SlipstreamSite) => ({
  line: `A wallet's ${site.label} Slipstream positions on ${site.chainName}, staked or not, each with its range, fees or ${site.reward.symbol} and pool over the last 30 days.`,
  heading: `${site.label} positions`,
  none: `This address holds no ${site.label} Slipstream position with liquidity in it.`,
  truncated: "This wallet holds more than 200 positions on one deployment; Rails read the newest 200.",
  unanswered: "The read of this wallet's positions did not answer. Try again in a minute.",
  row: (p: AeroPositionsRead["positions"][number]) =>
    `${positionNumber(p.id)} · ${p.token0.symbol}/${p.token1.symbol} · tick spacing ${p.tickSpacing}`,
  staked: "Staked",
  unstaked: "Not staked",
});
