"use client";

// A family's `ChainTruthStat` list as the card's `cells` slot (ui-jobs 309,
// rails-ops reference/shared-event-card-spec.md §3). The families that drew
// `ChainTruthDetail` keep their stat builders and their receipts; this states
// each stat as a typed cell for the shell's grid (components/shared/
// event-cells.tsx), with the figures written as `ChainTruthDetail` writes
// them: the exact decimal on hover, a figure under 0.01 in the site's number
// format, a ledger cell's figures at the decimals its opened ledger prints.

import { useContext, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ExactTip } from "@/components/shared/amount-text";
import { TipLabel } from "@/components/shared/tip-label";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { useUnreadTokenOf } from "@/components/shared/unread-tokens-context";
import { ValuePill } from "@/components/shared/state-transition";
import { usdAt } from "@/components/shared/event-ledger";
import { EventLedgerContext, ledgerFigure } from "@/components/shared/event-ledger-context";
import { offPar, usdShown } from "@/lib/shared/usd-display";
import { todayUsdProv, useTodayBasisPrices } from "@/components/shared/price-basis";
import { OFF_PAR_BAND, OffParFigure } from "@/components/shared/usd-figure";
import { formatCompact, formatNumber, formatUsdValue } from "@/lib/utils/format";
import type { ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { FlowSide } from "@/lib/shared/flows-timeline";

/** A stat with the key a derived cell's `inputs` name, and those inputs. */
export type ChainTruthCellStat = ChainTruthStat & { key: string; inputs?: string[] };

/** "10,967,283.723" → "10.97M"; placeholders and sub-1000 values pass. */
function compactAmount(full: string): string {
  const n = Number(full.replace(/,/g, ""));
  return Number.isFinite(n) && full.trim() !== "" ? formatCompact(n) : full;
}

/** A before or change figure below 0.01, rewritten from its exact string in
 *  the site's number format; a change keeps its sign. */
function transitionFigure(shown: string, exact: string, signed = true): string {
  const m = /^([+−-]?)(.*)$/.exec(exact.trim());
  if (!m) return shown;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) >= 0.01) return shown;
  const sign = !signed ? "" : m[1] === "-" ? "−" : m[1];
  const body = formatNumber(Math.abs(n));
  return sign && body.startsWith("<") ? `${sign} ${body}` : `${sign}${body}`;
}

function fmtUsdChip(value: number): string {
  if (!Number.isFinite(value) || value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function readableName(value: number, symbol: string): string {
  return `${formatNumber(Math.abs(value))}${symbol ? ` ${symbol}` : ""}`;
}

function readableExact(exact: string, symbol: string): string | undefined {
  const m = /^([+−-]?)(.*)$/.exec(exact.trim());
  const n = m ? Number(m[2].replace(/,/g, "")) : NaN;
  if (!m || !Number.isFinite(n)) return undefined;
  return `${m[1] === "-" ? "−" : m[1]}${formatNumber(n)}${symbol ? ` ${symbol}` : ""}`;
}

/** One figure: at the ledger's decimals where the cell opens into a ledger
 *  (read where it draws, inside the card's ledger source), the exact decimal
 *  on hover. */
function StatFigure({
  side,
  exact,
  shown,
  symbol,
  label,
  word,
}: {
  side?: FlowSide;
  exact: string;
  shown: string;
  symbol: string;
  label?: string;
  /** The symbol as a word after the figure. */
  word?: boolean;
}) {
  const src = useContext(EventLedgerContext);
  const dec = side ? (src?.decimals?.(side) ?? null) : null;
  const m = /^([+−-]?)(.*)$/.exec(exact.trim());
  const n = m ? Number(m[2].replace(/,/g, "")) : NaN;
  let text = shown;
  if (dec != null && Number.isFinite(n) && n < 1e6) {
    const t = ledgerFigure(n, dec, shown);
    if (t !== shown) text = `${m![1] === "-" ? "−" : m![1]}${t}`;
  }
  return (
    <span className="tabular-nums">
      <ExactTip always text={text} exact={exact} symbol={symbol} label={label} />
      {word && symbol ? <span className="font-normal text-rb-500"> {symbol}</span> : null}
    </span>
  );
}

/** A stat cell's dollars with no ledger: at the event's price, or at the
 *  latest block's where the card is set to today. */
function UsdChip({
  usd,
  amount,
  symbol,
  changed,
}: {
  usd: { value: number; prov: Provenance };
  amount: number;
  symbol: string | undefined;
  changed: boolean;
}) {
  const today = useTodayBasisPrices()(symbol);
  const atToday = today != null && symbol != null && amount > 0;
  const value = atToday ? amount * today : usd.value;
  const off = offPar(atToday ? today : amount > 0 ? usd.value / amount : null, symbol);
  return (
    <OffParFigure off={off}>
      <Prov info={atToday ? todayUsdProv(`${symbol} held`, symbol) : usd.prov} value={formatUsdValue(value)}>
        <ValuePill changed={changed}>
          <span className={off?.band ? OFF_PAR_BAND : undefined}>{fmtUsdChip(value)}</span>
        </ValuePill>
      </Prov>
    </OffParFigure>
  );
}

/** One stat as a cell. */
function statCell(
  s: ChainTruthCellStat,
  unread: { address: string; label: string } | undefined,
  word: boolean,
): EventCellSpec {
  const changed = s.changed ?? true;
  const common = { key: s.key, label: s.label, changed, ...(s.inputs ? { inputs: s.inputs } : {}) };
  if (unread)
    return {
      ...common,
      kind: "stat",
      value: { after: { text: <TokenAmountNotLoaded address={unread.address} label={unread.label} /> } },
    };
  const t = s.transition;
  const side = s.ledger;
  const sub: NonNullable<EventCellSpec["sub"]> = [];
  const i = s.interestSincePrevious;
  if (i)
    sub.push({
      content: (
        <>
          <TipLabel text={i.label ?? "Interest since previous event"} tip={i.labelTip} />:{" "}
          <Prov info={i.prov} value={i.value} symbol={s.symbol}>
            <ExactTip
              always
              text={i.display ?? transitionFigure(formatNumber(Number(i.value)), i.value)}
              exact={i.value}
              symbol={s.symbol}
            />
          </Prov>{" "}
          {s.symbol}
          {i.after}
        </>
      ),
    });
  if (s.sub) sub.push({ content: s.sub, changed });
  const usdOn = s.usd != null && usdShown(s.usd.value);
  const held = Number(s.value);
  const value: EventCellSpec["value"] = {
    ...(t
      ? {
          before: {
            text: (
              <StatFigure
                side={side}
                exact={t.beforeExact}
                shown={t.shownAsIs ? t.before : transitionFigure(t.before, t.beforeExact, false)}
                symbol={s.symbol}
                label={s.readableLabel ? readableExact(t.beforeExact, s.symbol) : undefined}
              />
            ),
            info: t.beforeProv,
            value: t.beforeExact,
          },
          delta: {
            text: (
              <StatFigure
                side={side}
                exact={t.changeExact}
                shown={t.shownAsIs ? t.change : transitionFigure(t.change, t.changeExact)}
                symbol={s.symbol}
                label={s.readableLabel ? readableExact(t.changeExact, s.symbol) : undefined}
              />
            ),
            info: t.changeProv,
            value: t.changeExact,
          },
        }
      : {}),
    after: {
      text: (
        <StatFigure
          side={side}
          exact={s.value}
          shown={s.display ?? compactAmount(s.value)}
          symbol={s.symbol}
          word={word}
          label={s.readableLabel && Number.isFinite(held) ? readableName(held, s.symbol) : undefined}
        />
      ),
      info: s.prov,
      value: s.value,
    },
    ...(s.symbol ? { icon: s.symbol, ...(s.address ? { iconAddress: s.address } : {}) } : {}),
    ...(usdOn && !side && s.usd
      ? { chip: <UsdChip usd={s.usd} amount={held} symbol={s.symbol} changed={changed} /> }
      : {}),
  };
  if (side)
    return {
      ...common,
      kind: "ledger",
      side,
      value,
      ...(sub.length ? { sub } : {}),
      ...(usdOn && s.usd
        ? {
            usd: {
              before:
                s.usdBefore && t ? (
                  <Prov info={s.usdBefore.prov} value={formatUsdValue(s.usdBefore.value)}>
                    {fmtUsdChip(s.usdBefore.value)}
                  </Prov>
                ) : null,
              after: (
                <Prov info={s.usd.prov} value={formatUsdValue(s.usd.value)}>
                  {fmtUsdChip(s.usd.value)}
                </Prov>
              ),
              ...(s.symbol && held > 0
                ? usdAt({
                    price: s.usd.value / held,
                    symbol: s.symbol,
                    before: t ? Number(t.beforeExact) : null,
                    after: held,
                  })
                : {}),
            },
          }
        : {}),
    };
  return { ...common, kind: "stat", value, ...(sub.length ? { sub } : {}) };
}

/** The stats as the card's cells. `symbolText` prints each figure's symbol
 *  as a word beside its icon. */
export function useChainTruthCells(stats: ChainTruthCellStat[], symbolText = false): EventCellSpec[] {
  return useStatCells(symbolText)(stats);
}

/** The same, as a function a family calls in whichever branch builds its
 *  stats. */
export function useStatCells(symbolText = false): (stats: ChainTruthCellStat[]) => EventCellSpec[] {
  const unreadOf = useUnreadTokenOf();
  return (stats) => stats.map((s) => statCell(s, s.symbol ? unreadOf(s.address, s.symbol) : undefined, symbolText));
}

/** One short line under the grid: a label, then its figure. */
export function NoteLine({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="text-xs tabular-nums text-rb-500" data-event-note="">
      <span>{label}</span> <span className="font-semibold text-foreground">{children}</span>
    </div>
  );
}

/** The `notes` slot's frame: short lines under the grid. */
export function EventNotes({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 px-5 py-2">{children}</div>;
}

/** Stats a family states as notes in place of cells (an event's terms it did
 *  not change, the parties of a handover): one line each, the label, the
 *  figure with its receipt and symbol, then its sub-line. */
export function StatNotes({ stats }: { stats: ChainTruthStat[] }) {
  if (stats.length === 0) return null;
  return (
    <EventNotes>
      {stats.map((s, i) => {
        const t = s.transition;
        const shown = s.display ?? compactAmount(s.value);
        return (
          <NoteLine key={`${s.label}-${i}`} label={s.label}>
            {t && (
              <span className="font-normal text-rb-500">
                <Prov info={t.beforeProv} value={t.beforeExact}>
                  {t.shownAsIs ? t.before : transitionFigure(t.before, t.beforeExact, false)}
                </Prov>{" "}
                →{" "}
              </span>
            )}
            <Prov info={s.prov} value={s.value}>
              {shown}
            </Prov>
            {s.symbol && !shown.includes(s.symbol) ? (
              <span className="font-normal text-rb-500"> {s.symbol}</span>
            ) : null}
            {s.sub ? <span className="font-normal text-rb-500"> · {s.sub}</span> : null}
          </NoteLine>
        );
      })}
    </EventNotes>
  );
}
