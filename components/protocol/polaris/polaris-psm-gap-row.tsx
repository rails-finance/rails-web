"use client";

// Polaris — the PSM's mints and redemptions in one closed gap between two of a
// CDP's touches, as one row (rails-ops TO-DO-ui-jobs 402; the model is
// lib/polaris/psm-gap.ts). The shape is the note run row's on the shared shell
// (components/shared/market-note-row.tsx, `NoteRunRow`): the kind in words
// with the count, the gap's dates, and on the spine the hollow diamond with
// the share the closing touch wrote on its flanks. Opened: the two shares and
// their net, each on the touch's own receipt, the count of trades, and the
// pro-rata sentence with the market's read-more.

import { NoteRowShell } from "@/components/shared/note-row-shell";
import { CountChip } from "@/components/shared/count-chip";
import { HeadingTip } from "@/components/shared/tip-label";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { SpineTokenRow } from "@/components/shared/spine-column";
import { ledgerFieldProv } from "@/lib/polaris/event-provenance";
import { psmGapNetProv } from "@/lib/polaris/market-note-provenance";
import { polarisModal, POLARIS_WORDS } from "@/lib/polaris/event-templates";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatPeth } from "@/lib/polaris/figure-format";
import { formatExact, formatNumber } from "@/lib/utils/format";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { RATE_NOTE_T1, type PsmGapNote } from "@/lib/shared/market-note";

const W = POLARIS_WORDS;

const day = (ts: number) => (ts > 0 ? `${shortDate(ts)} ${shortDateYear(ts)}` : "");

/** The gap's dates, the shared parts said once: "5 – 6 Sep '26",
 *  "25 Aug – 5 Sep '26", "29 Dec '25 – 2 Jan '26", or the one day. */
function gapRange(from: number, to: number): string {
  const a = day(from);
  const b = day(to);
  if (!a || a === b) return b;
  const [ad, am, ay] = a.split(" ");
  const [, bm, by] = b.split(" ");
  if (ay !== by) return `${a} – ${b}`;
  return am === bm ? `${ad} – ${b}` : `${ad} ${am} – ${b}`;
}
const signed = (n: number, text: string) => `${n < 0 ? "−" : "+"}${text}`;

export function PolarisPsmGapRow({ note, isLast = false }: { note: PsmGapNote; isLast?: boolean }) {
  const stable = note.marketSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[note.market].stable.address;
  const coords = { market: note.market, cdpId: note.cdpId, txHash: note.to.txHash, blockNumber: note.to.block };
  // A run of touches' row sums its members' shares (ui-jobs 404).
  const sumProv = (side: "coll" | "debt"): Provenance => ({
    kind: "derived",
    summary: `${side === "coll" ? "Collateral" : "Debt"} share over the run — the sum of the ${side === "coll" ? "pETH" : stable} each touch in it wrote as the CDP's PSM share (${side === "coll" ? "_mintRedeemCollGain" : "_mintRedeemDebtGain"}).`,
    formula: `Σ ${side === "coll" ? "_mintRedeemCollGain" : "_mintRedeemDebtGain"}`,
    inputs: (note.members ?? []).map((g) => ({
      label: `touch at block ${g.to.block.toLocaleString("en-US")}`,
      value: formatExact(side === "coll" ? g.collShare : g.debtShare),
      kind: "chain" as const,
      pclass: "emitted" as const,
    })),
  });
  const collProv = note.members ? sumProv("coll") : ledgerFieldProv("mintRedeemCollGain", coords, note.collShareRaw);
  const debtProv = note.members ? sumProv("debt") : ledgerFieldProv("mintRedeemDebtGain", coords, note.debtShareRaw);
  const collText = signed(note.collShare, formatPeth(Math.abs(note.collShare)));
  const debtText = signed(note.debtShare, formatNumber(Math.abs(note.debtShare)));
  const net = note.priceAtTouch != null ? note.collShare * note.priceAtTouch - note.debtShare : null;
  const range = gapRange(note.from.timestamp, note.to.timestamp);

  // On the spine: the pETH the share added to the collateral points into the
  // position, the debt it added out to the wallet's side, as a touch's legs do.
  const tokens: SpineTokenRow[] = [];
  if (note.collShare !== 0)
    tokens.push({
      symbol: PETH.symbol,
      address: PETH.address,
      direction: note.collShare > 0 ? "right" : "left",
      value: Math.abs(note.collShare),
      display: formatPeth(Math.abs(note.collShare)),
    });
  if (note.debtShare !== 0)
    tokens.push({
      symbol: stable,
      address: stableAddr,
      direction: note.debtShare > 0 ? "left" : "right",
      value: Math.abs(note.debtShare),
      display: formatNumber(Math.abs(note.debtShare)),
    });

  const tradesProv: Provenance | null = note.ordinals
    ? {
        kind: "derived",
        summary: `PSM mints and redemptions in the gap — the market's PrimaryRateSet count at the closing touch less the count at the earlier touch; the primary rate is re-set at every PSM mint and redemption.`,
        formula: "PrimaryRateSet count at the closing touch − count at the earlier touch",
        inputs: [
          {
            label: `PrimaryRateSet count at block ${note.from.block.toLocaleString("en-US")}`,
            value: String(note.ordinals[0]),
            kind: "chain",
            pclass: "indexed",
          },
          {
            label: `PrimaryRateSet count at block ${note.to.block.toLocaleString("en-US")}`,
            value: String(note.ordinals[1]),
            kind: "chain",
            pclass: "indexed",
          },
        ],
      }
    : null;

  const line = (label: string, tip: string, value: React.ReactNode, key: string) => (
    <div className="flex items-baseline justify-between gap-x-3 py-1" data-psm-gap-line={key}>
      <span className="min-w-0 text-rb-500">
        <HeadingTip text={label} tip={tip} />
      </span>
      <span className="shrink-0 tabular-nums text-foreground">{value}</span>
    </div>
  );

  const tradesWords =
    note.trades != null ? `${note.trades.toLocaleString("en-US")} ${W.psm_gap_trades_word}` : W.psm_gap_trades_word;

  return (
    <NoteRowShell
      icon="market"
      isLast={isLast}
      label={`${RATE_NOTE_T1.name}, ${W.psm_gap_head}, ${tradesWords}, ${collText} pETH and ${debtText} ${stable}, ${range}`}
      marker={{ attr: "data-market-note", value: note.id }}
      spine={{ tokens }}
      header={
        // Under 640px the short words, so the caption keeps its count and dates.
        <span
          className="inline-flex max-w-full shrink-0 items-center text-sm text-rb-500 max-sm:min-w-0 max-sm:shrink max-sm:text-xs"
          data-head-kind=""
        >
          <span className="min-w-0 truncate max-sm:hidden">{W.psm_gap_head}</span>
          <span className="min-w-0 truncate sm:hidden">{W.psm_gap_head_short}</span>
          {note.trades != null && note.trades > 0 && <CountChip count={note.trades} />}
        </span>
      }
      meta={
        <span className="evt-meta ml-auto inline-flex min-h-6 items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-foreground">{range}</span>
        </span>
      }
    >
      <div className="px-5 pb-3 pt-2 text-sm" data-psm-gap="">
        {note.collShare !== 0 &&
          line(
            W.psm_gap_coll,
            W.tip_psm_gap_coll,
            <Prov info={collProv} value={formatExact(note.collShare)} symbol={PETH.symbol}>
              {collText} pETH
            </Prov>,
            "coll",
          )}
        {note.debtShare !== 0 &&
          line(
            W.psm_gap_debt,
            W.tip_psm_gap_debt,
            <Prov info={debtProv} value={formatExact(note.debtShare)} symbol={stable}>
              {debtText} {stable}
            </Prov>,
            "debt",
          )}
        {net != null &&
          line(
            W.psm_gap_net,
            W.tip_psm_gap_net,
            <Prov info={psmGapNetProv(note)} value={formatExact(net)} symbol={stable}>
              {signed(net, formatNumber(Math.abs(net)))} {stable}
            </Prov>,
            "net",
          )}
        {tradesProv &&
          note.trades != null &&
          line(
            W.psm_gap_trades,
            W.tip_psm_gap_trades,
            <Prov info={tradesProv} value={String(note.trades)}>
              {note.trades.toLocaleString("en-US")}
            </Prov>,
            "trades",
          )}
        <div className="flex items-start gap-2 pt-2 text-xs leading-relaxed text-rb-500">
          <span className="min-w-0">{W.psm_pro_rata}</span>
          <span className="ml-auto shrink-0">
            <LearnMore inline content={polarisModal("market")} />
          </span>
        </div>
      </div>
    </NoteRowShell>
  );
}
