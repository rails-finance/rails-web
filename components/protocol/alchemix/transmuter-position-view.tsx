"use client";

// One Transmuter position. The client half; the page above it is a server
// component that has already read the position and its whole event stream.
//
// THE ROSTER'S DETAIL ANATOMY, three sections (rails-ops
// standards/detail-page-anatomy.md): the position card, Lifetime flows, the
// timeline, drawn with the shared components.
//
// THREE THINGS THIS VIEW KEEPS.
//
// 1. NO GRADE AND NO READING. Every figure is one of the Transmuter's own logs,
//    replayed, and the card says so in a sentence. Nothing here is a getCDP
//    read, and no row carries a state-at-block.
//
// 2. MATURITY IS A BLOCK, stated against the block the line is indexed to.
//
// 3. THE POSITION IS A FREELY TRANSFERABLE NFT until the claim burns it, so
//    the holder shown is the holder now, and after the claim the page names
//    who claimed rather than a holder.

import { useEffect, useMemo } from "react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { ChainTruthTimeline, type TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { WalletPill } from "@/components/shared/wallet-pill";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { useWalletContext } from "@/components/nav/wallet-context";
import { isTransmuterEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { alchemixPositionName } from "@/lib/alchemix/naming";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import { transmuterEmittedProv, transmuterMaturityProv } from "@/lib/alchemix/transmuter-provenance";
import { computeTransmuterEconomics } from "@/lib/alchemix/transmuter-economics";
import {
  claimColumn,
  maturityColumn,
  stakedColumn,
  transmuterState,
} from "@/components/protocol/alchemix/transmuter-position-card";
import {
  TransmuterEventCard,
  coordsForTransmuterLeg,
  type TransmuterEvent,
} from "@/components/protocol/alchemix/transmuter-event-card";
import type { AlchemixTransmuterPositionData } from "@/types/api/alchemix";

const STATE_WORD = { maturing: "Maturing", matured: "Matured", claimed: "Claimed" } as const;

const logIndexOf = (e: BaseActivityEvent): number => {
  const n = Number(e.id.split(":").pop());
  return Number.isFinite(n) ? n : 0;
};

export function TransmuterPositionView({
  deployment,
  position,
}: {
  deployment: AlchemixDeployment;
  position: AlchemixTransmuterPositionData<BaseActivityEvent>;
}) {
  const registry = useReceiptRegistry();
  const p = position;
  const mytSymbol = p.claim?.claimed?.symbol ?? p.mytSymbol ?? "vault shares";
  const state = transmuterState(p);
  const holder = p.owner ?? p.claim?.claimer ?? null;

  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!holder) return;
    setWallets([holder.toLowerCase()], {});
  }, [holder, setWallets]);

  const events = useMemo(() => p.events.filter(isTransmuterEvent) as TransmuterEvent[], [p.events]);
  const created = events.find((e) => e.context.data.eventType === "transmuter_position_created");
  const claimed = events.find((e) => e.context.data.eventType === "transmuter_position_claimed");

  const base: AlchemixCoords = useMemo(
    () => ({ chainId: deployment.chainId, lineKey: p.lineKey, tokenId: p.nftId }),
    [deployment.chainId, p.lineKey, p.nftId],
  );
  const stakeCoords = created ? coordsForTransmuterLeg(created) : base;
  const claimCoords = claimed ? coordsForTransmuterLeg(claimed) : null;

  const olderCount = p.eventsTruncated ? Math.max(0, p.eventCount - events.length) : 0;
  const tl = useTimelineEvents(events, {
    storageKey: `alchemix-transmuter-${p.lineKey}-${p.nftId}`,
    protocolKey: "alchemix-v3",
    olderCount,
  });

  // One transaction, one card: a stake's mint and PositionCreated, a claim's
  // hop, burn and PositionClaimed.
  const runs: TimelineRunSpec[] = useMemo(
    () => [
      {
        asOneEvent: true,
        match: (e: BaseActivityEvent) => isTransmuterEvent(e),
        min: 2,
        sameRun: (prev: BaseActivityEvent, next: BaseActivityEvent) => prev.txHash === next.txHash,
        render: (run, meta) => {
          const legs = (run.filter(isTransmuterEvent) as TransmuterEvent[]).sort(
            (a, b) => logIndexOf(a) - logIndexOf(b),
          );
          return (
            <TransmuterEventCard
              key={legs[0].id}
              legs={legs}
              mytSymbol={mytSymbol}
              isFirst={meta.isFirst}
              isLast={meta.isLast}
            />
          );
        },
      },
    ],
    [mytSymbol],
  );

  const economics = useMemo(
    () => (p.eventsTruncated ? null : computeTransmuterEconomics(p, { stake: stakeCoords, claim: claimCoords })),
    [p, stakeCoords, claimCoords],
  );

  const name = alchemixPositionName(p.syntheticSymbol, p.nftId, "transmuter");

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6 py-8">
        <DetailTopRow session={deployment.session} wallet={holder} />

        {/* ── The position card ──────────────────────────────────────────── */}
        <PositionCardShell receipts>
          <OpenPositionStats
            statusPill={
              <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
                {STATE_WORD[state]}
              </span>
            }
            leadingIdentity={
              <>
                <span className="text-xs font-bold tracking-wide text-foreground/80">{name}</span>
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-rb-500">
                  <span>{p.chainName ?? `chain ${p.chainId}`}</span>
                  {holder ? (
                    <span className="inline-flex items-center gap-1.5">
                      {p.owner ? "held now by" : "claimed by"}
                      <WalletPill
                        wallet={holder}
                        ensName={null}
                        filterProtocol={deployment.session}
                        bookmarkProtocol={deployment.session}
                      />
                    </span>
                  ) : null}
                </span>
              </>
            }
            columns={[
              stakedColumn(p, transmuterEmittedProv("amount_staked", p.staked.symbol, p.staked.raw, stakeCoords)),
              maturityColumn(p, transmuterMaturityProv(p.maturity.startBlock, p.maturity.maturationBlock, stakeCoords)),
              claimColumn(
                p,
                claimCoords && p.claim
                  ? {
                      claimed: p.claim.claimed
                        ? transmuterEmittedProv("amount_claimed", mytSymbol, p.claim.claimed.raw, claimCoords)
                        : undefined,
                      returned: p.claim.unclaimed
                        ? transmuterEmittedProv(
                            "amount_unclaimed",
                            p.claim.unclaimed.symbol,
                            p.claim.unclaimed.raw,
                            claimCoords,
                          )
                        : undefined,
                    }
                  : undefined,
              ),
            ]}
          />
          <div className="mt-3 space-y-1.5">
            <p className="text-xs leading-relaxed text-rb-500">
              A Transmuter position locks {p.syntheticSymbol} until a maturity counted in blocks, and a claim pays out
              the converted part in {mytSymbol}. Every figure here is one of the Transmuter&rsquo;s own events,
              replayed; none is read from the contract at a block.
            </p>
            {p.owner ? (
              <p className="text-[11px] leading-relaxed text-rb-500">
                The position is a token that can be sold until it is claimed, so the address above is who holds it now
                and need not be who staked.
              </p>
            ) : null}
            {p.transmuterUrl ? (
              <a href={p.transmuterUrl} target="_blank" rel="noopener noreferrer" className="link inline-block text-xs">
                The line&rsquo;s Transmuter contract
              </a>
            ) : null}
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
          persistKeyPrefix="alchemix-v3"
          closed={p.status === "claimed"}
          tl={tl}
          runs={runs}
          boundary={null}
          displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
          emptyLabel="No events recorded for this position"
          toolbarLeading={
            <TimelineActivityHeader events={events} closed={p.status === "claimed"} tenurePending={olderCount > 0} />
          }
          renderCard={(event, meta) => {
            if (!isTransmuterEvent(event)) return null;
            return (
              <TransmuterEventCard
                legs={[event as TransmuterEvent]}
                mytSymbol={mytSymbol}
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
