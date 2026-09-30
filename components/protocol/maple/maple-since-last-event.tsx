"use client";

// Maple — "Since the last event": the interest from the wallet's newest row to
// now, pinned in the timeline's head slot.
// ----------------------------------------------------------------------------
// Every row states the interest since the pool's previous row. The one
// stretch no row covers is the newest row to now, and without it the rows'
// interest does not add up to the card's figure (Maple newcomer round 2, M1).
// This row states that stretch the way the rows state theirs: its period, the
// claim at each end, and the difference. Nothing moved the holding in between
// (every share movement is a row), so the difference is the pool's rate rising
// on it.
//
// The frame is <NoteRowShell>'s with the live-window glyph, as Polaris's
// "Since its last touch" row: the holder did nothing inside the window.

import { NoteRowShell } from "@/components/shared/note-row-shell";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { AmountText } from "@/components/shared/amount-text";
import { formatExact } from "@/lib/utils/format";
import { formatDate, formatDayMonth, formatDuration } from "@/lib/date";
import type { MapleSinceLastEvent } from "@/lib/maple/row-times";
import { positionCurrentValueProv } from "@/lib/maple/event-provenance";

const thenProv = (s: MapleSinceLastEvent): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${s.assetSymbol} the position's ${s.poolSymbol} were worth just after its newest event (block ${s.lastBlock.toLocaleString("en-US")}): the shares held plus any in the withdrawal queue, times the pool's rate in that block. The same figure that event's row states as the claim after it.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "(shares + escrowed) × rate at the newest event's block",
  formula: "(shares + escrowed) × rate",
  inputs: [{ label: "claim after the newest event", value: s.claimThenExact, kind: "chain-derived", pclass: "state" }],
});

const interestProv = (s: MapleSinceLastEvent): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${s.assetSymbol} the position's ${s.poolSymbol} earned since its newest event: the claim now less the claim that event left. Every share movement is an event, so the holding has not changed since; the difference is the pool's rate rising on it. The rows below state the interest between each pair of events; with this figure they add up to the interest on the card.`,
  contract: { name: "Maple pool (ERC-4626)", address: "" },
  via: "claim now − claim after the newest event",
  formula: "claim now − claim then",
  inputs: [
    { label: "claim now", value: formatExact(s.claimNow), kind: "chain-derived", pclass: "state" },
    { label: "claim then", value: s.claimThenExact, kind: "chain-derived", pclass: "state" },
  ],
});

// One rounding rule, the rows' and the card's: in full to three decimals.
const Amount = ({ value, symbol, signed = false }: { value: number; symbol: string; signed?: boolean }) => (
  <span className="font-semibold text-foreground tabular-nums">
    {signed ? (value >= 0 ? "+" : "−") : ""}
    <AmountText value={Math.abs(value)} format="number" /> {symbol}
  </span>
);

export function MapleSinceLastEventRow({
  lines,
  isFirst = false,
  now,
}: {
  lines: MapleSinceLastEvent[];
  isFirst?: boolean;
  /** Unix seconds the page counts the stretch to. */
  now: number;
}) {
  if (lines.length === 0) return null;
  const multi = lines.length > 1;
  const newest = Math.max(...lines.map((l) => l.lastAt));
  const period = `since ${formatDayMonth(newest)}, ${formatDuration(newest, now)}`;
  // The figure is live: the claim is read at the head block, and the pool's
  // rate rises on it every block.
  const blockNow = Math.max(...lines.map((l) => l.blockNow));
  const live = `as of block ${blockNow.toLocaleString("en-US")}, rises every block`;
  return (
    <NoteRowShell
      icon="live-window"
      isFirst={isFirst}
      label={`Since the last event: interest ${period}, ${live}`}
      marker={{ attr: "data-live-window", value: "maple-since-last-event" }}
      header={
        <>
          <span className="text-sm text-foreground">Since the last event</span>
          {lines.map((s) => (
            <Prov key={s.pool} echo info={interestProv(s)} value={formatExact(s.interest)}>
              <span className="text-sm">
                <Amount value={s.interest} symbol={s.assetSymbol} signed />
              </span>
            </Prov>
          ))}
          <span className="ml-auto text-xs text-rb-500">
            interest {period} · {live}
          </span>
        </>
      }
    >
      <div className="px-5 pb-3 pt-1 text-xs space-y-2">
        {lines.map((s) => (
          <div key={s.pool} className="space-y-1">
            {multi && <div className="font-medium text-foreground">{s.poolSymbol} pool</div>}
            <Line label={`Claim after the last event, ${formatDate(s.lastAt)}`}>
              <Prov info={thenProv(s)} value={s.claimThenExact}>
                <Amount value={s.claimThen} symbol={s.assetSymbol} />
              </Prov>
            </Line>
            <Line label={`Claim now, block ${s.blockNow.toLocaleString("en-US")}`}>
              <Prov
                info={positionCurrentValueProv(s.assetSymbol, s.poolSymbol, s.blockNow)}
                value={formatExact(s.claimNow)}
              >
                <Amount value={s.claimNow} symbol={s.assetSymbol} />
              </Prov>
            </Line>
            <div className="border-t border-rb-300/40 pt-1 dark:border-rb-700/40">
              <Line label="Interest, the difference">
                <Prov info={interestProv(s)} value={formatExact(s.interest)}>
                  <Amount value={s.interest} symbol={s.assetSymbol} signed />
                </Prov>
              </Line>
            </div>
          </div>
        ))}
        <p className="text-[11px] leading-snug text-rb-400">
          No event has moved the shares since, so this is the pool&rsquo;s rate rising on them; nothing is paid out.
          Each row below states the interest since the pool&rsquo;s previous row, and with this line they add up to the
          interest on the card.
        </p>
      </div>
    </NoteRowShell>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="text-rb-500">{label}</span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}
