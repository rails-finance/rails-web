"use client";

// One Yearn V3 vault's factsheet — what /ethereum/yearn/vaults/<vault> draws
// under its header.
// ----------------------------------------------------------------------------
// A fund factsheet and not an explorer (rails-ops decision 0017, which 0028
// left standing): the page is about the CONTRACT — what it holds, where that
// sits, who holds the roles over it, and how a reported gain reaches the share
// price — all at one block.
//
// THREE BLOCKS, IN THE ORDER A READER ASKS THEM IN:
//
//  1. WHAT IT HOLDS. Total assets, the idle/deployed split that adds up to it,
//     shares issued and what one share buys back. Every figure is in the
//     vault's asset, except the share count, which is in shares.
//  2. WHERE THE DEPLOYED PART SITS. The withdrawal queue in its order, one row
//     per strategy with the debt the vault records against it and the cap the
//     role manager set. The vault's `totalDebt()` sits under the column: where
//     the two differ, a strategy outside the queue is carrying the rest, and
//     the page says so instead of presenting the sum as the whole.
//  3. WHO AND HOW LONG. The role manager, the accountant, and the profit unlock
//     window — the three facts that decide who can change the vault and how a
//     gain reaches a holder.
//
// NO YIELD SERIES. A rate needs two readings and a sampling statement, and this
// page has one block (decision 0017 point 6). What it states about earnings is
// the unlock window, which is a parameter and not a return.
//
// A CLIENT COMPONENT: the receipts scope and the <Prov> registrations are client
// machinery.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { assetText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { explorerUrl } from "@/lib/shared/chains";
import {
  yearnVaultDebtProv,
  yearnVaultIdleProv,
  yearnVaultQueueProv,
  yearnVaultRoleProv,
  yearnVaultSharePriceProv,
  yearnVaultStrategyCapProv,
  yearnVaultStrategyDebtProv,
  yearnVaultTotalAssetsProv,
  yearnVaultTotalSupplyProv,
  yearnVaultUnlockProv,
  type YearnVaultCoords,
} from "@/lib/yearn/vault-provenance";
import type { YearnVaultResponse } from "@/lib/sources/chain/yearn-ethereum-vault";

const CHAIN_ID = 1;
const n = (v: number) => v.toLocaleString("en-US");

/** A span of seconds in the words a reader uses. Whole days where it divides
 *  cleanly, whole hours below that; the seconds are on the receipt. */
function spanWords(seconds: number): string {
  if (seconds === 0) return "none";
  const days = seconds / 86400;
  if (Number.isInteger(days)) return days === 1 ? "1 day" : `${n(days)} days`;
  const hours = seconds / 3600;
  if (Number.isInteger(hours)) return hours === 1 ? "1 hour" : `${n(hours)} hours`;
  return `${n(seconds)} seconds`;
}

export function YearnVaultView({ data }: { data: YearnVaultResponse }) {
  const registry = useReceiptRegistry();
  const v = data.vault;
  const decimals = v.asset.decimals;
  const coords: YearnVaultCoords = {
    blockNumber: data.blockNumber || undefined,
    vault: v.address,
    vaultName: v.name ?? v.censusName,
    assetSymbol: v.asset.symbol,
    apiVersion: v.apiVersion,
  };
  const assetClass = v.asset.named ? "text-rb-500" : "font-mono text-rb-500";

  /** Σ of the queue's recorded debt, against the vault's `totalDebt()`. A
   *  strategy the role manager has taken out of the queue keeps its debt until
   *  the vault pulls it back, so the two can differ and the page says when. */
  const queueDebtRaw = data.strategies.reduce((acc, s) => acc + BigInt(s.currentDebt?.raw ?? "0"), BigInt(0));
  const queueDebt = { raw: queueDebtRaw.toString(), value: Number(queueDebtRaw) / Math.pow(10, decimals) };
  const vaultDebt = v.totalDebt == null ? null : BigInt(v.totalDebt.raw);
  const debtOutsideQueue = vaultDebt == null ? null : vaultDebt - queueDebtRaw;

  return (
    <ProvReceiptsScope registry={registry}>
      {/* ── 1. what it holds ────────────────────────────────────────────── */}
      <section className="mb-7" data-skel-section="vault-holdings">
        <h2 className="text-sm font-semibold text-foreground">What the vault holds</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Figure label="Total assets" cell="total-assets" raw={v.totalAssets?.raw}>
            {v.totalAssets ? (
              <>
                <Prov info={yearnVaultTotalAssetsProv(coords)}>{assetText(v.totalAssets, decimals)}</Prov>{" "}
                <span className={assetClass}>{v.asset.symbol}</span>
              </>
            ) : (
              <span className="text-rb-500">not read</span>
            )}
          </Figure>
          <Figure label="Idle" cell="total-idle" raw={v.totalIdle?.raw}>
            {v.totalIdle ? (
              <>
                <Prov info={yearnVaultIdleProv(coords)}>{assetText(v.totalIdle, decimals)}</Prov>{" "}
                <span className={assetClass}>{v.asset.symbol}</span>
              </>
            ) : (
              <span className="text-rb-500">not read</span>
            )}
          </Figure>
          <Figure label="Deployed" cell="total-debt" raw={v.totalDebt?.raw}>
            {v.totalDebt ? (
              <>
                <Prov info={yearnVaultDebtProv(coords)}>{assetText(v.totalDebt, decimals)}</Prov>{" "}
                <span className={assetClass}>{v.asset.symbol}</span>
              </>
            ) : (
              <span className="text-rb-500">not read</span>
            )}
          </Figure>
          <Figure label="Share price" cell="share-price" raw={v.sharePrice?.raw}>
            {v.sharePrice ? (
              <>
                <Prov info={yearnVaultSharePriceProv(coords)}>{assetText(v.sharePrice, decimals)}</Prov>{" "}
                <span className={assetClass}>{v.asset.symbol}</span>
              </>
            ) : (
              <span className="text-rb-500">not read</span>
            )}
          </Figure>
        </dl>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          Idle and deployed are the two halves of the total: the idle part sits in the vault contract and serves
          withdrawals directly, and the deployed part is what the strategies below have been lent.{" "}
          {v.totalSupply && (
            <>
              <Prov info={yearnVaultTotalSupplyProv(coords)}>{shareText(v.totalSupply, decimals)}</Prov> shares are in
              existence at this block, and the share price above is what one whole share buys back in {v.asset.symbol}.
            </>
          )}
        </p>
      </section>

      {/* ── 2. where the deployed part sits ─────────────────────────────── */}
      <section className="mb-7" data-skel-section="vault-strategies">
        <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
          Withdrawal queue
          <span className="text-[12px] font-normal text-rb-500" data-figure="queue-count">
            <Prov info={yearnVaultQueueProv(coords, data.strategies.length)}>
              {data.strategies.length === 1 ? "1 strategy" : `${n(data.strategies.length)} strategies`}
            </Prov>
          </span>
        </h2>
        {data.strategies.length === 0 ? (
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
            The queue is empty at this block: the vault has no strategy to walk, so every withdrawal is served from the
            idle balance above.
          </p>
        ) : (
          <>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500">
              A withdrawal takes the idle balance first, then pulls from these in this order. Each debt is the
              vault&rsquo;s record of what it has lent that strategy, updated when the strategy reports.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-[12px]">
                <thead>
                  <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
                    <th className="py-2 pr-3 font-normal">#</th>
                    <th className="py-2 pr-3 font-normal">Strategy</th>
                    <th className="py-2 pr-3 text-right font-normal">Debt</th>
                    <th className="py-2 text-right font-normal">Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {data.strategies.map((s) => (
                    <tr
                      key={s.address}
                      className="border-b border-rb-200/60 dark:border-rb-500/20"
                      data-strategy-row={s.address}
                      data-queue-position={s.position}
                      data-current-debt-raw={s.currentDebt?.raw ?? ""}
                    >
                      <td className="py-2 pr-3 tabular-nums text-rb-500">{s.position}</td>
                      <td className="py-2 pr-3">
                        <a
                          href={explorerUrl(CHAIN_ID, "address", s.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-external"
                        >
                          {s.name ?? shortAddress(s.address)}
                        </a>{" "}
                        <span className="font-mono text-[11px] text-rb-500">{shortAddress(s.address)}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground whitespace-nowrap">
                        {s.currentDebt ? (
                          <>
                            <Prov info={yearnVaultStrategyDebtProv(coords, s.address)}>
                              {assetText(s.currentDebt, decimals)}
                            </Prov>{" "}
                            <span className={assetClass}>{v.asset.symbol}</span>
                          </>
                        ) : (
                          <span className="text-rb-500">not read</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-rb-500 whitespace-nowrap">
                        {s.maxDebt ? (
                          <Prov info={yearnVaultStrategyCapProv(coords, s.address)}>
                            {assetText(s.maxDebt, decimals)}
                          </Prov>
                        ) : (
                          "not read"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {debtOutsideQueue != null && debtOutsideQueue !== BigInt(0) && (
              <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="debt-outside-queue">
                The vault records {assetText(v.totalDebt!, decimals)} {v.asset.symbol} of debt in total, and the rows
                above account for {assetText(queueDebt, decimals)} of it. The rest sits with a strategy outside the
                default queue, which carries debt until the vault pulls it back.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── 3. who, and how long ────────────────────────────────────────── */}
      <section className="mb-7" data-skel-section="vault-governance">
        <h2 className="text-sm font-semibold text-foreground">Who holds the roles, and how a gain lands</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Figure label="Role manager" cell="role-manager">
            {v.roleManager ? (
              <a
                href={explorerUrl(CHAIN_ID, "address", v.roleManager)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external font-mono text-[13px]"
              >
                <Prov info={yearnVaultRoleProv(coords, "role manager")}>{shortAddress(v.roleManager)}</Prov>
              </a>
            ) : (
              <span className="text-rb-500">not read</span>
            )}
          </Figure>
          <Figure label="Accountant" cell="accountant">
            {v.accountant ? (
              <a
                href={explorerUrl(CHAIN_ID, "address", v.accountant)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external font-mono text-[13px]"
              >
                <Prov info={yearnVaultRoleProv(coords, "accountant")}>{shortAddress(v.accountant)}</Prov>
              </a>
            ) : (
              <span className="text-rb-500">none set</span>
            )}
          </Figure>
          <Figure label="Profit unlock" cell="profit-unlock">
            {v.profitMaxUnlockTime != null ? (
              <Prov info={yearnVaultUnlockProv(coords, v.profitMaxUnlockTime)}>{spanWords(v.profitMaxUnlockTime)}</Prov>
            ) : (
              <span className="text-rb-500">not read</span>
            )}
          </Figure>
        </dl>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          The role manager hands out every power over this vault — adding a strategy, setting a cap, shutting it down —
          and both it and the accountant are stated as addresses, because nothing on chain says who holds them. When a
          strategy reports a gain, the vault spreads it across the profit unlock window so the share price climbs
          smoothly; a loss lands at once.
        </p>
      </section>
    </ProvReceiptsScope>
  );
}

/** One labelled figure in a factsheet grid. The raw integer rides on the cell
 *  so a verifier can compare wei-exact what the page prints rounded. */
function Figure({
  label,
  cell,
  raw,
  children,
}: {
  label: string;
  cell: string;
  raw?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-cell={cell} data-raw={raw ?? ""}>
      <dt className="text-[11px] uppercase tracking-wider text-rb-500">{label}</dt>
      <dd className="mt-0.5 text-[15px] tabular-nums text-foreground">{children}</dd>
    </div>
  );
}
