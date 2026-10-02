"use client";

// One Sky Savings position: an address that holds sUSDS. The listing row and
// the position page draw this same card; the page passes `receipts`, the
// Explanation pane and the "?" lesson.
//
// Every figure is at the sealed block the api names (`asOf`), and the page
// draws the card only once the gate has passed. The balance is in sUSDS, its
// worth and the interest earned in USDS (exact decimals in the tooltip), and
// on the page the Savings Rate and the share price in force at that block.

import type { ReactNode } from "react";
import { OpenPositionStats, type OpenPositionStatsColumn } from "@/components/shared/open-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import { Prov } from "@/components/shared/provenance";
import { StatDash, StatFootnote, StatValue } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { AmountText } from "@/components/shared/amount-text";
import { WalletPill } from "@/components/shared/wallet-pill";
import { withRealMinus } from "@/lib/utils/format";
import { skyPositionContent } from "@/lib/sky-savings/learn-more";
import { SUSDS, USDS } from "@/lib/sky-savings/constants";
import { exact, pctString, rayExact, rayNumber, skyYearlyEarnings, units, yearlyText } from "@/lib/sky-savings/math";
import { chiProv, earnedProv, rateProv, sharesHeldProv, valueProv, yearlyProv } from "@/lib/sky-savings/provenance";
import type { SkyAsOf, SkyPosition } from "@/lib/sky-savings/types";

function balanceColumn(p: SkyPosition, block: number, withWorth: boolean): OpenPositionStatsColumn {
  const shares = units(p.shares.raw);
  return {
    label: "Balance",
    value:
      shares > 0 ? (
        <StatValue>
          <Prov info={sharesHeldProv(p.holder, block, p.shares.raw)}>
            <AssetAmount
              value={shares}
              symbol={SUSDS.symbol}
              address={SUSDS.address}
              exact={exact(p.shares.raw)}
              unit
            />
          </Prov>
        </StatValue>
      ) : (
        <StatDash />
      ),
    footnote: !withWorth ? undefined : p.value && shares > 0 ? (
      <StatFootnote>
        <Prov info={valueProv(block, p.value.raw, p.shares.raw, null)} value={exact(p.value.raw)} symbol={USDS.symbol}>
          <span className="tabular-nums">
            worth <AmountText value={units(p.value.raw)} exact={exact(p.value.raw)} symbol={USDS.symbol} />{" "}
            {USDS.symbol}
          </span>
        </Prov>
      </StatFootnote>
    ) : (
      <StatFootnote>nothing held</StatFootnote>
    ),
  };
}

function worthColumn(p: SkyPosition, asOf: SkyAsOf): OpenPositionStatsColumn {
  const v = p.value ? units(p.value.raw) : 0;
  return {
    label: "Worth",
    value:
      p.value && v > 0 ? (
        <StatValue>
          <Prov info={valueProv(asOf.block, p.value.raw, p.shares.raw, asOf.chi)}>
            <AssetAmount value={v} symbol={USDS.symbol} address={USDS.address} exact={exact(p.value.raw)} />
          </Prov>
        </StatValue>
      ) : (
        <StatDash />
      ),
  };
}

function earnedColumn(p: SkyPosition, block: number, asOf?: SkyAsOf): OpenPositionStatsColumn {
  if (!p.earned) return { label: "Interest earned", value: <StatDash /> };
  const yearly = asOf ? skyYearlyEarnings(p, asOf) : null;
  const e = units(p.earned.raw);
  const full = withRealMinus(exact(p.earned.raw));
  return {
    label: "Interest earned",
    value: (
      <StatValue title={`${full} ${USDS.symbol}`}>
        <Prov info={earnedProv(block, p.earned.raw, p.value?.raw ?? "0", p.usdsIn.raw, p.usdsOut.raw)}>
          <AssetAmount
            value={e}
            symbol={USDS.symbol}
            address={USDS.address}
            exact={exact(p.earned.raw)}
            signed={e < 0}
          />
        </Prov>
      </StatValue>
    ),
    footnote:
      yearly != null && asOf ? (
        <StatFootnote>
          <Prov
            info={yearlyProv(asOf.block, p.value!.raw, asOf.ssr, pctString(asOf.ssrAnnual))}
            value={yearly.toFixed(2)}
            symbol={USDS.symbol}
          >
            <span className="tabular-nums">
              about {yearlyText(yearly)} {USDS.symbol} a year at {pctString(asOf.ssrAnnual)}
            </span>
          </Prov>
        </StatFootnote>
      ) : undefined,
  };
}

function rateColumn(asOf: SkyAsOf): OpenPositionStatsColumn {
  return {
    label: "Savings Rate",
    value: (
      <StatValue>
        <Prov info={rateProv(asOf.block, asOf.ssr, pctString(asOf.ssrAnnual))} value={pctString(asOf.ssrAnnual)}>
          <span>{pctString(asOf.ssrAnnual)}</span>
        </Prov>
      </StatValue>
    ),
    footnote: asOf.chi ? (
      <StatFootnote>
        <Prov info={chiProv(asOf)} value={rayExact(asOf.chi)} symbol={USDS.symbol}>
          <span className="tabular-nums">
            1 {SUSDS.symbol} = {rayNumber(asOf.chi).toFixed(6)} {USDS.symbol}
          </span>
        </Prov>
      </StatFootnote>
    ) : undefined,
  };
}

function Identity({ p }: { p: SkyPosition }) {
  return <WalletPill wallet={p.holder} ensName={null} filterProtocol="sky-savings" bookmarkProtocol="sky-savings" />;
}

function Meta({ p }: { p: SkyPosition }) {
  return (
    <PositionCardMeta
      lastActivityAt={p.activity.lastTimestamp ?? null}
      eventCount={p.activity.events}
      eventCountNoun="event"
    />
  );
}

export function SkySavingsPositionCard({
  p,
  asOf,
  surface = "listing",
  explanation,
  rowExtra,
  viewHref,
}: {
  p: SkyPosition;
  asOf: SkyAsOf;
  surface?: "listing" | "detail";
  explanation?: ReactNode;
  rowExtra?: ReactNode;
  viewHref?: () => string;
}) {
  const detail = surface === "detail";
  const open = p.status === "open";
  // One status word on every surface: the listing's OPEN / CLOSED.
  const statusPill = <LifecyclePill status={open ? "open" : "closed"} />;
  const columns = detail
    ? [balanceColumn(p, asOf.block, true), earnedColumn(p, asOf.block, asOf), rateColumn(asOf)]
    : [balanceColumn(p, asOf.block, false), worthColumn(p, asOf), earnedColumn(p, asOf.block)];
  return (
    <PositionCardShell
      receipts={detail}
      explanation={detail ? explanation : undefined}
      learnMore={detail ? skyPositionContent() : undefined}
      rowExtra={detail ? rowExtra : undefined}
      viewHref={viewHref}
    >
      <OpenPositionStats
        statusPill={statusPill}
        // The detail page draws the holder on the wallet row above the card
        // (ui-jobs 228).
        leadingIdentity={detail ? undefined : <Identity p={p} />}
        identity={<Meta p={p} />}
        columns={columns}
      />
    </PositionCardShell>
  );
}
