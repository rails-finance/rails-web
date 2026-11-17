// A Polaris stability-pool deposit's and a reserve loan's T2 as a balance
// sheet (rails-ops reference/app-anatomy.md, T2): the card's `sheet` slot, as
// the CDP card fills it (polaris-sheet.ts). The rows' figures are raw integers
// from the index; no row carries a dollar price, so every side states its
// total in its asset (SHEET_NO_USD), as Maple's and Morpho's do.
//
// DEPOSIT. The index's identity, deposit before + change − burned + yield
// paid − yield claimed = deposit after (lib/polaris/sp-loan-math.ts), is the
// Deposit side: the burn and the yield are the carry layer, the change and the
// claim the event's rows. The pETH liquidations paid is the second side: stash
// before + paid − claimed = stash after. No Risk or Limits panel: a deposit
// has no liquidation and no limit.
//
// LOAN. Collateral in fpETH and Debt in WETH, the fees since the previous
// touch as the Debt side's carry. No Risk panel: the loans manager has no
// liquidation. Limits holds the floor the debt borrows against.

import {
  SHEET_NO_USD,
  SHEET_WORDS,
  type EventSheet,
  type SheetRow,
  type SheetStat,
} from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import { FPETH, PETH, POLARIS_MARKET_CONFIG, POLARIS_WETH } from "@/lib/polaris/asset-catalog";
import { atFloor, big, exactUnits, feeAtTouch, units } from "@/lib/polaris/sp-loan-math";
import { loanIndexProv, touchProv } from "@/lib/polaris/sp-loan-provenance";
import type { PolarisDepositEventRow, PolarisLoanEventRow } from "@/lib/sources/api/polaris-sp-loans";

const ZERO = BigInt(0);

const WORDS = {
  deposit: "Deposit",
  pethGains: "pETH from liquidations",
  burned: "Burned by liquidations",
  yieldPaid: "Yield since last event",
  deposited: "Deposited",
  withdrawn: "Withdrawn",
  yieldClaimed: "Yield claimed",
  pethPaid: "Paid since last event",
  claimed: "Claimed",
  fees: "Fees since last event",
  borrowed: "Borrowed",
  repaid: "Repaid",
  floor: "Floor price",
  atFloor: "Collateral at the floor",
  index: "Debt per share",
};

const TIPS = {
  deposit:
    "The deposit's stablecoin in the pool: what this operation moved, then the deposit it recorded, from the pool's logs.",
  pethGains:
    "The pETH liquidations paid the deposit: what this operation paid and claimed, then what stays stashed for a later claim.",
  depositLast: "The deposit the previous operation recorded, from this operation's DepositOperation log.",
  burned:
    "The deposit liquidations used since the previous operation, written by this one: the DepositOperation's depositLossSinceLastOperation.",
  yieldPaid:
    "The stablecoin yield paid to the deposit since the previous operation: the DepositOperation's stableTokenGainSinceLastOperation.",
  depositBefore: "The deposit just before this operation's change: the last event's, less the burn, plus the yield.",
  change: "The stablecoin this operation moved, from the DepositOperation's topUpOrWithdrawal.",
  yieldClaimed: "The yield this operation paid out to the holder; the rest stays in the deposit.",
  depositTotal: "The deposit after this operation, from the DepositUpdated's newDeposit.",
  stashLast:
    "The pETH earlier operations left unclaimed: the stash after this one, less what it paid, plus what it claimed.",
  pethPaid:
    "The pETH liquidations paid the deposit since the previous operation: the DepositOperation's bcTokenGainSinceLastOperation.",
  stashBefore: "The pETH stashed before this operation's claim: the last event's stash plus what liquidations paid.",
  pethClaimed: "The pETH this operation paid out to the holder.",
  stashTotal: "The pETH left stashed for a later claim, from the DepositUpdated's stashedBcTokens.",
  collLast: "The loan's fpETH the previous touch left.",
  coll: "The fpETH this touch moved, from the loans manager's log.",
  collTotal: "The loan's fpETH after this touch: the collateral before it plus the signed change.",
  debtLast: "The debt the previous touch left: its shares at the debt per share then in force, rounded up.",
  fees: "The fees the reserve charged since the previous touch: the shares before this touch at its debt per share, less the debt the previous touch left.",
  debtBefore: "The debt just before this touch: the last event's debt plus the fees since.",
  debt: "The WETH this touch borrowed or repaid, from the loans manager's log.",
  debtTotal: "The loan's shares after this touch at the debt per share in force, rounded up.",
  floor: "The bonding curve's floor price the loans manager logged with the debt per share in force at this touch.",
  atFloor: "The loan's fpETH after this touch at the floor price: what the collateral is worth in WETH at the floor.",
  index: "The reserve's debt per share in force at this touch, from the last FeesAccrued at or before it.",
};

/** Each receipt's name, the head of its summary. */
const RECEIPT: Partial<Record<keyof typeof TIPS, string>> = {
  atFloor: "Collateral at the floor",
  burned: "Burned by liquidations",
  change: "Deposited or withdrawn",
  coll: "Collateral moved",
  collLast: "Collateral at the last event",
  collTotal: "Collateral after",
  debt: "Borrowed or repaid",
  debtBefore: "Debt before this event",
  debtLast: "Debt at the last event",
  debtTotal: "Debt after",
  depositBefore: "Deposit before this event",
  depositLast: "Deposit at the last event",
  depositTotal: "Deposit after",
  fees: "Fees since last event",
  floor: "Floor price",
  index: "Debt per share",
  pethClaimed: "pETH claimed",
  pethPaid: "pETH paid since last event",
  stashBefore: "pETH stashed before this event",
  stashLast: "pETH stashed at the last event",
  stashTotal: "pETH stashed after",
  yieldClaimed: "Yield claimed",
  yieldPaid: "Yield since last event",
};

/** A receipt's summary: its name, then the tip. */
const said = (key: keyof typeof TIPS): string => {
  const tip = TIPS[key];
  return `${RECEIPT[key] ?? key} — ${tip.charAt(0).toLowerCase()}${tip.slice(1)}`;
};

const fmt = (raw: bigint) => formatNumber(units(raw < ZERO ? -raw : raw));
const signedText = (raw: bigint) => `${raw < ZERO ? "−" : "+"}${fmt(raw)}`;
const derived = (summary: string, formula: string): Provenance => ({
  kind: "derived",
  summary,
  formula,
  via: formula,
});

type Figure = NonNullable<SheetRow["amount"]>;
const figure = (raw: bigint, text: string, symbol: string, address: string, info: Provenance): Figure => ({
  text,
  symbol,
  address,
  info,
  value: exactUnits(raw),
});

/** The deposit's sheet; none on a transfer, which keeps its cells. */
export function polarisDepositSheet(row: PolarisDepositEventRow): EventSheet | undefined {
  if (row.event_type === "transfer") return undefined;
  const stable = POLARIS_MARKET_CONFIG[row.market].stable;
  const log = (summary: string) => touchProv(summary, row.tx_hash, row.block_number, "pool", row.market);
  const s = (raw: bigint, text: string, info: Provenance) => figure(raw, text, stable.symbol, stable.address, info);
  const p = (raw: bigint, text: string, info: Provenance) => figure(raw, text, PETH.symbol, PETH.address, info);

  const last = big(row.deposit_before);
  const burned = big(row.deposit_loss);
  const yieldPaid = big(row.stable_gain_since);
  const yieldClaimed = big(row.stable_gain_claimed);
  const change = big(row.top_up_or_withdrawal);
  const after = big(row.new_deposit);
  const before = last - burned + yieldPaid;

  const depositCarry: SheetRow[] = [];
  if (last > ZERO) {
    depositCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: s(last, fmt(last), log(said("depositLast"))),
      tip: TIPS.depositLast,
    });
    if (burned > ZERO)
      depositCarry.push({
        key: "burned",
        label: WORDS.burned,
        amount: s(-burned, `−${fmt(burned)}`, log(said("burned"))),
        tip: TIPS.burned,
      });
    if (yieldPaid > ZERO)
      depositCarry.push({
        key: "yield",
        label: WORDS.yieldPaid,
        amount: s(yieldPaid, `+${fmt(yieldPaid)}`, log(said("yieldPaid"))),
        tip: TIPS.yieldPaid,
      });
  }
  const depositRows: SheetRow[] = [];
  if (change !== ZERO)
    depositRows.push({
      key: "change",
      label: change > ZERO ? WORDS.deposited : WORDS.withdrawn,
      amount: s(change, signedText(change), log(said("change"))),
      tip: TIPS.change,
    });
  if (yieldClaimed > ZERO)
    depositRows.push({
      key: "yield-claimed",
      label: WORDS.yieldClaimed,
      amount: s(-yieldClaimed, `−${fmt(yieldClaimed)}`, log(said("yieldClaimed"))),
      tip: TIPS.yieldClaimed,
    });

  const paid = big(row.bc_gain_since);
  const claimed = big(row.bc_gain_claimed);
  const stash = big(row.stashed_bc_tokens);
  const stashLast = stash - paid + claimed;
  const pethCarry: SheetRow[] = [];
  if (stashLast > ZERO || paid > ZERO) {
    pethCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: p(stashLast, fmt(stashLast), derived(said("stashLast"), "stash after − paid + claimed")),
      tip: TIPS.stashLast,
    });
    if (paid > ZERO)
      pethCarry.push({
        key: "paid",
        label: WORDS.pethPaid,
        amount: p(paid, `+${fmt(paid)}`, log(said("pethPaid"))),
        tip: TIPS.pethPaid,
      });
  }
  const pethRows: SheetRow[] =
    claimed > ZERO
      ? [
          {
            key: "claimed",
            label: WORDS.claimed,
            amount: p(-claimed, `−${fmt(claimed)}`, log(said("pethClaimed"))),
            tip: TIPS.pethClaimed,
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
        icons: [stable.symbol],
        carry: depositCarry,
        before:
          depositCarry.length > 1
            ? {
                key: "before",
                label: SHEET_WORDS.before,
                amount: s(before, fmt(before), derived(said("depositBefore"), "last event − burned + yield")),
                tip: TIPS.depositBefore,
              }
            : undefined,
        rows: depositRows,
        total: SHEET_NO_USD,
        totalAmount: s(after, fmt(after), log(said("depositTotal"))),
        totalTip: TIPS.depositTotal,
      },
      {
        side: "debt",
        id: "peth-gains",
        name: WORDS.pethGains,
        tip: TIPS.pethGains,
        icons: [PETH.symbol],
        carry: pethCarry,
        before:
          pethCarry.length > 1
            ? {
                key: "before",
                label: SHEET_WORDS.before,
                amount: p(stashLast + paid, fmt(stashLast + paid), derived(said("stashBefore"), "last event + paid")),
                tip: TIPS.stashBefore,
              }
            : undefined,
        rows: pethRows,
        total: SHEET_NO_USD,
        totalAmount: p(stash, fmt(stash), log(said("stashTotal"))),
        totalTip: TIPS.stashTotal,
      },
    ],
    panels: [],
  };
}

/** The loan's sheet; none on a transfer, which keeps its cells. */
export function polarisLoanSheet(
  row: PolarisLoanEventRow,
  previous: PolarisLoanEventRow | null,
): EventSheet | undefined {
  if (row.event_type === "transfer") return undefined;
  const log = (summary: string) => touchProv(summary, row.tx_hash, row.block_number, "loans");
  const c = (raw: bigint, text: string, info: Provenance) => figure(raw, text, FPETH.symbol, FPETH.address, info);
  const w = (raw: bigint, text: string, info: Provenance) =>
    figure(raw, text, POLARIS_WETH.symbol, POLARIS_WETH.address, info);

  const collChange = big(row.coll_change);
  const collAfter = big(row.coll_after);
  const collBefore = big(row.coll_before);
  const collCarry: SheetRow[] =
    previous && collBefore > ZERO
      ? [
          {
            key: "last",
            label: SHEET_WORDS.last,
            amount: c(collBefore, fmt(collBefore), log(said("collLast"))),
            tip: TIPS.collLast,
          },
        ]
      : [];
  const collRows: SheetRow[] =
    collChange !== ZERO
      ? [
          {
            key: "coll",
            label: collChange > ZERO ? WORDS.deposited : WORDS.withdrawn,
            amount: c(collChange, signedText(collChange), log(said("coll"))),
            tip: TIPS.coll,
          },
        ]
      : [];

  const debtChange = big(row.debt_change);
  const debtAfter = big(row.debt_after);
  const fee = feeAtTouch(row, previous);
  const debtCarry: SheetRow[] = [];
  let debtBefore: SheetRow | undefined;
  if (previous && big(previous.debt_after) > ZERO) {
    const last = big(previous.debt_after);
    debtCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: w(last, fmt(last), touchProv(said("debtLast"), previous.tx_hash, previous.block_number, "loans")),
      tip: TIPS.debtLast,
    });
    if (fee != null && fee > ZERO) {
      debtCarry.push({
        key: "fees",
        label: WORDS.fees,
        amount: w(
          fee,
          `+${fmt(fee)}`,
          derived(said("fees"), "ceil(shares before × debt per share ÷ 1e27) − last event's debt"),
        ),
        tip: TIPS.fees,
      });
      debtBefore = {
        key: "before",
        label: SHEET_WORDS.before,
        amount: w(last + fee, fmt(last + fee), derived(said("debtBefore"), "last event's debt + fees since")),
        tip: TIPS.debtBefore,
      };
    }
  }
  const debtRows: SheetRow[] =
    debtChange !== ZERO
      ? [
          {
            key: "debt",
            label: debtChange > ZERO ? WORDS.borrowed : WORDS.repaid,
            amount: w(debtChange, signedText(debtChange), log(said("debt"))),
            tip: TIPS.debt,
          },
        ]
      : [];

  const floorRaw = row.floor_price;
  const limits: SheetStat[] = [];
  if (floorRaw) {
    const floor = big(floorRaw);
    const prevFloor = previous?.floor_price ? big(previous.floor_price) : null;
    const index = loanIndexProv(row.debt_per_share_tx_hash, row.debt_per_share_block);
    const floorInfo: Provenance = { ...index, summary: said("floor"), via: "FeesAccrued floor price" };
    limits.push({
      key: "floor",
      label: WORDS.floor,
      value: { text: `${units(floor).toFixed(4)} WETH per fpETH`, info: floorInfo, value: exactUnits(floor) },
      change:
        prevFloor != null && prevFloor !== floor
          ? {
              text: `${floor > prevFloor ? "+" : "−"}${units(floor > prevFloor ? floor - prevFloor : prevFloor - floor).toFixed(4)} WETH`,
            }
          : null,
      tip: TIPS.floor,
    });
    const worth = atFloor(row.coll_after ?? "0", floorRaw);
    limits.push({
      key: "at-floor",
      label: WORDS.atFloor,
      value: {
        text: `${fmt(worth)} WETH`,
        info: derived(said("atFloor"), "collateral after × floor price ÷ 1e18"),
        value: exactUnits(worth),
      },
      tip: TIPS.atFloor,
    });
  }
  const breakdown: SheetStat[] = row.debt_per_share
    ? [
        {
          key: "index",
          label: WORDS.index,
          value: {
            text: (Number(big(row.debt_per_share)) / 1e27).toFixed(9),
            info: loanIndexProv(row.debt_per_share_tx_hash, row.debt_per_share_block),
            value: row.debt_per_share,
          },
          tip: TIPS.index,
        },
      ]
    : [];

  return {
    sides: [
      {
        side: "collateral",
        icons: [FPETH.symbol],
        carry: collCarry,
        rows: collRows,
        total: SHEET_NO_USD,
        totalAmount: c(collAfter, fmt(collAfter), log(said("collTotal"))),
        totalTip: TIPS.collTotal,
      },
      {
        side: "debt",
        icons: [POLARIS_WETH.symbol],
        carry: debtCarry,
        before: debtBefore,
        rows: debtRows,
        total: SHEET_NO_USD,
        totalAmount: w(debtAfter, fmt(debtAfter), log(said("debtTotal"))),
        totalTip: TIPS.debtTotal,
      },
    ],
    panels: limits.length > 0 ? [{ panel: "limits", rows: limits, breakdown }] : [],
  };
}
