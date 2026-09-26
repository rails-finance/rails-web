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

import type { AlchemixAmountAtBlock, AlchemixPositionSummary } from "@/types/api/alchemix";
import { formatCompact, shortAddr } from "@/lib/shared/format-event";

/** An amount is stated only with the block it was settled at. Without one the
 *  row says the figure did not settle rather than printing a bare number. */
function AmountAtBlock({ label, value, unit }: { label: string; value: AlchemixAmountAtBlock | null; unit: string }) {
  if (!value || value.asOfBlock == null) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-500">{label}</span>
        <span className="text-sm text-neutral-500">Not settled</span>
      </div>
    );
  }
  const { display, title } = formatCompact(value.formatted);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-sm tabular-nums" title={title}>
        {display} {unit}
      </span>
      <span className="text-xs text-neutral-500 tabular-nums">at block {value.asOfBlock.toLocaleString("en-US")}</span>
    </div>
  );
}

export function AlchemixPositionCard({ p }: { p: AlchemixPositionSummary }) {
  const collateralUnit = p.figures.collateral?.mytSymbol ?? "shares";
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-medium">
            {p.lineDisplayName} position {p.tokenId}
          </h3>
          <span className="text-xs text-neutral-500">{p.chainName ?? `chain ${p.chainId}`}</span>
        </div>
        <span className="text-xs text-neutral-500">
          {p.status === "unknown" ? "No current reading" : p.status}
          {p.owner ? ` · ${shortAddr(p.owner)}` : ""}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <AmountAtBlock label="Debt" value={p.figures.debt} unit={p.syntheticSymbol} />
        <AmountAtBlock label="Collateral" value={p.figures.collateral} unit={collateralUnit} />
        {/* Its own slot, never added to the debt beside it. */}
        <AmountAtBlock label="Earmarked" value={p.figures.earmarked} unit={p.syntheticSymbol} />
      </div>

      {/* The route's own sentence for this line's grade, rendered as given. */}
      <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{p.figures.gradeReason}</p>

      {/* The replayed figure, stated WITHOUT a direction. The API calls this
          field `derivedLowerBound`, but measured against production on
          2026-09-26 the replayed debt was at or above the read debt on every
          row that carried both, never below — a redemption burns debt and the
          replay does not see it. So the card says what the figure is and what
          block it stopped being exact at, and claims nothing about which side
          of the truth it falls. See the report on this stage. */}
      {p.figures.derivedLowerBound ? (
        <p className="text-xs leading-relaxed text-neutral-500">
          Replayed from this position&rsquo;s own events alone, the debt is{" "}
          {formatCompact(Number(p.figures.derivedLowerBound.debtRaw) / 1e18).display} {p.syntheticSymbol}, exact to
          block {p.figures.derivedLowerBound.validToBlock.toLocaleString("en-US")}. Redemptions after that block moved
          the debt with nothing in these events to see.
        </p>
      ) : null}

      {p.refusedReason ? <p className="text-xs leading-relaxed text-neutral-500">{p.refusedReason}</p> : null}
    </article>
  );
}
