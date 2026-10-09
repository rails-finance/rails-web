"use client";

// The SparkLend position card's explanation (zone Z1): a colon-terminated lead,
// then bullets under Holdings, Risk, Rate and History when two of them hold two
// or more bullets (rails-ops standards/prose-limits-and-zones.md 3.3). The words
// are content/spark/event-prose.yaml's `position_words`; this file chooses which
// to say and draws each figure as the card does (its receipt, or the card's
// amount format). The open account's figures are the chain read at head; a closed
// account's are its recorded history. The mechanisms behind them are the card's
// "?" (position_* in the same file).

import type { ReactNode } from "react";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";
import type { SparkPositionView } from "@/components/protocol/spark/spark-position-card";
import { sparkLiquidationRead, type SparkCardCaptions } from "@/lib/spark/economics";
import { fmtUsd, hfLabelV4, fmtLiqPrice } from "@/lib/aave-v4/format";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { AmountText } from "@/components/shared/amount-text";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isSparkEvent } from "@/lib/shared/types/event-shape";
import type { SparkReserveAmount } from "@/lib/sources/api/spark-positions";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { newestActivityFolder } from "@/lib/shared/timeline-folder-reductions";
import { formatDate } from "@/lib/date";
import { isGatewayWithdrawal } from "@/lib/spark/liquidation-fee";
import { SPARK_WORDS, positionWords } from "@/lib/spark/event-templates";
import { positionNodes } from "@/lib/spark/position-nodes";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";

/** The page's rows counted by act; a withdrawal as ETH through the gateway
 *  counts as a withdrawal. */
export interface SparkActivityCounts {
  supply: number;
  withdraw: number;
  borrow: number;
  repay: number;
}

const GROUPS = ["holdings", "risk", "rate", "history"] as const;
type Group = (typeof GROUPS)[number];
type Bullet = { group: Group; node: ReactNode };

const arrange = (bullets: Bullet[]) => {
  const heading: Record<Group, string> = {
    holdings: positionWords("heading_holdings"),
    risk: positionWords("heading_risk"),
    rate: positionWords("heading_rate"),
    history: positionWords("heading_history"),
  };
  return arrangeByHeading(bullets, GROUPS, (g) => heading[g]);
};

/** A record this long is mostly one kind of act, and the pane says which. */
const LONG_RECORD = 50;
/** Asset names stand in a bullet up to this many; more are counted. */
const NAMED_MAX = 4;

/** Oxford-join asset symbols ("wstETH, WBTC and USDC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length <= 1) return syms.join("");
  return `${syms.slice(0, -1).join(", ")} ${SPARK_WORDS.and} ${syms[syms.length - 1]}`;
}

export function SparkPositionExplanation({
  chain,
  captions,
  view,
  externalActivity,
  activity,
}: {
  /** The live Pool read. Null until it lands (or when it came back stale):
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: SparkPositionChainResponse | null;
  /** The card's stat captions (the borrow rate) — the same computed values the
   *  stat footnotes show. Omit to skip those bullets. */
  captions?: SparkCardCaptions | null;
  /** The card view — supplies the transaction count (the card's count badge)
   *  and the single-asset liquidation-price anchor. Omit to skip. */
  view?: SparkPositionView | null;
  /** Who executed this position's events, reduced over its whole loaded
   *  history. The page derives it from the events already on the page; omit to
   *  skip the operator bullet. */
  externalActivity?: ExternalActorSummary;
  /** Row counts by act over the whole history, where the page holds it all:
   *  a long record gets one bullet on what the wallet mostly did. */
  activity?: SparkActivityCounts | null;
}) {
  if (!chain) {
    // The pane says what state the read is in, so it never opens empty.
    if (view?.hfRead === "reading") return <p className="text-sm text-rb-500">{positionWords("reading")}</p>;
    if (view?.hfRead === "unread") return <p className="text-sm text-rb-500">{positionWords("unread")}</p>;
    return null;
  }
  const hasDebt = chain.totalDebtUsd > 0;
  const supplySyms = chain.reserves.filter((r) => r.supplyBalanceRaw !== "0").map((r) => r.symbol);
  const collateralSyms = chain.reserves
    .filter((r) => r.isCollateral && r.supplyBalanceRaw !== "0")
    .map((r) => r.symbol);
  const debtSyms = chain.reserves.filter((r) => r.debtBalanceRaw !== "0").map((r) => r.symbol);

  const hf = chain.healthFactor;
  const emode = chain.emode;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const liqRead = view ? sparkLiquidationRead(view) : null;

  // Empty position — nothing supplied and nothing borrowed. Nothing to narrate.
  if (supplySyms.length === 0 && !hasDebt) return null;

  // Status lead — the one-sentence verdict, subject-first, colon-terminated:
  // the lead-in to the bullets. The health factor is a figure the card shows.
  const lead = !hasDebt
    ? positionNodes("lead_no_debt")
    : hf != null
      ? positionNodes("lead_debt", { hf: <H>{hf >= 100 ? "∞" : hfLabelV4(hf)}</H> })
      : positionNodes("lead_debt_unread");

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  if (collateralSyms.length > 0 && chain.totalCollateralUsd > 0) {
    const coll_usd = <H>{fmtUsd(chain.totalCollateralUsd).display}</H>;
    add(
      "holdings",
      "coll",
      collateralSyms.length <= NAMED_MAX
        ? positionNodes("coll", { coll_usd, coll_syms: joinSymbols(collateralSyms) })
        : positionNodes("coll_many", { coll_usd, coll_count: collateralSyms.length }),
    );
  }

  if (hasDebt) {
    const debt_usd = <H>{fmtUsd(chain.totalDebtUsd).display}</H>;
    add(
      "holdings",
      "debt",
      debtSyms.length <= NAMED_MAX
        ? positionNodes("debt", { debt_usd, debt_syms: joinSymbols(debtSyms) })
        : positionNodes("debt_many", { debt_usd, debt_count: debtSyms.length }),
    );

    // The borrow limit (max LTV) against where the account stands; the
    // liquidation point is the fall below.
    if (chain.totalCollateralUsd > 0 && chain.ltv > 0 && chain.avgLiquidationThreshold > 0) {
      const ltv = <H>{pct(chain.totalDebtUsd / chain.totalCollateralUsd)}</H>;
      const max_ltv = <H>{pct(chain.ltv)}</H>;
      add(
        "risk",
        "ltv",
        emode && emode.id > 0
          ? positionNodes("ltv_emode", { ltv, max_ltv, emode: emode.label ?? String(emode.id) })
          : positionNodes("ltv", { ltv, max_ltv }),
      );
    }
    if (liqRead?.single) {
      add(
        "risk",
        "drop",
        positionNodes("drop_single", {
          drop: <H>{dropPct}%</H>,
          symbol: liqRead.single.symbol,
          liq_price: <H>{fmtLiqPrice(liqRead.single.liqPrice)}</H>,
        }),
      );
    } else if (dropPct != null) {
      add("risk", "drop", positionNodes("drop", { drop: <H>{dropPct}%</H> }));
    }
    if (chain.availableBorrowsUsd > 0) {
      add("risk", "capacity", positionNodes("capacity", { room: <H>{fmtUsd(chain.availableBorrowsUsd).display}</H> }));
    }
    if (captions?.borrowRate) {
      const rate = <H>{captions.borrowRate.pct.toFixed(2)}%</H>;
      add("rate", "rate", positionNodes(captions.borrowRate.avg ? "rate_avg" : "rate", { rate }));
    }
  }

  if (view != null && view.txCount >= LONG_RECORD && activity) {
    const cycling =
      activity.borrow + activity.repay >=
      0.5 * (activity.borrow + activity.repay + activity.supply + activity.withdraw);
    add(
      "history",
      "tx-count",
      positionNodes(cycling ? "history_cycling" : "history_flows", { tx_count: <H>{view.txCount}</H> }),
    );
  }

  // Who has been operating the position, across its whole loaded history: the
  // same externalActor() verdict each event card renders on its spine, reduced
  // once so this pane can state the pattern. The event sentence explains a
  // single row; only this tells a reader the position is run by an account
  // other than its owner. The lead carries its denominator
  // (operatorLead), because the transaction count and the event count differ.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    add(
      "history",
      "operators",
      positionNodes("operators", {
        lead: operatorLead(ext, null, SPARK_WORDS.operator_where),
        external: ext.external.toLocaleString("en-US"),
        were: ext.external === 1 ? SPARK_WORDS.was : SPARK_WORDS.were,
      }),
    );
  }

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

// ── Terminal accounts ────────────────────────────────────────────────────────
// The closed/liquidated card's Explanation — needs no live Pool read (the
// account holds nothing at head), so it renders from the view + the timeline
// already on the page. The lead states how the record ENDED: on SparkLend
// the liquidated STATUS only says seizures exist somewhere in the record (measured 2026-08-10: 0 of 216 liquidated accounts
// end with the seizure — every one exited by the owner's transactions afterwards).

/** What the owner did after the last liquidation: how many repays and
 *  withdrawals (a withdrawal as ETH through the gateway counts as one). Null
 *  where nothing of the owner's followed. */
function windDown(spark: BaseActivityEvent[]): { repays: number; withdrawals: number } | null {
  const rows = spark.filter(isSparkEvent);
  const lastLiq = [...rows].reverse().find((e) => e.context.data.eventType === "liquidation");
  if (!lastLiq) return null;
  const later = rows.filter((e) => e.timestamp > lastLiq.timestamp);
  const repays = later.filter((e) => e.context.data.eventType === "repay").length;
  const withdrawals = later.filter(
    (e) => e.context.data.eventType === "withdraw" || isGatewayWithdrawal(e.context.data),
  ).length;
  return repays + withdrawals === 0 ? null : { repays, withdrawals };
}

/** Up to three peak reserve figures, bolded, then a count for the rest — the
 *  asset-cluster cap grammar; every line stays on the card face with its own
 *  receipt. */
function peakPhrase(reserves: SparkReserveAmount[]): ReactNode {
  const named = reserves.slice(0, 3);
  const more = reserves.length - named.length;
  return (
    <>
      {named.map((r, i) => (
        <span key={r.address}>
          {i > 0 && (i === named.length - 1 && more === 0 ? ` ${SPARK_WORDS.and} ` : ", ")}
          <H>
            <AmountText value={r.amount} /> {r.symbol}
          </H>
        </span>
      ))}
      {more > 0 ? (
        <>
          {" "}
          {SPARK_WORDS.and} {more} {more === 1 ? SPARK_WORDS.more_one : SPARK_WORDS.more_many}
        </>
      ) : null}
    </>
  );
}

export function SparkClosedPositionExplanation({
  v,
  events,
  folders,
}: {
  v: SparkPositionView;
  /** The account's timeline (SparkLend Pool events, ascending) — the pane reads
   *  how the record ended from the rows already fetched. */
  events: BaseActivityEvent[];
  /** Every folder the index served, whole and unfiltered — the account's
   *  newest activity can sit inside one, so the closure attribution below
   *  reads it before falling back to the last loaded row. */
  folders?: readonly ServedFolder[] | null;
}) {
  if (v.status === "open") return null;

  const spark = events.filter(isSparkEvent);
  const isTransferType = (t: string) => t === "transfer_in" || t === "transfer_out";
  // Transfer rows are position moves, not the account's own Pool activity —
  // the transfer-only lead keys on the POOL record being empty, not the
  // timeline (which since mig 159 shows the transfers themselves).
  const poolEvents = spark.filter((e) => !isTransferType(e.context.data.eventType));
  // The newest activity overall — a served folder's last member when it is
  // newer than every loaded row, the loaded row otherwise.
  const newestFolder = newestActivityFolder(spark, folders);
  const lastType = newestFolder ? null : spark.length > 0 ? spark[spark.length - 1].context.data.eventType : null;
  // How the record actually ended — the truthful closure attribution, a
  // separate fact from the status word. A folder groups one run-spec kind at
  // a time (`liquidation` or `transfer`, never both), so its `kind` alone
  // answers which one ended it, EXCEPT a `transfer` folder can hold both
  // directions — only a folder whose legs are all "Sent" states the ending as
  // a transfer out.
  const endedBySeizure = newestFolder ? newestFolder.kind === "liquidation" : lastType === "liquidation";
  // A transfer to the Spark WETH gateway is a withdrawal to ETH, so a record
  // ending on one ended by the owner's withdrawal.
  const lastRow = spark.length > 0 ? spark[spark.length - 1].context.data : null;
  const endedByTransferOut = newestFolder
    ? newestFolder.kind === "transfer" &&
      newestFolder.legs.length > 0 &&
      newestFolder.legs.every((l) => l.verb === SPARK_WORDS.verb_sent)
    : lastType === "transfer_out" && !(lastRow && isGatewayWithdrawal(lastRow));
  const everLiquidated = v.liquidationCount > 0;

  const hasPeakSupply = v.peakSupplies.length > 0;
  const hasPeakBorrow = v.peakBorrows.length > 0;

  const lead =
    poolEvents.length === 0
      ? positionNodes("closed_lead_transfers")
      : endedByTransferOut
        ? positionNodes("closed_lead_transfer_out")
        : endedBySeizure
          ? positionNodes("closed_lead_seized")
          : everLiquidated
            ? positionNodes("closed_lead_liquidated")
            : hasPeakBorrow
              ? positionNodes("closed_lead_borrowed")
              : positionNodes("closed_lead_supplied");

  const bullets: Bullet[] = [];
  const add = (key: string, node: ReactNode) => bullets.push({ group: "history", node: <span key={key}>{node}</span> });

  if (hasPeakSupply && hasPeakBorrow)
    add(
      "peaks",
      positionNodes("peaks_both", {
        peak_supply: peakPhrase(v.peakSupplies),
        peak_debt: peakPhrase(v.peakBorrows),
      }),
    );
  else if (hasPeakSupply) add("peaks", positionNodes("peaks_supply", { peak_supply: peakPhrase(v.peakSupplies) }));
  else if (hasPeakBorrow) add("peaks", positionNodes("peaks_debt", { peak_debt: peakPhrase(v.peakBorrows) }));

  if (everLiquidated) {
    add(
      "seizures",
      positionNodes("liquidated_times", {
        liq_count: <H>{v.liquidationCount}</H>,
        time_word: v.liquidationCount === 1 ? SPARK_WORDS.time_one : SPARK_WORDS.time_many,
      }),
    );
    const after = windDown(spark);
    if (after) {
      const repays = <H>{after.repays}</H>;
      const withdrawals = <H>{after.withdrawals}</H>;
      const repay_word = after.repays === 1 ? SPARK_WORDS.repay_one : SPARK_WORDS.repay_many;
      const withdrawal_word = after.withdrawals === 1 ? SPARK_WORDS.withdrawal_one : SPARK_WORDS.withdrawal_many;
      add(
        "after",
        after.repays > 0 && after.withdrawals > 0
          ? positionNodes("wind_both", { repays, repay_word, withdrawals, withdrawal_word })
          : after.repays > 0
            ? positionNodes("wind_repays", { repays, repay_word })
            : positionNodes("wind_withdrawals", { withdrawals, withdrawal_word }),
      );
    }
  }

  const closed_on = <H>{formatDate(v.lastActivityAt)}</H>;
  add(
    "closure",
    v.txCount > 0
      ? positionNodes("closure_tx", {
          closed_on,
          tx_count: <H>{v.txCount}</H>,
          tx_word: v.txCount === 1 ? SPARK_WORDS.tx_one : SPARK_WORDS.tx_many,
        })
      : spark.length > 0
        ? positionNodes("closure_liq_only", { closed_on })
        : positionNodes("closure", { closed_on }),
  );

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
