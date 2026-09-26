// One Alchemist position, as a listing row.
//
// THE CARD'S JOB IS TO SAY WHAT IS TRUE AND WHEN IT WAS TRUE. Three rules it
// keeps, each of them a way this protocol's figures can be misread:
//
// 1. THE GRADE IS A SENTENCE, NOT A CHIP. Base and the two Ethereum lines
//    answer differently — Base replays wei-exact from the position's own
//    events, Ethereum reads getCDP at a block, because a redemption moves every
//    open position's debt at once with nothing in the position's events to see
//    (rails-ops decisions/0032). A reader cannot be expected to decode that
//    from a coloured pill, so the route's own plain-words sentence is rendered
//    as given.
//
// 2. EVERY FIGURE CARRIES ITS BLOCK, AND A FIGURE WITHOUT ONE IS NOT SHOWN.
//    `asOfBlock` is typed nullable because the wire types it that way; a null
//    there means the read did not settle, and an amount rendered without the
//    block it belongs to is a number that looks stated and is not. So the
//    amount and the block are drawn from one guard.
//
// 3. EARMARKED IS SHOWN ONLY AT ITS OWN BLOCK, AND NEVER BESIDE DEBT AS THOUGH
//    THEY SUMMED. It accrues every block; the reading is true at the block it
//    was taken at and at no other. It sits on its own line, with its own block,
//    and nothing here adds it to anything.
//
// There is also no V2 leg on this card and no slot for one. A V3 position is
// what a linked V2 position BECAME, so showing the two debts as one row would
// double count one obligation (rails-ops reference/alchemix-v2-frozen-record.md).
//
// THE CHROME IS THE HOUSE'S, NOT THIS PROTOCOL'S. The frame, the status pill,
// the identity row, the stat grid and the footnote rhythm are the shared
// position-card components every other explorer renders — `PositionCardShell` +
// `OpenPositionStats` + `LifecyclePill` + `WalletPill` + `StatValue`. What is
// Alchemix's here is what it says, not how it is drawn.

import type { ReactNode } from "react";
import { OpenPositionStats, type OpenPositionStatsColumn } from "@/components/shared/open-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatValue, StatFootnote } from "@/components/shared/stat-value";
import { WalletPill } from "@/components/shared/wallet-pill";
import type { SessionProtocol } from "@/lib/shared/sessions";
import type { AlchemixAmountAtBlock, AlchemixPositionStatus, AlchemixPositionSummary } from "@/types/api/alchemix";
import { formatCompact } from "@/lib/shared/format-event";

const block = (n: number) => n.toLocaleString("en-US");

/** The LISTING axis: Open and Closed are the roster's own lifecycle pill. The
 *  two states only Alchemix has wear the muted pill CLOSED wears, with the
 *  words the listing's Status facet names them by — there is no lifecycle word
 *  for a position the reducer declined, or for one on a read-grade line with no
 *  current reading. */
export function AlchemixLifecyclePill({ status }: { status: AlchemixPositionStatus }) {
  if (status === "open" || status === "closed") return <LifecyclePill status={status} />;
  return (
    <span className="font-bold tracking-wider uppercase px-2 py-0.5 rounded-xs text-xs bg-rb-300 dark:bg-rb-700 text-foreground/70">
      {status === "unknown" ? "No current reading" : status}
    </span>
  );
}

/** The DETAIL axis: the house's neutral pill, carrying the route's own word for
 *  what this position is. Alchemix states a lifecycle word where another
 *  protocol states a mode word, because a position on a read-grade line with no
 *  current reading has no mode anyone can name from the chain. */
export function AlchemixStatusPill({ status }: { status: AlchemixPositionStatus }) {
  return (
    <span className="font-bold capitalize px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
      {status === "unknown" ? "No current reading" : status}
    </span>
  );
}

/** An amount is stated only with the block it was settled at. Without one the
 *  column says the figure did not settle rather than printing a bare number.
 *
 *  The symbol stays a WORD rather than becoming a token chip: no icon exists
 *  for a line's synthetic or its MYT share (alUSD, mixWETH), so a chip would
 *  draw the unknown-token placeholder beside every figure and name nothing.
 *
 *  One builder for both surfaces — the listing row passes neither receipt nor
 *  note, the position page passes both. */
export function amountColumn(
  label: string,
  value: AlchemixAmountAtBlock | null,
  unit: string,
  extra?: { prov?: Provenance; note?: ReactNode },
): OpenPositionStatsColumn {
  // The note stays on the footnote's own rb-500 rather than dropping to rb-400:
  // rb-400 is the LIGHTER end of the ramp, so it reads dimmer than the block
  // line on the light canvas and brighter than it on the dark one, which is the
  // hierarchy inverting between themes.
  const note = extra?.note ? <div className="mt-0.5 leading-snug">{extra.note}</div> : null;
  if (!value || value.asOfBlock == null) {
    return {
      label,
      value: <StatValue color="text-rb-500">Not settled</StatValue>,
      footnote: note ? <StatFootnote>{note}</StatFootnote> : undefined,
    };
  }
  const { display, title } = formatCompact(value.formatted);
  const figure = (
    <>
      {display} {unit}
    </>
  );
  return {
    label,
    value: (
      <StatValue title={title}>
        {extra?.prov ? (
          <Prov info={extra.prov} value={String(value.formatted)} symbol={unit}>
            {figure}
          </Prov>
        ) : (
          figure
        )}
      </StatValue>
    ),
    footnote: (
      <StatFootnote>
        <span className="tabular-nums">at block {block(value.asOfBlock)}</span>
        {note}
      </StatFootnote>
    ),
  };
}

export function AlchemixPositionCard({ p, session }: { p: AlchemixPositionSummary; session: SessionProtocol }) {
  const collateralUnit = p.figures.collateral?.mytSymbol ?? "shares";
  return (
    <PositionCardShell>
      <OpenPositionStats
        statusPill={<AlchemixLifecyclePill status={p.status} />}
        leadingIdentity={
          <>
            <span className="text-xs font-bold uppercase tracking-wide text-foreground/80">{p.lineDisplayName}</span>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-rb-500">
              <span className="tabular-nums">position {p.tokenId}</span>
              <span>{p.chainName ?? `chain ${p.chainId}`}</span>
              {p.owner ? (
                <WalletPill wallet={p.owner} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
              ) : null}
            </span>
          </>
        }
        columns={[
          amountColumn("Debt", p.figures.debt, p.syntheticSymbol),
          amountColumn("Collateral", p.figures.collateral, collateralUnit),
          // Its own slot, never added to the debt beside it.
          amountColumn("Earmarked", p.figures.earmarked, p.syntheticSymbol),
        ]}
      />

      <div className="mt-3 space-y-1.5">
        {/* The route's own sentence for this line's grade, rendered as given. */}
        <p className="text-xs leading-relaxed text-rb-500">{p.figures.gradeReason}</p>

        {/* The replayed figure, stated WITHOUT a direction. The API calls this
            field `derivedLowerBound`, but measured against production on
            2026-09-26 the replayed debt was at or above the read debt on every
            row that carried both, never below — a redemption burns debt and the
            replay does not see it. So the card says what the figure is and what
            block it stopped being exact at, and claims nothing about which side
            of the truth it falls. See the report on this stage. */}
        {p.figures.derivedLowerBound ? (
          <p className="text-xs leading-relaxed text-rb-500">
            Replayed from this position&rsquo;s own events alone, the debt is{" "}
            {formatCompact(Number(p.figures.derivedLowerBound.debtRaw) / 1e18).display} {p.syntheticSymbol}, exact to
            block {block(p.figures.derivedLowerBound.validToBlock)}. Redemptions after that block moved the debt with
            nothing in these events to see.
          </p>
        ) : null}

        {p.refusedReason ? <p className="text-xs leading-relaxed text-rb-500">{p.refusedReason}</p> : null}
      </div>
    </PositionCardShell>
  );
}
