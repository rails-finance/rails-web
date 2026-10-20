"use client";

// Polaris — "Since its last touch": the live window's two causes, side by side.
// ----------------------------------------------------------------------------
// Between two of a CDP's own touches its stated figures do not move, so exactly
// two things changed what it is worth at the market's own feed — the feed, and
// the protocol's pending legs — and they add up to the whole move. The closed
// row states that move. Opened, it is an event card's balance sheet (decision
// 0042, ui-jobs 396): Collateral and Debt as the last touch wrote them, what
// is pending, and the figures at the feed; Risk and Limits at the feed beside
// the stated ones; and behind the breakdown switch the feed, one line per
// protocol leg (largest first, dust left out) and the total, every figure
// receipted, no percentage and no colour (lib/polaris/since-last-touch.ts
// carries the why). Where the last touch is the open, the row says "Since its
// open": the one window where a statement over the CDP's whole life is a fact.
//
// IT IS A TIMELINE ROW, pinned in the head slot (rails-ops TO-DO-ui-jobs §44).
// Every window between two touches is already told on the spine, between the
// two events that bracket it; this is the one window with no second touch yet,
// so it is told the same way, at the end that is now. It is NOT a market note:
// a note happened to every holder at once, this is this CDP's own window — so
// it keeps every note exclusion (out of the event options, the filters and the
// boundary histogram) and takes none of the notes toggle. See ChainTruthTimeline's
// `liveWindow` prop for the whole of that contract.
//
// The frame is <NoteRowShell>'s, shared with the market-note row. The glyph
// keeps the note's register — hollow, neutral ink — for the same reason the
// note has it: the holder did nothing inside the window, which is what lets
// its two causes be stated as facts rather than apportioned. It is a square
// where the note's is a diamond, because on a CDP carrying both the two rows
// stand side by side in the head slot.
//
// It renders only where the window IS a fact — `polarisSinceLastTouch` returns
// null otherwise, and the slot draws nothing.

import type { ReactNode } from "react";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { Prov, type Provenance, type ProvInput } from "@/components/shared/provenance";
import {
  EventSheetView,
  sheetUsd,
  type EventSheet,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import { changeText } from "@/components/shared/change-swap-value";
import { gasEscrowFootnote } from "@/lib/shared/liquity-gas-escrow";
import { gasCompHeldProv, type PolarisCoords } from "@/lib/polaris/event-provenance";
import { crPct1, POLARIS_NORMAL_MCR_PCT } from "@/lib/polaris/cr-at-event";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { POLARIS_LIQ_CONSTANTS, polarisValueFormat } from "./polaris-liquidation-forensics";
import { polarisParamStats } from "./polaris-sheet";
import { formatNumber } from "@/lib/utils/format";
import { formatExact } from "@/lib/utils/format";
import { formatPethPrice } from "@/components/protocol/polaris/polaris-position-card";
import { formatDuration } from "@/lib/date";
import {
  polarisProtocolLegs,
  polarisSinceLabel,
  signedFigure,
  type PolarisProtocolLeg,
  type PolarisProtocolLegKey,
  type PolarisSinceLastTouch,
} from "@/lib/polaris/since-last-touch";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatPeth } from "@/lib/polaris/figure-format";

const Signed = ({ value, unit }: { value: number; unit: string }) => (
  <span className="font-semibold text-foreground tabular-nums">
    {value >= 0 ? "+" : "−"}
    <AmountText value={Math.abs(value)} format="compact" /> {unit}
  </span>
);

/** The feed's own legs at one end, as receipt inputs. Stated, never split into
 *  shares of the figure: apportioning one price move between three
 *  multiplicative legs is a choice of index, not a fact of the chain. */
function feedLegInputs(w: PolarisSinceLastTouch, market: "usdp" | "goldp") {
  const ends: Array<[string, number | undefined, number | undefined]> = [
    ["bonding-curve price", w.from.curve, w.to.curve],
    ["ETH/USD medianiser", w.from.ethUsd, w.to.ethUsd],
    ...(market === "goldp"
      ? ([["XAU/USD medianiser", w.from.xauUsd, w.to.xauUsd]] as Array<
          [string, number | undefined, number | undefined]
        >)
      : []),
  ];
  return ends
    .filter(([, a, b]) => a != null && b != null)
    .map(([label, a, b]) => ({
      label,
      value: `${formatCompact(a as number)} → ${formatCompact(b as number)}`,
      kind: "chain-derived" as const,
      pclass: "oracle" as const,
      note: "a leg of previewPrice(); the feed's move is not apportioned between the legs",
    }));
}

export function PolarisSinceLastTouchRow({
  window: w,
  market,
  cdpId,
  stable,
}: {
  window: PolarisSinceLastTouch;
  market: PolarisMarket;
  cdpId: string;
  stable: string;
}) {
  // formatDuration reads a bare number as unix SECONDS, which is what both ends carry.
  const elapsed = formatDuration(w.from.timestamp, w.to.timestamp);

  const feedProv: Provenance = {
    kind: "chain-derived",
    pclass: "oracle",
    summary:
      `What the market's own price feed did to the collateral — the figure this CDP stated at its last touch. The CDP's stated ` +
      `collateral does not change between touches, so this is the whole of the feed's effect: the pETH price in ` +
      `${stable} at the end of the touch's block (the oracle-at-block lane's previewPrice()) against the same feed ` +
      `read at the head block, times the collateral the chain recorded at that touch.`,
    formula: "coll (at the touch) × (previewPrice now − previewPrice at the touch)",
    inputs: [
      {
        label: "collateral at the touch",
        value: formatExact(w.collAtTouch),
        kind: "chain",
        pclass: "state",
        note: "getCDP(id).coll — the slot written at the last touch",
      },
      {
        label: `pETH in ${stable} at the touch`,
        value: formatExact(w.from.pethInDebt),
        kind: "chain-derived",
        pclass: "oracle",
        note: `previewPrice() at the end of block ${w.from.block.toLocaleString("en-US")}`,
      },
      {
        label: `pETH in ${stable} now`,
        value: formatExact(w.to.pethInDebt),
        kind: "chain-derived",
        pclass: "oracle",
        note: `previewPrice() at block ${w.to.block.toLocaleString("en-US")}`,
      },
      ...feedLegInputs(w, market),
    ],
  };

  const priceNowInput = {
    label: `pETH in ${stable} now`,
    value: formatExact(w.to.pethInDebt),
    kind: "chain-derived" as const,
    pclass: "oracle" as const,
    note: "the feed the pETH legs are valued at",
  };
  const pendingNote = "pending until the CDP's next touch settles it into the stated figures";
  /** One receipt per protocol leg: its getter, valued at the feed now. */
  const legProv = (key: PolarisProtocolLegKey): Provenance => {
    switch (key) {
      case "psm":
        return {
          kind: "chain-derived",
          pclass: "state",
          summary:
            `This CDP's net PSM share — its pro-rata share of every PSM mint and redemption since that touch, valued ` +
            `at the feed now; its two sides can move in opposite directions. The docs call these the peg-defence fees. ` +
            `It is ${pendingNote}.`,
          formula: "mintRedeemCollChange × price − mintRedeemDebtChange",
          inputs: [
            {
              label: "net PSM share, collateral side",
              value: formatExact(w.raw.psmColl),
              kind: "chain",
              pclass: "state",
              note: `getCDPMintRedeemCollChange(id), in pETH, a view call at the head block ${w.to.block.toLocaleString("en-US")}`,
            },
            {
              label: "net PSM share, debt side",
              value: formatExact(w.raw.psmDebt),
              kind: "chain",
              pclass: "state",
              note: `getCDPMintRedeemDebtChange(id), in ${stable}, a view call at the head block ${w.to.block.toLocaleString("en-US")}`,
            },
            priceNowInput,
          ],
        };
      case "reward":
        return {
          kind: "chain-derived",
          pclass: "state",
          summary:
            `This CDP's pETH reward — the pETH the protocol has distributed to it in proportion to its debt since ` +
            `that touch, valued at the feed now. The docs call it the pETH yield to minters. It is ${pendingNote}.`,
          formula: "bcTokenGain × price",
          inputs: [
            {
              label: "pETH reward",
              value: formatExact(w.raw.reward),
              kind: "chain",
              pclass: "state",
              note: `getCDPBcTokenGain(id), in pETH, a view call at the head block ${w.to.block.toLocaleString("en-US")}`,
            },
            priceNowInput,
          ],
        };
      case "interest":
        return {
          kind: "chain",
          pclass: "state",
          summary: `Interest charged — the interest accrued on the debt since that touch, ${pendingNote}.`,
          formula: "− accruedInterest",
          inputs: [
            {
              label: "interest charged",
              value: formatExact(-w.legs.interest),
              kind: "chain",
              pclass: "state",
              note: `getCDPAccruedInterest(id), in ${stable}, a view call at the head block ${w.to.block.toLocaleString("en-US")}`,
            },
          ],
        };
      case "stabilityGain":
        return {
          kind: "chain",
          pclass: "state",
          summary: `The stability gain — the Protocol Safety Rate's credit against the debt since that touch, ${pendingNote}.`,
          formula: "accruedStables",
          inputs: [
            {
              label: "stability gain",
              value: formatExact(w.legs.stabilityGain),
              kind: "chain",
              pclass: "state",
              note: `getCDPAccruedStables(id), in ${stable}, a view call at the head block ${w.to.block.toLocaleString("en-US")}`,
            },
          ],
        };
      case "settle":
        return {
          kind: "derived",
          summary:
            `The debt below zero — the pending legs clear more than the debt, and the next touch settles the debt to ` +
            `zero, so this part is taken back out.`,
          formula: "min(0, entireDebt)",
          inputs: [
            {
              label: "entire debt",
              value: formatExact(w.legs.settle),
              kind: "chain",
              pclass: "state",
              note: `getCDPEntireDebt(id), in ${stable}, a view call at the head block ${w.to.block.toLocaleString("en-US")}`,
            },
          ],
        };
    }
  };

  const totalProv: Provenance = {
    kind: "derived",
    summary:
      `The whole change in this CDP's equity at the feed since its ${w.sinceOpen ? "open" : "last touch"}: the feed's ` +
      `effect plus the protocol's legs. The holder did nothing inside this window, so no other cause exists. Equity ` +
      `here is a valuation at a block.`,
    formula: "(entireColl × price now − max(0, entireDebt)) − (coll × price at the touch − debt)",
    inputs: [
      {
        label: "equity at the touch",
        value: formatExact(w.equityAtTouch),
        kind: "derived",
        note: "the stated slots at that block, at that block's feed",
      },
      {
        label: "equity now",
        value: formatExact(w.equityNow),
        kind: "chain-derived",
        pclass: "state",
        note: "getCDPEntireColl × previewPrice − getCDPEntireDebt (zero at or below zero) at the head block",
      },
    ],
  };

  const legs = polarisProtocolLegs(w);
  const since = polarisSinceLabel(w);
  const feedLegs = [
    ["bonding curve", w.from.curve, w.to.curve, " ETH"],
    ["ETH/USD", w.from.ethUsd, w.to.ethUsd, ""],
    ...(market === "goldp" ? [["XAU/USD", w.from.xauUsd, w.to.xauUsd, ""]] : []),
  ] as Array<[string, number | undefined, number | undefined, string]>;
  const feedLegText = feedLegs
    .filter(([, a, b]) => a != null && b != null)
    .map(([name, a, b, unit]) => `${name} ${formatPethPrice(a as number)} → ${formatPethPrice(b as number)}${unit}`)
    .join(", ");
  // The docs' names beside ours (content/polaris/event-prose.yaml, `words`).
  const legDetail = (l: PolarisProtocolLeg): string =>
    l.key === "psm"
      ? POLARIS_WORDS.docs_psm
      : l.key === "reward"
        ? `${formatPeth(w.raw.reward)} pETH ${POLARIS_WORDS.docs_reward}`
        : l.key === "stabilityGain"
          ? POLARIS_WORDS.docs_gain
          : "";

  const Row = ({
    label,
    detail,
    value,
    leg,
    indent,
  }: {
    label: string;
    detail: ReactNode;
    value: ReactNode;
    leg?: string;
    indent?: boolean;
  }) => (
    <div className={`flex items-baseline justify-between gap-x-3 ${indent ? "py-1 pl-3" : "py-1.5"}`} data-leg={leg}>
      <span className="min-w-0">
        <span className="text-foreground">{label}</span> <span className="text-rb-500">{detail}</span>
      </span>
      <span className="shrink-0">{value}</span>
    </div>
  );

  // The breakdown: the five lines that sum to the change in equity at the
  // feed, behind the sheet's switch.
  const breakdown = (
    <div className="px-9 pb-1 text-xs" data-live-breakdown="">
      <Row
        label="The feed:"
        leg="feed"
        detail={
          <>
            pETH {formatPethPrice(w.from.pethInDebt)} → {formatPethPrice(w.to.pethInDebt)} {stable}
            {feedLegText ? ` (${feedLegText})` : ""}, on the collateral stated then
          </>
        }
        value={
          <Prov info={feedProv} value={formatExact(w.feed)}>
            <Signed value={w.feed} unit={stable} />
          </Prov>
        }
      />
      {legs.length > 0 && <div className="pt-1.5 text-foreground">{W.live_legs}</div>}
      {legs.map((l) => (
        <Row
          key={l.key}
          leg={l.key}
          indent
          label={l.name.charAt(0).toUpperCase() + l.name.slice(1)}
          detail={legDetail(l)}
          value={
            <Prov info={legProv(l.key)} value={formatExact(l.value)}>
              <Signed value={l.value} unit={stable} />
            </Prov>
          }
        />
      ))}
      <div className="mt-1 border-t border-rb-300/40 pt-1 dark:border-rb-700/40">
        <Row
          label={W.live_change}
          leg="total"
          detail=""
          value={
            <Prov info={totalProv} value={formatExact(w.total)}>
              <Signed value={w.total} unit={stable} />
            </Prov>
          }
        />
      </div>
    </div>
  );

  const sheet = polarisLiveSheet(w, { market, cdpId, stable, breakdown });

  return (
    <NoteRowShell
      icon="live-window"
      label={`${since} — ${signedFigure(w.total, stable)}`}
      marker={{ attr: "data-live-window", value: "polaris-since-touch" }}
      header={
        <>
          <span className="text-sm text-foreground">{since}</span>
          {/* The closed row names its figure: a bare number read as nothing. */}
          <span className="text-xs text-rb-500">change in equity at the feed</span>
          {/* An ECHO of the "Change in equity at the feed" receipt in the
              breakdown: one fact, stated where the row is closed and again
              where it opens. */}
          <Prov echo info={totalProv} value={formatExact(w.total)}>
            <span className="text-sm">
              <Signed value={w.total} unit={stable} />
            </span>
          </Prov>
          {/* The block is a link to the touch's block on the chain's explorer,
              chrome rather than a figure of this row. */}
          <span className="ml-auto text-xs text-rb-500" data-prov-exempt="">
            from block <BlockRef block={w.from.block} /> · {elapsed} ago
          </span>
        </>
      }
    >
      <EventSheetView sheet={sheet} breakdown={false} data={{ "data-live-sheet": "" }} />
    </NoteRowShell>
  );
}

const W = POLARIS_WORDS;

/** The live window on the event card's balance sheet (decision 0042, ui-jobs
 *  396): Collateral and Debt as the last touch wrote them, what is pending
 *  until the next touch, and the figures at the feed, every one a view call on
 *  the cdpManager at the head block; then Risk and Limits at the feed beside
 *  the stated ones. The breakdown is the window's five lines. */
function polarisLiveSheet(
  w: PolarisSinceLastTouch,
  o: { market: PolarisMarket; cdpId: string; stable: string; breakdown: ReactNode },
): EventSheet {
  const { market, stable } = o;
  const cfg = POLARIS_MARKET_CONFIG[market];
  const head = w.to.block;
  const atHead = `at the head block ${head.toLocaleString("en-US")}`;
  const coords: PolarisCoords = { market, cdpId: o.cdpId, blockNumber: head };
  const manager = { name: `Polaris ${stable} CDPManager`, address: cfg.cdpManager };
  // The stablecoin in dollars now: a USDp is $1 in the feed, a GOLDp an ounce at XAU/USD.
  const unitUsd = market === "usdp" ? 1 : (w.to.xauUsd ?? null);
  const unitInput: ProvInput | null =
    unitUsd == null
      ? null
      : market === "usdp"
        ? {
            label: `${stable} in USD`,
            value: "$1.00",
            kind: "chain-derived",
            pclass: "oracle",
            note: "the feed prices pETH as the bonding curve's rate times ETH/USD, so a USDp is $1 in it",
          }
        : {
            label: `${stable} in USD`,
            value: sheetUsd(unitUsd),
            kind: "chain",
            pclass: "oracle",
            note: `the XAU/USD medianiser ${atHead}`,
          };
  const pethUsd = unitUsd != null ? w.to.pethInDebt * unitUsd : null;
  const priceInput: ProvInput = {
    label: `pETH price in ${stable}`,
    value: `${formatExact(w.to.pethInDebt)} ${stable}`,
    kind: "chain",
    pclass: "oracle",
    note: `the market's price feed, previewPrice() ${atHead}`,
    contract: { name: `Polaris ${stable} price feed`, address: cfg.priceFeed },
  };
  const usd = (what: string, token: "coll" | "debt", n: number) => {
    const price = token === "coll" ? pethUsd : unitUsd;
    if (price == null) return undefined;
    return {
      text: sheetUsd(n * price),
      info: {
        kind: "chain-derived",
        pclass: "oracle",
        summary:
          token === "coll"
            ? `${what} in US dollars: the pETH times the feed's price for pETH in ${stable}, times ${stable} in dollars, ${atHead}.`
            : `${what} in US dollars: the ${stable} times its price in dollars, ${atHead}.`,
        formula:
          token === "coll" ? `pETH × pETH price in ${stable} × ${stable} in USD` : `${stable} × ${stable} in USD`,
        inputs: [
          { label: token === "coll" ? "pETH" : stable, value: formatExact(Math.abs(n)), kind: "chain" },
          ...(token === "coll" ? [priceInput] : []),
          ...(unitInput ? [unitInput] : []),
        ],
      } satisfies Provenance,
    };
  };
  /** A view call on the cdpManager at the head block, as a receipt. */
  const view = (summary: string, fn: string, value: number, unit: string): Provenance => ({
    kind: "chain",
    pclass: "state",
    summary,
    contract: manager,
    via: `${fn} ${atHead}`,
    inputs: [{ label: fn, value: `${formatExact(value)} ${unit}`, kind: "chain", pclass: "state" }],
  });
  const signedAmount = (n: number, fmt: (x: number) => string) => `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;
  const stated = w.sinceOpen ? W.live_stated_open : W.live_stated_touch;

  // ── Collateral ──
  const collPending = w.raw.psmColl + w.raw.reward;
  const pethFig = (text: string, info: Provenance, value: number) => ({
    text,
    info,
    value: formatExact(value),
    symbol: PETH.symbol,
    address: PETH.address,
  });
  const collSide: SheetSide = {
    side: "collateral",
    icons: [PETH.symbol],
    carry: [],
    rows: [
      {
        key: "stated",
        label: stated,
        amount: pethFig(
          formatPeth(w.collAtTouch),
          view(
            `The collateral the CDP's last touch wrote, the slot nothing rewrites until the next touch.`,
            "getCDP(id).coll",
            w.collAtTouch,
            "pETH",
          ),
          w.collAtTouch,
        ),
        usd: usd(stated, "coll", w.collAtTouch),
        tip: W.tip_live_coll_stated,
      },
      ...(Math.abs(collPending) > 1e-12
        ? [
            {
              key: "pending",
              label: W.live_pending,
              amount: pethFig(
                signedAmount(collPending, formatPeth),
                {
                  kind: "chain",
                  pclass: "state",
                  summary: `The pETH pending since the last touch: the CDP's net PSM collateral share and its pETH reward, two view calls on the cdpManager ${atHead}. The next touch writes them into the collateral.`,
                  formula: "getCDPMintRedeemCollChange(id) + getCDPBcTokenGain(id)",
                  contract: manager,
                  inputs: [
                    {
                      label: "net PSM share, collateral side",
                      value: formatExact(w.raw.psmColl),
                      kind: "chain",
                      pclass: "state",
                    },
                    { label: "pETH reward", value: formatExact(w.raw.reward), kind: "chain", pclass: "state" },
                  ],
                },
                collPending,
              ),
              usd: usd(W.live_pending, "coll", collPending),
              tip: W.tip_live_coll_pending,
            },
          ]
        : []),
    ],
    after: W.live_at_feed,
    total: pethUsd != null ? usd("The collateral at the feed", "coll", w.atFeed.coll)! : { none: W.sheet_no_price },
    totalAmount: pethFig(
      formatPeth(w.atFeed.coll),
      view(
        "The CDP's collateral at the feed: the stated pETH with the pending PSM share and reward.",
        "getCDPEntireColl(id)",
        w.atFeed.coll,
        "pETH",
      ),
      w.atFeed.coll,
    ),
    totalTip: W.tip_live_coll_total,
  };

  // ── Debt ──
  const debtPending = w.atFeed.debt - w.debtAtTouch;
  const stableFig = (text: string, info: Provenance, value: number) => ({
    text,
    info,
    value: formatExact(value),
    symbol: stable,
    address: cfg.stable.address,
  });
  const debtSide: SheetSide = {
    side: "debt",
    icons: [stable],
    carry: [],
    rows: [
      {
        key: "stated",
        label: stated,
        amount: stableFig(
          formatNumber(w.debtAtTouch),
          view(
            `The debt the CDP's last touch wrote, the slot nothing rewrites until the next touch.`,
            "getCDP(id).debt",
            w.debtAtTouch,
            stable,
          ),
          w.debtAtTouch,
        ),
        usd: usd(stated, "debt", w.debtAtTouch),
        tip: W.tip_live_debt_stated,
      },
      ...(Math.abs(debtPending) > 1e-12
        ? [
            {
              key: "pending",
              label: W.live_pending,
              amount: stableFig(
                signedAmount(debtPending, formatNumber),
                {
                  kind: "chain-derived",
                  pclass: "state",
                  summary: `The debt pending since the last touch: interest charged, less the stability gain, with the net PSM debt share, view calls on the cdpManager ${atHead}. The next touch writes them into the debt.`,
                  formula: "getCDPAccruedInterest(id) − getCDPAccruedStables(id) + getCDPMintRedeemDebtChange(id)",
                  contract: manager,
                  inputs: [
                    {
                      label: "interest charged",
                      value: formatExact(w.atFeed.accruedInterest),
                      kind: "chain",
                      pclass: "state",
                    },
                    {
                      label: "stability gain",
                      value: formatExact(w.atFeed.accruedStables),
                      kind: "chain",
                      pclass: "state",
                    },
                    {
                      label: "net PSM share, debt side",
                      value: formatExact(w.raw.psmDebt),
                      kind: "chain",
                      pclass: "state",
                    },
                  ],
                },
                debtPending,
              ),
              usd: usd(W.live_pending, "debt", debtPending),
              tip: W.tip_live_debt_pending,
            },
          ]
        : []),
    ],
    after: W.live_at_feed,
    total: unitUsd != null ? usd("The debt at the feed", "debt", w.atFeed.debt)! : { none: W.sheet_no_price },
    totalAmount: stableFig(
      formatNumber(w.atFeed.debt),
      view(
        "The CDP's debt at the feed: the stated debt with the pending legs.",
        "getCDPEntireDebt(id)",
        w.atFeed.debt,
        stable,
      ),
      w.atFeed.debt,
    ),
    totalTip: W.tip_live_debt_total,
  };

  // ── Risk: at the feed, beside the stated ──
  const mcr = POLARIS_LIQ_CONSTANTS.mcr;
  const pts = (a: number) => `${a.toFixed(2)} pts`;
  const unitText = (n: number) => `${polarisValueFormat(market)(n)} ${stable}`;
  const crNow = w.atFeed.debt > 0 ? ((w.atFeed.coll * w.to.pethInDebt) / w.atFeed.debt) * 100 : null;
  const crThen = w.debtAtTouch > 0 ? ((w.collAtTouch * w.from.pethInDebt) / w.debtAtTouch) * 100 : null;
  const liqNow = w.atFeed.debt > 0 && w.atFeed.coll > 0 ? (w.atFeed.debt * mcr.fraction) / w.atFeed.coll : null;
  const liqThen = w.debtAtTouch > 0 && w.collAtTouch > 0 ? (w.debtAtTouch * mcr.fraction) / w.collAtTouch : null;
  const crProv = (what: string, coll: number, debt: number, price: number, at: string): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    summary: `${what} — the collateral times the feed's pETH price in ${stable}, over the debt, ${at}.`,
    formula: "coll × pETH price ÷ debt",
    contract: manager,
    inputs: [
      { label: "collateral", value: `${formatExact(coll)} pETH`, kind: "chain", pclass: "state" },
      { label: `pETH price in ${stable}`, value: `${formatExact(price)} ${stable}`, kind: "chain", pclass: "oracle" },
      { label: "debt", value: `${formatExact(debt)} ${stable}`, kind: "chain", pclass: "state" },
    ],
  });
  const liqProv = (what: string, coll: number, debt: number): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    summary: `${what} — the price of pETH, in ${stable}, at which the ratio meets the market's normal-mode minimum, ${mcr.label}: the debt times the minimum ratio, divided by the collateral.`,
    formula: "debt × minimum ratio ÷ collateral",
    contract: manager,
    inputs: [
      { label: "debt", value: `${formatExact(debt)} ${stable}`, kind: "chain", pclass: "state" },
      { label: "collateral", value: `${formatExact(coll)} pETH`, kind: "chain", pclass: "state" },
      { label: "minimum ratio", value: mcr.label, kind: "chain", pclass: "state" },
    ],
  });
  const sinceStated: Provenance = {
    kind: "derived",
    summary: "Change since the last touch — the value at the feed less the one the last touch wrote.",
    formula: "at the feed − as last written",
  };
  const fromTouch = `at the last touch's block ${w.from.block.toLocaleString("en-US")}`;
  const risk: SheetStat[] = [
    {
      key: "ratio",
      label: W.collateral_ratio,
      tip: W.tip_live_cr,
      value:
        crNow != null
          ? {
              text: crPct1(crNow),
              info: crProv("Collateral ratio at the feed", w.atFeed.coll, w.atFeed.debt, w.to.pethInDebt, atHead),
            }
          : { none: W.sheet_no_debt },
      tone: crNow != null && crNow < POLARIS_NORMAL_MCR_PCT ? "text-red-500" : undefined,
      change: crNow != null && crThen != null ? { text: changeText(crNow - crThen, pts), info: sinceStated } : null,
    },
    {
      key: "ratio-stated",
      label: W.live_cr_stated,
      tip: W.tip_live_cr_stated,
      value:
        crThen != null
          ? {
              text: crPct1(crThen),
              info: crProv(
                "Collateral ratio as last written",
                w.collAtTouch,
                w.debtAtTouch,
                w.from.pethInDebt,
                fromTouch,
              ),
            }
          : { none: W.sheet_no_debt },
    },
    {
      key: "liquidates-at",
      label: W.liquidates_at,
      tip: W.tip_live_liq,
      value:
        liqNow != null
          ? { text: unitText(liqNow), info: liqProv("Liquidation price at the feed", w.atFeed.coll, w.atFeed.debt) }
          : { none: W.sheet_no_debt },
      change:
        liqNow != null && liqThen != null ? { text: changeText(liqNow - liqThen, unitText), info: sinceStated } : null,
    },
    {
      key: "liquidates-at-stated",
      label: W.live_liq_stated,
      tip: W.tip_live_liq_stated,
      value:
        liqThen != null
          ? {
              text: unitText(liqThen),
              info: liqProv("Liquidation price as last written", w.collAtTouch, w.debtAtTouch),
            }
          : { none: W.sheet_no_debt },
    },
  ];

  // ── Limits ──
  const rate = w.atFeed.primaryRate;
  const r2d = w.atFeed.reserveToDebt;
  const limits: SheetStat[] = [
    {
      key: "primary-rate",
      label: W.primary_rate,
      tip: W.tip_live_rate,
      value:
        rate != null
          ? {
              text: `${(rate * 100).toFixed(2)}%`,
              info: view("The primary rate in force now.", "primaryRate()", rate, ""),
            }
          : { none: W.sheet_no_rate },
    },
    {
      key: "reserve-to-debt",
      label: W.reserve_to_debt,
      tip: W.tip_live_reserve,
      value:
        r2d != null
          ? {
              text: `${(r2d * 100).toFixed(1)}%`,
              info: view("The market's reserve divided by its debt.", "getReserveToDebtRatio()", r2d, ""),
            }
          : { none: W.sheet_not_read },
    },
  ];

  // ── The gas compensation escrow, below Risk and Limits (ui-jobs 388) ──
  const escrow = POLARIS_LIQ_CONSTANTS.gasComp.amount;
  const escrowNote = gasEscrowFootnote({
    move: "held",
    amount: escrow,
    text: formatPeth(escrow),
    symbol: PETH.symbol,
    info: gasCompHeldProv(coords),
    usd: usd("The gas compensation escrow", "coll", escrow),
    tip: W.tip_escrow_note,
  });

  return {
    note: w.sinceOpen ? W.live_note_open : W.live_note_touch,
    sides: [collSide, debtSide],
    panels: [
      { panel: "risk", rows: risk },
      { panel: "limits", rows: limits, breakdown: polarisParamStats(coords) },
    ],
    breakdownNotes: o.breakdown,
    footnotes: [escrowNote],
  };
}
