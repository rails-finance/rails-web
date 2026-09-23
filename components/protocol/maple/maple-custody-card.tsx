"use client";

// Maple custody card — the detail card for a known-infrastructure address
// (the Chainlink CCIP bridge escrows). Same grammar as the lender position
// card (PositionCardShell + OpenPositionStats, every figure <Prov>-traced),
// but custody claims instead of lending claims: the escrow HOLDS pool shares
// that back bridged balances on other networks — it does not lend, so there
// is no principal, no interest, no queue column (the Compound V3 lesson:
// custody is custody, not a deposit). Amounts stay in the pool's own asset —
// Rails never pins a stablecoin to $1.
//
// Every figure rides the one custody chain read (one multicall, one block;
// lib/sources/chain/maple-custody.ts): the direct share balance, its value at
// the pool's exit price, and the escrow's fraction of the pool supply.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov } from "@/components/shared/provenance";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatCompact, formatUnitsExact } from "@/lib/utils/format";
import {
  custodySharesProv,
  custodySupplyShareProv,
  custodyValueProv,
  poolExitRateProv,
} from "@/lib/maple/event-provenance";
import type { CcipEscrow } from "@/lib/shared/known-infrastructure";
import type { MapleCustodyHolding } from "@/lib/sources/chain/maple-custody";

/** The headline stack: what the locked shares redeem for, in the pool's own
 *  asset — shares alone when the value derivation degraded. */
function CustodyStack({ holdings }: { holdings: MapleCustodyHolding[] }) {
  if (holdings.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {holdings.map((h) => (
        <StatValue key={h.pool}>
          <Prov
            info={
              h.exitValue != null
                ? custodyValueProv(h.assetSymbol, h.symbol, h.blockNumber)
                : custodySharesProv(h.symbol, h.blockNumber)
            }
          >
            <AssetAmount
              value={h.exitValue ?? h.shares}
              symbol={h.exitValue != null ? h.assetSymbol : h.symbol}
              exact={`${formatUnitsExact(h.raw.shares, 6)} ${h.symbol} locked`}
            />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** Per-pool share amounts beneath the headline — the exact locked balances,
 *  each with the exit rate it was valued at (the lender card's footnote
 *  idiom). */
function CustodyFootnoteLines({ holdings }: { holdings: MapleCustodyHolding[] }) {
  if (holdings.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {holdings.map((h) => {
        const exact = `${formatUnitsExact(h.raw.shares, 6)} ${h.symbol}`;
        return (
          <div key={h.pool}>
            <Prov info={custodySharesProv(h.symbol, h.blockNumber)}>
              <span title={exact} data-prov-exact={exact} data-prov-symbol={h.symbol}>
                {formatCompact(h.shares)} {h.symbol}
              </span>
            </Prov>
            {h.exitValue != null && (
              <>
                {" "}
                <Prov info={poolExitRateProv(h.assetSymbol, h.symbol, h.blockNumber)}>
                  <span className="text-rb-500">@ {h.exitRate.toFixed(4)}</span>
                </Prov>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The escrow's fraction of each pool's whole share supply. */
function SupplyShareStack({ holdings }: { holdings: MapleCustodyHolding[] }) {
  const valued = holdings.filter((h) => h.supplyShare != null);
  if (valued.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {valued.map((h) => (
        <StatValue key={h.pool}>
          <Prov info={custodySupplyShareProv(h.symbol, h.blockNumber)}>
            <span data-prov-exact={`${((h.supplyShare ?? 0) * 100).toFixed(4)}% of ${h.symbol} supply`}>
              {((h.supplyShare ?? 0) * 100).toFixed(2)}%
            </span>
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** The card's Explanation pane — what the face figures mean, third person,
 *  describing only the custody that exists now. */
function CustodyExplanation({ infra, holdings }: { infra: CcipEscrow; holdings: MapleCustodyHolding[] }) {
  const bullets: React.ReactNode[] = holdings.map((h) => (
    <span key={h.pool}>
      The contract holds <H>{formatCompact(h.shares)}</H> {h.symbol}
      {h.exitValue != null && (
        <>
          , worth <H>{formatCompact(h.exitValue)}</H> {h.assetSymbol} at the pool&rsquo;s current exit price
        </>
      )}
      {h.supplyShare != null && (
        <>
          {" "}
          — {((h.supplyShare ?? 0) * 100).toFixed(2)}% of all {h.symbol} in existence
        </>
      )}
      . That value belongs to the holders of the bridged shares, not to the escrow.
    </span>
  ));
  bullets.push(
    <span key="custody">
      Custody, not lending: the contract never deposits or withdraws on its own, so it has no lender history here.
      Lenders&rsquo; own moves through the bridge appear on their own timelines, with this escrow named as the
      counterparty.
    </span>,
  );
  return (
    <ProseExplainer
      paragraph={
        <>
          {infra.name} is Chainlink&rsquo;s bridge custody for {infra.poolSymbol}: shares locked here on Ethereum back
          bridged {infra.poolSymbol} balances on other networks.
        </>
      }
      items={bullets}
    />
  );
}

export function MapleCustodyCard({
  infra,
  holdings,
  viewHref,
}: {
  infra: CcipEscrow;
  holdings: MapleCustodyHolding[];
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  const live = holdings.filter((h) => h.shares > 0);
  return (
    <PositionCardShell receipts explanation={<CustodyExplanation infra={infra} holdings={live} />} viewHref={viewHref}>
      <OpenPositionStats
        statusPill={
          <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
            Custody
          </span>
        }
        leadingIdentity={<span className="text-sm font-semibold text-foreground">{infra.name}</span>}
        columns={[
          {
            // AssetAmount's towed glyph identifies the asset — an escrow holds
            // exactly one pool's shares, so a cluster would only repeat it.
            label: "Held in custody",
            value: <CustodyStack holdings={live} />,
            footnote: <CustodyFootnoteLines holdings={live} />,
          },
          {
            label: "Share of pool supply",
            value: <SupplyShareStack holdings={live} />,
          },
        ]}
      />
    </PositionCardShell>
  );
}
