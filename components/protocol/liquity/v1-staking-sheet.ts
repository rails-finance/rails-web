// A Liquity V1 LQTY stake's T2 as a balance sheet (rails-ops
// reference/app-anatomy.md, T2), as the deposit's (v1-sp-sheet.ts). The rows
// carry no dollar price, so every side states its total in its asset
// (SHEET_NO_USD).
//
// The Stake side is the index's identity, stake before + change = stake
// after. The second side is the fees the touch paid: the LUSD borrowing fees
// and the ETH redemption fees paid in since the previous touch, each paid out
// in full, so the side ends at nothing.

import { SHEET_NO_USD, SHEET_WORDS, type EventSheet, type SheetRow } from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import { big, exactUnits, units } from "@/lib/liquity-v1/staking-math";
import { stChangeProv, stReplayedProv, stTouchProv } from "@/lib/liquity-v1/staking-provenance";
import type { LiquityV1StakeEventRow } from "@/lib/sources/api/liquity-v1-staking";

const ZERO = BigInt(0);

const TIPS = {
  stake: "The LQTY staked: what this touch moved, then the stake after it, from LQTYStaking's StakeChanged.",
  fees: "The fees this touch paid out: the stake's share of the borrowing fees in LUSD and the redemption fees in ETH paid in since the previous touch.",
  stakeLast: "The stake the previous touch left.",
  change: "The LQTY this touch moved: its _newStake less the stake before it.",
  stakeTotal: "The stake after this touch: the StakeChanged's _newStake, or the stake before it on a claim.",
  lusdIn: "The borrowing fees paid in to the stake since the previous touch: the StakingGainsWithdrawn's LUSDGain.",
  lusdOut: "The LUSD this touch sent the staker: the StakingGainsWithdrawn's LUSDGain.",
  ethIn: "The redemption fees paid in to the stake since the previous touch: the StakingGainsWithdrawn's ETHGain.",
  ethOut: "The ETH this touch sent the staker: the StakingGainsWithdrawn's ETHGain.",
};

const RECEIPT: Record<keyof typeof TIPS, string> = {
  stake: "Stake",
  fees: "Fees paid",
  stakeLast: "Stake at the last touch",
  change: "Staked or unstaked",
  stakeTotal: "Stake after",
  lusdIn: "LUSD paid in",
  lusdOut: "LUSD paid out",
  ethIn: "ETH paid in",
  ethOut: "ETH paid out",
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

export function stStakeSheet(row: LiquityV1StakeEventRow): EventSheet {
  const log = (summary: string) => stTouchProv(summary, row.tx_hash, row.block_number);
  const q = (raw: bigint, text: string, info: Provenance) => figure(raw, text, "LQTY", TOKEN_ADDRESSES.LQTY, info);
  const l = (raw: bigint, text: string, info: Provenance) => figure(raw, text, "LUSD", TOKEN_ADDRESSES.LUSD, info);
  const e = (raw: bigint, text: string, info: Provenance) => figure(raw, text, "ETH", NATIVE, info);

  const last = big(row.stake_before);
  const change = big(row.stake_change);
  const after = big(row.stake_after);
  const lusd = big(row.lusd_gain);
  const eth = big(row.eth_gain);

  const stakeCarry: SheetRow[] =
    last > ZERO
      ? [
          {
            key: "last",
            label: SHEET_WORDS.last,
            amount: q(last, fmt(last), stReplayedProv(said("stakeLast"), "previous touch's _newStake")),
            tip: TIPS.stakeLast,
          },
        ]
      : [];
  const stakeRows: SheetRow[] =
    change !== ZERO
      ? [
          {
            key: "change",
            label: change > ZERO ? "Staked" : "Unstaked",
            amount: q(
              change,
              signedText(change),
              stChangeProv(row.tx_hash, row.block_number, exactUnits(last), exactUnits(after)),
            ),
            tip: TIPS.change,
          },
        ]
      : [];

  const feeCarry: SheetRow[] = [];
  const feeRows: SheetRow[] = [];
  if (lusd > ZERO) {
    feeCarry.push({
      key: "lusd-in",
      label: "LUSD paid in since last touch",
      amount: l(lusd, `+${fmt(lusd)}`, log(said("lusdIn"))),
      tip: TIPS.lusdIn,
    });
    feeRows.push({
      key: "lusd-out",
      label: "LUSD sent",
      amount: l(-lusd, `−${fmt(lusd)}`, log(said("lusdOut"))),
      tip: TIPS.lusdOut,
    });
  }
  if (eth > ZERO) {
    feeCarry.push({
      key: "eth-in",
      label: "ETH paid in since last touch",
      amount: e(eth, `+${fmt(eth)}`, log(said("ethIn"))),
      tip: TIPS.ethIn,
    });
    feeRows.push({
      key: "eth-out",
      label: "ETH sent",
      amount: e(-eth, `−${fmt(eth)}`, log(said("ethOut"))),
      tip: TIPS.ethOut,
    });
  }

  return {
    sides: [
      {
        side: "collateral",
        id: "stake",
        name: "Stake",
        tip: TIPS.stake,
        icons: ["LQTY"],
        carry: stakeCarry,
        before: undefined,
        rows: stakeRows,
        total: SHEET_NO_USD,
        totalAmount: q(
          after,
          fmt(after),
          row.operation === "claim" ? stReplayedProv(said("stakeTotal"), "stake before") : log(said("stakeTotal")),
        ),
        totalTip: TIPS.stakeTotal,
      },
      {
        side: "debt",
        id: "fees",
        name: "Fees paid",
        tip: TIPS.fees,
        icons: ["LUSD", "ETH"],
        carry: feeCarry,
        before: undefined,
        rows: feeRows,
        total: SHEET_NO_USD,
        untouched: "No fees paid at this touch",
      },
    ],
    panels: [],
  };
}
