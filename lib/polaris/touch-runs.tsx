// Polaris — a run of touches as one row (rails-ops TO-DO-ui-jobs 404). A
// touch is an adjust that moved neither collateral nor debt: the log writes
// the pending legs into the CDP's figures and nothing the holder chose moves.
// Two or more in a row, with no other event between them and one sender, draw
// as one run row, "Touched CDP [9]" with the date range, opening to the
// members, each keeping its page, number and share link (the shared event run,
// `TimelineRunCard`). The node is the touch's fingerprint.
//
// Who sent a touch is the row's own `txFrom`; the holder at that row is read
// off the page: the position's holder at its open, then each NFT transfer's
// recipient (`polarisHoldersAt`).

import type { ReactNode } from "react";
import { isPolarisEvent, type BaseActivityEvent, type PolarisContext } from "@/lib/shared/types/event-shape";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { SHEET_NO_USD, type EventSheet, type SheetRow, type SheetSide } from "@/components/shared/event-sheet";
import { LinkedAddress } from "@/components/shared/linked-address";
import { polarisEchoCoords } from "@/components/protocol/polaris/polaris-event-explainer";
import { beforeProv, ledgerFieldProv } from "@/lib/polaris/event-provenance";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatPeth } from "@/lib/polaris/figure-format";
import { formatExact, formatNumber } from "@/lib/utils/format";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { renderRunFolders, runMemo } from "@/lib/shared/run-folders";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** An adjust that moved neither collateral nor debt. */
export function isPolarisTouch(e: BaseActivityEvent): boolean {
  if (!isPolarisEvent(e)) return false;
  const d = e.context.data;
  return d.eventType === "adjust" && num(d.collChange) === 0 && num(d.debtChange) === 0;
}

/** The CDP's holder at each event, by event id: `ownerAtOpen` (or the open's
 *  sender where the index has not said) until a transfer, then each
 *  transfer's recipient. */
export function polarisHoldersAt(
  events: readonly BaseActivityEvent[],
  ownerAtOpen?: string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  const asc = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  let holder: string | null = ownerAtOpen?.toLowerCase() ?? null;
  for (const e of asc) {
    if (!isPolarisEvent(e)) continue;
    const d = e.context.data;
    if (holder == null && d.eventType === "open" && d.txFrom) holder = d.txFrom.toLowerCase();
    if (holder) out.set(e.id, holder);
    if (d.eventType === "transfer" && d.toAddr) holder = d.toAddr.toLowerCase();
  }
  return out;
}

const senderOf = (e: BaseActivityEvent) => (isPolarisEvent(e) ? (e.context.data.txFrom ?? "").toLowerCase() : "");

type PolarisRow = BaseActivityEvent & { context: { protocol: "polaris"; data: PolarisContext } };

const W = POLARIS_WORDS;
const bold = (n: ReactNode) => <strong className="font-semibold text-foreground">{n}</strong>;
const signed = (n: number, fmt: (x: number) => string) => `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;

/** A Σ receipt over the run's members: one input per touch. */
function sumProv(what: string, field: string, members: PolarisRow[], pick: (d: PolarisContext) => number): Provenance {
  return {
    kind: "derived",
    summary: `${what} — the sum over the run of what each touch's CDPUpdated log wrote (${field}).`,
    formula: `Σ ${field}`,
    inputs: members.map((e) => ({
      label: `touch at block ${e.blockNumber.toLocaleString("en-US")}`,
      value: formatExact(pick(e.context.data)),
      kind: "chain" as const,
      pclass: "emitted" as const,
    })),
  };
}

/** The run's Explanation lines (ui-jobs 404), oldest member first: the
 *  interest the touches wrote into the debt, the PSM share they wrote, and
 *  the stated collateral and debt before the first touch and after the last.
 *  The PSM share is stated here as well as on the row after the run. */
function touchRunLines(events: readonly BaseActivityEvent[]): ReactNode[] {
  const members = events
    .filter((e): e is PolarisRow => isPolarisEvent(e))
    .sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  if (members.length === 0) return [];
  const first = members[0];
  const last = members[members.length - 1];
  const fd = first.context.data;
  const ld = last.context.data;
  const stable = fd.stableSymbol;
  const lines: ReactNode[] = [];
  const interest = members.reduce((n, e) => n + num(e.context.data.accruedInterest), 0);
  if (interest > 0)
    lines.push(
      <>
        {W.touch_run_interest}{" "}
        <Prov
          info={sumProv("Interest written over the run", "_accruedInterest", members, (d) => num(d.accruedInterest))}
          value={formatExact(interest)}
          symbol={stable}
        >
          {bold(formatNumber(interest))}
        </Prov>{" "}
        {stable} {W.touch_run_interest_tail}
      </>,
    );
  const psmColl = members.reduce((n, e) => n + num(e.context.data.mintRedeemCollGain), 0);
  const psmDebt = members.reduce((n, e) => n + num(e.context.data.mintRedeemDebtGain), 0);
  if (psmColl !== 0 || psmDebt !== 0)
    lines.push(
      <>
        {W.touch_run_psm}{" "}
        <Prov
          info={sumProv("PSM collateral share over the run", "_mintRedeemCollGain", members, (d) =>
            num(d.mintRedeemCollGain),
          )}
          value={formatExact(psmColl)}
          symbol={PETH.symbol}
        >
          {bold(signed(psmColl, formatPeth))}
        </Prov>{" "}
        {PETH.symbol} {W.touch_run_psm_coll}{" "}
        <Prov
          info={sumProv("PSM debt share over the run", "_mintRedeemDebtGain", members, (d) =>
            num(d.mintRedeemDebtGain),
          )}
          value={formatExact(psmDebt)}
          symbol={stable}
        >
          {bold(signed(psmDebt, formatNumber))}
        </Prov>{" "}
        {stable} {W.touch_run_psm_debt}
      </>,
    );
  const firstCoords = polarisEchoCoords(fd, first.txHash, first.blockNumber);
  const lastCoords = polarisEchoCoords(ld, last.txHash, last.blockNumber);
  const stated = (side: "coll" | "debt") => {
    const before = num(side === "coll" ? fd.collBefore : fd.debtBefore);
    const after = num(side === "coll" ? ld.newColl : ld.newDebt);
    const fmt = side === "coll" ? formatPeth : formatNumber;
    const symbol = side === "coll" ? PETH.symbol : stable;
    return (
      <>
        {side === "coll" ? W.touch_run_coll : W.touch_run_debt}{" "}
        <Prov
          info={beforeProv(side, firstCoords, side === "coll" ? fd.raw?.collBefore : fd.raw?.debtBefore)}
          value={formatExact(before)}
          symbol={symbol}
        >
          {bold(fmt(before))}
        </Prov>{" "}
        {W.touch_run_to}{" "}
        <Prov
          info={ledgerFieldProv(
            side === "coll" ? "newColl" : "newDebt",
            lastCoords,
            side === "coll" ? ld.raw?.newColl : ld.raw?.newDebt,
          )}
          value={formatExact(after)}
          symbol={symbol}
        >
          {bold(fmt(after))}
        </Prov>{" "}
        {symbol} {W.touch_run_after}
      </>
    );
  };
  if (fd.collBefore != null && ld.newColl != null) lines.push(stated("coll"));
  if (fd.debtBefore != null && ld.newDebt != null) lines.push(stated("debt"));
  return lines;
}

/** The run's Figures (ui-jobs 404): each side's stated figure before the
 *  first touch, what the touches wrote into it summed, and the figure after
 *  the last, which the sums reach by the log's identity. Read from the
 *  members' rows, oldest first. */
function touchRunSheet(events: readonly BaseActivityEvent[]): EventSheet | null {
  const members = events
    .filter((e): e is PolarisRow => isPolarisEvent(e))
    .sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  if (members.length === 0) return null;
  const first = members[0];
  const last = members[members.length - 1];
  const fd = first.context.data;
  const ld = last.context.data;
  const stable = fd.stableSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[fd.market].stable.address;
  const firstCoords = polarisEchoCoords(fd, first.txHash, first.blockNumber);
  const lastCoords = polarisEchoCoords(ld, last.txHash, last.blockNumber);
  const sum = (pick: (d: PolarisContext) => number) => members.reduce((n, e) => n + pick(e.context.data), 0);
  const row = (
    key: string,
    label: string,
    side: "coll" | "debt",
    value: number,
    info: Provenance,
    tip: string,
    signedText = true,
  ): SheetRow => ({
    key,
    label,
    amount: {
      text: signedText
        ? signed(value, side === "coll" ? formatPeth : formatNumber)
        : (side === "coll" ? formatPeth : formatNumber)(value),
      info,
      value: formatExact(value),
      symbol: side === "coll" ? PETH.symbol : stable,
      address: side === "coll" ? PETH.address : stableAddr,
    },
    tip,
  });
  const summed = (
    key: string,
    label: string,
    side: "coll" | "debt",
    field: string,
    pick: (d: PolarisContext) => number,
  ) => {
    const v = sum(pick);
    return v === 0 ? null : row(key, label, side, v, sumProv(label, field, members, pick), W.tip_touch_sheet_sum);
  };
  const side = (s: "coll" | "debt"): SheetSide => {
    const before = num(s === "coll" ? fd.collBefore : fd.debtBefore);
    const after = num(s === "coll" ? ld.newColl : ld.newDebt);
    const legs =
      s === "coll"
        ? [
            summed("psm", W.sheet_psm, "coll", "_mintRedeemCollGain", (d) => num(d.mintRedeemCollGain)),
            summed("reward", W.sheet_reward, "coll", "_bcTokenGain", (d) => num(d.bcTokenGain)),
          ]
        : [
            summed("interest", W.touch_sheet_interest, "debt", "_accruedInterest", (d) => num(d.accruedInterest)),
            summed("stability-gain", W.sheet_stability_gain, "debt", "_stableGain", (d) => -num(d.stableGain)),
            summed("psm", W.sheet_psm, "debt", "_mintRedeemDebtGain", (d) => num(d.mintRedeemDebtGain)),
            summed("settled", W.sheet_settled, "debt", "_stablesMintedToEnsureZeroDebt", (d) =>
              num(d.stablesMintedToEnsureZeroDebt),
            ),
          ];
    return {
      side: s === "coll" ? "collateral" : "debt",
      icons: [s === "coll" ? PETH.symbol : stable],
      carry: [],
      rows: [
        row(
          "before",
          W.touch_sheet_before,
          s,
          before,
          beforeProv(s, firstCoords, s === "coll" ? fd.raw?.collBefore : fd.raw?.debtBefore),
          W.tip_touch_sheet_before,
          false,
        ),
        ...legs.filter((r): r is SheetRow => r != null),
      ],
      after: W.touch_sheet_after,
      total: SHEET_NO_USD,
      totalAmount: {
        text: (s === "coll" ? formatPeth : formatNumber)(after),
        info: ledgerFieldProv(
          s === "coll" ? "newColl" : "newDebt",
          lastCoords,
          s === "coll" ? ld.raw?.newColl : ld.raw?.newDebt,
        ),
        value: formatExact(after),
        symbol: s === "coll" ? PETH.symbol : stable,
        address: s === "coll" ? PETH.address : stableAddr,
      },
      totalTip: W.tip_touch_sheet_after,
    };
  };
  return { sides: [side("coll"), side("debt")], panels: [] };
}

/** One merge per member list, so the collector's memo holds (`runMemo`). */
const mergeOf = (events: readonly BaseActivityEvent[]) => {
  const sheet = touchRunSheet(events);
  return () => sheet;
};

/** The touch run, for a page whose holders are `holderOf`. */
export function polarisTouchRuns(holderOf: (id: string) => string | undefined): TimelineRunSpec[] {
  return [
    {
      match: isPolarisTouch,
      floor: 2,
      // One sender per run: the holder's touches and a keeper's do not join.
      sameRun: (a, b) => senderOf(a) === senderOf(b),
      render: (run, meta) =>
        renderRunFolders(run, meta, (events, folder) => {
          const first = events[0];
          const holder = holderOf(first.id);
          const sender = senderOf(first);
          const other = !!holder && !!sender && holder !== sender;
          return (
            <TimelineRunCard
              key={folder.key}
              count={events.length}
              memberNoun={W.touch_noun}
              memberPlural={W.touch_plural}
              explain={{
                who: other ? (
                  <>
                    {W.touch_run_other} <LinkedAddress address={sender} />, {W.touch_run_made}
                  </>
                ) : undefined,
                lines: touchRunLines(events),
                covers: ["collateral", "debt"],
              }}
              mergeSheet={runMemo(events, mergeOf)}
              kindWord={POLARIS_WORDS.t1_touched}
              tone="neutral"
              spineIcon="touch"
              byOwner={!holder || !sender || holder === sender}
              firstTimestamp={events[0].timestamp}
              lastTimestamp={events[events.length - 1].timestamp}
              isLast={folder.isLast}
            >
              {folder.children}
            </TimelineRunCard>
          );
        }),
    },
  ];
}
