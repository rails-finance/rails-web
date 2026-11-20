// A Liquity V1 stability-pool deposit's T2 as a balance sheet (rails-ops
// reference/app-anatomy.md, T2): the card's `sheet` slot, as Liquity V2's
// deposit fills it (sp-sheet.ts). The rows carry no dollar price, so every
// side states its total in its asset (SHEET_NO_USD).
//
// The Deposit side is the index's identity, deposit before − burned + change =
// deposit after: the burn is the carry layer, the change the touch's row. The
// second side is the gains the touch paid: the ETH liquidations paid in and
// the LQTY issued, each paid out in full, so the side ends at nothing.

import { SHEET_NO_USD, SHEET_WORDS, type EventSheet, type SheetRow } from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import { big, exactUnits, units } from "@/lib/liquity-v1/sp-math";
import { spChangeProv, spReplayedProv, spTouchProv } from "@/lib/liquity-v1/sp-provenance";
import type { LiquityV1DepositEventRow } from "@/lib/sources/api/liquity-v1-sp";

const ZERO = BigInt(0);

const TIPS = {
  deposit:
    "The deposit's LUSD in the pool: what this touch moved, then the deposit after it, from the pool's UserDepositChanged.",
  gains:
    "The gains this touch paid out: the ETH liquidations paid the deposit since the previous touch, and the LQTY issued to it.",
  depositLast: "The deposit the previous touch recorded.",
  burned:
    "The deposit liquidations used since the previous touch, written by this one: the ETHGainWithdrawn's _LUSDLoss.",
  depositBefore: "The deposit just before this touch's change: the last event's, less the burn.",
  change: "The LUSD this touch moved: its _newDeposit less the deposit before it, net of the burn.",
  depositTotal: "The deposit after this touch: the UserDepositChanged's _newDeposit.",
  eth: "The ETH liquidations paid the deposit since the previous touch: the ETHGainWithdrawn's _ETH.",
  ethOut: "The ETH this touch sent: to the depositor, or to the depositor's Trove on withdrawETHGainToTrove.",
  lqty: "The LQTY this touch paid the depositor: the LQTYPaidToDepositor's _LQTY.",
  lqtyIn:
    "The LQTY issued to the deposit up to this touch, the issuance the touch triggered included, the front end's share taken out: the LQTYPaidToDepositor's _LQTY.",
};

const RECEIPT: Record<keyof typeof TIPS, string> = {
  deposit: "Deposit",
  gains: "Gains paid",
  depositLast: "Deposit at the last event",
  burned: "Burned since last touch",
  depositBefore: "Deposit before this event",
  change: "Deposited or withdrawn",
  depositTotal: "Deposit after",
  eth: "ETH paid in",
  ethOut: "ETH paid out",
  lqty: "LQTY paid",
  lqtyIn: "LQTY issued",
};

const said = (key: keyof typeof TIPS): string => {
  const tip = TIPS[key];
  return `${RECEIPT[key]} — ${tip.charAt(0).toLowerCase()}${tip.slice(1)}`;
};

const fmt = (raw: bigint) => formatNumber(units(raw < ZERO ? -raw : raw));
const signedText = (raw: bigint) => `${raw < ZERO ? "−" : "+"}${fmt(raw)}`;

type Figure = NonNullable<SheetRow["amount"]>;
const figure = (raw: bigint, text: string, symbol: string, address: string, info: Provenance): Figure => ({
  text,
  symbol,
  address,
  info,
  value: exactUnits(raw),
});

export function spDepositSheet(row: LiquityV1DepositEventRow): EventSheet {
  const log = (summary: string) => spTouchProv(summary, row.tx_hash, row.block_number);
  const l = (raw: bigint, text: string, info: Provenance) => figure(raw, text, "LUSD", TOKEN_ADDRESSES.LUSD, info);
  const e = (raw: bigint, text: string, info: Provenance) => figure(raw, text, "ETH", NATIVE, info);
  const q = (raw: bigint, text: string, info: Provenance) => figure(raw, text, "LQTY", TOKEN_ADDRESSES.LQTY, info);

  const last = big(row.deposit_before);
  const burned = big(row.deposit_loss);
  const before = last - burned;
  const change = big(row.top_up_or_withdrawal);
  const after = big(row.deposit_after);
  const eth = big(row.eth_gain);
  const lqty = big(row.lqty_gain);

  const depositCarry: SheetRow[] = [];
  if (last > ZERO) {
    depositCarry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: l(last, fmt(last), spReplayedProv(said("depositLast"), "previous touch's _newDeposit")),
      tip: TIPS.depositLast,
    });
    if (burned > ZERO)
      depositCarry.push({
        key: "burned",
        label: "Burned since last touch",
        amount: l(-burned, `−${fmt(burned)}`, log(said("burned"))),
        tip: TIPS.burned,
      });
  }
  const depositRows: SheetRow[] =
    change !== ZERO
      ? [
          {
            key: "change",
            label: change > ZERO ? "Deposited" : "Withdrawn",
            amount: l(
              change,
              signedText(change),
              spChangeProv(row.tx_hash, row.block_number, exactUnits(last), exactUnits(burned), exactUnits(after)),
            ),
            tip: TIPS.change,
          },
        ]
      : [];

  const gainCarry: SheetRow[] = [];
  if (eth > ZERO)
    gainCarry.push({
      key: "eth",
      label: "ETH paid in since last touch",
      amount: e(eth, `+${fmt(eth)}`, log(said("eth"))),
      tip: TIPS.eth,
    });
  if (lqty > ZERO)
    gainCarry.push({
      key: "lqty-in",
      label: "LQTY issued to the deposit",
      amount: q(lqty, `+${fmt(lqty)}`, log(said("lqty"))),
      tip: TIPS.lqtyIn,
    });
  const gainRows: SheetRow[] = [];
  if (eth > ZERO)
    gainRows.push({
      key: "eth-out",
      label: row.operation === "withdrawETHGainToTrove" ? "ETH sent to the Trove" : "ETH sent",
      amount: e(-eth, `−${fmt(eth)}`, log(said("ethOut"))),
      tip: TIPS.ethOut,
    });
  if (lqty > ZERO)
    gainRows.push({
      key: "lqty",
      label: "LQTY paid",
      amount: q(-lqty, `−${fmt(lqty)}`, log(said("lqty"))),
      tip: TIPS.lqty,
    });

  return {
    sides: [
      {
        side: "collateral",
        id: "deposit",
        name: "Deposit",
        tip: TIPS.deposit,
        icons: ["LUSD"],
        carry: depositCarry,
        before:
          depositCarry.length > 1
            ? {
                key: "before",
                label: SHEET_WORDS.before,
                amount: l(before, fmt(before), spReplayedProv(said("depositBefore"), "last event − burned")),
                tip: TIPS.depositBefore,
              }
            : undefined,
        rows: depositRows,
        total: SHEET_NO_USD,
        totalAmount: l(after, fmt(after), log(said("depositTotal"))),
        totalTip: TIPS.depositTotal,
      },
      {
        side: "debt",
        id: "gains",
        name: "Gains paid",
        tip: TIPS.gains,
        icons: ["ETH", "LQTY"],
        carry: gainCarry,
        before: undefined,
        rows: gainRows,
        total: SHEET_NO_USD,
        untouched: "Nothing paid at this touch",
      },
    ],
    panels: [],
  };
}
