"use client";

// Liquity V1 — "Since its last touch" on a stability-pool deposit's timeline:
// the window from the deposit's last touch to the head block, pinned in the
// timeline's head slot (decision 0022 §4), on the frame Liquity V2's deposit
// row uses (sp-since-touch.tsx).
//
// Closed, the row states the window's change in one figure, in USD at the
// PriceFeed: the ETH paid in valued there, less the LUSD burned, LUSD counted
// at $1. The LQTY accrued is not valued: no LQTY price is read. Opened, it is
// the event sheet's shape (v1-sp-sheet.ts): the deposit the last touch wrote,
// what the window burned, and the gains the next touch pays, every figure
// receipted. Where the feed did not answer, the row names the window and
// values nothing.

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
import { NATIVE } from "@/lib/shared/asset-roster";
import { exactUnits, units } from "@/lib/liquity-v1/sp-math";
import { spFeedProv, spLiveProv, spPendingLossProv, spSumProv } from "@/lib/liquity-v1/sp-provenance";

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

export function LiquityV1DepositSinceTouchRow({
  recorded,
  burned,
  now,
  eth,
  lqty,
  price,
  priceStale,
  fromBlock,
  fromAt,
  toAt,
  headBlock,
  sinceOpen,
}: {
  /** deposits(depositor).initialValue: the deposit the last touch recorded. */
  recorded: bigint;
  /** recorded − getCompoundedLUSDDeposit(depositor). */
  burned: bigint;
  /** getCompoundedLUSDDeposit(depositor). */
  now: bigint;
  /** getDepositorETHGain(depositor). */
  eth: bigint;
  /** getDepositorLQTYGain(depositor). */
  lqty: bigint;
  /** USD per ETH at the PriceFeed now, or null. */
  price: number | null;
  priceStale: boolean;
  fromBlock: number;
  fromAt: number;
  toAt: number;
  headBlock: number;
  /** The deposit's one touch is its open. */
  sinceOpen: boolean;
}) {
  const lu = (raw: bigint, text: string, info: Provenance) => fig(raw, text, "LUSD", TOKEN_ADDRESSES.LUSD, info);
  const et = (raw: bigint, text: string, info: Provenance) => fig(raw, text, "ETH", NATIVE, info);
  const lq = (raw: bigint, text: string, info: Provenance) => fig(raw, text, "LQTY", TOKEN_ADDRESSES.LQTY, info);
  const atHead = `at the head block ${headBlock.toLocaleString("en-US")}`;
  const since = sinceLabel(sinceOpen);
  const elapsed = formatDuration(fromAt, toAt);

  const ethValue = price != null ? units(eth) * price : null;
  const net = ethValue != null ? ethValue - units(burned) : null;
  const ethValueProv: Provenance | null =
    price != null
      ? {
          kind: "chain-derived",
          pclass: "oracle",
          summary: `ETH paid in, in USD — the ETH liquidations have paid the deposit since its last touch, times the PriceFeed's price for ETH ${atHead}.`,
          formula: "getDepositorETHGain(depositor) × price",
          inputs: [
            { label: "ETH paid in since last touch", value: exactUnits(eth), kind: "chain", pclass: "state" },
            { label: "ETH in USD", value: String(price), kind: "chain", pclass: "oracle" },
          ],
        }
      : null;
  const netProv: Provenance | null =
    net != null
      ? {
          kind: "chain-derived",
          pclass: "oracle",
          summary: `Change in USD since the last touch — the ETH paid in since the last touch at the PriceFeed, less the LUSD burned, LUSD counted at $1, ${atHead}. The LQTY accrued is not valued. The depositor did nothing inside this window.`,
          formula: "ETH paid in × price − burned",
          inputs: [
            { label: "ETH paid in, in USD", value: String(ethValue), kind: "chain-derived", pclass: "oracle" },
            {
              label: "LUSD burned since last touch",
              value: exactUnits(burned),
              kind: "chain-derived",
              pclass: "state",
            },
          ],
        }
      : null;

  const sheet: EventSheet = {
    sides: [
      {
        side: "collateral",
        id: "deposit",
        name: "Deposit",
        tip: "The deposit's LUSD in the pool: what its last touch recorded and what liquidations have burned since, from the pool's getters now.",
        icons: ["LUSD"],
        carry: [],
        rows: [
          {
            key: "last",
            label: "At the last touch",
            amount: lu(recorded, fmt(recorded), spSumProv("recorded")),
            tip: "The LUSD the deposit held after its last touch.",
          },
          ...(burned > ZERO
            ? [
                {
                  key: "burned",
                  label: "Burned since last touch",
                  amount: lu(-burned, `−${fmt(burned)}`, spPendingLossProv()),
                  tip: "LUSD liquidations have used from the deposit since its last touch, in exchange for the ETH paid in. The next touch writes it.",
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: NEXT,
        totalAmount: lu(now, fmt(now), spLiveProv("compounded")),
        totalTip: "The deposit now: what the next touch starts from, before it moves anything.",
      },
      {
        side: "debt",
        id: "gains",
        name: "Gains pending",
        tip: "What the next touch pays out: the ETH liquidations have paid the deposit since its last touch, and the LQTY issued to it.",
        icons: ["ETH", "LQTY"],
        carry: [],
        rows: [
          ...(eth > ZERO
            ? [
                {
                  key: "eth",
                  label: "ETH paid in since last touch",
                  amount: et(eth, `+${fmt(eth)}`, spLiveProv("ethGain")),
                  tip: "The ETH liquidations have paid the deposit since its last touch. The next touch pays it out.",
                },
              ]
            : []),
          ...(lqty > ZERO
            ? [
                {
                  key: "lqty",
                  label: "LQTY issued since last touch",
                  amount: lq(lqty, `+${fmt(lqty)}`, spLiveProv("lqtyGain")),
                  tip: "The LQTY issued to the deposit since its last touch, the front end's share taken out. The next touch pays it, with the issuance that touch triggers.",
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: NEXT,
        untouched: "Nothing pending",
      },
    ],
    panels: [],
    note:
      price != null && ethValueProv && netProv && ethValue != null && net != null ? (
        <>
          {eth > ZERO ? (
            <>
              At the PriceFeed, ETH is{" "}
              <Prov info={spFeedProv(priceStale)} value={String(price)}>
                {usd(price)}
              </Prov>
              , so the ETH paid in is{" "}
              <Prov info={ethValueProv} value={String(ethValue)}>
                {usd(ethValue)}
              </Prov>
              .
            </>
          ) : (
            <>No liquidation has paid the deposit ETH.</>
          )}{" "}
          Less the burn, LUSD counted at $1, the deposit has moved{" "}
          <Prov info={netProv} value={String(net)}>
            {signedUsd(net)}
          </Prov>{" "}
          {sinceWords(sinceOpen)}, before the LQTY, which is not valued. The next touch writes these figures.
        </>
      ) : (
        "The next touch writes these figures."
      ),
  };

  return (
    <NoteRowShell
      icon="live-window"
      label={net != null ? `${since}: ${signedUsd(net)} change in USD, LQTY not valued` : since}
      marker={{ attr: "data-live-window", value: "liquity-v1-sp-since-touch" }}
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
              <span className="text-xs text-rb-500">change in USD · LQTY not valued</span>
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
