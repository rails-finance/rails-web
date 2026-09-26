"use client";

// One address's own events inside one Aave vault on Ethereum.
// ----------------------------------------------------------------------------
// The holder section above this states a READING at the page's block — shares,
// claim, redeemable, cooldown. This states how the address got there: every
// `Transfer` the vault emitted about it, newest first, with the balance
// replayed from those logs and each row's share price read at that row's own
// block.
//
// ── THE GATE IS DRAWN BEFORE THE ROWS ARE ────────────────────────────────────
// Nothing renders until the replayed balance equals the vault's own
// `balanceOf`, wei-exact. On a mismatch this states BOTH figures and draws no
// rows — not a partial timeline, not one with a caveat under it. The reason is
// measured: a wide-range logs lane has answered a whole-life query with HTTP
// 200 and an empty array where the true answer was six figures of logs, and a
// page that drew "what it got" would have presented that as a life. A failed
// check is a READING here, never an error state and never an empty list.
//
// ── NO SHELL OF ITS OWN ──────────────────────────────────────────────────────
// The rows are `components/vaults/vault-timeline-row.tsx` — the house's
// `EventCard`, `SpineColumn` and `ChainTruthRow`, shared with the Base vault
// timeline because a row about a `Transfer` is the same row on either chain.
// What stays here is what is Aave's: the gate's own prose, the cooldown a row
// carries, the vault-wide notes, and the receipts, because what a share price
// MEANS is the family's mechanic and belongs beside it. Everything that surface
// refuses to draw — no line through two prices, no USD, no APY, no names on a
// row, no opinionated colour — is stated in that file and holds here.
//
// ── AND NO LIST OF ITS OWN EITHER ────────────────────────────────────────────
// The rows ride `ChainTruthTimeline`, the same shell every other detail page in
// the tier uses, so this surface gets the house toolbar (count, sort flip, type
// filter, date range, display menu), the 100-row render window and run collapse
// without a second implementation of any of them. What is passed in is a
// coordinate record per row (`lib/aave-vaults/timeline-runs.tsx`) and a closure
// that draws the real row back from this page's own id → event map.
//
// ⚠️⚠️ WINDOWING NEVER MOVES AN AGGREGATE, AND THERE ARE TWO WINDOWS NOW. The
// inner one is `ChainTruthTimeline`'s 100-row render cap. The outer one is the
// loader's: a life longer than `VAULT_TIMELINE_DRAW_ROWS` hands this component
// its newest `VAULT_TIMELINE_DRAW_ROWS` rows and states the two figures in
// `coverage.drawn`, so that a nine-thousand-row life does not ship
// nine thousand rows of RSC payload to a browser that paints a hundred.
//
// Neither window touches an aggregate. The gate below is `reconcile`, a signed
// sum over every log the sweeps returned; the lifetime-flows tower above these
// rows is reduced over the WHOLE life on the server
// (`lib/aave-vaults/position-economics.ts`, called from the page, never from
// the tower component). What the outer window does move is the timeline's own
// toolbar — its count, its date range and its type filter read the rows this
// component holds — so the words beside it state both figures rather than
// leaving the count to be read as a lifetime's. A figure that changed when a
// reader pressed "Show N more" would be a window's arithmetic presented as a
// lifetime's, which is what memory `timeline-paging-programme` is about.
//
// ── AND A LIFE CAN BE MID-BUILD ──────────────────────────────────────────────
// A life above the horizon is built into Rails's store a chunk of blocks at a
// time, across visits, because each row costs an archive call at its own block.
// While that is happening `history.building` is set, no rows are drawn, and
// this states how much has been kept and at which block. It is not a refusal
// and it is not an error: it is a reading in progress, and the next visit
// continues it.

import { Fragment, useMemo } from "react";

import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { Prov } from "@/components/shared/provenance";
import { shareText } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { VaultTimelineRow, rawAmount as raw, type VaultTimelineProvKit } from "@/components/vaults/vault-timeline-row";
import { utcInstant } from "@/components/vaults/aave-vault-format";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromVaultDrawn } from "@/lib/shared/timeline-boundary";
import { chainMeta, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { vaultTermsNotes, type MarketNote } from "@/lib/shared/market-note";
import { AAVE_VAULT_TIMELINE_KEY, aaveVaultTimelineRuns, vaultEventToActivity } from "@/lib/aave-vaults/timeline-runs";
import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import {
  vaultTimelineAccrualProv,
  vaultTimelineAssetsProv,
  vaultTimelineBalanceAfterProv,
  vaultTimelineBalanceBeforeProv,
  vaultTimelineBuildingProv,
  vaultTimelineCooldownProv,
  vaultTimelineGateProv,
  vaultTimelineHorizonProv,
  vaultTimelineNoteProv,
  vaultTimelineSharePriceProv,
  vaultTimelineSharesProv,
  vaultStoredRowsProv,
} from "@/lib/aave-vaults/vault-timeline-provenance";
import {
  tailMaxRows,
  type AaveVaultNote,
  type VaultHolderEvent,
  type VaultHolderTimeline,
  type VaultNote,
  type VaultTimelineCoords,
} from "@/lib/shared/vault-holder-timeline";

const n = (v: number) => v.toLocaleString("en-US");

/** The four row receipts, as this family states them. */
const PROV: VaultTimelineProvKit = {
  shares: vaultTimelineSharesProv,
  balanceAfter: vaultTimelineBalanceAfterProv,
  balanceBefore: vaultTimelineBalanceBeforeProv,
  assets: vaultTimelineAssetsProv,
  sharePrice: vaultTimelineSharePriceProv,
};

/** This loader emits exactly the three configuration events below and no
 *  others, so this narrowing drops nothing — it is how the shared note shape,
 *  which also carries MetaMorpho's kinds on Base, is read as Aave's. */
const isAaveNote = (note: VaultNote): note is AaveVaultNote =>
  note.kind === "target-rate" || note.kind === "cooldown-config" || note.kind === "unstake-window-config";

/** An Umbrella cooldown snapshot carried on a row, or none. `extra` is
 *  discriminated, so the MetaMorpho arm cannot be read as a cooldown. */
const cooldownsOf = (event: VaultHolderEvent) => (event.extra?.kind === "umbrella" ? event.extra.cooldown : []);

export interface AaveVaultTimelineProps {
  timeline: VaultHolderTimeline;
  family: AaveVaultFamily;
  vaultName: string | null;
  shareSymbol: string | null;
  assetSymbol: string;
}

export function AaveVaultTimeline({ timeline, family, vaultName, shareSymbol, assetSymbol }: AaveVaultTimelineProps) {
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
  const building = timeline.history?.building;
  // The outer window, when the life was longer than the client is handed.
  const window = timeline.coverage.drawn;
  const drawn = timeline.events.length > 0;

  // The row this page draws, found back from the coordinate record the shared
  // timeline hands to `renderCard`. The map is the one place the two shapes are
  // joined, and it is keyed by the id both carry.
  const byId = useMemo(() => new Map(timeline.events.map((e) => [e.id, e])), [timeline.events]);
  const activity = useMemo(
    () => timeline.events.map((e) => vaultEventToActivity(e, MAINNET_CHAIN_ID, timeline.holder)),
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
    storageKey: `aave-vault-${timeline.vault}-${timeline.holder}`,
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
  // The vault's own terms, as notes the shell places among the rows by block.
  // Memoised because a fresh array identity per render recomputes the
  // anchoring — the prop's own instruction.
  const notes = useMemo(
    () => aaveVaultTermsNotes(coords, timeline.notes.filter(isAaveNote), shareUnit),
    // `coords` is rebuilt every render from the same fields; the notes and the
    // unit are what actually move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeline.notes, shareUnit, timeline.vault, timeline.blockNumber, timeline.holder],
  );

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
            info={vaultTimelineHorizonProv(
              coords,
              withheld,
              tailMaxRows(MAINNET_CHAIN_ID),
              timeline.coverage.logCountIsLowerBound,
              // On the floor path no gate ran, so the lane is the chain's own logs lane by name.
              reconcile?.lane ?? chainMeta(MAINNET_CHAIN_ID).logsRpcEnv,
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
          The newest rows are not shown in place of the rest.
        </p>
      ) : !reconcile ? null : !reconcile.reconciled ? (
        <GateFailure coords={coords} timeline={timeline} shareUnit={shareUnit} shareDecimals={shareDecimals} />
      ) : building ? (
        /* A READING IN PROGRESS, stated as one. Each row costs an archive call
           at its own block, so a life this long is built into Rails's store a
           chunk of blocks at a time and drawn once it is whole. No rows here:
           a prefix of a life is not a life, and the check above sums every
           one of them. */
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-building">
          <Prov info={vaultTimelineBuildingProv(coords, building)}>
            Rails is storing this history now: {n(building.keptRows)} of {n(building.totalRows)} rows kept at or below
            block {n(building.keptCut)}
          </Prov>
          . The rows and the flows are drawn once the whole life is stored, on a later visit. Every figure above this is
          unaffected — they are calls answered at block {n(timeline.blockNumber)}.
        </p>
      ) : (
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="timeline-reconciled">
          Every share transfer this address sent or received, newest first, replayed.{" "}
          <Prov info={vaultTimelineGateProv(coords, reconcile)}>
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
        // two attributes because they are two figures, and one of them standing
        // in for the other is exactly the confusion this surface refuses.
        <div
          className="mt-4"
          data-vault-timeline-rows={timeline.events.length}
          data-vault-timeline-notes={notes.length}
          {...(window ? { "data-vault-timeline-of": window.of } : {})}
        >
          <ChainTruthTimeline
            tl={tl}
            runs={runs}
            boundary={boundary}
            notes={notes}
            toolbarLeading="replayed from this address's own transfers"
            emptyLabel="No share transfers of this vault name this address."
            // The card-open memory's namespace, as the ROW spells it
            // (`${persistPrefix}:${vaultAddress}:${event.id}`) less the id the
            // shell appends. Pinned mode writes that key during render so the
            // one card a permalink draws arrives with its detail already open.
            // The two spellings must agree — a prefix that missed the vault
            // would force a key no card ever reads.
            persistKeyPrefix={`aave-vault:${timeline.vault}`}
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
                <AaveTimelineRow
                  event={row}
                  coords={coords}
                  shareUnit={shareUnit}
                  assetSymbol={assetSymbol}
                  vaultAddress={timeline.vault}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                />
              );
            }}
          />
        </div>
      )}

      {drawn && (
        <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-rb-500" data-figure="timeline-accrual">
          <Prov info={vaultTimelineAccrualProv(coords, family)}>
            {/* An Umbrella token's line says what its accounting IS and stops.
                It does NOT say that no slashing has happened: an absence is
                already visible in the rows, and a sentence asserting one reads
                as a statement about what will happen next, which is not a thing
                any read here supports. */}
            {family === "sgho"
              ? "The vault's own accrual is not a row here."
              : family === "stata"
                ? "This vault emits no accrual event at all."
                : "This token's assets are a stored counter rather than a balance read."}
          </Prov>{" "}
          A row is something this address did.
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
  const prov = vaultStoredRowsProv(coords, h, lane, "");
  return (
    <p
      className="mt-2 max-w-3xl text-[11px] leading-relaxed text-rb-500"
      data-history-source={h.source}
      data-history-cut={h.cut ?? ""}
      data-history-tail-rows={h.tailRows}
      data-history-head-rows={h.headRows}
    >
      <Prov info={prov}>
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
      <Prov info={vaultTimelineGateProv(coords, r)}>
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
 *  what a target rate or an unstake window MEANS is Aave's mechanic — see
 *  `VaultTermsNote` in lib/shared/market-note.ts. */
function aaveVaultTermsNotes(coords: VaultTimelineCoords, notes: AaveVaultNote[], shareUnit: string): MarketNote[] {
  return vaultTermsNotes(
    notes,
    { address: coords.vault ?? "", shareSymbol: shareUnit, protocolId: "aave-vaults" },
    (note) => {
      const prov = vaultTimelineNoteProv(coords, note);
      switch (note.kind) {
        case "target-rate":
          return {
            headline: `${n(Number(note.fields.newRate))} bp`,
            quantity: "target rate",
            statement: `the vault's target rate was set to ${n(Number(note.fields.newRate))} basis points`,
            prov,
          };
        case "cooldown-config":
          return {
            headline: `${n(Number(note.fields.newCooldown))} s`,
            quantity: "cooldown",
            statement: `the cooldown was set to ${n(Number(note.fields.newCooldown))} seconds, from ${n(Number(note.fields.oldCooldown))}`,
            prov,
          };
        case "unstake-window-config":
          return {
            headline: `${n(Number(note.fields.newUnstakeWindow))} s`,
            quantity: "redemption window",
            statement: `the redemption window was set to ${n(Number(note.fields.newUnstakeWindow))} seconds, from ${n(Number(note.fields.oldUnstakeWindow))}`,
            prov,
          };
      }
    },
  );
}

// ── one row ──────────────────────────────────────────────────────────────────

/** The house row, with the two things that are Aave's own hung off it: the
 *  cooldown a stake token wrote in this transaction, and the clock glyph a row
 *  that moved no shares wears instead of a flow. */
function AaveTimelineRow({
  event,
  coords,
  shareUnit,
  assetSymbol,
  vaultAddress,
  eventNumber,
  isFirst,
  isLast,
}: {
  event: VaultHolderEvent;
  coords: VaultTimelineCoords;
  shareUnit: string;
  assetSymbol: string;
  vaultAddress: string;
  /** This row's place in the WHOLE history, 1-based and chronological — the
   *  badge the display menu's "Event numbers" reveals. */
  eventNumber: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const cooldowns = cooldownsOf(event);
  const sd = event.shareDecimals;
  return (
    <VaultTimelineRow
      event={event}
      coords={coords}
      chainId={MAINNET_CHAIN_ID}
      shareUnit={shareUnit}
      assetSymbol={assetSymbol}
      vaultAddress={vaultAddress}
      eventNumber={eventNumber}
      isFirst={isFirst}
      isLast={isLast}
      prov={PROV}
      persistPrefix="aave-vault"
      // A cooldown moves nothing, so there is no flow to draw; the clock says
      // what the row is instead of leaving the spine slot empty.
      icon={event.kind === "cooldown" ? "extend" : event.kind === "transfer-self" ? "no-change" : undefined}
      detailNotes={(rowCoords) =>
        cooldowns.length > 0 ? (
          <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="row-cooldown">
            {cooldowns.map((c, i) => (
              <Fragment key={`${c.endOfCooldown}:${i}`}>
                {i > 0 && " "}
                <Prov info={vaultTimelineCooldownProv(rowCoords)}>
                  The token recorded a cooldown over {shareText(raw(c.amount, sd), sd)} {shareUnit}, ending{" "}
                  {utcInstant(c.endOfCooldown)}, with {n(c.unstakeWindow)} seconds of window after it
                </Prov>
                .
              </Fragment>
            ))}{" "}
            That is what was written then. What this address&rsquo;s cooldown is now is the reading in the section
            above, at the page&rsquo;s own block.
          </p>
        ) : null
      }
    />
  );
}
