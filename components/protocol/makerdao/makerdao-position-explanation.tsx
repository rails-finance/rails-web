"use client";

// The MakerDAO vault card's explanation (zone Z1): a lead, then bullets under
// Holdings, Risk, Rate and History when two of them hold two or more bullets
// (rails-ops standards/prose-limits-and-zones.md 3.3). The words are
// content/makerdao/event-prose.yaml's `position_words`; this file chooses
// which to say and draws each figure as the card does, a figure the card also
// shows with the card's receipt. The open vault's figures are the live chain
// overlay; a closed or liquidated vault's are its replayed record and the
// auctions the page read. The mechanisms behind them are the card's "?"
// (position_* in the same file).

import type { ReactNode } from "react";
import { usdPrice } from "@/lib/makerdao/price-format";
import type { MakerVaultView } from "./makerdao-vault-card";
import { formatUsd } from "@/lib/shared/format-event";
import { ilkDebtSymbol, MAKER_STATUS_DUST } from "@/lib/makerdao/asset-catalog";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";
import { AmountText } from "@/components/shared/amount-text";
import { Prov } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import {
  collateralRatioProv,
  collateralUsdProv,
  daiDebtProv,
  stabilityFeeAprProv,
  vaultInkProv,
} from "@/lib/makerdao/event-provenance";
import { LinkedAddress } from "@/components/shared/linked-address";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import { formatDate } from "@/lib/date";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { newestActivityFolder } from "@/lib/shared/timeline-folder-reductions";
import { useMakerVaultHistory, type MakerVaultHistory } from "@/lib/makerdao/vault-history";
import { makerTxHashOf } from "@/lib/makerdao/market-notes";
import type { MakerAuctionOutcome } from "@/lib/makerdao/chain-history-types";
import { positionWords } from "@/lib/makerdao/event-templates";
import { positionNodes } from "@/lib/makerdao/position-nodes";
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

const dai2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const matPct = (m: number): string => `${Number((m * 100).toFixed(2))}%`;

/** A fall as a whole percent; one that rounds to 100 while the price would
 *  still be above zero reads "over 99%". */
function dropText(drop: number): string {
  const whole = Math.max(0, Math.round(drop * 100));
  return whole >= 100 && drop < 1 ? "over 99%" : `${whole}%`;
}

/** The owner bullet: one owner since the vault opened, or the current owner
 *  and since when, with the count of transfers. */
function ownerBullets(history: MakerVaultHistory, owner: string | null | undefined, add: (b: Bullet) => void) {
  const owners = history.owners;
  if (owners.length < 2) {
    if (!owner || history.ownership.size > 0) return;
    add({ group: "history", node: positionNodes("owner_one", { owner: <LinkedAddress address={owner} /> }) });
    return;
  }
  // The current owner's stretch reaches back over any transaction-long
  // interlude that handed the vault back.
  const key = (i: number) => owners[i].ref.holder ?? owners[i].ref.owner;
  const last = owners.length - 1;
  let start = last;
  while (start >= 2 && owners[start - 1].withinTx && key(start - 2) === key(last)) start -= 2;
  const current = owners[last].ref.owner ?? owners[last].ref.holder;
  if (current)
    add({
      group: "history",
      node: positionNodes("owner_since", {
        owner: <LinkedAddress address={current} />,
        since: <H>{formatDate(owners[start].since)}</H>,
      }),
    });
  if (history.ownership.size === 1) add({ group: "history", node: positionNodes("transfers_one") });
  else if (history.ownership.size > 1)
    add({
      group: "history",
      node: positionNodes("transfers", { transfers: <H>{history.ownership.size.toLocaleString("en-US")}</H> }),
    });
}

export function MakerdaoPositionExplanation({
  v,
  externalActivity,
}: {
  v: MakerVaultView;
  /** Who executed the vault's events, reduced over its whole history with the
   *  same two-fact verdict the event cards render. The page derives it from the
   *  events already on the page; omit to skip the operator bullets. */
  externalActivity?: ExternalActorSummary;
}) {
  // Hooks first — the pane declines below.
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const history = useMakerVaultHistory();
  // The minimum at the vault's newest row, and today's where governance moved it.
  const newestRead = [...history.ilkAt.values()].reduce<{ block: number; mat: number | null } | null>(
    (m, r) => (m == null || r.block > m.block ? { block: r.block, mat: r.mat } : m),
    null,
  );
  const matMoved =
    newestRead?.mat != null && v.matRatio != null && Math.abs(newestRead.mat - v.matRatio) > 1e-9 && v.atBlock != null;
  // Narrates the live vault only: the summary cannot supply the ilk's terms.
  if (v.source !== "chain" || v.status !== "open") return null;

  const hasDebt = v.debtDai != null && v.debtDai > 0;
  // DAI on CdpManager vaults, USDS on LockStake urns (asset-catalog).
  const dsym = ilkDebtSymbol(v.ilk);
  const sym = v.collateralSymbol;
  // The fee in the debt: the debt less the DAI drawn since the vault last owed
  // nothing (lib/makerdao/vault-history.tsx), the figure the card states.
  const feeInDebt =
    hasDebt && v.drawnDai != null && (v.debtDai as number) - v.drawnDai > 0.005
      ? (v.debtDai as number) - v.drawnDai
      : null;
  const ratio = hasDebt && v.collateralUsd != null ? v.collateralUsd / (v.debtDai as number) : null;
  const drop =
    v.liquidationPriceUsd != null && v.priceUsd != null && v.priceUsd > 0
      ? 1 - v.liquidationPriceUsd / v.priceUsd
      : null;

  // Each figure the card also shows carries the card's receipt.
  const coll = (
    <Prov info={vaultInkProv(sym, v.atBlock, false, v.source)}>
      <H>
        <AmountText value={v.ink} />
      </H>
    </Prov>
  );
  const debtFigure = (
    <H>
      <AmountText value={v.debtDai as number} />
    </H>
  );
  const lead = hasDebt
    ? positionNodes("lead_debt", {
        coll,
        coll_symbol: sym,
        debt: v.rate ? <Prov info={daiDebtProv(formatNumber(v.art), v.rate, dsym)}>{debtFigure}</Prov> : debtFigure,
        debt_symbol: dsym,
      })
    : positionNodes("lead_no_debt", { coll, coll_symbol: sym });

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  // ── Holdings ──
  // LockStake's feed is capped: the Vat values SKY at the lower of the cap
  // and the OSM (lib/sources/chain/makerdao-lse-oracle.ts).
  const cap = v.priceCap ?? null;
  const capBinds = cap != null && cap.oracleUsd != null && cap.oracleUsd > cap.capUsd;
  if (v.collateralUsd != null && v.priceUsd != null) {
    const collUsd = (
      <Prov info={collateralUsdProv(sym, formatNumber(v.ink), v.priceUsd)}>
        <H>{formatUsd(v.collateralUsd)}</H>
      </Prov>
    );
    add(
      "holdings",
      "worth",
      cap ? positionNodes("worth_capped", { coll_usd: collUsd }) : positionNodes("worth", { coll_usd: collUsd }),
    );
  }
  if (cap && cap.oracleUsd != null)
    add(
      "holdings",
      "cap",
      capBinds
        ? positionNodes("cap_binds", { cap_usd: <H>{usdPrice(cap.capUsd)}</H>, oracle_usd: usdPrice(cap.oracleUsd) })
        : positionNodes("cap_under", { oracle_usd: usdPrice(cap.oracleUsd), cap_usd: <H>{usdPrice(cap.capUsd)}</H> }),
    );
  if (feeInDebt != null)
    add("holdings", "fee", positionNodes("fee_split", { fee: <H>{dai2(feeInDebt)}</H>, debt_symbol: dsym }));
  const ls = v.lockstake ?? null;
  if (v.lse && ls?.farm && ls.voteDelegate)
    add(
      "holdings",
      "lockstake",
      positionNodes("lockstake", {
        farm: <LinkedAddress address={ls.farm} />,
        delegate: <LinkedAddress address={ls.voteDelegate} />,
      }),
    );

  // ── Risk ──
  const auctionsOff = hasDebt && v.auction != null && v.auction.stopped > 0;
  const ratioNode =
    ratio != null ? (
      <Prov
        info={collateralRatioProv(formatUsd(v.collateralUsd as number), `${formatNumber(v.debtDai as number)} ${dsym}`)}
      >
        <H>{(ratio * 100).toFixed(0)}%</H>
      </Prov>
    ) : null;
  // Under the minimum: said with the breaker when it is on, in one bullet.
  const below = ratio != null && v.matRatio != null && ratio < v.matRatio;
  if (!hasDebt) add("risk", "no-debt", positionNodes("no_debt"));
  else if (below && v.matRatio != null)
    add(
      "risk",
      "ratio",
      auctionsOff
        ? positionNodes("ratio_below_off", { ratio: ratioNode, mat: matPct(v.matRatio), ilk: v.ilk })
        : positionNodes("ratio_below", { ratio: ratioNode, mat: matPct(v.matRatio) }),
    );
  else if (ratioNode != null && drop != null && drop > 0) {
    const dropNode = <H>{dropText(drop)}</H>;
    add(
      "risk",
      "ratio",
      capBinds
        ? positionNodes("ratio_drop_capped", { ratio: ratioNode, drop: dropNode })
        : positionNodes("ratio_drop", { ratio: ratioNode, coll_symbol: sym, drop: dropNode }),
    );
  }
  if (hasDebt && matMoved && newestRead?.mat != null && v.matRatio != null)
    add(
      "risk",
      "mat",
      positionNodes("mat_moved", { mat_then: matPct(newestRead.mat), mat: <H>{matPct(v.matRatio)}</H> }),
    );
  if (auctionsOff && !below) add("risk", "auctions", positionNodes("auctions_off", { ilk: v.ilk }));

  // ── Rate ──
  if (hasDebt && v.stabilityFeeApr != null)
    add(
      "rate",
      "fee",
      positionNodes("rate", {
        fee_rate: (
          <Prov info={stabilityFeeAprProv(v.ilk)}>
            <H>{(v.stabilityFeeApr * 100).toFixed(2)}%</H>
          </Prov>
        ),
        yearly: <AmountText value={(v.debtDai as number) * v.stabilityFeeApr} format="compact" />,
        debt_symbol: dsym,
      }),
    );
  if (v.lse && ls && ls.exitFee > 0)
    add("rate", "exit", positionNodes("exit_fee", { exit_fee: `${(ls.exitFee * 100).toFixed(2)}%` }));

  // ── History: who operated the vault, who owns it ──
  // The same externalActor() verdict each event card renders on its spine,
  // reduced once so the pane states the pattern. The count is plural-safe and
  // an address is never spoken in place of a name.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    if (ext.external === 1) {
      add(
        "history",
        "operators",
        positionNodes("operators_one", {
          external: ext.external.toLocaleString("en-US"),
          total: ext.total.toLocaleString("en-US"),
        }),
      );
      if (leadName) add("history", "operators-who", positionNodes("operators_one_named", { lead_name: leadName }));
    } else {
      add(
        "history",
        "operators",
        positionNodes("operators", {
          external: ext.external.toLocaleString("en-US"),
          total: ext.total.toLocaleString("en-US"),
        }),
      );
      if (ext.actors.length === 1)
        add(
          "history",
          "operators-who",
          leadName ? positionNodes("operators_all_named", { lead_name: leadName }) : positionNodes("operators_single"),
        );
      else if (leadName)
        add("history", "operators-who", positionNodes("operators_most_named", { lead_name: leadName }));
      else
        add(
          "history",
          "operators-who",
          positionNodes("operators_spread", {
            actors: ext.actors.length.toLocaleString("en-US"),
            top_count: ext.actors[0].count.toLocaleString("en-US"),
          }),
        );
    }
  }
  ownerBullets(history, v.owner, (b) => add(b.group, `owner-${bullets.length}`, b.node));

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

// ── A closed or liquidated vault ─────────────────────────────────────────────
// Read from the replay summary, the timeline already on the page and the
// auctions the page read; no chain overlay, so it renders on every terminal
// vault.

export function MakerdaoClosedPositionExplanation({
  v,
  events,
  folders,
}: {
  v: MakerVaultView;
  /** The vault's timeline (maker events, ascending): how the record ended
   *  and the seizures. */
  events: BaseActivityEvent[];
  /** Every folder the index served, whole and unfiltered: the vault's newest
   *  activity can sit inside one. */
  folders?: readonly ServedFolder[] | null;
}) {
  const history = useMakerVaultHistory();
  if (v.status === "open") return null;

  const dsym = ilkDebtSymbol(v.ilk);
  const sym = v.collateralSymbol;
  const maker = events.filter(isMakerDAOEvent);
  const grabs = maker.filter((e) => e.context.data.eventType === "grab");
  // The newest activity overall: a served folder's last member when it is
  // newer than every loaded row, the loaded row otherwise. MakerDAO's folder
  // kinds are `liquidation` and `owner_run`, so a folder never stands for a
  // fork-out.
  const newestFolder = newestActivityFolder(maker, folders);
  const lastType = newestFolder ? null : maker.length > 0 ? maker[maker.length - 1].context.data.eventType : null;
  const endedByMove = !newestFolder && lastType === "fork-out";
  // After the last liquidation, did the owner do more than take back what the
  // auction returned?
  const lastGrabIdx = maker.map((e) => e.context.data.eventType).lastIndexOf("grab");
  const ownerActedAfter =
    !newestFolder &&
    lastGrabIdx >= 0 &&
    maker.slice(lastGrabIdx + 1).some((e) => !history.leftover.has(e.id) && e.context.data.eventType !== "grab");

  const outcomes = grabs
    .map((g) => history.auctions.get(makerTxHashOf(g)))
    .filter((a): a is MakerAuctionOutcome => a?.kind === "clipper" && a.settled);
  const allRead = grabs.length > 0 && outcomes.length === grabs.length;
  const sum = (f: (a: MakerAuctionOutcome) => string) => outcomes.reduce((t, a) => t + Number(f(a)), 0);
  const firstGrab = grabs[0];
  const minimum = outcomes[0]?.mat ?? null;
  const takenOut = [...history.leftover.values()].filter((l) => l.role === "out").map((l) => l.at);

  const ended = firstGrab ? formatDate(firstGrab.timestamp) : null;
  const lead = v.everLiquidated
    ? ended
      ? endedByMove
        ? positionNodes("liq_lead_moved", { ended })
        : ownerActedAfter
          ? positionNodes("liq_lead_emptied", { ended })
          : positionNodes("liq_lead", { ended })
      : positionNodes("liq_lead_undated")
    : endedByMove
      ? positionNodes("closed_lead_moved")
      : positionNodes("closed_lead");

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  // ── Holdings: what the auctions took and handed back ──
  if (v.everLiquidated && allRead) {
    const returned = sum((a) => a.leftoverInk);
    const shortfall = sum((a) => a.shortfallDai);
    add(
      "holdings",
      "lost",
      positionNodes("lost", {
        sold: (
          <H>
            <AmountText value={sum((a) => a.soldInk)} />
          </H>
        ),
        coll_symbol: sym,
        raised: dai2(sum((a) => a.raisedDai)),
        debt_symbol: dsym,
      }),
    );
    add(
      "holdings",
      "penalty",
      positionNodes("penalty", { penalty: dai2(sum((a) => a.penaltyDai)), debt_symbol: dsym }),
    );
    add("holdings", "kept", positionNodes("kept", { debt_symbol: dsym }));
    const back = (
      <H>
        <AmountText value={returned} />
      </H>
    );
    if (returned > 0)
      add(
        "holdings",
        "returned",
        takenOut.length > 0
          ? positionNodes("returned_taken", {
              returned: back,
              coll_symbol: sym,
              taken: formatDate(Math.max(...takenOut)),
            })
          : positionNodes("returned", { returned: back, coll_symbol: sym }),
      );
    else if (shortfall > 0)
      add("holdings", "shortfall", positionNodes("shortfall", { shortfall: dai2(shortfall), debt_symbol: dsym }));
  }
  // A wei-scale trace below the line the lifecycle status reads balances
  // against: said so it does not read as a balance.
  const inkResidue = v.ink > 0 && v.ink <= MAKER_STATUS_DUST;
  const artResidue = v.art > 0 && v.art <= MAKER_STATUS_DUST;
  if ((inkResidue || artResidue) && bullets.filter((b) => b.group === "holdings").length < 4)
    add("holdings", "residue", positionNodes("residue", { residue_symbol: inkResidue ? sym : dsym }));

  // ── Risk: the minimum the first liquidation came under ──
  if (v.everLiquidated && minimum != null)
    add("risk", "minimum", positionNodes("min_then", { min_then: matPct(minimum) }));

  // ── History: the seizures and who owns it ──
  if (grabs.length > 1)
    add(
      "history",
      "seized",
      positionNodes("seized_count", { seizures: <H>{grabs.length.toLocaleString("en-US")}</H> }),
    );
  ownerBullets(history, null, (b) => add(b.group, `owner-${bullets.length}`, b.node));

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
