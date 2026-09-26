// One Alchemix V2 position, as a listing row, and the stat columns its page
// reuses.
//
// EVERY V2 POSITION IS CLOSED, AT 2026-04-02. V2 was wound down that day and
// every figure is the Alchemist's own read at the frozen block. The pill says
// Closed and each figure carries the date.
//
// THE DEBT IS SIGNED. A negative debt is credit the account never drew, and is
// stated as credit, never as a negative owed.
//
// THE V3 SUCCESSOR IS A LINK. Where the wallet holds a V3 position on the same
// synthetic, the row links to it by name. No V3 figure is drawn beside a V2
// one, because the two are one obligation at two points in time.

import type { ReactNode } from "react";
import Link from "next/link";
import { OpenPositionStats, type OpenPositionStatsColumn } from "@/components/shared/open-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatValue, StatFootnote } from "@/components/shared/stat-value";
import { WalletPill } from "@/components/shared/wallet-pill";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { formatHeadlineAmount, formatUnitsExact } from "@/lib/utils/format";
import { alchemixPositionName, alchemixV2PositionName } from "@/lib/alchemix/naming";
import type { AlchemixV2PositionSummary } from "@/types/api/alchemix";

/** alUSD and alETH are 18 decimals each, read from the tokens. */
const SYNTHETIC_DECIMALS = 18;

/** "2 Apr 2026", in the house date locale. */
export function closedOn(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function V2ClosedPill() {
  return (
    <span className="font-bold tracking-wider uppercase px-2 py-0.5 rounded-xs text-xs bg-rb-300 dark:bg-rb-700 text-foreground/70">
      Closed
    </span>
  );
}

export function v2DebtColumn(p: AlchemixV2PositionSummary, prov?: Provenance): OpenPositionStatsColumn {
  const d = p.frozenDebt;
  if (!d) {
    return { label: "Debt at close", value: <StatValue color="text-rb-500">Not read</StatValue> };
  }
  const magnitude = d.raw.replace(/^-/, "");
  const figure = (
    <>
      {formatHeadlineAmount(Math.abs(d.formatted))} {p.syntheticSymbol}
    </>
  );
  return {
    label: d.sign === "credit" ? "Credit at close" : "Debt at close",
    value: (
      <StatValue title={`${formatUnitsExact(magnitude, SYNTHETIC_DECIMALS)} ${p.syntheticSymbol}`}>
        {prov ? (
          <Prov info={prov} value={formatUnitsExact(magnitude, SYNTHETIC_DECIMALS)} symbol={p.syntheticSymbol}>
            {figure}
          </Prov>
        ) : (
          figure
        )}
      </StatValue>
    ),
    footnote: (
      <StatFootnote>
        <span className="tabular-nums">at block {p.frozenAtBlock.toLocaleString("en-US")}</span>
        {d.sign === "credit" ? <div className="mt-0.5 leading-snug">credit the account never drew</div> : null}
      </StatFootnote>
    ),
  };
}

export function v2CollateralColumn(
  p: AlchemixV2PositionSummary,
  provFor?: (index: number) => Provenance | undefined,
): OpenPositionStatsColumn {
  const held = p.collateral.filter((c) => c.underlying && !c.readStale);
  if (held.length === 0) {
    return { label: "Collateral at close", value: <StatValue color="text-rb-500">None</StatValue> };
  }
  const lead = held[0];
  const u = lead.underlying!;
  const figure = (
    <>
      {formatHeadlineAmount(u.formatted)} {u.symbol}
    </>
  );
  const prov = provFor?.(p.collateral.indexOf(lead));
  const rest = held.length - 1;
  return {
    label: "Collateral at close",
    value: (
      <StatValue title={`${formatUnitsExact(u.raw, u.decimals)} ${u.symbol}`}>
        {prov ? (
          <Prov info={prov} value={formatUnitsExact(u.raw, u.decimals)} symbol={u.symbol}>
            {figure}
          </Prov>
        ) : (
          figure
        )}
      </StatValue>
    ),
    footnote: (
      <StatFootnote>
        <span className="tabular-nums">
          in {lead.yieldToken.symbol}
          {rest > 0 ? `, and ${rest} more ${rest === 1 ? "token" : "tokens"}` : ""}
        </span>
      </StatFootnote>
    ),
  };
}

/** The V3 position(s) this wallet holds now: links, by name. */
export function v3SuccessorLinks(
  p: AlchemixV2PositionSummary,
  hrefFor: (lineKey: string, tokenId: string) => string,
): ReactNode {
  if (p.v3Successors.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {p.v3Successors.map((s, i) => (
        <span key={`${s.lineKey}:${s.tokenId}`}>
          <Link href={hrefFor(s.lineKey, s.tokenId)} className="link">
            {alchemixPositionName(p.syntheticSymbol, s.tokenId)}
          </Link>
          {i < p.v3Successors.length - 1 ? "," : ""}
        </span>
      ))}
    </span>
  );
}

export function AlchemixV2PositionCard({ p, session }: { p: AlchemixV2PositionSummary; session: SessionProtocol }) {
  return (
    <PositionCardShell>
      <OpenPositionStats
        statusPill={<V2ClosedPill />}
        leadingIdentity={
          <>
            <span className="text-xs font-bold tracking-wide text-foreground/80">
              {alchemixV2PositionName(p.syntheticSymbol, p.account)}
            </span>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-rb-500">
              <span>closed {closedOn(p.closedAt)}</span>
              <WalletPill wallet={p.account} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
            </span>
          </>
        }
        columns={[
          v2DebtColumn(p),
          v2CollateralColumn(p),
          {
            label: "Now on V3",
            value: (
              <StatValue color={p.v3Successors.length > 0 ? "text-foreground/80" : "text-rb-500"}>
                {p.v3Successors.length > 0 ? p.v3Successors.length : "None"}
              </StatValue>
            ),
            footnote:
              p.v3Successors.length > 0 ? (
                <StatFootnote>
                  {p.v3Successors.length === 1 ? "position" : "positions"} this wallet holds now
                </StatFootnote>
              ) : (
                <StatFootnote>this wallet holds no V3 position on {p.syntheticSymbol}</StatFootnote>
              ),
          },
        ]}
      />
    </PositionCardShell>
  );
}
