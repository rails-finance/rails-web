// Lifetime flows for a PWN loan: the loan's rows replayed into the day rows
// the Lifetime flows panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "PWN").
// ----------------------------------------------------------------------------
// The position is the loan (rails-ops playbooks/pwn-loan-as-position.md §3):
// the page shows one loan, reached from either party, so the bars are the
// loan's two sides whichever party is viewing: the collateral the borrower
// locked and the debt the borrower owes the lender.
//
// Each side in its own token. PWN runs no oracle and the charter keeps it to
// amounts (rails-ops reference/pricing.md), so nothing values the collateral
// (often an NFT or a bundle) in the credit token: the collateral bar is in its
// token and the debt bar in the credit token, each on its own axis
// (`FlowTimeline.sideUnits`).
//
// The rows that move a token, and nothing else, are flow events:
//
//     created            collateral Locked in escrow; debt Principal (and, on
//                        v1.1, the whole fixed Interest: the repay total is
//                        owed from the start)
//     paid_back          collateral Returned at repayment; debt Interest (v1.2
//                        and v1.3: accrued to the repayment's minute) and
//                        Repaid (principal + interest)
//     claimed, defaulted collateral Claimed by the lender; debt Interest (to
//                        the deadline) and Cleared by the default claim
//
// An extension moves no token (v1.1 charges nothing; no v1.2/v1.3 extension
// with a compensation has fired), the LOAN note's mint and burn move none of
// the loan's, and a note holder's claim after repayment collects what the
// repayment already paid: none is a flow event.
//
// Interest. v1.1: the terms' repay total less the principal, owed in full
// from creation, so the debt is flat. v1.2/v1.3: the contract's sum
// (lib/pwn/economics.ts `accrueTo`): principal × APR × whole minutes since
// the start ÷ 5,256,000,000, plus the terms' fixed part. Between rows the debt
// grows by that sum to the end of each day; a repayment is refused once the
// deadline passes, so the debt stops at the deadline (the card's "Owed at the
// deadline"). A loan past its deadline that nobody has claimed still holds its
// collateral and owes the deadline's sum; at today the interest since creation
// is stated on the Interest line (`live.pending`).
//
// Pure: tested offline in scripts/verify/verify-pwn-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, PwnContext } from "@/lib/shared/types/event-shape";
import { isPwnEvent } from "@/lib/shared/types/event-shape";
import { accrueTo } from "@/lib/pwn/economics";

const DAY_S = 86_400;
const DUST = 1e-12;
const ZERO = BigInt(0);

/** Bucket keys. */
export const PWN = {
  locked: "pwn-locked",
  returned: "pwn-returned",
  claimed: "pwn-claimed",
  principal: "pwn-principal",
  interest: "pwn-interest",
  repaid: "pwn-repaid",
  cleared: "pwn-cleared",
} as const;

const COLL_KEYS = new Set<string>([PWN.locked, PWN.returned, PWN.claimed]);
const OUT_KEYS = new Set<string>([PWN.returned, PWN.claimed, PWN.repaid, PWN.cleared]);

/** The buckets in drawing order. */
export function pwnFlowBuckets(): FlowBucket[] {
  return [
    { key: PWN.locked, label: "Locked in escrow", event: "Loan created", side: "collateral", dir: "in" },
    { key: PWN.returned, label: "Returned at repayment", event: "Repayment", side: "collateral", dir: "out" },
    // The lender takes the collateral in place of the repayment the
    // borrower can no longer make: the loan's one outcome nobody chose on
    // the day.
    {
      key: PWN.claimed,
      label: "Claimed by the lender",
      event: "Default claim",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "pwn-default",
    },
    { key: PWN.principal, label: "Principal", event: "Loan created", side: "debt", dir: "in" },
    // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md).
    { key: PWN.interest, label: "Interest", event: "", side: "debt", dir: "in", hatch: "dashes" },
    { key: PWN.repaid, label: "Repaid", event: "Repayment", side: "debt", dir: "out" },
    {
      key: PWN.cleared,
      label: "Cleared by the default claim",
      event: "Default claim",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "pwn-default",
    },
  ];
}

/** The loan's terms as the replay reads them (the page's loan view). */
export interface PwnFlowLoan {
  loanId: string;
  version: string | null;
  /** Unix seconds and block of the creation. */
  createdAt: number;
  collSymbol: string;
  /** Units of collateral: an ERC-20's amount, an ERC-1155's count, 1 for an
   *  ERC-721. */
  collAmount: number;
  /** An NFT's token id, for the words. */
  collTokenId: string | null;
  creditSymbol: string;
  creditDecimals: number;
  principalRaw: string;
  /** v1.1: the terms' repay total (raw). */
  repayRaw: string | null;
  /** v1.2/v1.3: the APR (two decimals) and the fixed part (raw). */
  apr: number | null;
  fixedRaw: string | null;
  /** The deadline the loan ran to, its extensions included. */
  deadline: number | null;
}

/** One flow row of the loan. */
export interface PwnFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: "created" | "paid_back" | "default_claim";
}

type PwnEv = BaseActivityEvent & { context: { protocol: "pwn"; data: PwnContext } };

/** The loan's flow rows, oldest first: its creation, its repayment and a
 *  default claim. */
export function pwnFlowEvents(events: BaseActivityEvent[], loanId: string): PwnFlowEvent[] {
  return (events.filter(isPwnEvent) as PwnEv[])
    .filter((e) => e.context.data.loanId === loanId)
    .map((e): PwnFlowEvent | null => {
      const d = e.context.data;
      const kind =
        d.eventType === "created"
          ? "created"
          : d.eventType === "paid_back"
            ? "paid_back"
            : d.eventType === "claimed" && d.defaulted
              ? "default_claim"
              : null;
      if (!kind) return null;
      return { id: e.id, ts: e.timestamp, block: e.blockNumber, tx: e.txHash?.toLowerCase(), kind };
    })
    .filter((e): e is PwnFlowEvent => e != null)
    .sort((a, b) => a.block - b.block || a.ts - b.ts);
}

const human = (v: bigint, decimals: number): number => {
  if (decimals <= 0) return Number(v);
  const neg = v < ZERO;
  const s = (neg ? -v : v).toString().padStart(decimals + 1, "0");
  const n = Number(`${s.slice(0, -decimals)}.${s.slice(-decimals)}`);
  return neg ? -n : n;
};

const big = (v: string | null | undefined): bigint | null => {
  if (v == null || v === "") return null;
  try {
    return BigInt(v.split(".")[0]);
  } catch {
    return null;
  }
};

/** Does this loan's interest accrue by the minute? */
export const pwnAccrues = (l: PwnFlowLoan): boolean => (l.apr ?? 0) > 0;

/** What the loan owes at `t` (raw credit units): v1.1 its repay total; v1.2
 *  and v1.3 the contract's sum to `t`, stopped at the deadline. Null where
 *  the terms do not give it. */
export function pwnOwedRaw(l: PwnFlowLoan, t: number): bigint | null {
  const p = big(l.principalRaw);
  if (p == null) return null;
  if (!pwnAccrues(l)) {
    const repay = big(l.repayRaw);
    if (repay != null) return repay;
    return p + (big(l.fixedRaw) ?? ZERO);
  }
  const to = Math.max(l.createdAt, l.deadline != null ? Math.min(t, l.deadline) : t);
  const a = accrueTo(l.principalRaw, l.creditDecimals, l.apr!, l.fixedRaw, l.createdAt, to);
  return a ? BigInt(a.totalRaw) : null;
}

/** A replayed row's legs in tokens, by bucket. */
export interface PwnReplayed {
  ev: PwnFlowEvent;
  legs: { bucket: string; amount: number; raw?: bigint }[];
  /** Balances after the row, tokens (the debt also raw). */
  coll: number;
  debt: number;
  debtRaw: bigint;
}

/** The per-row replay. Null where the loan's terms do not give its debt. */
export function replayPwn(loan: PwnFlowLoan, events: PwnFlowEvent[]): PwnReplayed[] | null {
  const p = big(loan.principalRaw);
  if (p == null) return null;
  const dec = loan.creditDecimals;
  let coll = 0;
  let debt = ZERO;
  // Interest booked on the rows so far (raw).
  let booked = ZERO;
  const out: PwnReplayed[] = [];
  for (const ev of events) {
    const legs: PwnReplayed["legs"] = [];
    const add = (bucket: string, raw: bigint) => {
      if (raw <= ZERO) return;
      legs.push({ bucket, amount: human(raw, dec), raw });
    };
    if (ev.kind === "created") {
      if (loan.collAmount > 0) legs.push({ bucket: PWN.locked, amount: loan.collAmount });
      coll += loan.collAmount;
      add(PWN.principal, p);
      const owed = pwnOwedRaw(loan, loan.createdAt);
      if (owed == null) return null;
      // v1.1's whole fixed interest, or a v1.2/v1.3 fixed part.
      add(PWN.interest, owed - p);
      booked += owed - p;
      debt = owed;
    } else {
      if (coll > 0) legs.push({ bucket: ev.kind === "paid_back" ? PWN.returned : PWN.claimed, amount: coll });
      coll = 0;
      const owed = pwnOwedRaw(loan, ev.ts);
      if (owed == null) return null;
      // Interest built since the rows before booked theirs.
      const grown = owed - p - booked;
      add(PWN.interest, grown);
      booked += grown > ZERO ? grown : ZERO;
      add(ev.kind === "paid_back" ? PWN.repaid : PWN.cleared, owed);
      debt = ZERO;
    }
    out.push({ ev, legs, coll, debt: human(debt, dec), debtRaw: debt });
  }
  return out;
}

export interface PwnFlowOptions {
  /** Unix seconds now; the page's clock. */
  now: number;
}

/** The replay with each side's grain, for the timeline, the cards and the tests. */
export interface PwnFlowReplay {
  loan: PwnFlowLoan;
  replayed: PwnReplayed[];
  /** Grains per token of each side: the model's figures are the token × this. */
  grain: { collateral: number; debt: number };
  scale: { collateral: number; debt: number };
  /** Still held after the last row: no repayment and no claim. */
  open: boolean;
  /** What the loan owes now (tokens), where it is open. */
  owedNow: number;
  /** Interest the rows have not booked by now (tokens): the accrual on an
   *  open v1.2/v1.3 loan. */
  pendingInterest: number;
}

const legOf = (r: PwnReplayed, k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;

export function pwnFlowReplay(loan: PwnFlowLoan, events: PwnFlowEvent[], o: PwnFlowOptions): PwnFlowReplay | null {
  const replayed = replayPwn(loan, events);
  if (!replayed || replayed.length === 0 || replayed[0].ev.kind !== "created") return null;
  const last = replayed[replayed.length - 1];
  const open = last.ev.kind === "created";
  const owedNowRaw = open ? (pwnOwedRaw(loan, o.now) ?? last.debtRaw) : ZERO;
  const pendingRaw = open ? owedNowRaw - last.debtRaw : ZERO;
  const owedNow = human(owedNowRaw, loan.creditDecimals);
  const pendingInterest = pendingRaw > ZERO ? human(pendingRaw, loan.creditDecimals) : 0;
  // Each side's scale: about five significant digits of the largest figure
  // its bar can reach, in its token.
  const total = { collateral: 0, debt: 0 };
  for (const r of replayed)
    for (const l of r.legs) {
      if (OUT_KEYS.has(l.bucket)) continue;
      total[COLL_KEYS.has(l.bucket) ? "collateral" : "debt"] += l.amount;
    }
  const peak = { collateral: total.collateral, debt: total.debt + pendingInterest };
  const scale = { collateral: unitScaleFor(peak.collateral), debt: unitScaleFor(peak.debt) };
  return {
    loan,
    replayed,
    grain: { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt },
    scale,
    open,
    owedNow,
    pendingInterest,
  };
}

const COLL = "coll";
const DEBT = "debt";

/** The debt's growth factor at `t` over what the row before recorded: the
 *  contract's sum at `t` ÷ the recorded debt (1 on v1.1, and once nothing is
 *  owed). */
function growth(rp: PwnFlowReplay, recordedRaw: bigint, t: number): number {
  if (recordedRaw <= ZERO || !pwnAccrues(rp.loan)) return 1;
  const owed = pwnOwedRaw(rp.loan, t);
  if (owed == null) return 1;
  return Number(owed) / Number(recordedRaw);
}

/** The loan's rows as the Lifetime flows panel's timeline: the collateral in
 *  its token, the debt in the credit token. Null without its creation. */
export function pwnFlowTimeline(rp: PwnFlowReplay | null, o: PwnFlowOptions): FlowTimeline | null {
  if (!rp) return null;
  const { replayed, grain: G, scale, loan } = rp;
  const cs = loan.collSymbol;
  const ds = loan.creditSymbol;
  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      block: r.ev.block,
      tick:
        r.ev.kind === "default_claim"
          ? "liquidation"
          : moved.coll && moved.debt
            ? "both"
            : moved.debt
              ? "debt"
              : "collateral",
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * G.collateral, symbol: cs }
          : { bucket: l.bucket, usd: l.amount * G.debt, symbol: ds },
      ),
      tx: r.ev.tx,
      // The card counts the parties' own transactions; every flow row is one.
      balances: [
        { asset: COLL, symbol: cs, side: "collateral", amount: Math.max(0, r.coll) },
        { asset: DEBT, symbol: ds, side: "debt", amount: Math.max(0, r.debt) },
      ],
      prices: [
        { asset: COLL, usd: G.collateral },
        { asset: DEBT, usd: G.debt },
      ],
    };
  });
  const buckets = pwnFlowBuckets();
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  const lastDay = Math.floor(last.ev.ts / DAY_S);
  const endDay = rp.open ? Math.max(today, lastDay + 1) : lastDay + 1;

  // The collateral's "price" is its grain every day. The debt's is its grain
  // times the interest built on what the last row recorded by the day's
  // close: v1.2/v1.3 by the contract's sum, stopped at the deadline.
  const collObs: [number, number][] = [];
  const debtObs: [number, number][] = [];
  let ri = 0;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ri + 1 < replayed.length && replayed[ri + 1].ev.ts <= end) ri++;
    collObs.push([d, G.collateral]);
    debtObs.push([d, G.debt * growth(rp, replayed[ri].debtRaw, end)]);
  }

  const nowColl = rp.open ? last.coll : 0;
  const nowDebt = rp.open ? rp.owedNow : 0;
  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (rp.open) {
    if (nowColl > DUST) assets.push({ side: "collateral", symbol: cs, amount: nowColl, usd: nowColl * G.collateral });
    if (nowDebt > DUST) assets.push({ side: "debt", symbol: ds, amount: nowDebt, usd: nowDebt * G.debt });
  }

  return {
    unit: { symbol: ds, scale: scale.debt },
    sideUnits: {
      collateral: { symbol: cs, scale: scale.collateral },
      debt: { symbol: ds, scale: scale.debt },
    },
    buckets,
    days,
    live: {
      collateralUsd: nowColl * G.collateral,
      debtUsd: nowDebt * G.debt,
      assets,
      ...(rp.pendingInterest > DUST
        ? { pending: [{ bucket: PWN.interest, symbol: ds, usd: rp.pendingInterest * G.debt }] }
        : {}),
    },
    todayPrices: { [COLL]: G.collateral, [DEBT]: G.debt * growth(rp, last.debtRaw, o.now) },
    dailyPrices: { [COLL]: collObs, [DEBT]: debtObs },
    seriesCarry: true,
    today: rp.open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    words: pwnFlowWords(
      cs,
      ds,
      pwnAccrues(loan),
      pwnAccrues(loan)
        ? {
            start: loan.createdAt,
            deadline: loan.deadline,
            principal: Number(loan.principalRaw) / 10 ** loan.creditDecimals,
            apr: loan.apr!,
          }
        : undefined,
    ),
  };
}

/** The panel's words for a PWN loan. */
export function pwnFlowWords(
  collSymbol: string,
  creditSymbol: string,
  accrues: boolean,
  minuteSum?: NonNullable<NonNullable<FlowTimeline["words"]>["moment"]>["minuteSum"],
): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still in escrow",
    restBySide: {
      collateral: "Moved without a loan row",
      debt: "Interest since the last event",
    },
    restNote: {
      collateral: `${collSymbol} that moved with no loan row recording it`,
      debt: "the interest built on the principal since the loan's last event, by the contract's sum",
    },
    basis: {
      collateral: `Every figure is in ${collSymbol}, the loan's collateral; PWN has no price oracle, so nothing values it in ${creditSymbol}.`,
      debt: `Every figure is in ${creditSymbol}, the loan's credit.`,
    },
    heldBasis: {
      collateral: `the ${collSymbol} the loan held in escrow after its last event.`,
      debt: accrues
        ? `the ${creditSymbol} owed after the loan's last event, plus the interest the terms' rate built on the principal to the end of that day, stopped at the deadline.`
        : `the ${creditSymbol} owed after the loan's last event. The terms fix the repay total at creation, so nothing accrues.`,
    },
    linePrices: `with the collateral in ${collSymbol} and the debt in ${creditSymbol}, each on its own scale`,
    marks: { liquidation: "a red triangle for the lender's default claim" },
    moment: {
      // An accruing debt's figure between rows is the model's: the recorded
      // debt grown by the contract's sum to that moment.
      ...(accrues ? { face: ["debt" as const] } : {}),
      ...(minuteSum ? { minuteSum } : {}),
      tokensOnly: ["collateral", "debt"],
      notes: [
        accrues
          ? `PWN has no price oracle: the collateral is stated in ${collSymbol} and the debt in ${creditSymbol}. The debt grows by the minute at the terms' rate until the deadline.`
          : `PWN has no price oracle: the collateral is stated in ${collSymbol} and the debt in ${creditSymbol}. The repay total is fixed at creation, so neither side moves between events.`,
      ],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (each side's grains) and in
 *  tokens. Each side's figure just before and once the row had run; the
 *  debt before a closing row includes the interest built since the row
 *  before. */
export function pwnFocusEvents(rp: PwnFlowReplay): FocusEvent[] {
  const { replayed, grain: G, loan } = rp;
  const cs = loan.collSymbol;
  const ds = loan.creditSymbol;
  return replayed.map((r) => {
    let collMove = 0;
    let debtMove = 0;
    for (const l of r.legs) {
      const sign = OUT_KEYS.has(l.bucket) ? -1 : 1;
      if (COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
      else debtMove += sign * l.amount;
    }
    const collHeld = Math.max(0, r.coll);
    const debtHeld = Math.max(0, r.debt);
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      ...(r.ev.tx ? { tx: r.ev.tx } : {}),
      // The terms' rate, in force from the creation (the state card's words;
      // its figures are the model's, the contract's sum).
      ...(r.ev.kind === "created" && pwnAccrues(loan) ? { rate: loan.apr! / 100 } : {}),
      legs: r.legs.map((l) =>
        COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * G.collateral, amount: l.amount, symbol: cs }
          : {
              bucket: l.bucket,
              usd: l.amount * G.debt,
              amount: l.amount,
              symbol: ds,
              // A closing row's interest built up before it: not its act.
              ...(l.bucket === PWN.interest && r.ev.kind !== "created" ? { accrual: true } : {}),
            },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collHeld - collMove) * G.collateral,
          after: collHeld * G.collateral,
          amount: collMove,
          symbol: cs,
          held: collHeld,
        },
        debt: {
          before: Math.max(0, debtHeld - debtMove) * G.debt,
          after: debtHeld * G.debt,
          amount: debtMove,
          symbol: ds,
          held: debtHeld,
        },
      },
    };
  });
}

/** What the Explanation counts. */
export interface PwnFlowFacts {
  accrues: boolean;
  /** Interest over the life, in the credit token: booked on rows, and built
   *  since the last row (an open loan). */
  interest: number;
  pendingInterest: number;
  principal: number;
  repaid: number;
  cleared: number;
  returned: boolean;
  claimed: boolean;
  open: boolean;
  /** Past its deadline with nothing repaid or claimed. */
  lapsed: boolean;
}

export function pwnFlowFacts(rp: PwnFlowReplay, now: number): PwnFlowFacts {
  const r = rp.replayed;
  const sum = (k: string) => r.reduce((a, x) => a + legOf(x, k), 0);
  return {
    accrues: pwnAccrues(rp.loan),
    interest: sum(PWN.interest),
    pendingInterest: rp.pendingInterest,
    principal: sum(PWN.principal),
    repaid: sum(PWN.repaid),
    cleared: sum(PWN.cleared),
    returned: sum(PWN.returned) > 0,
    claimed: sum(PWN.claimed) > 0,
    open: rp.open,
    lapsed: rp.open && rp.loan.deadline != null && rp.loan.deadline <= now,
  };
}
