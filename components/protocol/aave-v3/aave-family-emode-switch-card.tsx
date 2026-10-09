"use client";

// An Aave V3-family account's e-mode change as a timeline row of its own: the
// Pool's UserEModeSet log, which the page reads beside its timeline
// (lib/aave-v3/account-switches.ts; SparkLend, Seamless). The header names the
// new category and its limits at the switch's block; the cells state the
// category before → after and the health factor either side, read at blocks
// N−1 and N like every other row (ui-jobs 309).

import type { BaseActivityEvent, EmodeSwitchFields, SparkContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { EventCellSpec } from "@/components/shared/event-cells";
import { EventLedgerContext, ROW_CELLS } from "@/components/shared/event-ledger-context";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { emodeSwitchContent } from "@/lib/shared/learn-more-content";
import { healthFactorProv } from "@/lib/aave-v3/event-provenance";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { bpsPct } from "@/lib/aave-v3/position-state";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import type { V3Coords } from "@/lib/aave-v3/event-provenance";
import type { V3PoolIdentity } from "@/lib/aave-v3/pool-context";
import { useAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import { sparkEventState } from "@/lib/spark/event-state";

type Switch = EmodeSwitchFields;

/** What the account read needs of a row that moved no reserve. */
const NO_RESERVE: SparkContext = { eventType: "emode", reserveSymbol: "", side: "supply", assetsDelta: "0" };

const name = (id: number, label: string | null): string => (id === 0 ? "none" : (label ?? `category ${id}`));

/** "Switched to ETH e-mode: borrow up to 90.00%, liquidation at 93.00%". */
function headline(s: Switch): string {
  if (s.toId === 0) return `Left ${name(s.fromId, s.fromLabel)} e-mode: each asset's own limits`;
  const limits =
    s.ltvBps != null && s.liquidationThresholdBps != null
      ? `: borrow up to ${bpsPct(s.ltvBps)}, liquidation at ${bpsPct(s.liquidationThresholdBps)}`
      : "";
  return `Switched to ${name(s.toId, s.toLabel)} e-mode${limits}`;
}

function switchProv(s: Switch, coords: { txHash: string; blockNumber: number }, pool: V3PoolIdentity): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `The account's e-mode category changed from ${name(s.fromId, s.fromLabel)} to ${name(s.toId, s.toLabel)} in this transaction.${s.toId !== 0 && s.ltvBps != null && s.liquidationThresholdBps != null ? ` At this block the category lent up to ${bpsPct(s.ltvBps)} of the collateral it covers and liquidated at ${bpsPct(s.liquidationThresholdBps)}.` : ""}`,
    contract: { name: pool.name, address: pool.address },
    source: { block: coords.blockNumber, txHash: coords.txHash },
    via: `Pool UserEModeSet log (categoryId ${s.toId}) in tx ${coords.txHash.slice(0, 10)}… at block ${coords.blockNumber}${s.toId !== 0 ? " · the category's figures read from the Pool at the block" : ""}`,
    formula: "UserEModeSet categoryId",
  };
}

export function AaveFamilyEmodeSwitchCard({
  event,
  sw: s,
  pool,
  persistPrefix,
  isLast,
  eventNumber,
  market,
  hfFormat = hfLabelV4,
}: {
  event: BaseActivityEvent;
  sw: EmodeSwitchFields;
  /** The Pool the receipts name. */
  pool: V3PoolIdentity;
  /** The timeline's card-state key prefix ("spark", "aave-v3"). */
  persistPrefix: string;
  isLast?: boolean;
  eventNumber?: number;
  /** Where the account around this transaction can be read at N−1 and N
   *  (hooks/useAaveV3PositionState: "spark", "seamless", "base", or an Aave V3
   *  Ethereum market); unset where another of the owner's transactions shares
   *  the block. */
  market?: string;
  /** The explorer's health-factor format (Seamless: the Aave V3 family's
   *  four decimals below 1.1); SparkLend's by default. */
  hfFormat?: (hf: number | null) => string;
}) {
  const here = useAaveV3PositionState({ wallet: event.wallet, market, block: event.blockNumber, txHash: event.txHash });
  const read =
    here?.status === "ready"
      ? {
          status: "ready" as const,
          raw: here.data,
          state: sparkEventState(NO_RESERVE, undefined, here.data, undefined),
        }
      : {
          status: here?.status ?? ("off" as const),
          lasting: here?.status === "unavailable" ? here.lasting : undefined,
          raw: undefined,
          state: undefined,
        };
  const coords = { txHash: event.txHash, blockNumber: event.blockNumber };
  const v3Coords: V3Coords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    stateRead: "chain-at-block",
    pool,
  };
  const entering = s.toId !== 0;
  const state = read.status === "ready" ? read.state : undefined;
  const hfMoved = state && state.before.hf != null && state.after.hf != null ? state : undefined;
  const acc = read.raw?.account;

  // The switch's one figure, from the log: the category before → after.
  const emodeCell: EventCellSpec = {
    kind: "stat",
    key: "emode",
    label: "E-mode",
    changed: true,
    value: {
      before: { text: s.fromId === 0 ? "None" : name(s.fromId, s.fromLabel), info: switchProv(s, coords, pool) },
      after: { text: s.toId === 0 ? "None" : name(s.toId, s.toLabel), info: switchProv(s, coords, pool) },
    },
  };
  // The health factor either side, from the account read at N−1 and N: the
  // same collateral counted at the category's limits.
  const hfCell: EventCellSpec | null =
    state && acc && (state.before.hf != null || state.after.hf != null)
      ? {
          kind: "stat",
          key: "health-factor",
          label: "Health factor",
          changed: state.before.hf !== state.after.hf,
          inputs: ["emode"],
          value: {
            before:
              state.before.hf !== state.after.hf
                ? {
                    text: hfFormat(state.before.hf),
                    value: state.before.hf == null ? "∞" : hfFormat(state.before.hf),
                    info: healthFactorProv("before", v3Coords, {
                      wad: acc.before.healthFactor,
                      collateralBase: acc.before.totalCollateralBase,
                      debtBase: acc.before.totalDebtBase,
                      thresholdBps: acc.before.liquidationThresholdBps,
                    }),
                  }
                : undefined,
            after: {
              text: hfFormat(state.after.hf),
              value: state.after.hf == null ? "∞" : hfFormat(state.after.hf),
              info: healthFactorProv("after", v3Coords, {
                wad: acc.after.healthFactor,
                collateralBase: acc.after.totalCollateralBase,
                debtBase: acc.after.totalDebtBase,
                thresholdBps: acc.after.liquidationThresholdBps,
              }),
            },
          },
        }
      : null;
  const protocol = pool.protocol === "Seamless" ? "seamless" : /spark/i.test(pool.name) ? "spark" : "aave";

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: persistPrefix,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine: { icon: "rate-change", iconDirection: entering ? "up" : "down", isLast: !!isLast },
    head: {
      label: "E-mode",
      deltas: [],
      note: (
        <span data-emode-switch="">
          <Prov info={switchProv(s, coords, pool)}>{headline(s)}</Prov>
        </span>
      ),
    },
    caption: "E-mode",
    cells: hfCell ? [emodeCell, hfCell] : [emodeCell],
    ledgers: { none: "an e-mode switch moves no reserve" },
    notes:
      read.status === "loading" ? (
        <div className="px-5 pb-2 text-xs text-rb-500" data-spark-account-state="loading">
          Reading the account before and after this transaction…
        </div>
      ) : read.status === "unavailable" && !read.lasting ? (
        <div className="px-5 pb-2 text-xs text-rb-500" data-spark-account-state="unread">
          The account before and after this transaction was not read. Reload to try again.
        </div>
      ) : undefined,
    explainer: {
      body: (
        <p className="text-sm leading-relaxed">
          {entering ? (
            <>
              The account chose the {name(s.toId, s.toLabel)} e-mode category. Collateral the category covers now counts
              at the category&rsquo;s limits
              {s.ltvBps != null && s.liquidationThresholdBps != null
                ? ` (borrow up to ${bpsPct(s.ltvBps)}, liquidation at ${bpsPct(s.liquidationThresholdBps)})`
                : ""}{" "}
              in place of each asset&rsquo;s own, and the account may borrow only assets in the category.
            </>
          ) : (
            <>
              The account left the {name(s.fromId, s.fromLabel)} e-mode category: each asset counts at its own limits
              again.
            </>
          )}
          {hfMoved ? (
            <>
              {" "}
              Nothing was supplied or borrowed; the health factor went from {hfFormat(hfMoved.before.hf)} to{" "}
              {hfFormat(hfMoved.after.hf)}.
            </>
          ) : null}
        </p>
      ),
    },
    learnMore: <LearnMore inline content={emodeSwitchContent(protocol)} />,
  };

  return (
    <EventLedgerContext.Provider value={ROW_CELLS}>
      <EventCard slots={slots} avatar={null} />
    </EventLedgerContext.Provider>
  );
}
