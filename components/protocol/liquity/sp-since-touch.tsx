"use client";

// Liquity V2 — "Since its last touch" on a stability-pool deposit's timeline:
// the window from the deposit's newest touch to the head block, pinned in the
// timeline's head slot (decision 0022 §4), on the frame Polaris's deposit row
// uses (components/protocol/polaris/polaris-sp-loan-since-touch.tsx).
//
// The frame is <NoteRowShell>'s with the live-window glyph. Closed, the row
// states the window's change in one figure, in USD at the branch price feed:
// the collateral paid in valued there, plus the BOLD yield pending, less the
// BOLD burned, BOLD counted at $1. Opened, it is the event sheet's
// shape (sp-sheet.ts): the figures the last touch wrote, what the window
// added, and the total the next touch starts from, every figure receipted.
// Where the feed did not answer, the row names the window and values nothing.

import { NoteRowShell } from "@/components/shared/note-row-shell";
import { DepositTouchTip } from "./touch-tip";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { EventSheetView, SHEET_NO_USD, type EventSheet } from "@/components/shared/event-sheet";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { formatNumber } from "@/lib/utils/format";
import { formatDuration } from "@/lib/date";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { exactUnits, units } from "@/lib/liquity-v2/sp-math";
import { spFeedProv, spLiveProv, spPendingLossProv, spSumProv } from "@/lib/liquity-v2/sp-provenance";
import type { SpBranch } from "@/lib/liquity-v2/sp-routes";

const ZERO = BigInt(0);
const NEXT = "Before the next touch";
const sinceLabel = (sinceOpen: boolean) => (sinceOpen ? "Since its open" : "Since its last touch");
const sinceWords = (sinceOpen: boolean) => (sinceOpen ? "since its open" : "since the last touch");

const fmt = (raw: bigint) => formatNumber(units(raw < ZERO ? -raw : raw));
const usd = (n: number) => `$${formatNumber(Math.abs(n))}`;
const signedUsd = (n: number) => `${n < 0 ? "−" : "+"}${usd(n)}`;

type Fig = { text: string; symbol: string; address: string; info: Provenance; value: string };
const fig = (raw: bigint, text: string, symbol: string, address: string, info: Provenance): Fig => ({
  text,
  symbol,
  address,
  info,
  value: exactUnits(raw),
});

export function LiquityV2DepositSinceTouchRow({
  branch,
  recorded,
  burned,
  now,
  gain,
  stash,
  paidIn,
  price,
  priceStale,
  fromBlock,
  fromAt,
  toAt,
  headBlock,
  sinceOpen,
}: {
  branch: SpBranch;
  /** deposits(depositor): the deposit the last touch recorded. */
  recorded: bigint;
  /** recorded − getCompoundedBoldDeposit(depositor). */
  burned: bigint;
  /** getCompoundedBoldDeposit(depositor). */
  now: bigint;
  /** getDepositorYieldGainWithPending(depositor). */
  gain: bigint;
  /** stashedColl(depositor): collateral earlier touches left unclaimed. */
  stash: bigint;
  /** getDepositorCollGain(depositor): collateral paid in since the last touch. */
  paidIn: bigint;
  /** USD per collateral token at the branch price feed now, or null. */
  price: number | null;
  priceStale: boolean;
  fromBlock: number;
  fromAt: number;
  toAt: number;
  headBlock: number;
  /** The deposit's one operation is its open. */
  sinceOpen: boolean;
}) {
  const c = branch;
  const collAddr = LIQUITY_V2_BRANCHES[c.toLowerCase()].collateralAddr;
  const bo = (raw: bigint, text: string, info: Provenance) => fig(raw, text, "BOLD", TOKEN_ADDRESSES.BOLD, info);
  const co = (raw: bigint, text: string, info: Provenance) => fig(raw, text, c, collAddr, info);
  const atHead = `at the head block ${headBlock.toLocaleString("en-US")}`;
  const since = sinceLabel(sinceOpen);
  const elapsed = formatDuration(fromAt, toAt);

  const collValue = price != null ? units(paidIn) * price : null;
  const net = collValue != null ? collValue + units(gain) - units(burned) : null;
  const collValueProv: Provenance | null =
    price != null
      ? {
          kind: "chain-derived",
          pclass: "oracle",
          summary: `${c} paid in, in USD — the ${c} liquidations have paid the deposit since its last touch, times the branch price feed's price for ${c} ${atHead}.`,
          formula: "getDepositorCollGain(depositor) × price",
          inputs: [
            { label: `${c} paid in since last touch`, value: exactUnits(paidIn), kind: "chain", pclass: "state" },
            { label: `${c} in USD`, value: String(price), kind: "chain", pclass: "oracle" },
          ],
        }
      : null;
  const netProv: Provenance | null =
    net != null
      ? {
          kind: "chain-derived",
          pclass: "oracle",
          summary: `Change in USD since the last touch — the ${c} paid in since the last touch at the branch price feed, plus the BOLD yield pending, less the BOLD burned, BOLD counted at $1, ${atHead}. The depositor did nothing inside this window.`,
          formula: `${c} paid in × price + yield − burned`,
          inputs: [
            { label: `${c} paid in, in USD`, value: String(collValue), kind: "chain-derived", pclass: "oracle" },
            { label: "BOLD yield since last touch", value: exactUnits(gain), kind: "chain", pclass: "state" },
            {
              label: "BOLD burned since last touch",
              value: exactUnits(burned),
              kind: "chain-derived",
              pclass: "state",
            },
          ],
        }
      : null;

  const before = now + gain;
  const beforeProv: Provenance = {
    kind: "chain-derived",
    pclass: "state",
    summary: `Deposit before the next touch — the deposit now, getCompoundedBoldDeposit(depositor), plus the BOLD yield pending, getDepositorYieldGainWithPending(depositor), ${atHead}: what the next touch starts from before it claims or moves anything.`,
    formula: "getCompoundedBoldDeposit(depositor) + yield",
    inputs: [
      { label: "deposit now", value: exactUnits(now), kind: "chain", pclass: "state" },
      { label: "BOLD yield since last touch", value: exactUnits(gain), kind: "chain", pclass: "state" },
    ],
  };

  const sheet: EventSheet = {
    sides: [
      {
        side: "collateral",
        id: "deposit",
        name: "Deposit",
        tip: "The deposit's BOLD in the pool: what its last touch recorded, what liquidations have burned since and the yield pending, from the pool's getters now.",
        icons: ["BOLD"],
        carry: [],
        rows: [
          {
            key: "last",
            label: "At the last touch",
            amount: bo(recorded, fmt(recorded), spSumProv("recorded", c)),
            tip: "The BOLD the deposit held after its latest operation.",
          },
          ...(burned > ZERO
            ? [
                {
                  key: "burned",
                  label: "Burned since last touch",
                  amount: bo(-burned, `−${fmt(burned)}`, spPendingLossProv(c)),
                  tip: `BOLD liquidations have used from the deposit since its last touch, in exchange for the ${c} paid in. The next touch writes it.`,
                },
              ]
            : []),
          ...(gain > ZERO
            ? [
                {
                  key: "yield",
                  label: "BOLD yield since last touch",
                  amount: bo(gain, `+${fmt(gain)}`, spLiveProv("yieldGain", c)),
                  tip: "The yield the branch's interest has paid the deposit since its last touch. The next touch pays it; what it does not claim joins the deposit.",
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: NEXT,
        totalAmount: bo(before, fmt(before), beforeProv),
        totalTip:
          "The deposit now with the yield pending: what the next touch starts from, before it claims or moves anything.",
      },
      {
        side: "debt",
        id: "coll-gains",
        name: `${c} paid in`,
        tip: `The ${c} liquidations paid in to the deposit: what earlier touches left stashed, and what liquidations have paid since the last touch.`,
        icons: [c],
        carry: [],
        rows: [
          ...(stash > ZERO
            ? [
                {
                  key: "last",
                  label: "Stashed at the last touch",
                  amount: co(stash, fmt(stash), spSumProv("stash", c)),
                  tip: `The ${c} earlier touches paid in and left unclaimed.`,
                },
              ]
            : []),
          ...(paidIn > ZERO
            ? [
                {
                  key: "paid",
                  label: "Paid in since last touch",
                  amount: co(paidIn, `+${fmt(paidIn)}`, spLiveProv("collGain", c)),
                  tip: `The ${c} liquidations have paid the deposit since its last touch. The next touch writes it.`,
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: NEXT,
        untouched: "Not changed since the last touch",
        totalAmount: co(stash + paidIn, fmt(stash + paidIn), spLiveProv("pendingColl", c)),
        totalTip: `What a claiming touch sends in ${c}: the stash and what liquidations have paid since.`,
      },
    ],
    panels: [],
    note:
      price != null && collValueProv && netProv && collValue != null && net != null ? (
        <>
          {paidIn > ZERO ? (
            <>
              At the branch price feed, {c} is{" "}
              <Prov info={spFeedProv(c, priceStale)} value={String(price)}>
                {usd(price)}
              </Prov>
              , so the {c} paid in is{" "}
              <Prov info={collValueProv} value={String(collValue)}>
                {usd(collValue)}
              </Prov>
              .
            </>
          ) : (
            <>No liquidation has paid the deposit {c}.</>
          )}{" "}
          With the yield, less the burn, BOLD counted at $1, the deposit has moved{" "}
          <Prov info={netProv} value={String(net)}>
            {signedUsd(net)}
          </Prov>{" "}
          {sinceWords(sinceOpen)}. The next touch writes these figures.
        </>
      ) : (
        "The next touch writes these figures."
      ),
  };

  return (
    <NoteRowShell
      icon="live-window"
      label={net != null ? `${since}: ${signedUsd(net)} change in USD` : since}
      marker={{ attr: "data-live-window", value: "liquity-v2-sp-since-touch" }}
      header={
        <>
          <span className="text-sm text-foreground">
            {sinceOpen ? (
              since
            ) : (
              <>
                Since its last <DepositTouchTip />
              </>
            )}
          </span>
          {net != null && netProv && (
            <>
              <span className="text-xs text-rb-500">change in USD</span>
              {/* An ECHO of the receipt in the sheet's note: one fact, stated
                  where the row is closed and again where it opens. */}
              <Prov echo info={netProv} value={String(net)}>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {net >= 0 ? "+" : "−"}$<AmountText value={Math.abs(net)} format="compact" />
                </span>
              </Prov>
            </>
          )}
          {/* The block is a link to the touch's block on the chain's explorer. */}
          <span className="ml-auto text-xs text-rb-500" data-prov-exempt="">
            from block <BlockRef block={fromBlock} chainId={MAINNET_CHAIN_ID} /> · {elapsed} ago
          </span>
        </>
      }
    >
      <EventSheetView sheet={sheet} breakdown data={{ "data-live-sheet": "" }} />
    </NoteRowShell>
  );
}
