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

import type { AlchemixLineCoverage } from "@/types/api/alchemix";

const block = (n: number | null) => (n == null ? "not recorded" : n.toLocaleString("en-US"));

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
    `A redemption moves every open position's debt at once, with nothing in a position's own events to see, so ` +
    `from that block the replay is a lower bound. The figures shown are read from the contract's getCDP at the ` +
    `block beside them, not computed by Rails.`
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
        <section key={line.lineKey} className="rounded-xl bg-raised px-4 py-3.5">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-foreground/80">{line.displayName}</h2>
            <span className="text-[11px] tabular-nums text-rb-500">
              {line.lineKey} · indexed to block {block(line.indexedToBlock)}
            </span>
          </header>
          <p className="mt-2.5 text-xs leading-relaxed text-rb-500">{gradeSentence(line)}</p>
          {line.unsweptRedemptions > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-rb-500">
              {line.unsweptRedemptions.toLocaleString("en-US")} of those redemptions have not been swept yet, so the
              readings on this line do not cover every block at which a debt could have stepped.
            </p>
          ) : null}
          {line.staleHeadReadings > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-rb-500">
              {line.staleHeadReadings.toLocaleString("en-US")} positions on this line have no current reading. Their
              replayed figures are a floor, not their debt.
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
