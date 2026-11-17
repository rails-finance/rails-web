"use client";

// A Polaris reserve loan's page, in the three sections
// (rails-ops standards/detail-page-anatomy.md) on the CDP page's shell: the
// card, the Lifetime flows panel (lib/polaris/sp-loan-flow-timelines.ts), the
// shared timeline. The loans manager's getters at head
// (/api/chain/polaris/reserve-loan) are the card's figures and the fees
// accrued since the last touch; the index holds the touches. The price strip
// quotes fpETH at the floor, in WETH, the debt's unit.

import { useEffect, useMemo, useState } from "react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext, useFlowFocusRoot, useFlowFocusValue } from "@/components/shared/flow-focus-context";
import { CHAIN_TRUTH_DISPLAY_ITEMS, TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { PolarisLoanCard, type PolarisLoanNow } from "@/components/protocol/polaris/polaris-loan-card";
import { PolarisLoanEventCard } from "@/components/protocol/polaris/polaris-sp-loan-event-cards";
import {
  PolarisLoanFlowsNote,
  polarisLoanFlowsContent,
} from "@/components/protocol/polaris/polaris-sp-loan-flows-note";
import { fetchPolarisLoanChain, type PolarisLoanChain } from "@/lib/api/fetch-polaris-sp-loans-chain";
import { FPETH } from "@/lib/polaris/asset-catalog";
import { POLARIS_LOANS_PATH } from "@/lib/polaris/routes";
import { atFloor, big, loanLifetime, max0, units } from "@/lib/polaris/sp-loan-math";
import { loanFlows } from "@/lib/polaris/sp-loan-flow-timelines";
import { loanTimelineEvent } from "@/lib/polaris/sp-loan-timeline-events";
import { loanLiveProv } from "@/lib/polaris/sp-loan-provenance";
import {
  readPolarisSpLoans,
  type PolarisLoanEventRow,
  type PolarisLoanTimelineResponse,
} from "@/lib/sources/api/polaris-sp-loans";

const NO_FOCUS: never[] = [];

export default function LoanView({ loanId, initial }: { loanId: string; initial: PolarisLoanTimelineResponse | null }) {
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [chain, setChain] = useState<PolarisLoanChain | null>(null);
  const [chainSettled, setChainSettled] = useState(false);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readPolarisSpLoans<PolarisLoanTimelineResponse>("reserve-loans/timeline", { id: loanId, limit: "5000" })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [initial, loanId]);

  // The live read answers for a closed loan too (the floor), so it always runs.
  useEffect(() => {
    let cancelled = false;
    fetchPolarisLoanChain(loanId)
      .then((c) => !cancelled && !c.chainStale && setChain(c))
      .catch(() => undefined)
      .finally(() => !cancelled && setChainSettled(true));
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  const row = data?.position ?? null;
  const open = row?.status === "open";
  const touches = useMemo(() => data?.rows ?? [], [data]);
  const lifetime = useMemo(() => (touches.length ? loanLifetime(touches) : null), [touches]);

  const now = useMemo<PolarisLoanNow | null>(() => {
    if (!chain || !lifetime || !open) return null;
    const debt = big(chain.debtRaw);
    return {
      coll: big(chain.collRaw),
      debt,
      cost: max0(debt - lifetime.netBorrowed),
      atFloor: atFloor(chain.collRaw, chain.floorPriceRaw),
    };
  }, [chain, lifetime, open]);

  // Set on mount, so the server's render and the first client render agree.
  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => setNowSec(Math.floor(Date.now() / 1000)), []);
  const flows = useMemo(
    () =>
      touches.length && chainSettled && nowSec != null
        ? loanFlows(touches, {
            open,
            collNowRaw: chain?.collRaw ?? null,
            debtNowRaw: chain?.debtRaw ?? null,
            nowSec,
          })
        : null,
    [touches, chainSettled, open, chain, nowSec],
  );
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(flows?.focus ?? NO_FOCUS), flows?.timeline ?? null);
  const accrued = flows?.timeline.live.pending?.length ? true : false;

  const floor = chain ? units(big(chain.floorPriceRaw)) : null;
  const stripAssets: LatestPriceAsset[] =
    floor != null && floor > 0
      ? [
          {
            symbol: FPETH.symbol,
            address: FPETH.address,
            price: floor,
            unit: "WETH",
            label: `${FPETH.symbol} at the floor`,
            triggerLabel: FPETH.symbol,
            info: loanLiveProv("floor"),
          },
        ]
      : [];

  const events = useMemo(() => touches.map(loanTimelineEvent), [touches]);
  const rowById = useMemo(() => new Map(touches.map((r) => [r.event_key, r])), [touches]);
  const tl = useTimelineEvents(events, {
    storageKey: `polaris-loan-${loanId}`,
    protocolKey: "polaris-loan",
    // Navigated by the Lifetime flows cursor through "Sync to chart": no Dates.
    dates: false,
  });
  const previousOf = useMemo(() => {
    const m = new Map<string, PolarisLoanEventRow | null>();
    let prev: PolarisLoanEventRow | null = null;
    for (const l of touches) {
      m.set(l.event_key, prev);
      if (l.event_type !== "transfer") prev = l;
    }
    return m;
  }, [touches]);
  const holder = chain?.owner ?? row?.holder ?? null;

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!row)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this loan just now. Reload the page to try again.
      </div>
    );

  return (
    <FlowFocusContext.Provider value={flows ? flowFocus : null}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="polaris"
          wallet={holder}
          owner={{
            wallet: holder,
            href: holder ? `${POLARIS_LOANS_PATH}?q=${holder}` : undefined,
            wrap: chain?.owner
              ? (pill) => (
                  <Prov info={loanLiveProv("owner")} value={chain.owner ?? undefined}>
                    {pill}
                  </Prov>
                )
              : undefined,
          }}
          fallbackHref={POLARIS_LOANS_PATH}
          assets={stripAssets}
          closed={!open}
          tools={false}
        />
        <PolarisLoanCard
          row={row}
          lifetime={lifetime}
          now={now}
          pending={open && !chainSettled}
          explanation={
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
              <li>
                A reserve loan borrows WETH from Polaris&rsquo;s reserve against {FPETH.symbol}, the floor part of pETH,
                whose price in WETH the protocol only raises.
              </li>
              <li>
                The debt is a number of shares in the reserve&rsquo;s debt. Each fee the reserve charges raises the debt
                per share, so the debt grows with no action on the loan.
              </li>
              <li>The loans manager has no liquidation.</li>
            </ul>
          }
        />
        <LifetimeFlowsPanel
          scrubber={flows ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
          read={flows ? "done" : "reading"}
          explanation={
            <div className="space-y-2 text-sm text-rb-500">
              <PolarisLoanFlowsNote accrued={accrued} />
            </div>
          }
          learnMore={polarisLoanFlowsContent()}
        />
        {failed && <p className="text-sm text-rb-500">The operations could not be read just now.</p>}
        <ChainTruthTimeline
          persistKeyPrefix="polaris-loan"
          closed={!open}
          tl={tl}
          displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
          emptyLabel="No operations recorded for this loan"
          toolbarLeading={<TimelineActivityHeader events={events} closed={!open} />}
          renderCard={(event, meta) => {
            const r = rowById.get(event.id);
            return r ? (
              <PolarisLoanEventCard
                row={r}
                previous={previousOf.get(r.event_key) ?? null}
                holder={row.holder}
                isLast={meta.isLast}
              />
            ) : null;
          }}
        />
        <ProvInspectorLayer />
      </div>
    </FlowFocusContext.Provider>
  );
}
