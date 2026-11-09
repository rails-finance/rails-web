"use client";

// One Maple pool's page on Ethereum (rails-ops ui-jobs 549 step 4): the holder
// finder (V4), the vault card (V2) and where the assets are (V3), on the vault
// grammar the other families draw. One block's read of the pool, its
// PoolManager, its two LoanManagers and its withdrawal queue
// (lib/sources/chain/maple-pool-state.ts). The daily store keeps no Maple
// series, so there is no Yield figure and no "last 30 days" (V5). The Steward
// is the pool delegate.

import { ProvReceiptsScope, Prov, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import type { PositionPanelRow } from "@/components/shared/position-card-panel";
import { NotLoaded } from "@/components/shared/not-loaded";
import { CreatedBullet, VaultCard, type VaultMenuLink } from "@/components/vaults/vault-card";
import { VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { VaultFinder } from "@/components/vaults/vault-finder";
import { StatAmount } from "@/components/vaults/stat-amount";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { assetText, pctText, sharePriceText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { formatCompact } from "@/lib/shared/format-compact";
import { serverReadAt, stampServerRead } from "@/lib/shared/server-head-read";
import type { MaplePool } from "@/lib/maple/asset-catalog";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import { maplePoolSummary } from "@/lib/vaults/summary";
import { vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports, type VaultExportModel } from "@/lib/vaults/card-export";
import { maplePoolPositionsHref, maplePoolsHref } from "@/lib/vaults/routes";
import {
  MAPLE_DELEGATE_TIP,
  SHARES_ISSUED_TIP,
  maplePoolAssetsContent,
  maplePoolCardContent,
} from "@/lib/vaults/card-words";
import {
  poolCashProv,
  poolDelegateProv,
  poolExitRateProv,
  poolLoanManagerAumProv,
  poolNavRateProv,
  poolQueueSharesProv,
  poolStrategiesAumProv,
  poolTotalAssetsProv,
  poolTotalSupplyProv,
  poolUnrealizedLossesProv,
} from "@/lib/maple/event-provenance";

const UNREAD = <NotLoaded className="text-base font-normal text-rb-500" />;
const ZERO = BigInt(0);
const eth = (kind: "address" | "block", v: string | number) => explorerUrl(MAINNET_CHAIN_ID, kind, v);

export function MaplePoolPage({
  pool: p,
  state: s,
  readAt,
}: {
  pool: MaplePool;
  state: MaplePoolState;
  readAt: string;
}) {
  const registry = useReceiptRegistry();
  const v = maplePoolSummary(p, s, { block: s.blockNumber, timestamp: readAt });
  const readBy = serverReadAt(s.head, s.blockNumber);
  const withRead = (x: Provenance) => stampServerRead(x, readBy);
  const unit = p.assetSymbol;
  const d = p.decimals;
  const raw = (r: string): RawAmount => ({ raw: r, value: Number(r) / 10 ** d });
  const total = BigInt(s.raw.totalAssets);
  const supply = BigInt(s.raw.totalSupply);
  const losses = BigInt(s.raw.unrealizedLosses);
  const fraction = (part: string): number | null =>
    total > ZERO ? Number((BigInt(part) * BigInt(1e9)) / total) / 1e9 : null;
  // The queue's shares at the pool's exit math, as the pool computes it.
  const queueRaw = BigInt(s.raw.queueShares);
  const queueValue = supply > ZERO ? raw(((queueRaw * (total - losses)) / supply).toString()) : null;
  const cash = BigInt(s.raw.cash);
  const delegate = s.poolDelegate;
  const fig = (name: string, value: React.ReactNode, rawValue?: string) => (
    <span data-cell={name} data-raw={rawValue ?? ""}>
      {value}
    </span>
  );

  const stats: PositionPanelRow[] = [
    {
      id: "shares-issued",
      label: "Shares issued",
      tip: SHARES_ISSUED_TIP,
      sub: p.symbol,
      value: fig(
        "total-supply",
        <Prov info={withRead(poolTotalSupplyProv(p.symbol, s.blockNumber))}>
          <StatAmount amount={raw(s.raw.totalSupply)} decimals={d} shares />
        </Prov>,
        s.raw.totalSupply,
      ),
    },
    {
      id: "exit-rate",
      label: "Exit rate",
      tip: "What one share pays on withdrawal. It is below the share price only while a loan is marked as impaired.",
      asset: { symbol: unit, address: p.asset },
      value: fig(
        "exit-rate",
        <Prov info={withRead(poolExitRateProv(unit, p.symbol, s.blockNumber))}>
          {sharePriceText(raw(s.raw.exitRate), d)}
        </Prov>,
        s.raw.exitRate,
      ),
    },
    {
      id: "queue",
      label: "Withdrawal queue",
      tip: "Shares waiting to be paid out, first in, first out, from the cash in the pool.",
      sub:
        queueRaw === ZERO
          ? "empty"
          : queueValue
            ? `${formatCompact(queueValue.value)} ${unit}, ${BigInt(queueValue.raw) <= cash ? "within" : "more than"} the cash`
            : undefined,
      value: fig(
        "queue-shares",
        <Prov info={withRead(poolQueueSharesProv(p.symbol, s.blockNumber))}>
          <StatAmount amount={raw(s.raw.queueShares)} decimals={d} shares />
        </Prov>,
        s.raw.queueShares,
      ),
    },
    {
      id: "impaired",
      label: "Marked as impaired",
      tip: "Loans the pool delegate has marked as likely to lose value. A lender who exits while a mark stands takes a part of it.",
      asset: { symbol: unit, address: p.asset },
      value: fig(
        "unrealized-losses",
        <Prov info={withRead(poolUnrealizedLossesProv(unit, s.blockNumber))}>
          <StatAmount amount={raw(s.raw.unrealizedLosses)} decimals={d} symbol={unit} />
        </Prov>,
        s.raw.unrealizedLosses,
      ),
    },
    {
      id: "steward",
      label: "Steward",
      sub: "pool delegate",
      tip: MAPLE_DELEGATE_TIP,
      value: fig(
        "pool-delegate",
        delegate ? (
          <span className="font-mono text-sm" data-steward={delegate} data-steward-role="poolDelegate">
            <Prov info={withRead(poolDelegateProv(p.symbol, delegate, s.blockNumber))}>{shortAddress(delegate)}</Prov>
          </span>
        ) : (
          UNREAD
        ),
      ),
    },
  ];

  const legs: { key: string; venue: string; sub: string; raw: string; prov: Provenance }[] = [
    {
      key: "liquid",
      venue: "Liquid now",
      sub: "in the pool, paid out first",
      raw: s.raw.cash,
      prov: withRead(poolCashProv(unit, s.blockNumber)),
    },
    {
      key: "fixed-term",
      venue: "Fixed-term loans",
      sub: "run to a maturity date",
      raw: s.raw.fixedTermAum,
      prov: withRead(poolLoanManagerAumProv(unit, "fixed-term", s.blockNumber)),
    },
    {
      key: "open-term",
      venue: "Open-term loans",
      sub: "no maturity; the pool delegate can call them",
      raw: s.raw.openTermAum,
      prov: withRead(poolLoanManagerAumProv(unit, "open-term", s.blockNumber)),
    },
    {
      key: "strategies",
      venue: "Other strategies",
      sub: "on-chain strategies apart from the loans",
      raw: s.raw.strategiesAum,
      prov: withRead(poolStrategiesAumProv(unit, s.blockNumber)),
    },
  ];
  const rows: VaultAssetRow[] = legs.map((l) => ({
    key: l.key,
    venue: l.venue,
    sub: l.sub,
    amount: raw(l.raw),
    amountProv: l.prov,
    amountFigure: `maple-${l.key}`,
    share: fraction(l.raw),
    shareProv: vaultVenueShareProv(v, l.venue, "the pool's total assets", readBy),
    hooks: { "data-maple-leg": l.key, "data-asset-row": l.key },
  }));
  // Cash plus every strategy's assets is the pool's total; a gap of a
  // hundredth of a percent or more means a leg did not answer, and the line
  // says so.
  const sum = legs.reduce((acc, l) => acc + BigInt(l.raw), ZERO);
  const gap = total - sum;
  const gapLarge = (gap < ZERO ? -gap : gap) * BigInt(10_000) >= total && gap !== ZERO;

  const exportModel: VaultExportModel = {
    stats: [
      ["Shares issued", shareText(raw(s.raw.totalSupply), d)],
      ["Exit rate", `${assetText(raw(s.raw.exitRate), d)} ${unit}`],
      ["Withdrawal queue", `${shareText(raw(s.raw.queueShares), d)} ${p.symbol}`],
      ["Marked as impaired", `${assetText(raw(s.raw.unrealizedLosses), d)} ${unit}`],
      ["Steward (pool delegate)", delegate ?? "not read"],
    ],
    rows: rows.map((r) => [
      String(r.venue),
      r.amount ? assetText(r.amount, d) : "not read",
      r.share == null ? "" : pctText(r.share),
    ]),
  };

  const links: VaultMenuLink[] = [
    {
      item: "pools",
      title: "All Maple pools",
      subtitle: "The pools side by side",
      href: maplePoolsHref(),
      internal: true,
    },
    {
      item: "positions",
      title: "Positions in this pool",
      subtitle: `Every lender holding ${p.symbol}`,
      href: maplePoolPositionsHref(p.key),
      internal: true,
    },
    {
      item: "vault-contract",
      title: "Pool contract",
      subtitle: `${shortAddress(p.pool)} on Etherscan`,
      href: eth("address", p.pool),
    },
    {
      item: "pool-manager",
      title: "Pool manager",
      subtitle: `${shortAddress(p.poolManager)} on Etherscan`,
      href: eth("address", p.poolManager),
    },
    ...(delegate
      ? [
          {
            item: "steward",
            title: "Pool delegate on Etherscan",
            subtitle: shortAddress(delegate),
            href: eth("address", delegate),
          },
        ]
      : []),
    {
      item: "withdrawal-manager",
      title: "Withdrawal queue",
      subtitle: `${shortAddress(p.withdrawalManager)} on Etherscan`,
      href: eth("address", p.withdrawalManager),
    },
    {
      item: "created",
      title: "Created",
      subtitle: `Block ${p.deployBlock.toLocaleString("en-US")} on Etherscan`,
      href: eth("block", p.deployBlock),
    },
    {
      item: "venue-page",
      title: "On Maple's app",
      subtitle: "app.maple.finance",
      href: "https://app.maple.finance/earn",
    },
    {
      item: "docs",
      title: "Maple's documentation",
      subtitle: "docs.maple.finance",
      href: "https://docs.maple.finance",
    },
  ];

  const loansRaw = (BigInt(s.raw.fixedTermAum) + BigInt(s.raw.openTermAum)).toString();
  const explanation = (
    <div data-vault-explanation="">
      <ExplainGroup title="Holdings">
        <ExplainBullet>
          This pool holds{" "}
          <Fig>
            {assetText(raw(s.raw.totalAssets), d)} {unit}
          </Fig>
          :{" "}
          <Fig>
            {assetText(raw(s.raw.cash), d)} {unit}
          </Fig>{" "}
          in the pool and{" "}
          <Fig>
            {assetText(raw(loansRaw), d)} {unit}
          </Fig>{" "}
          lent to Maple&rsquo;s borrowers.
        </ExplainBullet>
        <ExplainBullet>
          One share is worth{" "}
          <Fig>
            {assetText(raw(s.raw.navRate), d)} {unit}
          </Fig>{" "}
          and pays{" "}
          <Fig>
            {assetText(raw(s.raw.exitRate), d)} {unit}
          </Fig>{" "}
          on withdrawal.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Risk">
        {delegate && (
          <ExplainBullet>
            The pool delegate <Fig>{shortAddress(delegate)}</Fig> funds and calls the loans, and marks a loan as
            impaired.
          </ExplainBullet>
        )}
        <ExplainBullet>
          Custodians hold the loans&rsquo; collateral off the chain, so the loan book is read as Maple records it.
        </ExplainBullet>
        <ExplainBullet>
          {losses > ZERO ? (
            <>
              <Fig>
                {assetText(raw(s.raw.unrealizedLosses), d)} {unit}
              </Fig>{" "}
              of loans are marked as impaired; a lender who exits now takes a part of it.
            </>
          ) : (
            <>No loan is marked as impaired, so the exit rate equals the share price.</>
          )}
        </ExplainBullet>
        <ExplainBullet>
          Withdrawals wait in a queue and are paid from the cash in the pool, first in, first out
          {queueRaw > ZERO && queueValue ? (
            <>
              ;{" "}
              <Fig>
                {assetText(queueValue, d)} {unit}
              </Fig>{" "}
              is waiting now
            </>
          ) : (
            <>; the queue is empty</>
          )}
          .
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Rate">
        <ExplainBullet>The share price rises as borrowers pay interest.</ExplainBullet>
        <ExplainBullet>No yield figure: Rails keeps no daily share-price series for Maple pools.</ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="History">
        <CreatedBullet chainId={MAINNET_CHAIN_ID} block={p.deployBlock > 0 ? p.deployBlock : null} by="Maple" />
      </ExplainGroup>
    </div>
  );

  const status =
    losses > ZERO
      ? {
          word: "Impaired",
          tone: "caution" as const,
          tip: "A loan is marked as impaired: a withdrawal pays the exit rate, below the share price.",
        }
      : null;

  return (
    <ProvReceiptsScope registry={registry}>
      <VaultFinder noun="pool" />
      <VaultCard
        vault={v}
        yieldFigure={{ none: "no-series" }}
        holdersHref={null}
        receipts={{
          totalAssets: withRead(poolTotalAssetsProv(unit, s.blockNumber)),
          sharePrice: withRead(poolNavRateProv(unit, p.symbol, s.blockNumber)),
        }}
        hooks={{ "data-maple-pool": p.key }}
        status={status}
        stats={stats}
        links={links}
        explanation={explanation}
        learnMore={maplePoolCardContent()}
        stamp={
          <SectionReadStamp
            chainId={MAINNET_CHAIN_ID}
            block={s.blockNumber}
            readBy={readBy}
            info={(at) =>
              readStampProv({
                chainId: MAINNET_CHAIN_ID,
                block: s.blockNumber,
                at,
                readBy,
                what: "Every figure on this card and in where the assets are",
                contracts: [
                  {
                    name: p.symbol,
                    address: p.pool,
                    reads: "totalAssets(), totalSupply(), unrealizedLosses(), convertToAssets(), convertToExitAssets()",
                  },
                  { name: unit, address: p.asset, reads: `balanceOf(${shortAddress(p.pool)})` },
                  {
                    name: "PoolManager",
                    address: p.poolManager,
                    reads: "strategyListLength(), strategyList(i), poolDelegate()",
                  },
                  { name: "Fixed-term LoanManager", address: p.fixedTermLoanManager, reads: "assetsUnderManagement()" },
                  { name: "Open-term LoanManager", address: p.openTermLoanManager, reads: "assetsUnderManagement()" },
                  { name: "WithdrawalManager", address: p.withdrawalManager, reads: "totalShares()" },
                ],
              })
            }
          />
        }
        exports={exportModel}
      />
      <VaultAssets
        rows={rows}
        assetSymbol={unit}
        assetAddress={p.asset}
        assetDecimals={d}
        line={
          gapLarge ? (
            <>
              The cash in the pool and what it lends. The rows read{" "}
              {assetText(raw((gap < ZERO ? -gap : gap).toString()), d)} {unit} {gap < ZERO ? "over" : "short of"} the
              pool&rsquo;s total: a leg did not answer.
            </>
          ) : (
            <>The cash in the pool and what it lends, which add up to its total assets.</>
          )
        }
        shareTip="The row's amount over the pool's total assets."
        learnMore={maplePoolAssetsContent()}
        menu={{
          links: [
            {
              item: "positions",
              title: "Positions in this pool",
              subtitle: `Every lender holding ${p.symbol}`,
              href: maplePoolPositionsHref(p.key),
              internal: true,
            },
            {
              item: "fixed-term",
              title: "Fixed-term LoanManager",
              subtitle: `${shortAddress(p.fixedTermLoanManager)} on Etherscan`,
              href: eth("address", p.fixedTermLoanManager),
            },
            {
              item: "open-term",
              title: "Open-term LoanManager",
              subtitle: `${shortAddress(p.openTermLoanManager)} on Etherscan`,
              href: eth("address", p.openTermLoanManager),
            },
          ],
          exports: vaultAssetsExports(v, exportModel),
        }}
      />
    </ProvReceiptsScope>
  );
}
