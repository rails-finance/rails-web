"use client";

// Maple custody card, the detail card for a known-infrastructure address (the
// Chainlink CCIP bridge escrows). A slot builder for the shared position card
// (rails-ops TO-DO-position-card 322), with every figure <Prov>-traced, but
// custody claims instead of lending claims: the escrow HOLDS pool shares that
// back bridged balances on other networks. It does not lend, so there is no
// principal, no interest, no queue (the Compound V3 lesson: custody is custody,
// and no deposit). Amounts stay in the pool's asset; Rails never pins a
// stablecoin to $1.
//
// Every figure rides the one custody chain read (one multicall, one block;
// lib/sources/chain/maple-custody.ts): the direct share balance, its value at
// the pool's exit price, and the escrow's fraction of the pool supply.

import {
  PositionCard,
  type PositionCardHead,
  type PositionCardSlots,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov } from "@/components/shared/provenance";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatUnitsExact } from "@/lib/utils/format";
import {
  custodySharesProv,
  custodySupplyShareProv,
  custodyValueProv,
  poolExitRateProv,
} from "@/lib/maple/event-provenance";
import type { CcipEscrow } from "@/lib/shared/known-infrastructure";
import type { MapleCustodyHolding } from "@/lib/sources/chain/maple-custody";
import { AmountText, ExactSpan } from "@/components/shared/amount-text";
import { MapleMenuRows } from "./maple-menu-rows";
import { formatCompact } from "@/lib/shared/format-compact";
import { PanelFigure } from "@/components/shared/position-card-panel";

/** The first headline: what the locked shares redeem for, in the pool's own
 *  asset, or shares alone when the value derivation degraded. */
function CustodyLines({ holdings }: { holdings: MapleCustodyHolding[] }) {
  return (
    <div className="flex flex-col gap-1">
      {holdings.map((h) => (
        <div key={h.pool}>
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
        </div>
      ))}
    </div>
  );
}

/** The escrow's fraction of each pool's whole share supply. */
function SupplyShareLines({ holdings }: { holdings: MapleCustodyHolding[] }) {
  return (
    <div className="flex flex-col gap-1">
      {holdings.map((h) => (
        <div key={h.pool}>
          <Prov info={custodySupplyShareProv(h.symbol, h.blockNumber)}>
            <span data-prov-exact={`${((h.supplyShare ?? 0) * 100).toFixed(4)}% of ${h.symbol} supply`}>
              {((h.supplyShare ?? 0) * 100).toFixed(2)}%
            </span>
          </Prov>
        </div>
      ))}
    </div>
  );
}

/** The card's Explanation pane — what the face figures mean, third person,
 *  describing only the custody that exists now. */
function CustodyExplanation({ infra, holdings }: { infra: CcipEscrow; holdings: MapleCustodyHolding[] }) {
  const bullets: React.ReactNode[] = holdings.map((h) => (
    <span key={h.pool}>
      The contract holds{" "}
      <H>
        <AmountText value={h.shares} format="compact" />
      </H>{" "}
      {h.symbol}
      {h.exitValue != null && (
        <>
          , worth{" "}
          <H>
            <AmountText value={h.exitValue} format="compact" />
          </H>{" "}
          {h.assetSymbol} at the pool&rsquo;s current exit price
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
  wallet,
  holdings,
  viewHref,
}: {
  infra: CcipEscrow;
  /** The escrow contract's address. */
  wallet: string;
  holdings: MapleCustodyHolding[];
  /** Copy-this-view control: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  const live = holdings.filter((h) => h.shares > 0);
  const valued = live.filter((h) => h.supplyShare != null);

  const heads: PositionCardHead[] = [
    {
      // AssetAmount's towed glyph identifies the asset: an escrow holds
      // one pool's shares, so a cluster would only repeat it.
      id: "held-in-custody",
      label: "Held in custody",
      value: live.length > 0 ? <CustodyLines holdings={live} /> : null,
    },
    {
      id: "supply-share",
      label: "Share of pool supply",
      value: valued.length > 0 ? <SupplyShareLines holdings={valued} /> : null,
    },
  ];

  // The exact locked balance of each pool, with the exit rate it was valued at.
  const rows: PositionPanelRow[] = live.map((h) => ({
    id: `locked-${h.pool}`,
    label: `${h.symbol} locked`,
    value: (
      <span className="tabular-nums">
        <Prov info={custodySharesProv(h.symbol, h.blockNumber)}>
          <ExactSpan exact={`${formatUnitsExact(h.raw.shares, 6)} ${h.symbol}`} symbol={h.symbol}>
            <PanelFigure>{formatCompact(h.shares)}</PanelFigure> {h.symbol}
          </ExactSpan>
        </Prov>
        {h.exitValue != null && (
          <>
            {" "}
            <Prov info={poolExitRateProv(h.assetSymbol, h.symbol, h.blockNumber)}>
              @ <PanelFigure>{h.exitRate.toFixed(4)}</PanelFigure>
            </Prov>
          </>
        )}
      </span>
    ),
    tip: `${h.symbol} the contract holds, read from the share token's balance, and the rate one share pays on withdrawal, read from the pool in the same block.`,
  }));

  const slots: PositionCardSlots = {
    surface: "detail",
    status: null,
    heads,
    // Custody is what this address is.
    identity: (
      <span className="flex items-center gap-2 text-xs text-rb-500">
        <span className="text-sm font-semibold text-foreground">{infra.name}</span>
        Custody
      </span>
    ),
    counters: null,
    explainer: { body: <CustodyExplanation infra={infra} holdings={live} />, viewHref },
    learnMore: null,
    menu: {
      leading: () => (
        <MapleMenuRows address={wallet} pagePath={`/ethereum/maple/${wallet}`} noun="address" idLabel="Contract" />
      ),
      exports: null,
    },
    panel: [rows, []],
  };
  return <PositionCard slots={slots} />;
}
