// A Liquity V2 stability-pool deposit's T2 as a balance sheet (rails-ops
// reference/app-anatomy.md, T2): the card's `sheet` slot, as Polaris's
// deposit fills it (components/protocol/polaris/polaris-sp-loan-sheet.ts).
// The rows carry no dollar price, so every side states its total in its asset
// (SHEET_NO_USD).
//
// The Deposit side is the index's identity, deposit before − burned + yield
// since + change − yield claimed = deposit after: the burn and the yield are
// the carry layer, the change and the claim the event's rows. The branch
// collateral paid in is the second side: stash before + paid in − claimed =
// stash after, the claim including the stash. No Risk or Limits panel: a
// deposit has no liquidation and no limit.

import { SHEET_NO_USD, SHEET_WORDS, type EventSheet, type SheetRow } from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { big, exactUnits, units } from "@/lib/liquity-v2/sp-math";
import { spTouchProv } from "@/lib/liquity-v2/sp-provenance";
import type { LiquityV2DepositEventRow } from "@/lib/sources/api/liquity-v2-sp";

const ZERO = BigInt(0);

const WORDS = {
  deposit: "Deposit",
  collPaid: (c: string) => `${c} paid in`,
  burned: "Burned since last touch",
  yieldPaid: "BOLD yield since last touch",
  deposited: "Deposited",
  withdrawn: "Withdrawn",
  yieldClaimed: "BOLD yield claimed",
  paidSince: "Paid in since last touch",
  claimed: "Claimed",
};

const TIPS = {
  deposit:
    "The deposit's BOLD in the pool: what this operation moved, then the deposit it recorded, from the pool's log.",
  collPaid:
    "The collateral liquidations paid in to the deposit: what this operation paid in and claimed, then what stays stashed for a later claim.",
  depositLast: "The deposit the previous operation recorded.",
  burned:
    "The deposit liquidations used since the previous operation, written by this one: the DepositOperation's depositLossSinceLastOperation.",
  yieldPaid:
    "The BOLD yield the branch's interest paid the deposit since the previous operation: the DepositOperation's yieldGainSinceLastOperation.",
  depositBefore: "The deposit just before this operation's change: the last event's, less the burn, plus the yield.",
  change: "The BOLD this operation moved, from the DepositOperation's topUpOrWithdrawal.",
  yieldClaimed: "The BOLD yield this operation sent to the depositor; what it did not send joined the deposit.",
  depositTotal: "The deposit after this operation: the pool's deposits(depositor) once it had run.",
  stashLast: "The collateral earlier operations left stashed.",
  collPaidIn:
    "The collateral liquidations paid the deposit since the previous operation: the DepositOperation's ethGainSinceLastOperation.",
  stashBefore:
    "The collateral stashed before this operation's claim: the last event's stash plus what liquidations paid.",
  collClaimed:
    "The collateral this operation sent to the depositor, the stash included: the DepositOperation's ethGainClaimed.",
  stashTotal: "The collateral left stashed for a later claim: the pool's stashedColl(depositor) once it had run.",
};

/** Each receipt's name, the head of its summary. */
const RECEIPT: Record<keyof typeof TIPS, string> = {
  deposit: "Deposit",
  collPaid: "Collateral paid in",
  depositLast: "Deposit at the last event",
  burned: "Burned since last touch",
  yieldPaid: "Yield since last touch",
  depositBefore: "Deposit before this event",
  change: "Deposited or withdrawn",
  yieldClaimed: "Yield claimed",
  depositTotal: "Deposit after",
  stashLast: "Collateral stashed at the last event",
  collPaidIn: "Collateral paid in since last touch",
  stashBefore: "Collateral before this event",
  collClaimed: "Collateral claimed",
  stashTotal: "Collateral stashed after",
};

const said = (key: keyof typeof TIPS): string => {
  const tip = TIPS[key];
  return `${RECEIPT[key]} — ${tip.charAt(0).toLowerCase()}${tip.slice(1)}`;
};

const fmt = (raw: bigint) => formatNumber(units(raw < ZERO ? -raw : raw));
const signedText = (raw: bigint) => `${raw < ZERO ? "−" : "+"}${fmt(raw)}`;
const derived = (summary: string, formula: string): Provenance => ({ kind: "derived", summary, formula, via: formula });

type Figure = NonNullable<SheetRow["amount"]>;
const figure = (raw: bigint, text: string, symbol: string, address: string, info: Provenance): Figure => ({
  text,
  symbol,
  address,
  info,
  value: exactUnits(raw),
});

export function spDepositSheet(row: LiquityV2DepositEventRow): EventSheet {
  const branch = LIQUITY_V2_BRANCHES[row.collateral_type.toLowerCase()];
  const c = branch.symbol;
  const log = (summary: string) => spTouchProv(summary, row.tx_hash, row.block_number, row.collateral_type);
  const b = (raw: bigint, text: string, info: Provenance) => figure(raw, text, "BOLD", TOKEN_ADDRESSES.BOLD, info);
  const k = (raw: bigint, text: string, info: Provenance) => figure(raw, text, c, branch.collateralAddr, info);

  const last = big(row.deposit_before);
  const burned = big(row.deposit_loss);
  const yieldPaid = big(row.yield_gain_since);
  const yieldClaimed = big(row.yield_gain_claimed);
  const change = big(row.top_up_or_withdrawal);
  const after = big(row.deposit_after);
  const before = last - burned + yieldPaid;

  const depositCarry: SheetRow[] = [];
  if (last > ZERO) {
    depositCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: b(last, fmt(last), derived(said("depositLast"), "previous operation's deposit after")),
      tip: TIPS.depositLast,
    });
    if (burned > ZERO)
      depositCarry.push({
        key: "burned",
        label: WORDS.burned,
        amount: b(-burned, `−${fmt(burned)}`, log(said("burned"))),
        tip: TIPS.burned,
      });
    if (yieldPaid > ZERO)
      depositCarry.push({
        key: "yield",
        label: WORDS.yieldPaid,
        amount: b(yieldPaid, `+${fmt(yieldPaid)}`, log(said("yieldPaid"))),
        tip: TIPS.yieldPaid,
      });
  }
  const depositRows: SheetRow[] = [];
  if (change !== ZERO)
    depositRows.push({
      key: "change",
      label: change > ZERO ? WORDS.deposited : WORDS.withdrawn,
      amount: b(change, signedText(change), log(said("change"))),
      tip: TIPS.change,
    });
  if (yieldClaimed > ZERO)
    depositRows.push({
      key: "yield-claimed",
      label: WORDS.yieldClaimed,
      amount: b(-yieldClaimed, `−${fmt(yieldClaimed)}`, log(said("yieldClaimed"))),
      tip: TIPS.yieldClaimed,
    });

  const stashLast = big(row.stash_before);
  const paid = big(row.coll_gain_since);
  const claimed = big(row.coll_gain_claimed);
  const stash = big(row.stash_after);
  const collCarry: SheetRow[] = [];
  if (stashLast > ZERO || paid > ZERO) {
    collCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: k(stashLast, fmt(stashLast), derived(said("stashLast"), "previous operation's stash after")),
      tip: TIPS.stashLast,
    });
    if (paid > ZERO)
      collCarry.push({
        key: "paid",
        label: WORDS.paidSince,
        amount: k(paid, `+${fmt(paid)}`, log(said("collPaidIn"))),
        tip: TIPS.collPaidIn,
      });
  }
  const collRows: SheetRow[] =
    claimed > ZERO
      ? [
          {
            key: "claimed",
            label: WORDS.claimed,
            amount: k(-claimed, `−${fmt(claimed)}`, log(said("collClaimed"))),
            tip: TIPS.collClaimed,
          },
        ]
      : [];

  return {
    sides: [
      {
        side: "collateral",
        id: "deposit",
        name: WORDS.deposit,
        tip: TIPS.deposit,
        icons: ["BOLD"],
        carry: depositCarry,
        before:
          depositCarry.length > 1
            ? {
                key: "before",
                label: SHEET_WORDS.before,
                amount: b(before, fmt(before), derived(said("depositBefore"), "last event − burned + yield")),
                tip: TIPS.depositBefore,
              }
            : undefined,
        rows: depositRows,
        total: SHEET_NO_USD,
        totalAmount: b(after, fmt(after), log(said("depositTotal"))),
        totalTip: TIPS.depositTotal,
      },
      {
        side: "debt",
        id: "coll-gains",
        name: WORDS.collPaid(c),
        tip: TIPS.collPaid,
        icons: [c],
        carry: collCarry,
        before:
          collCarry.length > 1
            ? {
                key: "before",
                label: SHEET_WORDS.before,
                amount: k(
                  stashLast + paid,
                  fmt(stashLast + paid),
                  derived(said("stashBefore"), "last event + paid in"),
                ),
                tip: TIPS.stashBefore,
              }
            : undefined,
        rows: collRows,
        total: SHEET_NO_USD,
        totalAmount: k(stash, fmt(stash), log(said("stashTotal"))),
        totalTip: TIPS.stashTotal,
      },
    ],
    panels: [],
  };
}
