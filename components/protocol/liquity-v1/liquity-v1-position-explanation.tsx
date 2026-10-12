"use client";

// The Liquity V1 position card's explanation (zone Z1): a colon-terminated
// lead, then bullets under Holdings, Risk and History when two of them hold
// two or more bullets (rails-ops standards/prose-limits-and-zones.md 3.3;
// Liquity V1 has no rate). The words are content/liquity-v1/event-prose.yaml's
// `position_words`; this file chooses which to say and draws each figure as
// the card does (its receipt, or the card's amount format). The open Trove's
// figures are the chain read at head; an ended life's are its replayed record.
// The mechanisms behind them are the card's "?" (position_* in the same file).

import type { ReactNode } from "react";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";
import type { LiquityV1PositionView } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import { Prov } from "@/components/shared/provenance";
import { peakCollateralProv, peakDebtProv, surplusClaimableProv } from "@/lib/liquity-v1/event-provenance";
import { fmtUsd } from "@/lib/aave-v4/format";
import { formatDate, formatDuration } from "@/lib/date";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { AmountText } from "@/components/shared/amount-text";
import { LearnMore } from "@/components/shared/learn-more-modal";
import type { LiquityV1Surplus } from "@/lib/liquity-v1/use-event-read";
import type { LiquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";
import { fmtEth, fmtLusd, fmtPct, fmtUsdSigned } from "@/lib/liquity-v1/event-figures";
import type { LiquityV1RedemptionTotals } from "@/lib/liquity-v1/economics";
import { liquityV1Modal, positionWords, V1_WORDS } from "@/lib/liquity-v1/event-templates";
import { positionNodes } from "@/lib/liquity-v1/position-nodes";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";

const DUST = 1e-9;
/** An ETH figure below this rounds to nothing at four places. */
const EPS_ETH = 5e-5;

const GROUPS = ["holdings", "risk", "history"] as const;
type Group = (typeof GROUPS)[number];
type Bullet = { group: Group; node: ReactNode };

const arrange = (bullets: Bullet[]) => {
  const heading: Record<Group, string> = {
    holdings: positionWords("heading_holdings"),
    risk: positionWords("heading_risk"),
    history: positionWords("heading_history"),
  };
  return arrangeByHeading(bullets, GROUPS, (g) => heading[g]);
};

const pctOf = (ratio: number) => `${(ratio * 100).toFixed(0)}%`;

export function LiquityV1PositionExplanation({
  chain,
}: {
  /** The live chain read. Null until it lands: nothing is narrated, and the
   *  pane still mounts so its foot controls draw. */
  chain: LiquityV1PositionChainResponse | null;
}) {
  if (!chain || chain.chainStale || chain.troveStatus !== "active") return null;

  const hasDebt = chain.debt > 0;
  const collUsd = chain.coll * chain.price;
  const liqPrice = hasDebt && chain.coll > 0 ? (chain.debt * chain.mcr) / chain.coll : null;
  const dropPct = liqPrice != null && chain.price > 0 ? Math.round((1 - liqPrice / chain.price) * 100) : null;

  // The ETH and LUSD figures are on the card's stat row, so they carry the highlight.
  const coll = (
    <H>
      <AmountText value={chain.coll} />
    </H>
  );
  const lead = hasDebt
    ? positionNodes("lead_debt", {
        coll,
        debt: (
          <H>
            <AmountText value={chain.debt} />
          </H>
        ),
      })
    : positionNodes("lead_no_debt", { coll });

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  if (collUsd > 0) add("holdings", "worth", positionNodes("coll_worth", { coll_usd: fmtUsd(collUsd).display }));
  if (hasDebt) add("holdings", "parts", positionNodes("debt_parts"));
  if (chain.pendingEthReward > DUST || chain.pendingLusdReward > DUST)
    add(
      "holdings",
      "pending",
      positionNodes("pending", {
        pending_eth: <AmountText value={chain.pendingEthReward} />,
        pending_lusd: <AmountText value={chain.pendingLusdReward} />,
      }),
    );

  if (!hasDebt) add("risk", "no-debt", positionNodes("no_debt"));
  else {
    // One bullet for the ratio and its runway to liquidation, then the room to
    // borrow (the risk row's formula: coll × price ÷ active ratio − debt).
    const icr = chain.icr != null ? <H>{(chain.icr * 100).toFixed(1)}%</H> : null;
    if (icr && dropPct != null && dropPct > 0)
      add("risk", "ratio", positionNodes("ratio_drop", { icr, drop: <H>{dropPct}%</H> }));
    else if (icr) add("risk", "ratio", positionNodes("coll_ratio", { icr }));
    const activeRatio = chain.recoveryMode ? chain.ccr : chain.mcr;
    const headroom = Math.max(0, (chain.coll * chain.price) / activeRatio - chain.debt);
    if (chain.icr != null && headroom > 0)
      add(
        "risk",
        "capacity",
        positionNodes("capacity", {
          capacity: (
            <H>
              <AmountText value={headroom} format="compact" />
            </H>
          ),
          limit: pctOf(activeRatio),
        }),
      );
    if (chain.debtInFront != null) {
      const inFront = <AmountText value={chain.debtInFront} format="compact" />;
      add(
        "risk",
        "queue",
        chain.queueDebtTotal != null && chain.queueDebtTotal > 0
          ? positionNodes("queue", {
              debt_in_front: inFront,
              queue_share: <H>{pct(Math.min(1, chain.debtInFront / chain.queueDebtTotal))}</H>,
            })
          : positionNodes("queue_no_share", { debt_in_front: inFront }),
      );
    }
  }

  // Recovery Mode while it is on, with the system's ratio; the "?" beside it
  // opens the liquidation modal, which carries Recovery Mode as a concept.
  if (chain.tcr > 0 && chain.recoveryMode)
    add(
      "risk",
      "system",
      <>
        {positionNodes("recovery_on", { tcr: <H>{(chain.tcr * 100).toFixed(1)}%</H>, ccr: pctOf(chain.ccr) })}
        <span className="ml-1 inline-flex align-middle">
          <LearnMore inline content={liquityV1Modal("liquidation")} />
        </span>
      </>,
    );

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

// ── An indexed-open life the chain has moved past ─────────────────────────────
//
// The index can lag the chain: a life still open in the index whose live read
// finds the Trove closed. The live risk surfaces gate on an active Trove and
// stay off; the explanation says what the chain shows and that the history
// ends before it.

export function LiquityV1SupersededExplanation({ chain }: { chain: LiquityV1PositionChainResponse }) {
  if (chain.chainStale || chain.troveStatus === "active") return null;
  const status = chain.troveStatus;
  const lead =
    status === "closedByOwner"
      ? positionNodes("superseded_owner")
      : status === "closedByRedemption"
        ? positionNodes("superseded_redeemed")
        : status === "closedByLiquidation"
          ? positionNodes("superseded_liquidated")
          : positionNodes("superseded_none");
  return (
    <ProseExplainer
      paragraph={lead}
      items={[
        <span key="lag">{positionNodes("superseded_lag")}</span>,
        <span key="joins">{positionNodes("superseded_joins")}</span>,
      ]}
    />
  );
}

// ── Past lives ────────────────────────────────────────────────────────────────
//
// A closed or liquidated life states its recorded figures, past tense.
// Nothing reads the live chain: the live risk surfaces describe the current
// Trove. A V1 life ends by one of three mechanisms: the owner closed it (last
// event closeTrove), a redemption cleared the last of its debt (last event
// redemption), or a liquidation took it (status liquidated).

export function LiquityV1ClosedEpochExplanation({
  v,
  openedAt,
  lastAction,
  surplus,
  ownerOutcome,
  redemptions,
  priceNow,
  ethBack,
}: {
  v: LiquityV1PositionView;
  /** Unix seconds of the life's first captured event. Null while the timeline loads. */
  openedAt?: number | null;
  /** The life's final event type. Null while the timeline loads; the lead
   *  falls back to the owner's close. */
  lastAction?: string | null;
  /** ETH the ending left in the CollSurplusPool, with its claim status. */
  surplus?: LiquityV1Surplus | null;
  /** A liquidated life: what it left its owner. */
  ownerOutcome?: LiquityV1OwnerOutcome | null;
  /** The outcome's reads are still on their way. */
  outcomePending?: boolean;
  /** The life's redemptions. Null on a windowed page or with an unpriced row. */
  redemptions?: LiquityV1RedemptionTotals | null;
  /** The price feed's ETH price now. */
  priceNow?: number | null;
  /** ETH the ending sent back to the owner: all of it at an owner close, the
   *  surplus on a full redemption. */
  ethBack?: number | null;
  /** How the timeline's events divide. */
  eventTally?: { total: number; owner: number; claim: boolean } | null;
}) {
  if (v.status !== "closed" && v.status !== "liquidated") return null;
  const liquidated = v.status === "liquidated";
  const redeemed = !liquidated && lastAction === "redemption";
  const ended = v.lastActivityAt > 0 ? formatDate(v.lastActivityAt) : null;
  const lead = ended
    ? positionNodes(liquidated ? "closed_lead_liquidated" : redeemed ? "closed_lead_redeemed" : "closed_lead_owner", {
        ended,
      })
    : positionNodes(
        liquidated
          ? "closed_lead_liquidated_undated"
          : redeemed
            ? "closed_lead_redeemed_undated"
            : "closed_lead_owner_undated",
      );

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });
  const eth = (n: number) => <H>{fmtEth(n)}</H>;

  // ── Holdings: where the ETH and the LUSD went ──
  if (liquidated && ownerOutcome) {
    const o = ownerOutcome;
    const kept = o.lusdReceived - o.lusdRepaid;
    add(
      "holdings",
      "kept",
      kept > 0.005 && o.lusdRepaid > 0.005
        ? positionNodes("kept_net", { kept: <H>{fmtLusd(kept)}</H> })
        : kept > 0.005
          ? positionNodes("kept_all", { kept: <H>{fmtLusd(o.lusdReceived)}</H> })
          : positionNodes("kept_none", { kept: <H>{fmtLusd(o.lusdRepaid)}</H> }),
    );
    add(
      "holdings",
      "lost",
      positionNodes("lost", { eth_lost: eth(o.ethLost), usd_lost: fmtUsd(o.ethLost * o.liquidationPrice).display }),
    );
    if (o.ethWithdrawn > EPS_ETH && o.ethRedeemed > EPS_ETH)
      add(
        "holdings",
        "out",
        positionNodes("withdrew_redeemed", { eth_withdrawn: eth(o.ethWithdrawn), eth_redeemed: eth(o.ethRedeemed) }),
      );
    else if (o.ethWithdrawn > EPS_ETH)
      add("holdings", "out", positionNodes("withdrew", { eth_withdrawn: eth(o.ethWithdrawn) }));
    else if (o.ethRedeemed > EPS_ETH)
      add("holdings", "out", positionNodes("redemptions_took", { eth_taken: eth(o.ethRedeemed) }));
  } else if (!liquidated && redemptions) {
    add(
      "holdings",
      "taken",
      positionNodes(redemptions.count === 1 ? "redemption_took" : "redemptions_took", {
        eth_taken: eth(redemptions.ethTaken),
      }),
    );
  }
  if (!liquidated && !redeemed && ethBack != null && ethBack > DUST)
    add(
      "holdings",
      "back",
      positionNodes(redemptions ? "owner_took_back_rest" : "owner_took_back", { eth_back: eth(ethBack) }),
    );
  if (surplus && (liquidated || redeemed)) {
    const claimed = surplus.claimed;
    const fig = (
      <Prov info={surplusClaimableProv(surplus)}>
        <H>{fmtEth(claimed ? surplus.surplus : surplus.claimable > DUST ? surplus.claimable : surplus.surplus)}</H>
      </Prov>
    );
    add(
      "holdings",
      "surplus",
      claimed
        ? claimed.timestamp != null
          ? positionNodes("surplus_claimed_on", { surplus: fig, claimed: formatDate(claimed.timestamp) })
          : positionNodes("surplus_claimed", { surplus: fig })
        : surplus.claimable > DUST
          ? positionNodes("surplus_waiting", { surplus: fig })
          : positionNodes("surplus_left", { surplus: fig }),
    );
  }

  // ── Risk: the ratio the liquidation came at ──
  if (liquidated && ownerOutcome?.liquidationRatio != null) {
    const r = ownerOutcome.liquidationRatio;
    add(
      "risk",
      "ratio",
      positionNodes(r < 1.1 ? "liq_ratio_below" : "liq_ratio_recovery", { liq_ratio: <H>{fmtPct(r)}</H> }),
    );
  }

  // ── History: the redemptions' net, the peaks, the life's span and counts ──
  if (!liquidated && redemptions) {
    const netThen = redemptions.lusdRedeemed - redemptions.ethValueAtRedemption;
    const netNow = priceNow != null && priceNow > 0 ? redemptions.lusdRedeemed - redemptions.ethTaken * priceNow : null;
    const one = redemptions.count === 1;
    const then = fmtUsdSigned(Math.abs(netThen) < 0.005 ? 0 : netThen);
    add(
      "history",
      "net",
      netNow != null
        ? positionNodes(one ? "net_both_one" : "net_both", { net_then: then, net_now: fmtUsdSigned(netNow) })
        : positionNodes(one ? "net_then_one" : "net_then", { net_then: then }),
    );
  }
  if (v.peakCollateral > 0 || v.peakDebt > 0)
    add(
      "history",
      "peaks",
      positionNodes("peaks", {
        peak_coll: (
          <Prov info={peakCollateralProv()}>
            <H>{fmtEth(v.peakCollateral)}</H>
          </Prov>
        ),
        peak_debt: (
          <Prov info={peakDebtProv()}>
            <H>{fmtLusd(v.peakDebt)}</H>
          </Prov>
        ),
      }),
    );
  if (openedAt != null && openedAt > 0 && v.lastActivityAt > openedAt)
    add(
      "history",
      "active",
      positionNodes("active", {
        duration: <H>{formatDuration(openedAt, v.lastActivityAt)}</H>,
        opened: formatDate(openedAt),
      }),
    );
  if (v.txCount > 0 || v.redemptionCount > 0) {
    const txWord = v.txCount === 1 ? V1_WORDS.tx_one : V1_WORDS.tx_many;
    const redemptionWord = v.redemptionCount === 1 ? V1_WORDS.redemption_one : V1_WORDS.redemption_many;
    add(
      "history",
      "counts",
      v.txCount > 0 && v.redemptionCount > 0
        ? positionNodes("counts_both", {
            tx_count: <H>{v.txCount}</H>,
            tx_word: txWord,
            redemption_count: <H>{v.redemptionCount}</H>,
            redemption_word: redemptionWord,
          })
        : v.txCount > 0
          ? positionNodes("counts_owner", { tx_count: <H>{v.txCount}</H>, tx_word: txWord })
          : positionNodes("counts_redeemed", {
              redemption_count: <H>{v.redemptionCount}</H>,
              redemption_word: redemptionWord,
            }),
    );
  }

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
