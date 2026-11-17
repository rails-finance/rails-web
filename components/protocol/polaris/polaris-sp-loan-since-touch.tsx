"use client";

// Polaris — "Since its last touch" on a stability-pool deposit's and a reserve
// loan's timeline: the window from the position's newest touch to the head
// block, pinned in the head slot as the CDP's is
// (polaris-since-last-touch.tsx, whose header carries the rule).
//
// The frame is <NoteRowShell>'s with the live-window glyph. The closed row
// states the window's change in one figure: a deposit's at the market's price
// feed (the pETH paid in valued there, plus the stable gain, less the burn), a
// loan's at the bonding curve's floor (the collateral's move at the floor,
// less the fees). Opened, it is the event sheet's shape
// (polaris-sp-loan-sheet.ts): the figures the last touch wrote, what the
// window added, and the total the next touch starts from, every figure
// receipted.

import { NoteRowShell } from "@/components/shared/note-row-shell";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { EventSheetView, SHEET_NO_USD, type EventSheet, type SheetStat } from "@/components/shared/event-sheet";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { formatNumber } from "@/lib/utils/format";
import { formatDuration } from "@/lib/date";
import {
  FPETH,
  PETH,
  POLARIS_CHAIN_ID,
  POLARIS_MARKET_CONFIG,
  POLARIS_WETH,
  type PolarisMarket,
} from "@/lib/polaris/asset-catalog";
import { atFloor, big, exactUnits, units } from "@/lib/polaris/sp-loan-math";
import {
  loanAtFloorProv,
  loanLiveProv,
  loanSumProv,
  spFeedProv,
  spLiveProv,
  spPendingLossProv,
  spSumProv,
} from "@/lib/polaris/sp-loan-provenance";
import type { PolarisLoanEventRow } from "@/lib/sources/api/polaris-sp-loans";

const ZERO = BigInt(0);
/** The head's words, the CDP's (lib/polaris/since-last-touch.ts): where the
 *  last touch is the open, the window is the whole life. */
const sinceLabel = (sinceOpen: boolean) => (sinceOpen ? "Since its open" : "Since its last touch");
const sinceWords = (sinceOpen: boolean) => (sinceOpen ? "since its open" : "since the last touch");
const NEXT = "Before the next touch";

const Signed = ({ value, unit }: { value: number; unit: string }) => (
  <span className="font-semibold text-foreground tabular-nums">
    {value >= 0 ? "+" : "−"}
    <AmountText value={Math.abs(value)} format="compact" /> {unit}
  </span>
);

const fmt = (raw: bigint) => formatNumber(units(raw < ZERO ? -raw : raw));
const signedText = (raw: bigint) => `${raw < ZERO ? "−" : "+"}${fmt(raw)}`;
const signedNum = (n: number) => `${n < 0 ? "−" : "+"}${formatNumber(Math.abs(n))}`;

type Fig = { text: string; symbol: string; address: string; info: Provenance; value: string };
const fig = (raw: bigint, text: string, symbol: string, address: string, info: Provenance): Fig => ({
  text,
  symbol,
  address,
  info,
  value: exactUnits(raw),
});

/** The row on the shell: the window's one figure closed, the sheet open. */
function SinceTouchRow({
  marker,
  caption,
  figure,
  figureInfo,
  figureValue,
  unit,
  fromBlock,
  fromAt,
  toAt,
  sinceOpen,
  sheet,
}: {
  marker: string;
  /** The last touch is the open. */
  sinceOpen: boolean;
  /** What the figure is: a bare number read as nothing. */
  caption: string;
  figure: number | null;
  figureInfo: Provenance | null;
  /** The exact value the figure's receipt keys on. */
  figureValue: string;
  unit: string;
  fromBlock: number;
  fromAt: number;
  toAt: number;
  sheet: EventSheet;
}) {
  const elapsed = formatDuration(fromAt, toAt);
  const since = sinceLabel(sinceOpen);
  return (
    <NoteRowShell
      icon="live-window"
      label={figure != null ? `${since}: ${signedNum(figure)} ${unit} ${caption}` : since}
      marker={{ attr: "data-live-window", value: marker }}
      header={
        <>
          <span className="text-sm text-foreground">{since}</span>
          {figure != null && figureInfo && (
            <>
              <span className="text-xs text-rb-500">{caption}</span>
              {/* An ECHO of the receipt in the sheet's note: one fact, stated
                  where the row is closed and again where it opens. */}
              <Prov echo info={figureInfo} value={figureValue}>
                <span className="text-sm">
                  <Signed value={figure} unit={unit} />
                </span>
              </Prov>
            </>
          )}
          {/* The block is a link to the touch's block on the chain's explorer,
              chrome rather than a figure of this row. */}
          <span className="ml-auto text-xs text-rb-500" data-prov-exempt="">
            from block <BlockRef block={fromBlock} chainId={POLARIS_CHAIN_ID} /> · {elapsed} ago
          </span>
        </>
      }
    >
      <EventSheetView sheet={sheet} breakdown data={{ "data-live-sheet": "" }} />
    </NoteRowShell>
  );
}

// ── Deposit ────────────────────────────────────────────────────────────────

export function PolarisDepositSinceTouchRow({
  market,
  recorded,
  burned,
  now,
  gain,
  stashed,
  paidIn,
  feed,
  fromBlock,
  fromAt,
  toAt,
  headBlock,
  sinceOpen,
}: {
  market: PolarisMarket;
  /** deposits(id): the deposit the last touch recorded. */
  recorded: bigint;
  /** recorded − getCompoundedStableTokenDeposit(id). */
  burned: bigint;
  /** getCompoundedStableTokenDeposit(id). */
  now: bigint;
  /** getDepositorStableTokenGainWithPending(id). */
  gain: bigint;
  /** stashedBcTokens(id): pETH earlier touches left unclaimed. */
  stashed: bigint;
  /** getDepositorBcTokenGain(id): pETH paid in since the last touch. */
  paidIn: bigint;
  /** pETH in the market's stablecoin at its price feed now. */
  feed: number | null;
  fromBlock: number;
  fromAt: number;
  toAt: number;
  headBlock: number;
  /** The deposit's one operation is its open. */
  sinceOpen: boolean;
}) {
  const stable = POLARIS_MARKET_CONFIG[market].stable;
  const s = stable.symbol;
  const st = (raw: bigint, text: string, info: Provenance) => fig(raw, text, s, stable.address, info);
  const pe = (raw: bigint, text: string, info: Provenance) => fig(raw, text, PETH.symbol, PETH.address, info);
  const atHead = `at the head block ${headBlock.toLocaleString("en-US")}`;

  const pethValue = feed != null ? units(paidIn) * feed : null;
  const net = pethValue != null ? pethValue + units(gain) - units(burned) : null;
  const pethValueProv: Provenance | null =
    feed != null
      ? {
          kind: "chain-derived",
          pclass: "oracle",
          summary: `pETH paid in, at the feed — the pETH liquidations have paid the deposit since its last touch, times the market's price feed for pETH in ${s} ${atHead}.`,
          formula: "getDepositorBcTokenGain(id) × previewPrice()",
          inputs: [
            { label: "pETH paid in since last touch", value: exactUnits(paidIn), kind: "chain", pclass: "state" },
            { label: `pETH in ${s}`, value: String(feed), kind: "chain", pclass: "oracle" },
          ],
        }
      : null;
  const netProv: Provenance | null =
    net != null
      ? {
          kind: "chain-derived",
          pclass: "oracle",
          summary: `Change at the feed since the last touch — the pETH paid in since the last touch valued at the market's price feed, plus the ${s} gain pending, less the ${s} burned, ${atHead}. The holder did nothing inside this window.`,
          formula: "pETH paid in × previewPrice() + gain − burned",
          inputs: [
            { label: "pETH paid in, at the feed", value: String(pethValue), kind: "chain-derived", pclass: "oracle" },
            { label: `${s} gain since last touch`, value: exactUnits(gain), kind: "chain", pclass: "state" },
            { label: "burned since last touch", value: exactUnits(burned), kind: "chain-derived", pclass: "state" },
          ],
        }
      : null;

  const before = now + gain;
  const beforeProv: Provenance = {
    kind: "chain-derived",
    pclass: "state",
    summary: `Deposit before the next touch — the deposit now, getCompoundedStableTokenDeposit(id), plus the ${s} gain pending, getDepositorStableTokenGainWithPending(id), ${atHead}: what the next touch starts from before it claims or moves anything.`,
    formula: "getCompoundedStableTokenDeposit(id) + gain",
    inputs: [
      { label: "deposit now", value: exactUnits(now), kind: "chain", pclass: "state" },
      { label: `${s} gain since last touch`, value: exactUnits(gain), kind: "chain", pclass: "state" },
    ],
  };

  const sheet: EventSheet = {
    sides: [
      {
        side: "collateral",
        id: "deposit",
        name: "Deposit",
        tip: "The deposit's stablecoin in the pool: what its last touch recorded, what liquidations have burned since and the gain pending, from the pool's getters now.",
        icons: [s],
        carry: [],
        rows: [
          {
            key: "last",
            label: "At the last touch",
            amount: st(recorded, fmt(recorded), spSumProv("recorded", market)),
            tip: `The ${s} the deposit held after its newest operation.`,
          },
          ...(burned > ZERO
            ? [
                {
                  key: "burned",
                  label: "Burned since last touch",
                  amount: st(-burned, `−${fmt(burned)}`, spPendingLossProv(market)),
                  tip: `${s} liquidations have used from the deposit since its last touch, in exchange for the pETH paid in. The next touch writes it.`,
                },
              ]
            : []),
          ...(gain > ZERO
            ? [
                {
                  key: "yield",
                  label: `${s} gain since last touch`,
                  amount: st(gain, `+${fmt(gain)}`, spLiveProv("stableGain", market)),
                  tip: `The yield the deposit has earned since its last touch. The next touch pays it; what it does not claim stays in the deposit.`,
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: NEXT,
        totalAmount: st(before, fmt(before), beforeProv),
        totalTip:
          "The deposit now with the gain pending: what the next touch starts from, before it claims or moves anything.",
      },
      {
        side: "debt",
        id: "peth-gains",
        name: "pETH paid in",
        tip: "The pETH liquidations paid in to the deposit: what earlier touches left stashed, and what liquidations have paid since the last touch.",
        icons: [PETH.symbol],
        carry: [],
        rows: [
          ...(stashed > ZERO
            ? [
                {
                  key: "last",
                  label: "Stashed at the last touch",
                  amount: pe(stashed, fmt(stashed), spSumProv("stashed", market)),
                  tip: "The pETH earlier touches paid in and left unclaimed.",
                },
              ]
            : []),
          ...(paidIn > ZERO
            ? [
                {
                  key: "paid",
                  label: "Paid in since last touch",
                  amount: pe(paidIn, `+${fmt(paidIn)}`, spLiveProv("bcGain", market)),
                  tip: "The pETH liquidations have paid the deposit since its last touch. The next touch writes it.",
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: NEXT,
        untouched: "Not changed since the last touch",
        totalAmount: pe(stashed + paidIn, fmt(stashed + paidIn), spLiveProv("pendingPeth", market)),
        totalTip: "What the next touch can pay out in pETH: the stash and what liquidations have paid since.",
      },
    ],
    panels: [],
    note:
      feed != null && pethValueProv && netProv && pethValue != null && net != null ? (
        <>
          {paidIn > ZERO ? (
            <>
              At the feed, pETH is{" "}
              <Prov info={spFeedProv(market)} value={String(feed)}>
                {formatNumber(feed)}
              </Prov>{" "}
              {s}, so the pETH paid in is{" "}
              <Prov info={pethValueProv} value={String(pethValue)}>
                {formatNumber(pethValue)}
              </Prov>{" "}
              {s}.
            </>
          ) : (
            <>No liquidation has paid the deposit pETH.</>
          )}{" "}
          With the gain, less the burn, the deposit has moved{" "}
          <Prov info={netProv} value={String(net)}>
            {signedNum(net)}
          </Prov>{" "}
          {s}
          {paidIn > ZERO ? " at the feed" : ""} {sinceWords(sinceOpen)}. The next touch writes these figures.
        </>
      ) : (
        "The next touch writes these figures."
      ),
  };

  return (
    <SinceTouchRow
      marker="polaris-sp-since-touch"
      caption="change at the feed"
      figure={net}
      figureInfo={netProv}
      figureValue={String(net)}
      unit={s}
      sinceOpen={sinceOpen}
      fromBlock={fromBlock}
      fromAt={fromAt}
      toAt={toAt}
      sheet={sheet}
    />
  );
}

// ── Reserve loan ───────────────────────────────────────────────────────────

const sharesAgree = (a: bigint, b: bigint) => (a > b ? a - b : b - a) <= BigInt(1);

type LoanChainNow = {
  blockNumber: number;
  blockTimestamp: number;
  collRaw: string;
  sharesRaw: string;
  debtRaw: string;
  floorPriceRaw: string;
};

/** The loan's live window stands where the chain's loan is the one the
 *  index's last touch wrote: its collateral and shares agree, and the debt has
 *  not fallen below what that touch left. */
export function polarisLoanWindowStands(
  last: PolarisLoanEventRow | null,
  chain: LoanChainNow | null,
): last is PolarisLoanEventRow {
  return (
    last != null &&
    chain != null &&
    !!last.floor_price &&
    last.coll_after != null &&
    last.debt_after != null &&
    big(chain.collRaw) === big(last.coll_after) &&
    // The index carries the shares with decimals; the chain's integer is
    // within one of their integer part.
    sharesAgree(big(chain.sharesRaw), big(last.shares_after)) &&
    big(chain.debtRaw) >= big(last.debt_after)
  );
}

export function PolarisLoanSinceTouchRow({ last, chain }: { last: PolarisLoanEventRow; chain: LoanChainNow }) {
  if (!last.floor_price || last.coll_after == null) return null;
  const coll = big(chain.collRaw);
  const debtThen = big(last.debt_after);
  const debtNow = big(chain.debtRaw);
  const fee = debtNow - debtThen;
  const floorThen = big(last.floor_price);
  const floorNow = big(chain.floorPriceRaw);
  const atFloorThen = atFloor(last.coll_after, last.floor_price);
  const atFloorNow = atFloor(chain.collRaw, chain.floorPriceRaw);
  const move = atFloorNow - atFloorThen;
  const change = move - fee;
  const atHead = `at the head block ${chain.blockNumber.toLocaleString("en-US")}`;
  const W = POLARIS_WETH;
  const w = (raw: bigint, text: string, info: Provenance) => fig(raw, text, W.symbol, W.address, info);
  const c = (raw: bigint, text: string, info: Provenance) => fig(raw, text, FPETH.symbol, FPETH.address, info);

  const moveProv: Provenance = {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Collateral's move at the floor — the loan's ${FPETH.symbol} at the bonding curve's floor price ${atHead}, less the same collateral at the floor its last touch logged.`,
    formula: "collateral × (floorPrice() now − floor at the last touch) ÷ 1e18",
    inputs: [
      { label: "collateral", value: exactUnits(coll), kind: "chain", pclass: "state" },
      { label: "floor at the last touch", value: exactUnits(floorThen), kind: "chain", pclass: "emitted" },
      { label: "floor now", value: exactUnits(floorNow), kind: "chain", pclass: "oracle" },
    ],
  };
  const changeProv: Provenance = {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Change at the floor since the last touch — the collateral's move at the bonding curve's floor, less the fees the reserve has charged since the last touch, ${atHead}. The holder did nothing inside this window.`,
    formula: "collateral's move at the floor − fees since last touch",
    inputs: [
      { label: "collateral's move at the floor", value: exactUnits(move), kind: "chain-derived", pclass: "oracle" },
      { label: "fees since last touch", value: exactUnits(fee), kind: "chain-derived", pclass: "state" },
    ],
  };

  const floorMoveProv: Provenance = {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Floor's move since the last touch — the bonding curve's floorPrice() ${atHead}, less the floor price the last touch logged with its FeesAccrued index.`,
    formula: "floorPrice() now − floor at the last touch",
    inputs: [
      { label: "floor now", value: exactUnits(floorNow), kind: "chain", pclass: "oracle" },
      { label: "floor at the last touch", value: exactUnits(floorThen), kind: "chain", pclass: "emitted" },
    ],
  };
  const floorText = (raw: bigint) =>
    units(raw).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const floorMoved = floorText(floorNow) !== floorText(floorThen);
  const limits: SheetStat[] = [
    {
      key: "floor",
      label: "Floor price",
      value: {
        text: `${floorText(floorNow)} WETH per ${FPETH.symbol}`,
        info: loanLiveProv("floor"),
        value: exactUnits(floorNow),
      },
      change: floorMoved
        ? {
            info: floorMoveProv,
            value: exactUnits(floorNow - floorThen),
            text: `${floorNow > floorThen ? "+" : "−"}${floorText(floorNow > floorThen ? floorNow - floorThen : floorThen - floorNow)} WETH`,
          }
        : null,
      tip: "The bonding curve's floor price now, beside its move since the floor the last touch logged. The protocol only raises it.",
    },
    {
      key: "at-floor",
      label: "Collateral at the floor",
      value: { text: `${fmt(atFloorNow)} WETH`, info: loanAtFloorProv(), value: exactUnits(atFloorNow) },
      change: move !== ZERO ? { text: `${signedText(move)} WETH`, info: moveProv, value: exactUnits(move) } : null,
      tip: `The loan's ${FPETH.symbol} at the floor price now, beside its move since the last touch.`,
    },
  ];

  const sheet: EventSheet = {
    sides: [
      {
        side: "collateral",
        icons: [FPETH.symbol],
        carry: [],
        rows: [],
        total: SHEET_NO_USD,
        untouched: "Not changed since the last touch",
        totalAmount: c(coll, fmt(coll), loanLiveProv("coll")),
        totalTip: `The loan's ${FPETH.symbol}: only a touch moves it.`,
      },
      {
        side: "debt",
        icons: [W.symbol],
        carry: [],
        rows: [
          {
            key: "last",
            label: "At the last touch",
            amount: w(debtThen, fmt(debtThen), loanSumProv("debtAtLastTouch")),
            tip: "The debt the last touch left: its shares at the debt per share then in force, rounded up.",
          },
          ...(fee > ZERO
            ? [
                {
                  key: "fees",
                  label: "Fees since last touch",
                  amount: w(fee, `+${fmt(fee)}`, loanSumProv("pendingFee")),
                  tip: "The fees the reserve has charged since the last touch: the debt now less the debt the last touch left. Each fee raises the debt per share, so the debt grows with no action on the loan.",
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: "Now",
        totalAmount: w(debtNow, fmt(debtNow), loanLiveProv("debt")),
        totalTip:
          "The WETH the loan owes now: its shares at the debt per share, with the fees accrued since the last FeesAccrued.",
      },
    ],
    panels: [{ panel: "limits", rows: limits }],
    note: (
      <>
        At the floor, the collateral has moved{" "}
        <Prov info={moveProv} value={exactUnits(move)}>
          {signedText(move)}
        </Prov>{" "}
        WETH and the fees have added{" "}
        <Prov info={loanSumProv("pendingFee")} value={exactUnits(fee)}>
          {fmt(fee)}
        </Prov>{" "}
        WETH to the debt, a change of{" "}
        <Prov info={changeProv} value={exactUnits(change)}>
          {signedText(change)}
        </Prov>{" "}
        WETH {sinceWords(last.event_type === "opened")}. The next touch writes the debt.
      </>
    ),
  };

  return (
    <SinceTouchRow
      marker="polaris-loan-since-touch"
      caption="change at the floor"
      figure={units(change)}
      figureInfo={changeProv}
      figureValue={exactUnits(change)}
      sinceOpen={last.event_type === "opened"}
      unit={W.symbol}
      fromBlock={Number(last.block_number)}
      fromAt={Number(last.block_timestamp)}
      toAt={chain.blockTimestamp}
      sheet={sheet}
    />
  );
}
