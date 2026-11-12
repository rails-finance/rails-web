// An Aave V4 spoke reserve's configuration change explained (anatomy M3.6,
// ui-jobs 548), one row of config-words.ts at a time, read against the row
// before it of its kind: the timeline row's head (a verb summary and the figure
// that moved) and, opened, plain-language bullets on what the setting does and
// what this change means for a supplier or a borrower
// (components/shared/config-change-timeline.tsx). Every string is in WORDS; the logic below picks and fills them. Pure: no
// runtime imports, so the unit test (scripts/test/aave-v4-config-explain.test.mjs)
// runs it under node.
//
// The facts, from aave/aave-v4 at a3ef63e:
//   caps, line, threshold  IHub.sol 71–75; Hub.sol 814–858 (`_validateAdd`,
//                          `_validateRemove`, `_validateDraw`: the draw cap
//                          counts drawn, premium and deficit), 860–873
//   liquidity fee          IHub.sol 20; AssetLogic.sol 188–225
//   reinvestment           IHub.sol 326–333
//   flags                  ISpoke.sol 57–60; Spoke.sol 862–893;
//                          LiquidationLogic.sol 533–560
//   collateral risk        ISpoke.sol 41; Spoke.sol 795–803 (the risk premium)
//   collateral terms       ISpoke.sol 70–72
//   liquidation settings   ISpoke.sol 80–82; SpokeInstance.sol 23–32 (the
//                          defaults `initialize` writes); LiquidationLogic.sol 312–333
//                          (the bonus between its minimum and maximum), 795–812
//                          (debt repaid to the target health factor)
//   rate curve             AssetInterestRateStrategy.sol 102–137

import type { V4Change, V4ChangeSide, V4ConfigRow } from "./config-words";
import type { ChangeGlyph, ChangeMark } from "../shared/change-mark";

/** config-words.ts V4_NO_CAP: 2^40 − 1 whole tokens (Hub.sol MAX_ALLOWED_SPOKE_CAP). */
const NO_CAP = "1099511627775";

export interface V4ExplainNames {
  symbol: string;
  spoke: string;
  hub: string;
  /** The compact figure (lib/shared/compact-figure.ts `compactFigure`). */
  compact: (n: number) => string;
}

/** One part of a change's head. */
interface V4ChangeHead {
  summary: string;
  figure?: string;
  side: V4ChangeSide;
  /** The node's mark for this move; none, the neutral sliders. */
  mark?: ChangeMark;
}

/** A change's head line, its figure and what it means. */
export interface V4ChangeExplained {
  headline: string;
  /** The node's mark: the first move's family, direction and tone. */
  mark: ChangeMark;
  figure?: string;
  bullets: string[];
}

type N = V4ExplainNames;
type Dir = "raised" | "lowered";

// ── The words ───────────────────────────────────────────────────────────────

const WORDS = {
  listed: "Listed",
  listing: (n: N) => [
    `${n.spoke} began offering ${n.symbol}: its suppliers and borrowers use the ${n.hub} hub's ${n.symbol}.`,
    `${n.spoke} sets the terms its ${n.symbol} suppliers and borrowers meet: the price, the collateral terms and whether ${n.symbol} can be borrowed.`,
  ],

  lineSet: "Credit line set",
  lineOn: "Credit line on",
  lineOff: "Credit line off",
  lineHalted: "Credit line halted",
  lineResumed: "Credit line resumed",
  lineRestated: "Credit line restated",
  caps: (d: Dir | "changed") => `Caps ${d}`,
  addCap: (d: Dir | "set" | "removed") => `Add cap ${d}`,
  drawCap: (d: Dir | "set" | "removed") => `Draw cap ${d}`,
  threshold: "Risk premium threshold changed",
  lineWhat: (n: N) =>
    `The credit line sets how much ${n.symbol} ${n.spoke} can supply to and borrow from the ${n.hub} hub.`,
  lineFirst: (n: N, add: string, draw: string) =>
    `This first line let ${n.spoke}'s suppliers add up to ${add} and its borrowers owe up to ${draw}.`,
  lineStops: (n: N) =>
    `While the line is off, the ${n.hub} hub stops ${n.spoke}'s ${n.symbol} supplies, withdrawals, borrows and repayments.`,
  lineStays: (n: N) => `Positions on ${n.spoke} stay as they are until the line is back on.`,
  lineAgain: (n: N) =>
    `The ${n.hub} hub takes ${n.spoke}'s ${n.symbol} supplies, withdrawals, borrows and repayments again.`,
  haltStops: (n: N) =>
    `A halted line stops ${n.spoke}'s ${n.symbol} supplies, withdrawals, borrows and repayments through the ${n.hub} hub.`,
  addWhat: (n: N) =>
    `The add cap is the most ${n.symbol} suppliers on ${n.spoke} can put into the ${n.hub} hub, in total.`,
  drawWhat: (n: N) =>
    `The draw cap is the most ${n.symbol} borrowers on ${n.spoke} can owe the ${n.hub} hub, in total.`,
  addRaised: (n: N, by: string, to: string) =>
    `Raising the add cap by ${by}, to ${to}, adds that much room for supply on ${n.spoke}.`,
  addLowered: (n: N, to: string) => `New supply on ${n.spoke} now stops once the total reaches ${to}.`,
  addOpen: (n: N) => `Suppliers on ${n.spoke} can now add any amount.`,
  drawRaised: (n: N, by: string, to: string) =>
    `Raising the draw cap by ${by}, to ${to}, adds that much room for borrowing on ${n.spoke}.`,
  drawLowered: (n: N, to: string) => `New borrowing on ${n.spoke} now stops once the total owed reaches ${to}.`,
  drawOpen: (n: N) => `Borrowers on ${n.spoke} can now borrow any amount the hub holds.`,
  capsRaised: (n: N, by: string) =>
    `Raising both caps by ${by} adds that much room for supply and for borrowing on ${n.spoke}.`,
  capsRaisedApart: (n: N, add: string, draw: string) =>
    `Raising the caps adds ${add} of room for supply and ${draw} for borrowing on ${n.spoke}.`,
  thresholdWhat: (n: N) =>
    `The risk premium threshold is the most premium ${n.spoke}'s borrowers may owe, as a share of what they have drawn.`,
  lineAgainSame: (n: N) => `The ${n.hub} hub wrote ${n.spoke}'s credit line again with the same values.`,

  frozen: "Frozen",
  unfrozen: "Unfrozen",
  paused: "Paused",
  unpaused: "Unpaused",
  borrowOn: "Borrowing turned on",
  borrowOff: "Borrowing turned off",
  sharesOn: "Liquidator payout widened",
  sharesOff: "Liquidator payout narrowed",
  risk: (d: Dir) => `Collateral risk ${d}`,
  reserveSet: "Reserve settings set",
  reserveRestated: "Reserve settings restated",
  frozenStops: (n: N) => `Freezing stops new supply and new borrowing of ${n.symbol} on ${n.spoke}.`,
  frozenGoesOn: "Suppliers can still withdraw and borrowers can still repay; liquidations go on.",
  unfrozenAgain: (n: N) => `${n.spoke} takes new ${n.symbol} supply and borrowing again.`,
  pausedStops: (n: N) =>
    `Pausing stops every action on ${n.symbol} at ${n.spoke}: supply, withdrawal, borrowing, repayment and liquidation.`,
  unpausedAgain: (n: N) => `Every action on ${n.symbol} at ${n.spoke} works again.`,
  borrowOffWhat: (n: N) => `${n.spoke} stops lending ${n.symbol}; open loans stay open and can be repaid.`,
  borrowOnWhat: (n: N) => `${n.spoke} lends ${n.symbol} again.`,
  sharesOnWhat: (n: N) =>
    `A liquidator may take seized ${n.symbol} as ${n.symbol} supplied on ${n.spoke}, earning interest, in place of the tokens.`,
  sharesOffWhat: (n: N) => `A liquidator takes seized ${n.symbol} as tokens only.`,
  riskWhat: (n: N) =>
    `Collateral risk sets the premium a borrower pays on top of the borrow rate when ${n.symbol} backs the loan.`,
  riskUp: (n: N) => `Borrowers who post ${n.symbol} as collateral on ${n.spoke} now pay a higher premium.`,
  riskDown: (n: N) => `Borrowers who post ${n.symbol} as collateral on ${n.spoke} now pay a lower premium.`,
  reserveLends: (n: N) => `${n.spoke} lends ${n.symbol}: borrowing is on.`,
  reserveNoLend: (n: N) => `Borrowing ${n.symbol} on ${n.spoke} is off.`,
  reserveRisk: (n: N, p: string) => `${n.symbol}'s collateral risk on ${n.spoke} is ${p}.`,
  reserveSame: (n: N) => `${n.spoke} wrote ${n.symbol}'s settings again with the same values.`,

  priceSet: "Price source set",
  priceChanged: "Price source changed",
  priceRestated: "Price source restated",
  priceWhat: (n: N) => `The price source is the feed ${n.spoke} reads ${n.symbol}'s USD price from.`,
  priceFollows: (n: N) => `Every ${n.symbol} collateral and debt value on ${n.spoke} now follows the new feed.`,
  priceFollowsFirst: (n: N) => `Every ${n.symbol} collateral and debt value on ${n.spoke} follows this feed.`,
  priceSame: (n: N) => `${n.spoke} named the same feed again.`,

  termsSet: "Collateral terms set",
  termsSame: "New collateral terms, same values",
  termsRewritten: "Collateral terms rewritten",
  cf: (d: Dir) => `Collateral factor ${d}`,
  bonus: (d: Dir) => `Max liquidation bonus ${d}`,
  liqFee: (d: Dir) => `Liquidation fee ${d}`,
  cfWhat: (n: N) =>
    `The collateral factor is the share of supplied ${n.symbol}'s value that counts toward a borrow on ${n.spoke}.`,
  cfNone: (n: N) => `At 0%, ${n.symbol} supplied on ${n.spoke} backs no borrowing.`,
  cfSome: (n: N, p: string, per100: string) =>
    `At ${p}, each $100 of ${n.symbol} supplied supports up to $${per100} of borrowing.`,
  bonusWhat: (n: N) =>
    `The max liquidation bonus is the most extra ${n.symbol} a liquidator can take over the debt repaid.`,
  bonusNow: (p: string) => `A liquidator now takes up to ${p} extra.`,
  liqFeeWhat: "The liquidation fee is the part of a liquidator's bonus the protocol keeps.",
  liqFeeNow: (p: string) => `The protocol now keeps ${p} of each bonus.`,
  rewriteReach: "Every position on these terms takes the new values at once.",

  liqSet: "Liquidation settings set",
  liqDefaults: "Liquidation settings at their defaults",
  liqDefaultsWhat: (n: N) => `${n.spoke} took its default liquidation settings when it was set up.`,
  liqDefaultsTarget:
    "At the defaults, a liquidation repays enough debt to bring the position's health factor back to 1.00.",
  liqDefaultsBonus:
    "At the defaults, a liquidator's bonus grows from none at a health factor of 1 to the full maximum at 0.",
  liqChanged: "Liquidation settings changed",
  liqRestated: "Liquidation settings restated",
  liqScope: (n: N) => `These settings apply to every liquidation on ${n.spoke}, whatever the collateral.`,
  liqTarget: (hf: string) => `A liquidation repays enough debt to bring the position's health factor back to ${hf}.`,
  liqSame: (n: N) => `${n.spoke} wrote its liquidation settings again with the same values.`,
  liqBonus: (p: string, hf: string) =>
    `A liquidator's bonus starts at ${p} of the maximum and reaches the full maximum at a health factor of ${hf}.`,

  feeSet: "Liquidity fee set",
  fee: (d: Dir) => `Liquidity fee ${d}`,
  feeRestated: "Liquidity fee restated",
  strategy: "Rate strategy replaced",
  receiver: "Fee receiver changed",
  controller: (d: "set" | "changed" | "removed") => `Reinvestment controller ${d}`,
  feeWhat: (n: N) => `The liquidity fee is the share of borrowers' interest the ${n.hub} hub keeps as a fee.`,
  feeShare: (n: N, p: string, rest: string) =>
    `At ${p}, ${n.symbol} suppliers on the ${n.hub} hub earn ${rest} of the interest borrowers pay.`,
  feeFirstAlso: "The hub also named the rate strategy and the receiver of its fees.",
  strategyWhat: (n: N) => `The ${n.hub} hub now sets ${n.symbol}'s borrow rate from a new rate strategy.`,
  receiverWhat: (n: N) => `The ${n.hub} hub's ${n.symbol} fees now go to a new receiver.`,
  controllerWhat: (n: N) => `A reinvestment controller can move idle ${n.symbol} out of the hub to earn elsewhere.`,
  controllerGone: (n: N) => `Idle ${n.symbol} now stays in the hub.`,
  feeSame: (n: N) => `The ${n.hub} hub wrote ${n.symbol}'s fee and strategy again with the same values.`,

  curveSet: "Rate curve set",
  curveChanged: "Rate curve changed",
  curveRestated: "Rate curve restated",
  curveWhat: (n: N) =>
    `The rate curve sets the ${n.hub} hub's ${n.symbol} borrow rate from the share of its ${n.symbol} lent out.`,
  curveShape: (base: string, opt: string, atOpt: string, full: string) =>
    `The rate starts at ${base}, rises to ${atOpt} at ${opt} usage and to ${full} at full usage.`,
  curveBase: (to: string, from: string) => `With nothing lent out the rate is now ${to}, from ${from}.`,
  curveTurn: (to: string, from: string) => `The curve now turns at ${to} usage, from ${from}.`,
  curveAtOpt: (opt: string, to: string, from: string) => `At ${opt} usage the rate is now ${to}, from ${from}.`,
  curveFull: (to: string, from: string) => `At full usage the rate is now ${to}, from ${from}.`,
  curveReach: (n: N) =>
    `The change reaches every ${n.symbol} borrower on the ${n.hub} hub, whatever their spoke, and moves the supply rate with it.`,
  curveSame: (n: N) => `The ${n.hub} hub wrote ${n.symbol}'s rate curve again with the same values.`,
} as const;

// ── Reading a change ────────────────────────────────────────────────────────

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const bps = (v: unknown) => Number(v ?? 0);
const lower = (v: unknown) => String(v ?? "").toLowerCase();
const wad = (v: unknown) =>
  (Number(BigInt(String(v ?? "0")) / BigInt(10 ** 12)) / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
const dir = (a: number, b: number): Dir => (b > a ? "raised" : "lowered");
const ZERO = "0x0000000000000000000000000000000000000000";

/** A node's mark. */
const mark = (glyph: ChangeGlyph, direction?: "up" | "down", tone?: "caution"): ChangeMark => ({
  glyph,
  ...(direction ? { direction } : {}),
  ...(tone ? { tone } : {}),
});
const arrow = (d: Dir | string) => (d === "raised" ? "up" : d === "lowered" ? "down" : undefined);
/** One arrow for several moves: their common direction, none where they differ. */
const common = (ds: ("up" | "down")[]) => (ds.length && ds.every((d) => d === ds[0]) ? ds[0] : undefined);

/** A cap in the head's compact form, the symbol after: "40M USDC", "no cap". */
const capFig = (n: N, v: unknown) => (String(v) === NO_CAP ? "no cap" : `${n.compact(Number(v))} ${n.symbol}`);
/** "40.0M → 50.0M USDC", the symbol once where both sides are tokens. */
const capMove = (n: N, a: unknown, b: unknown) =>
  String(a) !== NO_CAP && String(b) !== NO_CAP
    ? `${n.compact(Number(a))} → ${n.compact(Number(b))} ${n.symbol}`
    : `${capFig(n, a)} → ${capFig(n, b)}`;
/** "add 18.0M → 40.0M, draw 15.0M → 36.0M USDC": both caps, the symbol once where it can be. */
function capsApart(n: N, a: V4ConfigRow, b: V4ConfigRow) {
  const bounded = [a.addCap, b.addCap, a.drawCap, b.drawCap].every((v) => String(v) !== NO_CAP);
  if (!bounded) return `add ${capMove(n, a.addCap, b.addCap)}, draw ${capMove(n, a.drawCap, b.drawCap)}`;
  const c = (v: unknown) => n.compact(Number(v));
  return `add ${c(a.addCap)} → ${c(b.addCap)}, draw ${c(a.drawCap)} → ${c(b.drawCap)} ${n.symbol}`;
}
const capRank = (v: unknown) => (String(v) === NO_CAP ? Infinity : Number(v));

/** What one cap's move reads as, in the head and in the bullets. */
function capChange(n: N, which: "add" | "draw", a: unknown, b: unknown): { head: V4ChangeHead; bullet: string } {
  const name = which === "add" ? WORDS.addCap : WORDS.drawCap;
  const free = String(b) === NO_CAP;
  const was = String(a) === NO_CAP;
  const d: Dir | "set" | "removed" = free ? "removed" : was ? "set" : dir(Number(a), Number(b));
  const to = capFig(n, b);
  const bullet = free
    ? which === "add"
      ? WORDS.addOpen(n)
      : WORDS.drawOpen(n)
    : d === "raised"
      ? (which === "add" ? WORDS.addRaised : WORDS.drawRaised)(n, n.compact(Number(b) - Number(a)), to)
      : which === "add"
        ? WORDS.addLowered(n, to)
        : WORDS.drawLowered(n, to);
  const up = d === "removed" ? "up" : arrow(d);
  return { head: { summary: name(d), figure: capMove(n, a, b), side: "hub", mark: mark("gauge", up) }, bullet };
}

type Read = { head: V4ChangeHead[]; bullets: string[] };

function creditLine(n: N, prev: V4ConfigRow | undefined, r: V4ConfigRow): Read {
  const side = "hub" as const;
  if (!prev) {
    const same = String(r.addCap) === String(r.drawCap);
    return {
      head: [
        {
          summary: WORDS.lineSet,
          figure: same ? capFig(n, r.addCap) : `add ${capFig(n, r.addCap)}, draw ${capFig(n, r.drawCap)}`,
          side,
          mark: mark("gauge"),
        },
      ],
      bullets: [WORDS.lineWhat(n), WORDS.lineFirst(n, capFig(n, r.addCap), capFig(n, r.drawCap))],
    };
  }
  const head: V4ChangeHead[] = [];
  const bullets: string[] = [];
  if (Boolean(prev.active) !== Boolean(r.active)) {
    head.push({
      summary: r.active === true ? WORDS.lineOn : WORDS.lineOff,
      side,
      mark: r.active === true ? mark("plug") : mark("unplug", undefined, "caution"),
    });
    bullets.push(...(r.active === true ? [WORDS.lineAgain(n)] : [WORDS.lineStops(n), WORDS.lineStays(n)]));
  }
  if (Boolean(prev.halted) !== Boolean(r.halted)) {
    head.push({
      summary: r.halted === true ? WORDS.lineHalted : WORDS.lineResumed,
      side,
      mark: r.halted === true ? mark("unplug", undefined, "caution") : mark("plug"),
    });
    bullets.push(r.halted === true ? WORDS.haltStops(n) : WORDS.lineAgain(n));
  }
  const addMoved = String(prev.addCap) !== String(r.addCap);
  const drawMoved = String(prev.drawCap) !== String(r.drawCap);
  if (addMoved && drawMoved) {
    const sameMove = String(prev.addCap) === String(prev.drawCap) && String(r.addCap) === String(r.drawCap);
    const up = capRank(r.addCap) > capRank(prev.addCap);
    const both = up === capRank(r.drawCap) > capRank(prev.drawCap);
    head.push({
      summary: WORDS.caps(both ? (up ? "raised" : "lowered") : "changed"),
      figure: sameMove ? capMove(n, prev.addCap, r.addCap) : capsApart(n, prev, r),
      side,
      mark: mark("gauge", both ? (up ? "up" : "down") : undefined),
    });
    bullets.push(WORDS.addWhat(n), WORDS.drawWhat(n));
    const bounded = [prev.addCap, r.addCap, prev.drawCap, r.drawCap].every((v) => String(v) !== NO_CAP);
    const by = (a: unknown, b: unknown) => capFig(n, Number(b) - Number(a));
    if (sameMove && up && bounded) bullets.push(WORDS.capsRaised(n, by(prev.addCap, r.addCap)));
    else if (both && up && bounded)
      bullets.push(WORDS.capsRaisedApart(n, by(prev.addCap, r.addCap), by(prev.drawCap, r.drawCap)));
    else
      bullets.push(
        capChange(n, "add", prev.addCap, r.addCap).bullet,
        capChange(n, "draw", prev.drawCap, r.drawCap).bullet,
      );
  } else if (addMoved || drawMoved) {
    const which = addMoved ? "add" : "draw";
    const c = addMoved ? capChange(n, "add", prev.addCap, r.addCap) : capChange(n, "draw", prev.drawCap, r.drawCap);
    head.push(c.head);
    bullets.push(which === "add" ? WORDS.addWhat(n) : WORDS.drawWhat(n), c.bullet);
  }
  if (bps(prev.riskPremiumThreshold) !== bps(r.riskPremiumThreshold)) {
    head.push({ summary: WORDS.threshold, side });
    bullets.push(WORDS.thresholdWhat(n));
  }
  if (!head.length) return { head: [{ summary: WORDS.lineRestated, side }], bullets: [WORDS.lineAgainSame(n)] };
  return { head, bullets };
}

function reserveConfig(n: N, prev: V4ConfigRow | undefined, r: V4ConfigRow): Read {
  const side = "spoke" as const;
  if (!prev) {
    // The values as set, then what collateral risk does.
    const bullets = [
      ...(r.paused === true ? [WORDS.pausedStops(n)] : []),
      ...(r.frozen === true ? [WORDS.frozenStops(n)] : []),
      r.borrowable === true ? WORDS.reserveLends(n) : WORDS.reserveNoLend(n),
      WORDS.reserveRisk(n, pct(bps(r.collateralRisk))),
      r.receiveSharesEnabled === true ? WORDS.sharesOnWhat(n) : WORDS.sharesOffWhat(n),
      WORDS.riskWhat(n),
    ];
    return { head: [{ summary: WORDS.reserveSet, side }], bullets };
  }
  const head: V4ChangeHead[] = [];
  const bullets: string[] = [];
  const flip = (
    k: string,
    on: string,
    off: string,
    onB: string[],
    offB: string[],
    marks: [ChangeMark, ChangeMark] = [mark("sliders"), mark("sliders")],
  ) => {
    if (Boolean(prev[k]) === Boolean(r[k])) return;
    head.push({ summary: r[k] === true ? on : off, side, mark: marks[r[k] === true ? 0 : 1] });
    bullets.push(...(r[k] === true ? onB : offB));
  };
  flip(
    "paused",
    WORDS.paused,
    WORDS.unpaused,
    [WORDS.pausedStops(n)],
    [WORDS.unpausedAgain(n)],
    [mark("pause", undefined, "caution"), mark("play")],
  );
  flip(
    "frozen",
    WORDS.frozen,
    WORDS.unfrozen,
    [WORDS.frozenStops(n), WORDS.frozenGoesOn],
    [WORDS.unfrozenAgain(n)],
    [mark("snowflake", undefined, "caution"), mark("snowflake")],
  );
  flip(
    "borrowable",
    WORDS.borrowOn,
    WORDS.borrowOff,
    [WORDS.borrowOnWhat(n)],
    [WORDS.borrowOffWhat(n)],
    [mark("plug"), mark("unplug", undefined, "caution")],
  );
  flip("receiveSharesEnabled", WORDS.sharesOn, WORDS.sharesOff, [WORDS.sharesOnWhat(n)], [WORDS.sharesOffWhat(n)]);
  const a = bps(prev.collateralRisk);
  const b = bps(r.collateralRisk);
  if (a !== b) {
    head.push({
      summary: WORDS.risk(dir(a, b)),
      figure: `${pct(a)} → ${pct(b)}`,
      side,
      mark: mark("shield", arrow(dir(a, b))),
    });
    bullets.push(WORDS.riskWhat(n), b > a ? WORDS.riskUp(n) : WORDS.riskDown(n));
  }
  if (!head.length) return { head: [{ summary: WORDS.reserveRestated, side }], bullets: [WORDS.reserveSame(n)] };
  return { head, bullets };
}

function priceSource(n: N, prev: V4ConfigRow | undefined, r: V4ConfigRow): Read {
  const side = "spoke" as const;
  if (!prev)
    return {
      head: [{ summary: WORDS.priceSet, side, mark: mark("radio-tower") }],
      bullets: [WORDS.priceWhat(n), WORDS.priceFollowsFirst(n)],
    };
  if (lower(prev.source) === lower(r.source))
    return { head: [{ summary: WORDS.priceRestated, side }], bullets: [WORDS.priceSame(n)] };
  return {
    head: [{ summary: WORDS.priceChanged, side, mark: mark("radio-tower") }],
    bullets: [WORDS.priceWhat(n), WORDS.priceFollows(n)],
  };
}

function collateralTerms(n: N, c: V4Change, prev: V4ConfigRow | undefined, r: V4ConfigRow): Read {
  const side = "spoke" as const;
  const rewrite = c.row.kind === "dynamic-updated";
  const cfBullet = (v: number) => (v === 0 ? WORDS.cfNone(n) : WORDS.cfSome(n, pct(v), String(v / 100)));
  if (!prev)
    return {
      head: [{ summary: rewrite ? WORDS.termsRewritten : WORDS.termsSet, side, mark: mark("shield") }],
      bullets: [WORDS.cfWhat(n), cfBullet(bps(r.collateralFactor))],
    };
  const head: V4ChangeHead[] = [];
  const bullets: string[] = [];
  const move = (k: string, name: (d: Dir) => string, show: (v: number) => string, what: string, now: string) => {
    const a = bps(prev[k]);
    const b = bps(r[k]);
    if (a === b) return;
    head.push({ summary: name(dir(a, b)), figure: `${show(a)} → ${show(b)}`, side });
    moves.push(b > a ? "up" : "down");
    bullets.push(what, now);
  };
  const moves: ("up" | "down")[] = [];
  const cf = bps(r.collateralFactor);
  move("collateralFactor", WORDS.cf, pct, WORDS.cfWhat(n), cfBullet(cf));
  const bonus = (v: number) => pct(v - 10_000);
  move(
    "maxLiquidationBonus",
    WORDS.bonus,
    bonus,
    WORDS.bonusWhat(n),
    WORDS.bonusNow(bonus(bps(r.maxLiquidationBonus))),
  );
  move("liquidationFee", WORDS.liqFee, pct, WORDS.liqFeeWhat, WORDS.liqFeeNow(pct(bps(r.liquidationFee))));
  if (!head.length) head.push({ summary: rewrite ? WORDS.termsRewritten : WORDS.termsSame, side });
  else if (rewrite) head.unshift({ summary: WORDS.termsRewritten, side });
  // Collateral terms take an arrow where every moved term went one way.
  if (moves.length) head[0].mark = mark("shield", common(moves));
  if (rewrite) bullets.push(WORDS.rewriteReach);
  return { head, bullets };
}

/** The settings a spoke's initializer writes before any are set: a target
 *  health factor of 1 (WAD) and the bonus terms at zero (SpokeInstance.sol
 *  23–32, `initialize`, emitting UpdateLiquidationConfig). */
const DEFAULT_TARGET = "1000000000000000000";

function liquidationConfig(n: N, prev: V4ConfigRow | undefined, r: V4ConfigRow): Read {
  const side = "spoke" as const;
  if (
    !prev &&
    String(r.targetHealthFactor) === DEFAULT_TARGET &&
    String(r.healthFactorForMaxBonus) === "0" &&
    bps(r.liquidationBonusFactor) === 0
  )
    return {
      head: [{ summary: WORDS.liqDefaults, side, mark: mark("shield-alert") }],
      bullets: [WORDS.liqDefaultsWhat(n), WORDS.liqDefaultsTarget, WORDS.liqDefaultsBonus],
    };
  const target = lower(prev?.targetHealthFactor) !== lower(r.targetHealthFactor);
  const bonus =
    lower(prev?.healthFactorForMaxBonus) !== lower(r.healthFactorForMaxBonus) ||
    bps(prev?.liquidationBonusFactor) !== bps(r.liquidationBonusFactor) ||
    !prev;
  if (prev && !target && !bonus) return { head: [{ summary: WORDS.liqRestated, side }], bullets: [WORDS.liqSame(n)] };
  const bullets = [WORDS.liqScope(n)];
  if (target || !prev) bullets.push(WORDS.liqTarget(wad(r.targetHealthFactor)));
  if (bonus) bullets.push(WORDS.liqBonus(pct(bps(r.liquidationBonusFactor)), wad(r.healthFactorForMaxBonus)));
  return { head: [{ summary: prev ? WORDS.liqChanged : WORDS.liqSet, side, mark: mark("shield-alert") }], bullets };
}

function assetConfig(n: N, prev: V4ConfigRow | undefined, r: V4ConfigRow): Read {
  const side = "hub" as const;
  const fee = bps(r.liquidityFee);
  const share = [WORDS.feeWhat(n), WORDS.feeShare(n, pct(fee), pct(10_000 - fee))];
  if (!prev)
    return {
      head: [{ summary: WORDS.feeSet, figure: pct(fee), side, mark: mark("rate") }],
      bullets: [...share, WORDS.feeFirstAlso],
    };
  const head: V4ChangeHead[] = [];
  const bullets: string[] = [];
  const was = bps(prev.liquidityFee);
  if (was !== fee) {
    head.push({
      summary: WORDS.fee(dir(was, fee)),
      figure: `${pct(was)} → ${pct(fee)}`,
      side,
      mark: mark("rate", arrow(dir(was, fee))),
    });
    bullets.push(...share);
  }
  if (lower(prev.irStrategy) !== lower(r.irStrategy)) {
    head.push({ summary: WORDS.strategy, side });
    bullets.push(WORDS.strategyWhat(n));
  }
  if (lower(prev.feeReceiver) !== lower(r.feeReceiver)) {
    head.push({ summary: WORDS.receiver, side });
    bullets.push(WORDS.receiverWhat(n));
  }
  const c0 = lower(prev.reinvestmentController);
  const c1 = lower(r.reinvestmentController);
  if (c0 !== c1) {
    head.push({ summary: WORDS.controller(c0 === ZERO ? "set" : c1 === ZERO ? "removed" : "changed"), side });
    bullets.push(c1 === ZERO ? WORDS.controllerGone(n) : WORDS.controllerWhat(n));
  }
  if (!head.length) return { head: [{ summary: WORDS.feeRestated, side }], bullets: [WORDS.feeSame(n)] };
  return { head, bullets };
}

function rateCurve(n: N, prev: V4ConfigRow | undefined, r: V4ConfigRow): Read {
  const side = "hub" as const;
  const pts = (x: V4ConfigRow) => {
    const base = bps(x.baseDrawnRate);
    const atOpt = base + bps(x.rateGrowthBeforeOptimal);
    return { base, opt: bps(x.optimalUsageRatio), atOpt, full: atOpt + bps(x.rateGrowthAfterOptimal) };
  };
  const now = pts(r);
  if (!prev)
    return {
      head: [{ summary: WORDS.curveSet, side, mark: mark("rate") }],
      bullets: [WORDS.curveWhat(n), WORDS.curveShape(pct(now.base), pct(now.opt), pct(now.atOpt), pct(now.full))],
    };
  const was = pts(prev);
  const bullets: string[] = [];
  if (was.base !== now.base) bullets.push(WORDS.curveBase(pct(now.base), pct(was.base)));
  if (was.opt !== now.opt) bullets.push(WORDS.curveTurn(pct(now.opt), pct(was.opt)));
  if (was.atOpt !== now.atOpt) bullets.push(WORDS.curveAtOpt(pct(now.opt), pct(now.atOpt), pct(was.atOpt)));
  if (was.full !== now.full) bullets.push(WORDS.curveFull(pct(now.full), pct(was.full)));
  if (!bullets.length) return { head: [{ summary: WORDS.curveRestated, side }], bullets: [WORDS.curveSame(n)] };
  // The arrow where every point of the curve moved one way and its turn stayed.
  const pointMoves = (["base", "atOpt", "full"] as const)
    .filter((k) => was[k] !== now[k])
    .map((k) => (now[k] > was[k] ? ("up" as const) : ("down" as const)));
  const curveArrow = was.opt === now.opt ? common(pointMoves) : undefined;
  return {
    head: [{ summary: WORDS.curveChanged, side, mark: mark("rate", curveArrow) }],
    bullets: [WORDS.curveWhat(n), ...bullets, WORDS.curveReach(n)],
  };
}

/** One change read against the row before it of its kind (config-words.ts `prev`). */
function readChange(n: N, c: V4Change): Read {
  const { prev, row: r } = c;
  switch (r.kind) {
    case "reserve-added":
      return { head: [{ summary: WORDS.listed, side: "spoke", mark: mark("list-plus") }], bullets: WORDS.listing(n) };
    case "credit-line":
      return creditLine(n, prev, r);
    case "reserve-config":
      return reserveConfig(n, prev, r);
    case "price-source":
      return priceSource(n, prev, r);
    case "dynamic-added":
    case "dynamic-updated":
      return collateralTerms(n, c, prev, r);
    case "liquidation-config":
      return liquidationConfig(n, prev, r);
    case "asset-config":
      return assetConfig(n, prev, r);
    case "rate-curve":
      return rateCurve(n, prev, r);
    default:
      return { head: [{ summary: c.words, side: c.side }], bullets: [] };
  }
}

const low1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A change's head and explanation: the summaries in one line ("Credit line
 *  on, caps raised"), the figure where one part moved one, the bullets. */
export function v4ChangeExplain(c: V4Change, n: V4ExplainNames): V4ChangeExplained {
  const { head, bullets } = readChange(n, c);
  const figures = head.filter((h) => h.figure);
  return {
    headline: head.map((h, i) => (i ? low1(h.summary) : h.summary)).join(", "),
    mark: head[0]?.mark ?? mark("sliders"),
    ...(figures.length === 1 ? { figure: figures[0].figure } : {}),
    bullets,
  };
}
