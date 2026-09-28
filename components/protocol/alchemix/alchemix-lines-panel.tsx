// The lines a chain's Alchemix explorer covers, and what each one can say
// about its own figures.
//
// THIS IS THE PAGE THAT EXPLAINS THE DIFFERENCE BETWEEN THE CHAINS, in words.
// A line that has never had a redemption replays wei-exact from each position's
// own events. From a line's first redemption it cannot: a redemption applies
// one survival ratio to every open position's earmarked debt at once, and the
// position's own events show nothing, so the replay becomes a floor and the
// served figure is a getCDP read at a block (rails-ops decisions/0032). Base is
// the first case today and both Ethereum lines are the second.
//
// Saying that as a coloured chip would leave the reader to work out what the
// chip meant. It is a sentence per line instead, and the figures elsewhere
// carry the block they were settled at so the sentence can be checked.
//
// `unsweptRedemptions` is stated rather than hidden: it counts redemptions
// whose getCDP sweep has not run, which means the readings on that line do not
// yet cover every block at which a debt could have stepped. A reader who is not
// told that would take the coverage as complete.
//
// NAMED `-panel` RATHER THAN `-view` ON PURPOSE, and it should be renamed when
// that stops being true. `check:prov` requires every `components/**/*-view*.tsx`
// to carry a `<ProvReceiptsScope>` so it can self-report its provenance gaps.
// This page has no receipts behind its figures yet, so the `-view` name would
// claim a scope it does not have. Give it the scope and the name together.

import type { ReactNode } from "react";
import type {
  AlchemixLineCoverage,
  AlchemixTransmuterLineCoverage,
  AlchemixV2LineCoverage,
} from "@/types/api/alchemix";
import { BlockRef } from "@/components/shared/block-ref";

const block = (n: number | null) => (n == null ? "not recorded" : n.toLocaleString("en-US"));
const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** One card: the house raised panel with its title/meta row and muted prose. */
function CoverageCard({ title, meta, children }: { title: string; meta: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-raised px-4 py-3.5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground/80">{title}</h3>
        <span className="text-[11px] tabular-nums text-rb-500">{meta}</span>
      </header>
      {children}
    </section>
  );
}

const PROSE = "mt-2 text-xs leading-relaxed text-rb-500";
// The first paragraph under a card's header sits a little lower.
const PROSE_FIRST = "mt-2.5 text-xs leading-relaxed text-rb-500";

function gradeSentence(line: AlchemixLineCoverage): string {
  if (line.grade === "derived") {
    return (
      `${line.displayName} has had no redemption. Every position's debt and collateral are replayed from ` +
      `that position's own events and are exact to the wei at the block each one states.`
    );
  }
  return (
    `${line.displayName} has had ${line.redemptionCount.toLocaleString("en-US")} ` +
    `redemption${line.redemptionCount === 1 ? "" : "s"}, the first at block ${block(line.firstRedemptionBlock)}. ` +
    `A redemption clears every open position's set-aside debt at once, with nothing in a position's own events to ` +
    `see, so from that block a position's events alone miss what the redemptions cleared. The figures shown are ` +
    `read from the contract's getCDP at the block beside them.`
  );
}

export function AlchemixLinesPanel({ lines }: { lines: AlchemixLineCoverage[] }) {
  if (lines.length === 0) {
    return <p className="text-sm text-rb-500">No line on this chain answered.</p>;
  }
  return (
    // The shared sub-page panel: the raised rounded-xl card every protocol-level
    // view draws its sections in, with the title/meta row and the muted prose
    // rhythm that go with it. Nothing about a line needs a frame of its own.
    <div className="flex flex-col gap-3">
      {lines.map((line) => (
        <CoverageCard
          key={line.lineKey}
          title={line.displayName}
          meta={
            <>
              {line.lineKey} · indexed to{" "}
              {line.indexedToBlock == null ? "block not recorded" : <BlockRef block={line.indexedToBlock} />}
            </>
          }
        >
          <p className={PROSE_FIRST}>{gradeSentence(line)}</p>
          {line.unsweptRedemptions > 0 ? (
            <p className={PROSE}>
              {line.unsweptRedemptions.toLocaleString("en-US")} of those redemptions have not been swept yet, so the
              readings on this line do not cover every block at which a debt could have stepped.
            </p>
          ) : null}
          {line.staleHeadReadings > 0 ? (
            <p className={PROSE}>
              {line.staleHeadReadings.toLocaleString("en-US")} positions on this line have no current reading. Their
              figures come from their own events alone and miss what redemptions cleared.
            </p>
          ) : null}
        </CoverageCard>
      ))}
    </div>
  );
}

/** A group of cards under one position type's heading. */
export function AlchemixCoverageGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

// The Transmuter's own coverage. A Transmuter position's staked amount, start
// and maturity are its own events and no redemption moves them, so it has no
// grade to state. What it depends on is how far its events are captured and
// reduced, whether each claim found its position, and the maturity period's
// history, since each position is dated by the period in force when it was
// created.
export function AlchemixTransmuterCoveragePanel({ lines }: { lines: AlchemixTransmuterLineCoverage[] | null }) {
  if (lines == null) return <p className="text-sm text-rb-500">The Transmuter coverage read did not answer.</p>;
  if (lines.length === 0) return <p className="text-sm text-rb-500">No Transmuter on this chain answered.</p>;
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line) => (
        <CoverageCard
          key={line.lineKey}
          title={`${line.displayName} Transmuter`}
          meta={
            <>
              {line.lineKey} · indexed to{" "}
              {line.indexedToBlock == null ? "block not recorded" : <BlockRef block={line.indexedToBlock} />}
            </>
          }
        >
          <p className={PROSE_FIRST}>
            {plural(line.positions, "position", "positions")}, {count(line.outstanding)} not yet claimed. Each
            position&rsquo;s stake, start and maturity block come from its own events, reduced to block{" "}
            {block(line.reducedToBlock)}.
          </p>
          <p className={PROSE}>
            {line.maturityParameterChanges === 0
              ? "The maturity period has not changed since the Transmuter was deployed."
              : `The maturity period has changed ${plural(line.maturityParameterChanges, "time", "times")}, and each position is dated by the period in force when it was created.`}
          </p>
          {line.reducedToBlock != null && line.indexedToBlock != null && line.reducedToBlock < line.indexedToBlock ? (
            <p className={PROSE}>
              Events to block {block(line.indexedToBlock)} are captured but not yet reduced, so a position created or
              claimed after block {block(line.reducedToBlock)} is not shown yet.
            </p>
          ) : null}
          {line.unattributedClaims > 0 ? (
            <p className={PROSE}>
              {plural(line.unattributedClaims, "claim", "claims")} could not be matched to the position{" "}
              {line.unattributedClaims === 1 ? "it paid out" : "they paid out"}, so no position here shows{" "}
              {line.unattributedClaims === 1 ? "it" : "them"}.
            </p>
          ) : null}
        </CoverageCard>
      ))}
    </div>
  );
}

// V2's own coverage. V2 closed on 2 April 2026, so the record is one read per
// account at the frozen block. What it depends on is that every captured
// contract was scanned to that block and every read landed. It also covers the
// V2 rows a V3 position's timeline shows behind the version filter, which come
// from this record.
export function AlchemixV2CoveragePanel({ lines }: { lines: AlchemixV2LineCoverage[] | null }) {
  if (lines == null) return <p className="text-sm text-rb-500">The V2 coverage read did not answer.</p>;
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line) => (
        <CoverageCard
          key={line.lineKey}
          title={`${line.syntheticSymbol} V2`}
          meta={`${line.lineKey} · closed ${line.closedAt}`}
        >
          <p className={PROSE_FIRST}>
            {plural(line.accounts, "account", "accounts")}, each read from the contract at block{" "}
            {block(line.frozenAtBlock)}, the last block V2 could change. {count(line.contractsScannedWhole)} of{" "}
            {count(line.contractsScanned)} captured contracts are scanned to that block. The V2 rows a V3
            position&rsquo;s timeline shows come from this record.
          </p>
          {line.contractsScannedWhole < line.contractsScanned ? (
            <p className={PROSE}>
              {plural(line.contractsScanned - line.contractsScannedWhole, "contract stops", "contracts stop")} short of
              that block, so the history on this line is missing its end.
            </p>
          ) : null}
          {line.staleReads > 0 ? (
            <p className={PROSE}>
              {plural(line.staleReads, "account's read", "accounts' reads")} did not land, so{" "}
              {line.staleReads === 1 ? "it carries" : "they carry"} no debt figure.
            </p>
          ) : null}
        </CoverageCard>
      ))}
    </div>
  );
}
