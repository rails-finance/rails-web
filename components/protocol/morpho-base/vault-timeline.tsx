"use client";

// One address's own events inside one MetaMorpho vault on Base.
// ----------------------------------------------------------------------------
// The attributed-exposure section above this states a READING at the page's
// block — shares, share of the vault, claim, and a slice of each Blue market
// the curator put the pool into. This states how the address got there: every
// `Transfer` the vault emitted about it, newest first, with the balance
// replayed from those logs, each row's share price read at that row's own
// block, and the supply that share was a share OF read at the same block.
//
// ── AND WHAT THE CLAIM SAT IN, ROW BY ROW ────────────────────────────────────
// Each row carries an allocation band: the markets the vault's asset sat in at
// THAT ROW's block, divided by this address's proportional slice of each. It is
// a read at the row's block and at no other — nothing is drawn between two
// rows, the curator's reallocations are read nowhere, and the page says both in
// words once, under the first band. `components/protocol/morpho-base/
// vault-allocation-band.tsx` holds it and states the rules it keeps. The band
// is never stored: it is re-read on every request over the newest rows of the
// whole life, so a page served partly out of the store draws the same bands a
// cold one does.
//
// ── THE GATE IS DRAWN BEFORE THE ROWS ARE ────────────────────────────────────
// Nothing renders until the replayed balance equals the vault's own
// `balanceOf`, wei-exact. On a mismatch this states BOTH figures and draws no
// rows — not a partial timeline, not one with a caveat under it. The reason is
// measured: a wide-range logs lane has answered a whole-life query with an HTTP
// 200 and a fraction of the true answer on this very chain, and a page that
// drew "what it got" would have presented that as a life.
//
// ── AND THE ROWS ARE WITHHELD BEFORE THE GATE IS ─────────────────────────────
// One address on the case-study vault is too large for its own sweep to be
// answered at all: the fee recipient, which holds 12.7% of the vault's whole
// `Transfer` stream because MetaMorpho mints performance-fee shares to it
// inside nearly every deposit and withdrawal. There the count is a FLOOR from a
// chunked walk and the gate could not run, so the horizon statement comes
// FIRST — before the gate's — and says which of the two it has. An ordinary
// address above the horizon has an exact count and a gate that ran and agreed.
//
// ── NO SHELL OF ITS OWN ──────────────────────────────────────────────────────
// The rows are `components/vaults/vault-timeline-row.tsx`, shared with the Aave
// vault timeline on Ethereum: a row about a `Transfer` is the same row on
// either chain. What lives here is what is MetaMorpho's — the gate's prose, the
// share of the vault a row carries, the vault-wide notes, and the receipts.
// Everything that surface refuses to draw (no line through two prices, no USD,
// no APY, no names on a row, no opinionated colour) is stated there and holds
// here.
//
// ── AND NO LIST OF ITS OWN EITHER ────────────────────────────────────────────
// The rows ride `ChainTruthTimeline`, the same shell every other detail page in
// the tier uses, so this surface gets the house toolbar (count, sort flip, type
// filter, date range, display menu), the render window and run collapse without
// a second implementation of any of them. What is passed in is a coordinate
// record per row and a closure that draws the real row back from this page's
// own id → event map. Both come from `lib/aave-vaults/timeline-runs.tsx`: that
// module's subject is the shared `VaultHolderEvent` grammar, which is this
// chain's rows as much as the other's, and its filter key names that grammar's
// label table rather than a roster.
//
// ⚠️⚠️ WINDOWING NEVER MOVES AN AGGREGATE. The window is a RENDER cap and
// nothing else: the lifetime-flows tower above these rows is computed from
// `timeline.events` — the whole life — and the gate below is `reconcile`, a
// signed sum over every log the sweep returned. Neither reads what is painted.

import { useMemo } from "react";

import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { VaultAllocationBand, VaultAllocationDetail } from "@/components/protocol/morpho-base/vault-allocation-band";
import { Prov } from "@/components/shared/provenance";
import { StatCard, pctText, shareText } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { VaultTimelineRow, rawAmount as raw, type VaultTimelineProvKit } from "@/components/vaults/vault-timeline-row";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromVaultDrawn } from "@/lib/shared/timeline-boundary";
import { AAVE_VAULT_TIMELINE_KEY, aaveVaultTimelineRuns, vaultEventToActivity } from "@/lib/aave-vaults/timeline-runs";
import { BASE_CHAIN_ID, chainMeta } from "@/lib/shared/chains";
import { vaultTermsNotes, type MarketNote } from "@/lib/shared/market-note";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import {
  morphoVaultTimelineAccrualProv,
  morphoVaultTimelineAssetsProv,
  morphoVaultTimelineBalanceAfterProv,
  morphoVaultTimelineBuildingProv,
  morphoVaultTimelineExponentProv,
  morphoVaultTimelineGateProv,
  morphoVaultTimelineHorizonProv,
  morphoVaultTimelineNoteProv,
  morphoVaultTimelineShareOfVaultProv,
  morphoVaultTimelineSharePriceProv,
  morphoVaultTimelineSharesProv,
  morphoVaultTimelineStoredRowsProv,
} from "@/lib/morpho-base/vault-timeline-provenance";
import {
  tailMaxRows,
  type MorphoVaultNote,
  type VaultHolderEvent,
  type VaultHolderTimeline,
  type VaultNote,
  type VaultTimelineCoords,
} from "@/lib/shared/vault-holder-timeline";

const n = (v: number) => v.toLocaleString("en-US");

/** The four row receipts, as MetaMorpho states them. */
const PROV: VaultTimelineProvKit = {
  shares: morphoVaultTimelineSharesProv,
  balanceAfter: morphoVaultTimelineBalanceAfterProv,
  assets: morphoVaultTimelineAssetsProv,
  sharePrice: morphoVaultTimelineSharePriceProv,
};

/** This loader emits exactly the three configuration events below and no
 *  others, so this narrowing drops nothing — it is how the shared note shape,
 *  which also carries Aave's kinds on Ethereum, is read as MetaMorpho's. */
const isMorphoNote = (note: VaultNote): note is MorphoVaultNote =>
  note.kind === "fee" || note.kind === "vault-name" || note.kind === "vault-symbol";

/** The supply this address's balance was a share of at a row's own block.
 *  `extra` is discriminated, so Umbrella's cooldown arm cannot be read as one. */
const supplyAt = (event: VaultHolderEvent): string | null =>
  event.extra?.kind === "metamorpho" ? event.extra.totalSupplyAtBlock : null;

export interface MorphoBaseVaultTimelineProps {
  timeline: VaultHolderTimeline;
  vaultName: string | null;
  shareSymbol: string | null;
  assetSymbol: string;
  /** Read at the page's block, so the exponent every row's price is asked with
   *  can be stated rather than assumed. Null where the vault did not answer
   *  `DECIMALS_OFFSET()`. */
  decimalsOffset: number | null;
}

export function MorphoBaseVaultTimeline({
  timeline,
  vaultName,
  shareSymbol,
  assetSymbol,
  decimalsOffset,
}: MorphoBaseVaultTimelineProps) {
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
  const assetDecimals = timeline.events[0]?.assetDecimals ?? 0;
  const withheld = timeline.coverage.withheldAbove;
  const building = timeline.history?.building;
  // The loader's own window, when the life was longer than the client is
  // handed. See the shared type's `coverage.drawn`.
  const window = timeline.coverage.drawn;
  const drawn = timeline.events.length > 0;
  // The vault's own terms, as notes the shell places among the rows by block.
  // Memoised because a fresh array identity per render recomputes the
  // anchoring — the prop's own instruction.
  const notes = useMemo(
    () => morphoVaultTermsNotes(coords, timeline.notes.filter(isMorphoNote), shareUnit),
    // `coords` is rebuilt every render from the same fields; the notes and the
    // unit are what actually move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeline.notes, shareUnit, timeline.vault, timeline.blockNumber, timeline.holder],
  );

  // The row this page draws, found back from the coordinate record the shared
  // timeline hands to `renderCard`. The map is the one place the two shapes are
  // joined, and it is keyed by the id both carry.
  const byId = useMemo(() => new Map(timeline.events.map((e) => [e.id, e])), [timeline.events]);
  const activity = useMemo(
    () => timeline.events.map((e) => vaultEventToActivity(e, MORPHO_BASE_CHAIN_ID, timeline.holder)),
    [timeline.events, timeline.holder],
  );
  // `useTimelineEvents` sorts ascending internally and reverses for display, so
  // the resting order is newest first — the head row at the top, with its dot,
  // the way every Rails timeline reads.
  const tl = useTimelineEvents(activity, {
    // The rows the loader's draw window left on the server, so numbering
    // runs over the whole life and the count line states the real total —
    // "at least" where the count is only a floor (rails-ops decision 0019).
    olderCount: window ? window.of - window.rows : 0,
    olderCountIsFloor: timeline.coverage.logCountIsLowerBound,
    storageKey: `morpho-base-vault-${timeline.vault}-${timeline.holder}`,
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

      {/* Where the rows came from. A row at or below the lane's own `finalized`
          block never changes, so it may be kept; anything above it may not.
          When half of a life came out of the store the reader is told which
          half, at which cut, and that the check below ran on the two together
          — a stored page and a swept one must never render the same. */}
      <HistoryLine coords={coords} timeline={timeline} />

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
            info={morphoVaultTimelineHorizonProv(
              coords,
              withheld,
              tailMaxRows(BASE_CHAIN_ID),
              timeline.coverage.logCountIsLowerBound,
              // On the floor path no gate ran, so the lane is the chain's own logs lane by name.
              reconcile?.lane ?? chainMeta(BASE_CHAIN_ID).logsRpcEnv,
            )}
          >
            This address has {timeline.coverage.logCountIsLowerBound ? "at least " : ""}
            {n(withheld)} of its own share transfers on this vault
          </Prov>
          , more than Rails keeps a stored history for.{" "}
          {timeline.coverage.logCountIsLowerBound ? (
            <>
              The count is a floor rather than a census: the endpoint would not answer this address&rsquo;s whole sweep
              at once, so the range was walked in chunks and the walk stopped as soon as it passed what this page draws.
              Because the logs were never read whole, the balance check below the rows could not be run on this address
              at all, and nothing about this address is kept in Rails&rsquo;s store of chain readings — a floor is a
              statement that the answer is at least this, and storing it would turn it into a statement that it is this.
            </>
          ) : (
            <>
              The whole history was read and it reconciles against the vault&rsquo;s own <code>balanceOf</code>; what is
              withheld is the drawing of it.
            </>
          )}{" "}
          The newest rows are not shown in place of the rest — a part of a life shown as the whole of one is the failure
          this check exists to prevent.
        </p>
      ) : !reconcile ? null : !reconcile.reconciled ? (
        <GateFailure coords={coords} timeline={timeline} shareUnit={shareUnit} shareDecimals={shareDecimals} />
      ) : building ? (
        /* A READING IN PROGRESS, stated as one. Each row costs an archive call
           at its own block, so a life this long is built into Rails's store a
           chunk of blocks at a time and drawn once it is whole. */
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-building">
          <Prov info={morphoVaultTimelineBuildingProv(coords, building)}>
            Rails is storing this history now: {n(building.keptRows)} of {n(building.totalRows)} rows kept at or below
            block {n(building.keptCut)}
          </Prov>
          . The rows and the flows are drawn once the whole life is stored, on a later visit. Every figure above this is
          unaffected — they are calls answered at block {n(timeline.blockNumber)}.
        </p>
      ) : (
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-reconciled">
          Every share transfer this address sent or received on this vault, newest first, replayed into the balance the
          vault itself reports.{" "}
          <Prov info={morphoVaultTimelineGateProv(coords, reconcile)}>
            The replay gives {shareText(raw(reconcile.replayed, shareDecimals), shareDecimals)} {shareUnit} and{" "}
            <code>balanceOf</code> at block {n(reconcile.toBlock)} gives{" "}
            {shareText(raw(reconcile.onChain, shareDecimals), shareDecimals)}
          </Prov>
          , so the two agree and the rows below are drawn. Each row states its own share price, read at the block that
          row happened in; no line is drawn between two of them, because nothing was read between them.
        </p>
      )}

      {drawn && (
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="timeline-exponent">
          <Prov info={morphoVaultTimelineExponentProv(coords, shareDecimals, assetDecimals, decimalsOffset)}>
            Every share price below is <code>convertToAssets(10^{shareDecimals})</code>, the {shareDecimals} being this
            vault&rsquo;s own <code>decimals()</code>
            {decimalsOffset != null ? (
              <>
                {" "}
                — its asset&rsquo;s {assetDecimals} plus a <code>DECIMALS_OFFSET()</code> of {decimalsOffset}
              </>
            ) : null}
          </Prov>
          . Both are reads at block {n(timeline.blockNumber)}, not a convention this page assumed.
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
          data-vault-timeline-notes={notes.length}
          {...(window ? { "data-vault-timeline-of": window.of } : {})}
        >
          <ChainTruthTimeline
            notes={notes}
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
            persistKeyPrefix={`morpho-base-vault:${timeline.vault}`}
            renderCard={(event, meta) => {
              const row = byId.get(event.id);
              if (!row) return null;
              const i = timeline.events.indexOf(row);
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
                  chainId={MORPHO_BASE_CHAIN_ID}
                  shareUnit={shareUnit}
                  assetSymbol={assetSymbol}
                  vaultAddress={timeline.vault}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  prov={PROV}
                  persistPrefix="morpho-base-vault"
                  icon={row.kind === "transfer-self" ? "no-change" : undefined}
                  headerBars={
                    <VaultAllocationBand
                      event={row}
                      coords={{ ...coords, blockNumber: row.blockNumber, txHash: row.txHash }}
                      assetSymbol={assetSymbol}
                      first={meta.isFirst}
                    />
                  }
                  detailCards={(rowCoords) => <ShareOfVaultCard event={row} coords={rowCoords} shareUnit={shareUnit} />}
                  detailNotes={(rowCoords) => (
                    <VaultAllocationDetail
                      event={row}
                      // Rows run NEWEST FIRST, so the row BEFORE this one in
                      // time is the NEXT element of the list. Naming it
                      // `earlier` rather than `previous` keeps the two senses
                      // apart. The neighbour is taken from the WHOLE life,
                      // never from what the window painted.
                      earlier={i >= 0 ? (timeline.events[i + 1] ?? null) : null}
                      coords={rowCoords}
                      assetSymbol={assetSymbol}
                    />
                  )}
                />
              );
            }}
          />
        </div>
      )}

      {drawn && (
        <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-rb-500" data-figure="timeline-accrual">
          <Prov info={morphoVaultTimelineAccrualProv(coords)}>
            The vault&rsquo;s own accrual, and the curator&rsquo;s reallocations, are rows nowhere here.
          </Prov>{" "}
          A row is something this address did. What accrual did to the share price shows in each row&rsquo;s own price
          figure, and nowhere else. A transaction that carried this address&rsquo;s own leg very likely moved other
          shares too; only this address&rsquo;s leg is stated.
        </p>
      )}
    </section>
  );
}

/** One line: how many rows came from the store, how many were read now, and
 *  the block the two were reconciled at. */
function HistoryLine({ coords, timeline }: { coords: VaultTimelineCoords; timeline: VaultHolderTimeline }) {
  const h = timeline.history;
  const lane = timeline.reconcile?.lane ?? "";
  if (!h || timeline.unread || !timeline.reconcile) return null;
  // The line is about the rows this page DREW. A gate that failed, a life above
  // what the store holds, and a life still being built all draw none, and each
  // already states its own reason — saying "N rows came from the store" over an
  // empty list would name a set the reader cannot see.
  if (!timeline.reconcile.reconciled || timeline.coverage.withheldAbove != null || h.building) return null;
  return (
    <p
      className="mt-2 max-w-3xl text-[11px] leading-relaxed text-rb-500"
      data-history-source={h.source}
      data-history-cut={h.cut ?? ""}
      data-history-tail-rows={h.tailRows}
      data-history-head-rows={h.headRows}
    >
      <Prov info={morphoVaultTimelineStoredRowsProv(coords, h, lane)}>
        {h.source === "stored+head"
          ? `${n(h.tailRows)} rows at or below block ${n(h.cut ?? 0)} from Rails's store of chain readings, ${n(h.headRows)} rows above it read now`
          : `Every row read from the chain on this request`}
      </Prov>
      ; reconciled at block {n(timeline.blockNumber)}.
    </p>
  );
}

/** The gate failed: both figures, stated, and no rows. */
function GateFailure({
  coords,
  timeline,
  shareUnit,
  shareDecimals,
}: {
  coords: VaultTimelineCoords;
  timeline: VaultHolderTimeline;
  shareUnit: string;
  shareDecimals: number;
}) {
  const r = timeline.reconcile!;
  return (
    <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-unreconciled">
      <Prov info={morphoVaultTimelineGateProv(coords, r)}>
        This address&rsquo;s history in this vault could not be reconciled. Replaying every share transfer it sent or
        received gives {shareText(raw(r.replayed, shareDecimals), shareDecimals)} {shareUnit} at block {n(r.toBlock)};
        the vault&rsquo;s own <code>balanceOf</code> at that block gives{" "}
        {shareText(raw(r.onChain, shareDecimals), shareDecimals)}
      </Prov>
      . The two do not agree, so no history is drawn.
      {r.refetched &&
        (r.refetchDiffered
          ? " Both sweeps were run a second time and returned a different number of logs from the first, which is direct evidence of the lane answering one question two ways."
          : " Both sweeps were run a second time and returned the same number of logs.")}{" "}
      The figures above this are unaffected — they are calls at block {n(timeline.blockNumber)}, not a replay.
    </p>
  );
}

/** What proportion of the vault this address held after the row — the page's
 *  own central question, asked at a block the address chose by transacting. */
function ShareOfVaultCard({
  event,
  coords,
  shareUnit,
}: {
  event: VaultHolderEvent;
  coords: VaultTimelineCoords;
  shareUnit: string;
}) {
  const supply = supplyAt(event);
  const balance = BigInt(event.balanceAfter);
  return (
    <StatCard
      label="Share of the vault after this"
      figure="row-share-of-vault"
      note={
        supply
          ? `This address's balance over the ${shareText(raw(supply, event.shareDecimals), event.shareDecimals)} ${shareUnit} in existence at block ${event.blockNumber.toLocaleString("en-US")}.`
          : "The vault's supply at this block was not read, so no proportion is stated."
      }
    >
      {supply && BigInt(supply) > BigInt(0) ? (
        <Prov info={morphoVaultTimelineShareOfVaultProv(coords)}>
          {pctText(Number(balance) / Number(BigInt(supply)))}
        </Prov>
      ) : (
        <span className="text-base font-normal text-rb-500">not read</span>
      )}
    </StatCard>
  );
}

/** Vault-wide terms that changed for every holder at once, as the house note
 *  the timeline shell places among the rows by block.
 *
 *  ⚠️ THE LINE THAT SURVIVED THE MOVE. Until 2026-09-20 these sat in a block of
 *  their own ABOVE the list, because "a row is something this holder did" and a
 *  note happened to every holder at once. That distinction is now carried by
 *  the note row itself — its own ground, its hollow spine diamond, its own
 *  register — rather than by position on the page, which is what lets a reader
 *  see WHEN the terms moved relative to their own events. What has not changed
 *  is that a note is counted in nothing: it reaches the list through
 *  `ChainTruthTimeline`'s `notes` prop, which keeps it out of `tl`,
 *  `displayedEvents`, `eventOptions`, the type and asset filters, the toolbar's
 *  row count and the boundary card's by-type histogram alike.
 *
 *  The words and the receipt are built HERE and carried on the note, because
 *  what a performance fee or a rename MEANS is MetaMorpho's mechanic — see
 *  `VaultTermsNote` in lib/shared/market-note.ts. */
function morphoVaultTermsNotes(coords: VaultTimelineCoords, notes: MorphoVaultNote[], shareUnit: string): MarketNote[] {
  return vaultTermsNotes(
    notes,
    { address: coords.vault ?? "", shareSymbol: shareUnit, protocolId: "morpho-base" },
    (note) => {
      const prov = morphoVaultTimelineNoteProv(coords, note);
      switch (note.kind) {
        case "fee": {
          // The WAD is the contract's own unit; the percentage is the same
          // number read in the units the fee is quoted in everywhere else.
          const pct = (Number(note.fields.newFee) / 1e16).toLocaleString("en-US", { maximumFractionDigits: 4 });
          return {
            headline: `${pct}%`,
            quantity: "performance fee",
            statement: `the vault's performance fee was set to ${pct}% of the interest its markets earn, which the contract stores as ${note.fields.newFee}`,
            prov,
          };
        }
        case "vault-name":
          return {
            headline: note.fields.name,
            quantity: "share token name",
            statement: `the share token was named "${note.fields.name}"`,
            prov,
          };
        case "vault-symbol":
          return {
            headline: note.fields.symbol,
            quantity: "share token symbol",
            statement: `the share token's symbol was set to "${note.fields.symbol}"`,
            prov,
          };
      }
    },
  );
}
