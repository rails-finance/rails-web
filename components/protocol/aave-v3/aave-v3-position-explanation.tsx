"use client";

// The Aave V3 position card's explanation (zone Z1), on Aave V3 Ethereum,
// Aave V3 Base and Seamless: a colon-terminated lead, then bullets under
// Holdings, Risk, Rate and History when two of them hold two or more bullets
// (rails-ops standards/prose-limits-and-zones.md 3.3). The words are
// content/aave-v3/event-prose.yaml's `position_words`; this file chooses which
// to say and draws each figure as the card does. The open account's figures
// are the Pool's read at the current block; an ended account's are its
// recorded history. The mechanisms behind them (the threshold averaging, the
// idle ceiling, one asset on both sides, the market, credit delegation,
// reopening) are the card's "?" (position_* in the same file).

import type { ReactNode } from "react";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import type { AaveV3PositionView, AaveV3ReserveAmount } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { aaveV3LiquidationRead, isWethGateway, type AaveV3CardCaptions } from "@/lib/aave-v3/chain-truth-tower";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { fmtUsd, fmtLiqPrice } from "@/lib/aave-v4/format";
import { formatUsd } from "@/lib/shared/format-event";
import { formatDate } from "@/lib/date";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";
import { AmountText } from "@/components/shared/amount-text";
import { aaveV3SameAsset } from "@/lib/aave-v3/same-asset";
import type { AaveV3LastBorrowRate } from "@/lib/aave-v3/last-borrow-rate";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { newestActivityFolder } from "@/lib/shared/timeline-folder-reductions";
import { PROSE, positionWords, V3_WORDS } from "@/lib/aave-v3/event-templates";
import { positionNodes } from "@/lib/aave-v3/position-nodes";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";

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

/** Asset symbols joined ("wstETH, WBTC and USDC"); past four, a count. */
function joinSymbols(syms: string[]): string {
  if (syms.length > 4) return PROSE.fillText(V3_WORDS.assets, { n: syms.length });
  if (syms.length <= 1) return syms[0] ?? "";
  return `${syms.slice(0, -1).join(", ")} ${V3_WORDS.and} ${syms[syms.length - 1]}`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function AaveV3PositionExplanation({
  chain,
  captions,
  view,
  externalActivity,
  lastBorrowRate,
}: {
  /** The Pool's read at the current block. Null until it lands (or when it
   *  came back stale): the pane says what the card shows. */
  chain: AaveV3PositionChainResponse | null;
  /** The card's stat captions: the borrow rate the stat footnote shows. */
  captions?: AaveV3CardCaptions | null;
  /** The card view: the single-asset liquidation price and the reserve lists. */
  view?: AaveV3PositionView | null;
  /** Who sent the position's events, over its whole history. */
  externalActivity?: ExternalActorSummary;
  /** The rate the Pool logged at the newest borrow of the reserve owed now
   *  (lib/aave-v3/last-borrow-rate). */
  lastBorrowRate?: AaveV3LastBorrowRate | null;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  // No read (in flight, failed or stale): the pane says what the card shows,
  // so a borrowing position never opens on an empty pane.
  if (!chain) {
    if (!view || view.borrows.length === 0) return null;
    const debtAssets = joinSymbols(view.borrows.map((r) => r.symbol));
    const lead =
      view.supplies.length > 0
        ? positionNodes("lead_unread", {
            debt_assets: debtAssets,
            coll_assets: joinSymbols(view.supplies.map((r) => r.symbol)),
          })
        : positionNodes("lead_debt");
    return <ProseExplainer paragraph={lead} items={[<span key="unread">{positionNodes("unread")}</span>]} />;
  }

  const hasDebt = chain.totalDebtUsd > 0;
  const held = chain.reserves.filter((r) => r.supplyBalanceRaw !== "0");
  if (held.length === 0 && !hasDebt) return null;
  const hf = chain.healthFactor;

  const lead = !hasDebt
    ? positionNodes("lead_no_debt")
    : hf != null
      ? positionNodes("lead_hf", { hf: <H>{hf >= 100 ? "∞" : hfLabelV3(hf)}</H> })
      : positionNodes("lead_debt");

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  // ── Holdings ──
  const collUsd = <H>{formatUsd(chain.totalCollateralUsd)}</H>;
  if (hasDebt)
    add(
      "holdings",
      "worth",
      positionNodes("worth", { coll_usd: collUsd, debt_usd: <H>{formatUsd(chain.totalDebtUsd)}</H> }),
    );
  else if (held.length > 0) add("holdings", "worth", positionNodes("worth_no_debt", { coll_usd: collUsd }));
  // A supply the Pool weights at a zero threshold (the e-mode category's,
  // where the wallet sits in one that counts the reserve); an unread
  // threshold is not called zero.
  const emode = chain.emode ?? null;
  const inert = held.filter((r) => (emode && r.emodeCollateral ? emode.lt : r.lt) === 0);
  if (inert.length > 0)
    add(
      "holdings",
      "inert",
      positionNodes(inert.length === 1 ? "inert" : "inert_many", {
        inert_assets: <H>{joinSymbols(inert.map((r) => r.symbol))}</H>,
      }),
    );

  // ── Risk ──
  if (hasDebt) {
    if (chain.totalCollateralUsd > 0 && chain.ltv > 0)
      add(
        "risk",
        "ltv",
        positionNodes("ltv_cap", {
          ltv: <H>{pct(chain.totalDebtUsd / chain.totalCollateralUsd)}</H>,
          max_ltv: <H>{pct(chain.ltv)}</H>,
        }),
      );
    // One asset on both sides has no price to fall: its sentence is the "?"'s.
    const same = aaveV3SameAsset(chain);
    const liqRead = view ? aaveV3LiquidationRead(view) : null;
    const drop = hf != null && hf > 1 ? <H>{Math.round((1 - 1 / hf) * 100)}%</H> : null;
    if (!same && drop && liqRead?.single)
      add(
        "risk",
        "liq",
        positionNodes("liq_single", {
          liq_symbol: liqRead.single.symbol,
          liq_price: <H>{fmtLiqPrice(liqRead.single.liqPrice)}</H>,
          drop,
        }),
      );
    else if (!same && drop) add("risk", "liq", positionNodes("liq_basket", { drop }));
    // Under a cent the room prints as "< $0.01" and says nothing.
    if (chain.availableBorrowsUsd >= 0.01)
      add(
        "risk",
        "capacity",
        positionNodes("capacity", { capacity: <H>{fmtUsd(chain.availableBorrowsUsd).display}</H> }),
      );
  }
  if (emode) {
    const covered = held.filter((r) => r.emodeCollateral).map((r) => r.symbol);
    if (covered.length > 0)
      add(
        "risk",
        "emode",
        positionNodes("emode", {
          emode: <H>{emode.label}</H>,
          emode_assets: joinSymbols(covered),
          emode_lt: <H>{pct(emode.lt)}</H>,
        }),
      );
  }

  // ── Rate ──
  const rate = hasDebt ? captions?.borrowRate : null;
  if (rate) {
    const moved = rateMove(chain, rate, lastBorrowRate);
    if (moved)
      add(
        "rate",
        "rate",
        positionNodes("rate_move", {
          rate_symbol: moved.symbol,
          rate_now: <H>{rate.pct.toFixed(2)}%</H>,
          rate_then: ratePct(moved.then),
        }),
      );
    else add("rate", "rate", positionNodes(rate.avg ? "rate_avg" : "rate", { rate: <H>{rate.pct.toFixed(2)}%</H> }));
  }

  // ── History: who sent the events, with the bullet's event count ──
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const external = ext.external.toLocaleString("en-US");
    const total = ext.total.toLocaleString("en-US");
    const one = ext.actors.length === 1 ? ext.actors[0] : null;
    add(
      "history",
      "operators",
      one
        ? positionNodes("operators_one", { external, total, actor: leadName ?? short(one.address) })
        : positionNodes("operators", { external, total }),
    );
  }

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

/** A rate under 0.1% at two significant figures, so it does not read 0.00%. */
const ratePct = (p: number): string =>
  p > 0 && p < 0.1
    ? `${p.toLocaleString("en-US", { maximumSignificantDigits: 2 })}%`
    : `${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** The rate the Pool logged at the newest borrow of the reserve owed now,
 *  where it is far from today's (more than half a point, and double or half). */
function rateMove(
  chain: AaveV3PositionChainResponse,
  now: NonNullable<AaveV3CardCaptions["borrowRate"]>,
  then: AaveV3LastBorrowRate | null | undefined,
): { symbol: string; then: number } | null {
  if (!then || now.avg) return null;
  const r = chain.reserves.find((x) => x.address.toLowerCase() === then.address && x.debtBalanceRaw !== "0");
  if (!r) return null;
  const far = Math.abs(now.pct - then.pct) >= 0.5 && (now.pct > then.pct * 2 || now.pct < then.pct / 2);
  return far ? { symbol: r.symbol, then: then.pct } : null;
}

// ── A closed or liquidated account, from its recorded history and the
// timeline already on the page ──────────────────────────────────────────────

/** Up to three peak reserve figures, bolded, then a count for the rest. */
function peakPhrase(reserves: AaveV3ReserveAmount[]): ReactNode {
  const named = reserves.slice(0, 3);
  const more = reserves.length - named.length;
  return (
    <>
      {named.map((r, i) => (
        <span key={r.address}>
          {i > 0 && (i === named.length - 1 && more === 0 ? ` ${V3_WORDS.and} ` : ", ")}
          <H>
            <AmountText value={r.amount} /> {r.symbol}
          </H>
        </span>
      ))}
      {more > 0 ? (
        <>
          {" "}
          {V3_WORDS.and} {more === 1 ? V3_WORDS.more_reserve : PROSE.fillText(V3_WORDS.more_reserves, { n: more })}
        </>
      ) : null}
    </>
  );
}

export function AaveV3ClosedPositionExplanation({
  v,
  events,
  folders,
}: {
  v: AaveV3PositionView;
  /** The account's timeline (Pool events, ascending): how the record ended. */
  events: BaseActivityEvent[];
  /** Every folder the index served: the newest activity can sit inside one. */
  folders?: readonly ServedFolder[] | null;
}) {
  if (v.status === "open") return null;

  const aave = events.filter(isAaveV3Event);
  const isTransferType = (t: string) => t === "transfer_in" || t === "transfer_out";
  // Transfer rows are position moves; the rest is the owner's Pool activity.
  const poolEvents = aave.filter((e) => !isTransferType(e.context.data.eventType));
  const newestFolder = newestActivityFolder(aave, folders);
  const lastRow = newestFolder ? null : aave.length > 0 ? aave[aave.length - 1].context.data : null;
  // A transfer to a WETH gateway is a withdrawal as ETH.
  const lastType =
    lastRow?.eventType === "transfer_out" && isWethGateway(lastRow.counterparty)
      ? "withdraw"
      : (lastRow?.eventType ?? null);
  // How the record ended: a folder groups one kind at a time, and only a
  // transfer folder whose legs are all sent ends the record as a transfer out.
  const endedBySeizure = newestFolder ? newestFolder.kind === "liquidation" : lastType === "liquidation";
  const endedByTransferOut = newestFolder
    ? newestFolder.kind === "transfer" &&
      newestFolder.legs.length > 0 &&
      newestFolder.legs.every((l) => l.verb.toLowerCase() === "sent")
    : lastType === "transfer_out";
  const everLiquidated = v.liquidationCount > 0;
  const hasPeakSupply = v.peakSupplies.length > 0;
  const hasPeakBorrow = v.peakBorrows.length > 0;
  const closed = <H>{formatDate(v.lastActivityAt)}</H>;

  const lead =
    poolEvents.length === 0
      ? positionNodes("closed_lead_transfers")
      : endedByTransferOut
        ? positionNodes("closed_lead_transfer_out", { closed })
        : endedBySeizure
          ? positionNodes("closed_lead_seized", { closed })
          : everLiquidated
            ? positionNodes("closed_lead_after_liq", { closed })
            : hasPeakBorrow
              ? positionNodes("closed_lead_repaid", { closed })
              : positionNodes("closed_lead_supply", { closed });

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  if (hasPeakSupply && hasPeakBorrow)
    add(
      "holdings",
      "peaks",
      positionNodes("peaks_both", { peak_supply: peakPhrase(v.peakSupplies), peak_borrow: peakPhrase(v.peakBorrows) }),
    );
  else if (hasPeakSupply)
    add("holdings", "peaks", positionNodes("peaks_supply", { peak_supply: peakPhrase(v.peakSupplies) }));
  else if (hasPeakBorrow)
    add("holdings", "peaks", positionNodes("peaks_borrow", { peak_borrow: peakPhrase(v.peakBorrows) }));

  if (everLiquidated)
    add(
      "history",
      "seizures",
      v.liquidationCount === 1
        ? positionNodes("seizure_one")
        : positionNodes("seizures", { liq_count: <H>{v.liquidationCount}</H> }),
    );
  if (v.txCount > 1) add("history", "tx", positionNodes("tx", { tx_count: <H>{v.txCount}</H> }));
  else if (v.txCount === 1) add("history", "tx", positionNodes("tx_one"));
  else if (aave.length > 0) add("history", "tx", positionNodes("tx_none"));

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
