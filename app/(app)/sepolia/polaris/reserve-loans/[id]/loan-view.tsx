"use client";

// A Polaris reserve loan's page, in the three sections
// (rails-ops standards/detail-page-anatomy.md): the card, the Lifetime flows
// tower (lib/polaris/loan-flows.ts), the timeline. The loans manager's
// getters at head (/api/chain/polaris/reserve-loan) are the card's figures
// and the tower's accrued fees; the index holds the touches. The price strip
// quotes fpETH at the floor, in WETH, the debt's unit.

import { useEffect, useMemo, useState } from "react";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { EventDateContext } from "@/components/shared/event-time";
import { SpineTipContext } from "@/components/shared/spine-column";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { PolarisLoanCard, type PolarisLoanNow } from "@/components/protocol/polaris/polaris-loan-card";
import { PolarisLoanEventCard } from "@/components/protocol/polaris/polaris-sp-loan-event-cards";
import { fetchPolarisLoanChain, type PolarisLoanChain } from "@/lib/api/fetch-polaris-sp-loans-chain";
import { FPETH } from "@/lib/polaris/asset-catalog";
import { POLARIS_LOANS_PATH } from "@/lib/polaris/routes";
import { atFloor, big, loanLifetime, max0, pendingFee, units } from "@/lib/polaris/sp-loan-math";
import { polarisLoanTower } from "@/lib/polaris/loan-flows";
import { loanLiveProv } from "@/lib/polaris/sp-loan-provenance";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { CARD_INSET_START, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  readPolarisSpLoans,
  type PolarisLoanEventRow,
  type PolarisLoanTimelineResponse,
} from "@/lib/sources/api/polaris-sp-loans";

const PAGE = 50;

const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;

export default function LoanView({ loanId, initial }: { loanId: string; initial: PolarisLoanTimelineResponse | null }) {
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
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

  const tower = useMemo(
    () => (lifetime ? polarisLoanTower(lifetime, open && chain ? pendingFee(chain.debtRaw, lifetime) : null) : null),
    [lifetime, chain, open],
  );

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

  const newestFirst = useMemo(() => [...touches].reverse(), [touches]);
  const previousOf = useMemo(() => {
    const m = new Map<string, PolarisLoanEventRow | null>();
    let prev: PolarisLoanEventRow | null = null;
    for (const l of touches) {
      m.set(l.event_key, prev);
      if (l.event_type !== "transfer") prev = l;
    }
    return m;
  }, [touches]);
  const registry = useReceiptRegistry();
  const holder = chain?.owner ?? row?.holder ?? null;

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!row)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this loan just now. Reload the page to try again.
      </div>
    );

  const total = data?.totalEvents ?? touches.length;
  const visible = newestFirst.slice(0, shown);
  return (
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
      {tower && <ChainTruthTower data={tower} />}

      <section className="space-y-4" data-anatomy="P3" aria-label="Activity">
        <div className={`flex flex-wrap items-baseline justify-between gap-2 ${CARD_INSET_START}`}>
          <h2 className={SECTION_HEADING}>Activity</h2>
          <span className="text-xs tabular-nums text-rb-500" data-loan-count="">
            {total.toLocaleString("en-US")} {total === 1 ? "operation" : "operations"}
          </span>
        </div>
        <ProvReceiptsScope registry={registry}>
          <div data-loan-rows="">
            {visible.map((r, i) => (
              <EventDateContext.Provider
                key={r.event_key}
                value={datePrefix(Number(r.block_timestamp), i > 0 ? Number(visible[i - 1].block_timestamp) : null)}
              >
                <SpineTipContext.Provider value={i === 0 ? "above" : null}>
                  <div id={`event-${r.event_key}`} data-event-id={r.event_key} data-row-at={r.block_timestamp}>
                    <PolarisLoanEventCard
                      row={r}
                      previous={previousOf.get(r.event_key) ?? null}
                      holder={row.holder}
                      isLast={i === visible.length - 1 && visible.length === newestFirst.length}
                    />
                  </div>
                </SpineTipContext.Provider>
              </EventDateContext.Provider>
            ))}
          </div>
        </ProvReceiptsScope>
        {failed && <p className="text-sm text-rb-500">The operations could not be read just now.</p>}
        {shown < newestFirst.length && (
          <div className={CARD_INSET_START}>
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex h-8 items-center rounded-full border border-teal-500/60 px-3 text-xs font-semibold text-teal-600 transition-colors hover:bg-teal-500/10 dark:text-teal-400"
              data-loan-more=""
            >
              Show {PAGE} more
            </button>
          </div>
        )}
      </section>
      <ProvInspectorLayer />
    </div>
  );
}
