"use client";

// One address's own events inside one Yearn V3 vault on Ethereum.
// ----------------------------------------------------------------------------
// The lifetime-flows tower above this states what the address has put in and
// taken out and what it holds now. This states how it got there: every
// `Transfer` the vault emitted about it, newest first, with the balance
// replayed from those logs and each row's share price read at that row's own
// block.
//
// ── THE GATE IS DRAWN BEFORE THE ROWS ARE ────────────────────────────────────
// Nothing renders until the replayed balance equals the vault's own
// `balanceOf`, wei-exact. On a mismatch this states BOTH figures and draws no
// rows — not a partial timeline, not one with a caveat under it. A failed check
// is a READING here, never an error state and never an empty list.
//
// ── NO SHELL AND NO ROW OF ITS OWN ───────────────────────────────────────────
// The rows are `components/vaults/vault-timeline-row.tsx` and the list is
// `ChainTruthTimeline`, both shared with the Aave and MetaMorpho vault
// timelines, because a row about an ERC-4626 `Transfer` is the same row in
// every family. So this surface gets the house toolbar, the type and asset
// filters, the date navigator, the render window and client run-collapse
// without a second implementation of any of them.
//
// What stays here is what is YEARN's: the gate's own prose, the sentence about
// why a harvest is not a row, and the receipts — because what a share price
// MEANS is the family's mechanic and belongs beside it
// (lib/yearn/vault-timeline-provenance.ts).
//
// Everything the shared row refuses to draw — no line through two prices, no
// USD, no APY, no annualised figure, no names on a row, no opinionated colour —
// is stated in that file and holds here.
//
// ⚠️ WINDOWING NEVER MOVES AN AGGREGATE, AND THERE ARE TWO WINDOWS. The inner
// one is `ChainTruthTimeline`'s render cap. The outer one is the loader's: a
// life longer than `VAULT_TIMELINE_DRAW_ROWS` hands this component its newest
// `VAULT_TIMELINE_DRAW_ROWS` rows and states both figures in `coverage.drawn`.
// Neither touches an aggregate — the gate is a signed sum over every log the
// sweeps returned, and the tower above is reduced over the WHOLE life on the
// server (`lib/aave-vaults/position-economics.ts`, called from the page).

import { useMemo } from "react";

import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { Prov } from "@/components/shared/provenance";
import { shareText } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { VaultTimelineRow, rawAmount as raw, type VaultTimelineProvKit } from "@/components/vaults/vault-timeline-row";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromVaultDrawn } from "@/lib/shared/timeline-boundary";
import { chainMeta } from "@/lib/shared/chains";
import { AAVE_VAULT_TIMELINE_KEY, aaveVaultTimelineRuns, vaultEventToActivity } from "@/lib/aave-vaults/timeline-runs";
import { YEARN_CHAIN_ID } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { YEARN_VAULT_TIMELINE_CEILING } from "@/lib/sources/chain/yearn-ethereum-vault-timeline";
import {
  yearnVaultTimelineAccrualProv,
  yearnVaultTimelineAssetsProv,
  yearnVaultTimelineBalanceAfterProv,
  yearnVaultTimelineBalanceBeforeProv,
  yearnVaultTimelineGateProv,
  yearnVaultTimelineHorizonProv,
  yearnVaultTimelineSharePriceProv,
  yearnVaultTimelineSharesProv,
} from "@/lib/yearn/vault-timeline-provenance";
import type { VaultHolderTimeline, VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";

const n = (v: number) => v.toLocaleString("en-US");

/** The five row receipts, as Yearn states them. */
const PROV: VaultTimelineProvKit = {
  shares: yearnVaultTimelineSharesProv,
  balanceAfter: yearnVaultTimelineBalanceAfterProv,
  balanceBefore: yearnVaultTimelineBalanceBeforeProv,
  assets: yearnVaultTimelineAssetsProv,
  sharePrice: yearnVaultTimelineSharePriceProv,
};

export interface YearnVaultTimelineProps {
  timeline: VaultHolderTimeline;
  vaultName: string | null;
  shareSymbol: string | null;
  assetSymbol: string;
}

export function YearnVaultTimeline({ timeline, vaultName, shareSymbol, assetSymbol }: YearnVaultTimelineProps) {
  const coords: VaultTimelineCoords = {
    blockNumber: timeline.blockNumber,
    vault: timeline.vault,
    vaultName: vaultName ?? undefined,
    assetSymbol,
    shareSymbol: shareSymbol ?? undefined,
    holder: timeline.holder,
  };
  const { reconcile } = timeline;
  const shareUnit = shareSymbol ?? "shares";
  const shareDecimals = timeline.events[0]?.shareDecimals ?? 18;
  const assetDecimals = timeline.events[0]?.assetDecimals ?? 18;
  const withheld = timeline.coverage.withheldAbove;
  // The outer window, when the life was longer than the client is handed.
  const window = timeline.coverage.drawn;
  const drawn = timeline.events.length > 0;

  // The row this page draws, found back from the coordinate record the shared
  // timeline hands to `renderCard`. The map is the one place the two shapes are
  // joined, and it is keyed by the id both carry.
  const byId = useMemo(() => new Map(timeline.events.map((e) => [e.id, e])), [timeline.events]);
  const activity = useMemo(
    () => timeline.events.map((e) => vaultEventToActivity(e, YEARN_CHAIN_ID, timeline.holder)),
    [timeline.events, timeline.holder],
  );
  const tl = useTimelineEvents(activity, {
    // The rows the loader's draw window left on the server, so numbering runs
    // over the whole life and the count line states the real total.
    olderCount: window ? window.of - window.rows : 0,
    olderCountIsFloor: timeline.coverage.logCountIsLowerBound,
    storageKey: `yearn-vault-${timeline.vault}-${timeline.holder}`,
    protocolKey: AAVE_VAULT_TIMELINE_KEY,
  });
  const runs = useMemo(
    () => aaveVaultTimelineRuns(byId, { shareUnit, assetSymbol, shareDecimals, assetDecimals }),
    [byId, shareUnit, assetSymbol, shareDecimals, assetDecimals],
  );
  // The boundary card (rails-ops decision 0019): the loader's draw window
  // stated as the last node on the spine. The share line is stated in this
  // page's own share unit — the loader holds decimals, not the symbol.
  const boundary = useMemo(() => {
    const b = boundaryFromVaultDrawn(window, timeline.coverage.logCountIsLowerBound);
    return b?.state ? { ...b, state: b.state.map((l) => ({ ...l, unit: shareUnit })) } : b;
  }, [window, timeline.coverage.logCountIsLowerBound, shareUnit]);

  return (
    <section className="mb-6" data-skel-section="vault-timeline" data-vault-timeline={timeline.holder}>
      <h2 className="text-sm font-semibold text-foreground">This address&rsquo;s own events in the vault</h2>

      {timeline.unread ? (
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-unread">
          The history of this address in this vault could not be read just now, so none is drawn. The figures above are
          unaffected: they are calls at block {n(timeline.blockNumber)} and were answered.
        </p>
      ) : withheld != null ? (
        // BEFORE the gate, because on the lower-bound path there is no gate to
        // report: the logs were never handed over, so there was nothing to
        // replay. Both shapes withhold every row.
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-horizon">
          <Prov
            info={yearnVaultTimelineHorizonProv(
              coords,
              withheld,
              YEARN_VAULT_TIMELINE_CEILING,
              timeline.coverage.logCountIsLowerBound,
              reconcile?.lane ?? chainMeta(YEARN_CHAIN_ID).logsRpcEnv,
            )}
          >
            This address has {timeline.coverage.logCountIsLowerBound ? "at least " : ""}
            {n(withheld)} of its own share transfers on this vault
          </Prov>
          , more than this lane builds in one request.{" "}
          {timeline.coverage.logCountIsLowerBound ? (
            <>
              The count is a floor rather than a census: the endpoint would not answer this address&rsquo;s whole sweep
              at once, so the range was walked in chunks and the walk stopped as soon as it passed what this page draws.
              Because the logs were never read whole, the balance check could not be run on this address at all.
            </>
          ) : (
            <>
              The whole history was read and it reconciles against the vault&rsquo;s own <code>balanceOf</code>; what is
              withheld is the drawing of it.
            </>
          )}{" "}
          The newest rows are not shown in place of the rest.
        </p>
      ) : !reconcile ? null : !reconcile.reconciled ? (
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-unreconciled">
          <Prov info={yearnVaultTimelineGateProv(coords, reconcile)}>
            This address&rsquo;s history in this vault could not be reconciled. Replaying every share transfer it sent
            or received gives {shareText(raw(reconcile.replayed, shareDecimals), shareDecimals)} {shareUnit} at block{" "}
            {n(reconcile.toBlock)}; the vault&rsquo;s own <code>balanceOf</code> at that block gives{" "}
            {shareText(raw(reconcile.onChain, shareDecimals), shareDecimals)}
          </Prov>
          . The two do not agree, so no history is drawn.
          {reconcile.refetched &&
            (reconcile.refetchDiffered
              ? " Both sweeps were run a second time and returned a different number of logs from the first, which is direct evidence of the lane answering one question two ways."
              : " Both sweeps were run a second time and returned the same number of logs.")}{" "}
          The figures above this are unaffected — they are calls at block {n(timeline.blockNumber)}, not a replay.
        </p>
      ) : (
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-reconciled">
          Every share transfer this address sent or received, newest first, replayed.{" "}
          <Prov info={yearnVaultTimelineGateProv(coords, reconcile)}>
            The replay gives {shareText(raw(reconcile.replayed, shareDecimals), shareDecimals)} {shareUnit} and{" "}
            <code>balanceOf</code> at block {n(reconcile.toBlock)} gives{" "}
            {shareText(raw(reconcile.onChain, shareDecimals), shareDecimals)}
          </Prov>
          , so the rows are drawn. Each states its own share price at its own block; no line joins two of them.
        </p>
      )}

      {drawn && (
        // The count on the wrapper is the set HANDED TO THIS COMPONENT, not the
        // hundred the render window paints. Where the loader's own window cut a
        // long life, `data-vault-timeline-of` states the life it was cut from —
        // two attributes because they are two figures.
        <div
          className="mt-4"
          data-vault-timeline-rows={timeline.events.length}
          {...(window ? { "data-vault-timeline-of": window.of } : {})}
        >
          <ChainTruthTimeline
            tl={tl}
            runs={runs}
            boundary={boundary}
            toolbarLeading="replayed from this address's own transfers"
            emptyLabel="No share transfers of this vault name this address."
            // The card-open memory's namespace, as the ROW spells it
            // (`${persistPrefix}:${vaultAddress}:${event.id}`) less the id the
            // shell appends. Pinned mode writes that key during render so the
            // one card a permalink draws arrives with its detail already open.
            // The two spellings must agree — a prefix that missed the vault
            // would force a key no card ever reads.
            persistKeyPrefix={`yearn-vault:${timeline.vault}`}
            renderCard={(event, meta) => {
              const row = byId.get(event.id);
              if (!row) return null;
              // NO share provider here. `ChainTruthTimeline` already wraps
              // every card it renders in one carrying that event's own
              // permalink, and this section's `event/[eventId]` route now
              // exists to receive it — so the copy-link control in
              // `EventCardFooter` is simply on. Until 2026-09-20 this nested
              // an EMPTY provider to shadow the shell's href and turn the
              // control off, because a copied link would have landed on a 404.
              return (
                <VaultTimelineRow
                  event={row}
                  coords={coords}
                  chainId={YEARN_CHAIN_ID}
                  shareUnit={shareUnit}
                  assetSymbol={assetSymbol}
                  vaultAddress={timeline.vault}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  prov={PROV}
                  persistPrefix="yearn-vault"
                  // A transfer whose two ends are this address moves nothing,
                  // so there is no flow to draw; the glyph says what the row
                  // is instead of leaving the spine slot empty.
                  icon={row.kind === "transfer-self" ? "no-change" : undefined}
                />
              );
            }}
          />
        </div>
      )}

      {drawn && (
        <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-rb-500" data-figure="timeline-accrual">
          <Prov info={yearnVaultTimelineAccrualProv(coords)}>
            A strategy&rsquo;s report moves the share price over time rather than at once, and is not a row here
          </Prov>
          . A row is something this address did.
        </p>
      )}
    </section>
  );
}
