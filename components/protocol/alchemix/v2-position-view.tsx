"use client";

// One Alchemix V2 position. The client half; the page above it is a server
// component that has already read the account and its whole event stream.
//
// THE ROSTER'S DETAIL ANATOMY, three sections (rails-ops
// standards/detail-page-anatomy.md): the position card, Lifetime flows, the
// timeline, drawn with the shared components.
//
// THREE THINGS THIS VIEW KEEPS (rails-ops reference/alchemix-v2-frozen-record.md).
//
// 1. CLOSED AT 2026-04-02. Every figure is the Alchemist's own read at the
//    frozen block, and the page says so once, on the card.
//
// 2. THE V3 SUCCESSOR IS A LINK AND NOTHING MORE. No V3 figure is read or
//    drawn here, so no total on this page can hold one.
//
// 3. THE SWEPT COLLATERAL IS A SENTENCE. It left for the DAO Safe that day, in
//    one transaction per line, and appears in no figure.

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { WalletPill } from "@/components/shared/wallet-pill";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { StatValue, StatFootnote } from "@/components/shared/stat-value";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { useWalletContext } from "@/components/nav/wallet-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatHeadlineAmount, formatUnitsExact } from "@/lib/utils/format";
import { isAlchemixV2Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { alchemixV2PositionName } from "@/lib/alchemix/naming";
import { v3PositionPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import { v2FrozenDebtProv, v2SharesProv, v2UnderlyingProv, type AlchemixV2Coords } from "@/lib/alchemix/v2-provenance";
import { computeAlchemixV2Economics, v2CreditTotalsWithheld } from "@/lib/alchemix/v2-economics";
import {
  V2ClosedPill,
  closedOn,
  v2CollateralColumn,
  v2DebtColumn,
  v3SuccessorLinks,
} from "@/components/protocol/alchemix/v2-position-card";
import { AlchemixV2EventCard, type AlchemixV2Event } from "@/components/protocol/alchemix/v2-event-card";
import type { AlchemixV2PositionData } from "@/types/api/alchemix";

const block = (n: number) => n.toLocaleString("en-US");

export function AlchemixV2PositionView({
  deployment,
  position,
}: {
  deployment: AlchemixDeployment;
  position: AlchemixV2PositionData<BaseActivityEvent>;
}) {
  const registry = useReceiptRegistry();
  const p = position;
  const chainId = deployment.chainId as ChainId;

  const { setWallets } = useWalletContext();
  useEffect(() => {
    setWallets([p.account.toLowerCase()], {});
  }, [p.account, setWallets]);

  const coords: AlchemixV2Coords = useMemo(
    () => ({ chainId, lineKey: p.lineKey, account: p.account }),
    [chainId, p.lineKey, p.account],
  );

  const events = useMemo(() => p.events.filter(isAlchemixV2Event) as AlchemixV2Event[], [p.events]);
  const olderCount = p.eventsTruncated ? Math.max(0, p.eventCount - events.length) : 0;
  const tl = useTimelineEvents(events, {
    storageKey: `alchemix-v2-${p.lineKey}-${p.account}`,
    protocolKey: "alchemix-v2",
    olderCount,
  });

  const economics = useMemo(
    () => (p.eventsTruncated ? null : computeAlchemixV2Economics(p, events, coords)),
    [p, events, coords],
  );
  const creditWithheld = useMemo(() => v2CreditTotalsWithheld(events), [events]);

  const debtProv = p.frozenDebt
    ? v2FrozenDebtProv(p.syntheticSymbol, p.frozenDebt.raw, p.frozenDebt.asOfBlock, coords)
    : undefined;
  const underlyingProvAt = (i: number) => {
    const c = p.collateral[i];
    const u = c?.underlying;
    if (!c || !u) return undefined;
    return v2UnderlyingProv(
      u.symbol,
      u.raw,
      u.decimals,
      c.yieldToken.symbol,
      c.yieldToken.decimals,
      u.perShareRaw,
      p.frozenAtBlock,
      coords,
    );
  };
  const held = p.collateral.filter((c) => c.underlying && !c.readStale);
  const successorHref = (lineKey: string, tokenId: string) => v3PositionPath(deployment, lineKey, tokenId);

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6 py-8">
        <DetailTopRow session={deployment.session} wallet={p.account} />

        {/* ── The position card ──────────────────────────────────────────── */}
        <PositionCardShell receipts>
          <OpenPositionStats
            statusPill={<V2ClosedPill />}
            leadingIdentity={
              <>
                <span className="text-xs font-bold tracking-wide text-foreground/80">
                  {alchemixV2PositionName(p.syntheticSymbol, p.account)}
                </span>
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-rb-500">
                  <span>{p.chainName ?? `chain ${p.chainId}`}</span>
                  <WalletPill
                    wallet={p.account}
                    ensName={null}
                    filterProtocol={deployment.session}
                    bookmarkProtocol={deployment.session}
                  />
                </span>
              </>
            }
            columns={[
              v2DebtColumn(p, debtProv),
              v2CollateralColumn(p, underlyingProvAt),
              {
                label: "Now on V3",
                value:
                  p.v3Successors.length > 0 ? (
                    <StatValue>{v3SuccessorLinks(p, successorHref)}</StatValue>
                  ) : (
                    <StatValue color="text-rb-500">None</StatValue>
                  ),
                footnote:
                  p.v3Successors.length > 0 ? (
                    <StatFootnote>held by this wallet now</StatFootnote>
                  ) : (
                    <StatFootnote>this wallet holds no V3 position on {p.syntheticSymbol}</StatFootnote>
                  ),
              },
            ]}
          />

          <div className="mt-3 space-y-1.5">
            {/* Every token the account held at close, where there is more than
                the one the column leads with. Each at its own decimals. */}
            {held.length > 1 ? (
              <ul className="space-y-0.5 text-[11px] leading-relaxed text-rb-500">
                {held.map((c) => {
                  const u = c.underlying!;
                  const i = p.collateral.indexOf(c);
                  return (
                    <li key={c.yieldToken.address} className="tabular-nums">
                      <Prov
                        info={v2SharesProv(
                          c.yieldToken.symbol,
                          c.yieldToken.address,
                          c.shares.raw,
                          c.yieldToken.decimals,
                          p.frozenAtBlock,
                          coords,
                        )}
                        value={formatUnitsExact(c.shares.raw, c.yieldToken.decimals)}
                        symbol={c.yieldToken.symbol}
                      >
                        {formatHeadlineAmount(c.shares.formatted)} {c.yieldToken.symbol} shares
                      </Prov>
                      , worth{" "}
                      <Prov info={underlyingProvAt(i)!} value={formatUnitsExact(u.raw, u.decimals)} symbol={u.symbol}>
                        {formatHeadlineAmount(u.formatted)} {u.symbol}
                      </Prov>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <p className="text-xs leading-relaxed text-rb-500">
              Alchemix V2 was wound down on {closedOn(p.closedAt)}. The figures above are the Alchemist&rsquo;s own
              reading at block {block(p.frozenAtBlock)}, and nothing has moved them since. That day the collateral was
              swept to the{" "}
              <a
                href={explorerUrl(chainId, "address", p.closure.sweptTo)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-muted"
              >
                Alchemix DAO Safe
              </a>
              {p.closure.sweepTxHash ? (
                <>
                  {" "}
                  in{" "}
                  <a
                    href={explorerUrl(chainId, "tx", p.closure.sweepTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-muted"
                  >
                    one transaction
                  </a>
                </>
              ) : null}
              {p.v3Successors.length > 0
                ? ", and the V3 position this wallet holds is what this one became. The two are one obligation at two points in time, so no figure here is added to a V3 one."
                : "."}
            </p>
            {economics ? (
              <p className="text-[11px] leading-relaxed text-rb-500">
                V2 paid debt down every block from the collateral&rsquo;s harvested yield, with no log at those blocks,
                so the flows below do not add up to the debt at close.
                {creditWithheld
                  ? " A repayment or liquidation logged before 11 May 2022 does not state the debt it cleared, so no total of either is given."
                  : ""}
              </p>
            ) : null}
            {p.v3Successors.length > 0 ? null : (
              <Link href={deployment.basePath} className="link inline-block text-xs">
                Browse V3 positions
              </Link>
            )}
          </div>
        </PositionCardShell>

        {/* ── Lifetime flows ─────────────────────────────────────────────── */}
        {economics ? (
          <ChainTruthTower data={economics} title="Lifetime flows" />
        ) : (
          <p className="rounded-md border border-dashed border-rb-300/50 px-4 py-6 text-center text-[11px] leading-relaxed text-rb-400 dark:border-rb-700/50">
            This position has more events than the page draws, so no lifetime totals are given.
          </p>
        )}

        {/* ── The timeline ───────────────────────────────────────────────── */}
        <ChainTruthTimeline
          persistKeyPrefix="alchemix-v2"
          closed
          tl={tl}
          boundary={null}
          displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
          emptyLabel="No events recorded for this position"
          toolbarLeading={<TimelineActivityHeader events={events} closed tenurePending={olderCount > 0} />}
          renderCard={(event, meta) => {
            if (!isAlchemixV2Event(event)) return null;
            return (
              <AlchemixV2EventCard
                event={event as AlchemixV2Event}
                isFirst={meta.isFirst}
                isLast={meta.isLast}
                eventNumber={meta.eventNumber}
              />
            );
          }}
        />
      </div>
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}
