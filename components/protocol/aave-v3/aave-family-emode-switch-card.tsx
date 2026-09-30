"use client";

// An Aave V3-family account's e-mode change as a timeline row of its own: the
// Pool's UserEModeSet log, which the page reads beside its timeline
// (lib/aave-v3/account-switches.ts; SparkLend, Seamless). The header names the
// new category and its limits at the switch's block; the grid states the
// account before and after the transaction, read at blocks N−1 and N like
// every other row (the SparkLend account block, which reads any Aave V3-family
// Pool's answer).

import type { BaseActivityEvent, EmodeSwitchFields, SparkContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { ChainTruthRow } from "@/components/shared/chain-truth-event";
import { SpineColumn } from "@/components/shared/spine-column";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { bpsPct } from "@/lib/aave-v3/position-state";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import type { V3Coords } from "@/lib/aave-v3/event-provenance";
import type { V3PoolIdentity } from "@/lib/aave-v3/pool-context";
import { useAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import { sparkEventState } from "@/lib/spark/event-state";
import { SparkAccountState } from "@/components/protocol/spark/spark-account-state";

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
  isFirst,
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
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** Where the account around this transaction can be read at N−1 and N;
   *  unset where another of the owner's transactions shares the block. */
  market?: "spark" | "seamless";
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
      : { status: here?.status ?? ("off" as const), raw: undefined, state: undefined };
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

  return (
    <EventCard
      avatar={null}
      iconColumn={
        <SpineColumn icon="rate-change" iconDirection={entering ? "up" : "down"} isFirst={isFirst} isLast={!!isLast} />
      }
      header={
        <ChainTruthRow
          spec={{
            label: "E-mode",
            deltas: [],
            note: (
              <span data-emode-switch="">
                <Prov info={switchProv(s, coords, pool)}>{headline(s)}</Prov>
              </span>
            ),
          }}
          timestamp={event.timestamp}
          eventNumber={eventNumber}
        />
      }
      detail={
        read.status === "ready" && read.state && read.raw ? (
          <SparkAccountState
            state={read.state}
            raw={read.raw}
            coords={v3Coords}
            isLiquidation={false}
            hfFormat={hfFormat}
          />
        ) : read.status === "loading" ? (
          <div className="px-5 pb-2 text-xs text-rb-500" data-spark-account-state="loading">
            Reading the account before and after this transaction…
          </div>
        ) : null
      }
      detailLabel="Position state"
      explainer={
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
      }
      explainerLabel="Plain English"
      txHash={event.txHash}
      persistKey={`${persistPrefix}:${event.id}`}
      caption="E-mode"
    />
  );
}
