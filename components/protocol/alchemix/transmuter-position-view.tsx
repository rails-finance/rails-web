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
import { useParams } from "next/navigation";
import { useMountedNow } from "@/hooks/useMountedNow";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { ChainTruthTimeline, type TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { PositionCard, type PositionCardSlots } from "@/components/shared/position-card";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { formatUnitsExact } from "@/lib/utils/format";
import type { TransmuterClaimValue } from "@/lib/sources/chain/alchemix-claim-value";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { useWalletContext } from "@/components/nav/wallet-context";
import { isTransmuterEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { alchemixPositionName } from "@/lib/alchemix/naming";
import { alchemixExplorer } from "@/lib/alchemix/explorer";
import { linesForChain, transmuterPositionPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import { transmuterEmittedProv, transmuterMaturityProv } from "@/lib/alchemix/transmuter-provenance";
import { computeTransmuterEconomics } from "@/lib/alchemix/transmuter-economics";
import { transmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";
import { logIndexOf, splitRidingTransfers, withRiders } from "@/lib/alchemix/riding-transfers";
import {
  transmuterClaimedByPrefix,
  transmuterHeads,
  transmuterMaturityEstimate,
  transmuterOutcome,
  transmuterPanel,
  transmuterStatus,
  type TransmuterCardProvs,
} from "@/components/protocol/alchemix/transmuter-position-card";
import { AlchemixIdentity } from "@/components/protocol/alchemix/alchemix-position-card";
import { AlchemixMenuRows } from "@/components/protocol/alchemix/alchemix-menu-rows";
import {
  TransmuterEventCard,
  coordsForTransmuterLeg,
  earlyClaimSentence,
  type TransmuterEvent,
} from "@/components/protocol/alchemix/transmuter-event-card";
import type { AlchemixTransmuterPositionData } from "@/types/api/alchemix";

/** The asset under each line's vault, at its decimals. */
const UNDERLYING_DECIMALS: Record<string, number> = { USDC: 6, WETH: 18 };

const fmt2 = (exact: string) => Number(exact).toLocaleString("en-US", { maximumFractionDigits: 2 });

function claimValueProv(
  v: TransmuterClaimValue,
  mytSymbol: string,
  underlying: string,
  decimals: number,
  chainId: number,
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    source: { block: v.block },
    contract: { name: `${mytSymbol} vault`, address: v.vault },
    summary: `${underlying} the payout was worth — the ${mytSymbol} vault's convertToAssets of the ${mytSymbol} the claim paid out, at the claim's block`,
    via: `convertToAssets(${v.sharesRaw}) @ block ${v.block}: ${v.assetsRaw}`,
    verify: {
      kind: "recompute",
      text: `To check: ask any ${chainId === 1 ? "Ethereum" : "Base"} archive node for convertToAssets(${v.sharesRaw}) on ${v.vault} at block ${v.block}.`,
    },
    scaling: { raw: v.assetsRaw, from: "call", places: decimals, why: `${underlying} carries ${decimals} decimals` },
  };
}

export function TransmuterPositionView({
  deployment,
  position,
  claimValue = null,
}: {
  deployment: AlchemixDeployment;
  position: AlchemixTransmuterPositionData<BaseActivityEvent>;
  /** The payout's convertToAssets at the claim's block, read on the server. */
  claimValue?: TransmuterClaimValue | null;
}) {
  const registry = useReceiptRegistry();
  // The event route (rails-ops TO-DO-ui-jobs 236): the sub-nav and the event's
  // card in page mode, nothing else.
  const onEventPage = useParams<{ eventId?: string }>()?.eventId != null;
  const p = position;
  const mytSymbol = p.claim?.claimed?.symbol ?? p.mytSymbol ?? "vault shares";
  const holder = p.owner ?? p.claim?.claimer ?? null;
  // Who held the position (its creator, its owner, the address that claimed
  // it): a leg one of them sent paid the gas.
  const holders = useMemo(
    () => [p.creator, p.owner, p.claim?.claimer].flatMap((a) => (a ? [a.toLowerCase()] : [])),
    [p.creator, p.owner, p.claim?.claimer],
  );
  const now = useMountedNow();
  const maturity = transmuterMaturityEstimate(p, now == null ? null : now * 1000);

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

  // The NFT's mint rides on the stake's card and its hand-over and burn on the
  // claim's, so the timeline counts those cards and not the transfers inside.
  const { drawn, ridersByTx } = useMemo(() => splitRidingTransfers(events, () => true), [events]);
  const olderCount = p.eventsTruncated ? Math.max(0, p.eventCount - events.length) : 0;
  const tl = useTimelineEvents(drawn, {
    storageKey: `alchemix-transmuter-${p.lineKey}-${p.nftId}`,
    protocolKey: "alchemix-v3",
    olderCount,
  });

  const early = useMemo(() => transmuterEarlyClaim(p), [p]);

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
          const legs = withRiders(
            (run.filter(isTransmuterEvent) as TransmuterEvent[]).sort((a, b) => logIndexOf(a) - logIndexOf(b)),
            ridersByTx,
          );
          return (
            <TransmuterEventCard
              key={legs[0].id}
              legs={legs}
              mytSymbol={mytSymbol}
              holders={holders}
              isLast={meta.isLast}
              early={early}
            />
          );
        },
      },
    ],
    [mytSymbol, ridersByTx, early, holders],
  );

  const economics = useMemo(
    () => (p.eventsTruncated ? null : computeTransmuterEconomics(p, { stake: stakeCoords, claim: claimCoords })),
    [p, stakeCoords, claimCoords],
  );

  const name = alchemixPositionName(p.syntheticSymbol, p.nftId, "transmuter");

  // The card's slots (rails-ops TO-DO-position-card 322, 323): Deposited and
  // Matures at as the heads; the panel while outstanding, the outcome once
  // claimed. What a Transmuter position is, and an early claim's cost, are
  // the Explanation.
  const provs: TransmuterCardProvs = {
    staked: transmuterEmittedProv("amount_staked", p.staked.symbol, p.staked.raw, stakeCoords),
    maturity: transmuterMaturityProv(p.maturity.startBlock, p.maturity.maturationBlock, stakeCoords, maturity),
    claimed:
      claimCoords && p.claim?.claimed
        ? transmuterEmittedProv("amount_claimed", mytSymbol, p.claim.claimed.raw, claimCoords)
        : undefined,
    returned:
      claimCoords && p.claim?.unclaimed
        ? transmuterEmittedProv("amount_unclaimed", p.claim.unclaimed.symbol, p.claim.unclaimed.raw, claimCoords)
        : undefined,
  };
  // What the payout was worth (call 6): Alchemix's docs pay one unit of the
  // asset underneath for each alAsset vested, and the claim block's
  // convertToAssets shows what the shares paid out came to.
  const underlying = linesForChain(deployment.chainId).find((l) => l.key === p.lineKey)?.underlying ?? null;
  const underlyingDecimals = underlying ? UNDERLYING_DECIMALS[underlying] : undefined;
  const vestedRaw =
    p.claim?.unclaimed != null
      ? (early?.convertedRaw ??
        (BigInt(p.staked.raw.split(".")[0]) - BigInt(p.claim.unclaimed.raw.split(".")[0])).toString())
      : null;
  const payoutValue =
    claimValue && underlying && underlyingDecimals != null && p.claim?.claimed && vestedRaw ? (
      <p>
        The claim paid out {fmt2(formatUnitsExact(claimValue.sharesRaw, 18))} {mytSymbol}, worth{" "}
        <Prov
          info={claimValueProv(claimValue, mytSymbol, underlying, underlyingDecimals, deployment.chainId)}
          value={formatUnitsExact(claimValue.assetsRaw, underlyingDecimals)}
          symbol={underlying}
        >
          {fmt2(formatUnitsExact(claimValue.assetsRaw, underlyingDecimals))} {underlying}
        </Prov>{" "}
        at block {p.claim.blockNumber.toLocaleString("en-US")}, for {fmt2(formatUnitsExact(vestedRaw, 18))}{" "}
        {p.syntheticSymbol} vested. Alchemix&rsquo;s docs describe a claim as paying one unit of the asset underneath
        for each alAsset vested.
      </p>
    ) : null;
  const explanation = (
    <div className="space-y-2">
      <p>
        A Transmuter position holds {p.syntheticSymbol} until a maturity counted in blocks, vesting a little every
        block, and a claim pays out the vested part in {mytSymbol}. The holder can claim before maturity: the claim then
        returns the part not yet vested as {p.syntheticSymbol}, less an early exit fee, so claiming early gives up
        vesting that part and pays the fee on it. Every figure here is one of the Transmuter&rsquo;s events, replayed,
        or arithmetic over them
        {payoutValue
          ? ", except the payout's value below, read from the vault at the claim's block."
          : "; none is read from the contract at a block."}
      </p>
      {early && p.claim?.claimed ? (
        <p>
          {earlyClaimSentence(early, p.syntheticSymbol, mytSymbol, p.claim.claimed.raw, false)} The claim&rsquo;s card
          below carries the arithmetic.
        </p>
      ) : null}
      {payoutValue}
      {p.owner ? (
        <p>
          The position is a token that can be sold until it is claimed, so the address above is who holds it now and
          need not be who deposited.
        </p>
      ) : null}
    </div>
  );
  const outcome = transmuterOutcome(p, provs, claimed?.timestamp ?? null);
  const common = {
    surface: "detail" as const,
    status: transmuterStatus(p),
    identity: <AlchemixIdentity name={name} chain={p.chainName ?? `chain ${p.chainId}`} />,
    heads: transmuterHeads(p, maturity, provs),
    counters: null,
    explainer: { body: explanation, viewHref: tl.viewHref },
    learnMore: null,
    menu: {
      leading: () => (
        <AlchemixMenuRows
          idTitle={`Position #${p.nftId}`}
          idValue={p.nftId}
          idSubtitle="Copy the position ID"
          outside={
            p.transmuterUrl
              ? {
                  title: "The market's Transmuter",
                  subtitle: "Open the contract on the explorer",
                  url: p.transmuterUrl,
                }
              : null
          }
          pagePath={transmuterPositionPath(deployment, p.lineKey, p.nftId)}
        />
      ),
      exports: null,
    },
  };
  const cardSlots: PositionCardSlots = outcome
    ? { ...common, outcome }
    : { ...common, panel: transmuterPanel(p, maturity) };

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6 py-8">
        <DetailTopRow
          session={deployment.session}
          wallet={holder}
          owner={{
            wallet: holder,
            chain: deployment.chainId,
            prefix: p.owner ? undefined : <span>{transmuterClaimedByPrefix(p)}</span>,
          }}
          closed={p.status === "claimed"}
          // The card's ⋮ carries the menu; an event page draws no Tools.
          tools={false}
        />

        {/* ── The position card ──────────────────────────────────────────── */}
        {!onEventPage && <PositionCard slots={cardSlots} />}

        {/* ── Lifetime flows ─────────────────────────────────────────────── */}
        {onEventPage ? null : economics ? (
          <ChainTruthTower data={economics} title="Lifetime flows" />
        ) : (
          <p className="rounded-md border border-dashed border-rb-300/50 px-4 py-6 text-center text-[11px] leading-relaxed text-rb-400 dark:border-rb-700/50">
            This position has more events than the page draws, so no lifetime totals are given.
          </p>
        )}

        {/* ── The timeline ───────────────────────────────────────────────── */}
        <ChainTruthTimeline
          persistKeyPrefix="alchemix-v3"
          eventPage={(slot) =>
            alchemixExplorer.eventPage({
              ...slot,
              deployment,
              kind: "transmuter",
              lineName: p.lineDisplayName,
              syntheticSymbol: p.syntheticSymbol,
              id: p.nftId,
              owner: holder,
              claimed: p.owner == null,
              rows: events,
            })
          }
          closed={p.status === "claimed"}
          tl={tl}
          runs={runs}
          boundary={null}
          displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
          emptyLabel="No events recorded for this position"
          toolbarLeading={
            <TimelineActivityHeader events={drawn} closed={p.status === "claimed"} tenurePending={olderCount > 0} />
          }
          renderCard={(event, meta) => {
            if (!isTransmuterEvent(event)) return null;
            return (
              <TransmuterEventCard
                legs={withRiders([event as TransmuterEvent], ridersByTx)}
                mytSymbol={mytSymbol}
                holders={holders}
                isLast={meta.isLast}
                eventNumber={meta.eventNumber}
                early={early}
              />
            );
          }}
        />
      </div>
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}
