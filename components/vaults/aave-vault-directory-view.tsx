"use client";

// The roster: every vault Aave's own enumerators name on Ethereum, at one block.
// ----------------------------------------------------------------------------
// The VAULTS tab of the Aave vaults rail (/ethereum/aave/vaults). The listing
// states positions; this states the vaults they are positions in, and it is a
// page of its own rather than part of the listing's path, because it is a
// Multicall3 wave over eighteen vaults and no listing page-load should wait on
// one (app/(app)/ethereum/aave/vaults/(views)/page.tsx).
//
// The row grammar is the Base directory's, one
// column at a time (vault · asset · total assets · shares issued · share price),
// and the two differences from it are both differences in the SUBJECT rather
// than in the design:
//
//  1. GROUPED BY FAMILY, NOT BY ASSET. Base groups by asset because 505
//     MetaMorpho vaults share one mechanic and differ in what they hold. Aave's
//     eighteen share assets and differ in MECHANIC: sGHO saves, a static aToken
//     wraps a supply position, an Umbrella stake token is staked against a
//     reserve's deficit and can be slashed. The family is the risk class, and a
//     reader choosing "a USDC vault" must not mistake a slashable stake for
//     wrapped supply. Each family heading carries a one-line statement of its
//     mechanic, read from the contract at the same block.
//  2. NO CURATOR COLUMN, A MECHANIC COLUMN INSTEAD. Aave deploys and governs
//     these; there is no curator to name. The last column is what the family's
//     own contract answers about itself — the deposit cap, the aToken wrapped,
//     the cooldown and whether the reserve is slashable now.
//
// THE THREE RULES THE BASE LAYOUT KEEPS, kept here unchanged:
//
//  • THE DENOMINATOR FIRST. What the list is, and what is outside it, before any
//    row. It is a different denominator from Base's — two enumerator calls
//    answer their whole family, so this list is complete at its block rather
//    than a floor — and the prose says so in those words.
//  • NO CROSS-ASSET ORDER, NO USD. A family group holds several assets, unlike
//    a Base group, so the order inside it is by asset symbol first and by size
//    only among rows sharing one asset. 96,011,828 USDT and 11,492 WETH are two
//    quantities of two different things; ordering them against each other would
//    imply a price this page never reads.
//  • AN EMPTY VAULT IS A READING, AN UNREAD ONE IS AN ABSENCE. A vault whose
//    `totalAssets()` answered zero holds nothing at this block and sits in a
//    trailing collapsed group; a vault whose call did not answer is stated as
//    unread, separately — never a dash, never a zero.
//
// ⚠️ AN EMPTY VAULT STILL ANSWERS A SHARE PRICE, AND IT IS NOT PARITY. A static
// aToken's rate is the Pool's accrued index for the reserve, which does not care
// that the wrapper holds nothing — the trailing group's prose says why rather
// than leaving a reader to think the figure is stale.
//
// A CLIENT COMPONENT: the receipts scope and the <Prov> registrations are client
// machinery, and the trailing group holds state. Colour: house neutrals — a
// slashable stake and a savings vault are the same KIND of fact, and colouring
// one as a warning would be this page choosing the stops.

import { useMemo, useState } from "react";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { DisclosureChevron } from "@/components/shared/expand-chevron";
import Link from "next/link";
import { assetText, shareText, shortAddress } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { AAVE_FAMILY_LABEL, durationText, sharePriceText } from "@/components/vaults/aave-vault-format";
import { AaveFirstPartySources } from "@/components/vaults/aave-first-party-sources";
import { VaultVenueMark } from "@/components/vaults/vault-venue-mark";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import {
  AAVE_VAULT_FAMILY_ORDER,
  aaveVaultAttestation,
  STATA_ENUMERATOR,
  UMBRELLA_ENUMERATOR,
  type AaveVaultFamily,
} from "@/lib/aave-vaults/vault-catalog";
import {
  aaveStataFactoryProv,
  aaveVaultATokenProv,
  aaveVaultCatalogueProv,
  aaveVaultCooldownProv,
  aaveVaultEmptyCountProv,
  aaveVaultFamilyCountProv,
  aaveVaultNameProv,
  aaveVaultReserveHopProv,
  aaveVaultSharePriceProv,
  aaveVaultSlashableProv,
  aaveVaultSupplyCapProv,
  aaveVaultTargetRateProv,
  aaveVaultTotalAssetsProv,
  aaveVaultTotalSupplyProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import type {
  AaveEthereumVaultDirectoryResponse,
  AaveEthereumVaultRow,
} from "@/lib/sources/chain/aave-ethereum-vault-directory";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);

/** The column the family's own mechanic reads land in. */
const MECHANIC_HEADER: Record<AaveVaultFamily, string> = {
  sgho: "Deposit cap",
  stata: "Wraps",
  "umbrella-stake": "Cooldown and slashing",
};

/** The Aave V3 Core market overview — the reserve roster a static aToken's
 *  aToken belongs to. There is no per-reserve route on that page and no
 *  per-reserve anchor in its table, so both links here land on the roster
 *  itself rather than on a fragment that does not exist. */
const AAVE_V3_MARKET_HREF = "/ethereum/aave-v3/market";

const rawOf = (r: AaveEthereumVaultRow) => BigInt(r.totalAssets?.raw ?? "0");

/** Inside a family: by asset symbol, then by size WITHIN one asset (a bigint
 *  comparison of two quantities of the same token, the only kind compared here),
 *  then by address for a stable tie. Two different assets are never ordered
 *  against each other by amount. */
function orderRows(rows: AaveEthereumVaultRow[]): AaveEthereumVaultRow[] {
  return [...rows].sort((a, b) => {
    if (a.asset.address !== b.asset.address) {
      return a.asset.symbol.localeCompare(b.asset.symbol, "en-US") || a.asset.address.localeCompare(b.asset.address);
    }
    const av = rawOf(a);
    const bv = rawOf(b);
    return av < bv ? 1 : av > bv ? -1 : a.address.localeCompare(b.address);
  });
}

export function AaveVaultDirectoryView({ data }: { data: AaveEthereumVaultDirectoryResponse }) {
  const registry = useReceiptRegistry();
  const [emptyOpen, setEmptyOpen] = useState(false);

  const coords: AaveVaultCoords = { blockNumber: data.blockNumber || undefined };

  // The three kinds of row, split once over the whole reading.
  const funded = useMemo(() => data.rows.filter((r) => r.totalAssets != null && rawOf(r) > ZERO), [data.rows]);
  const emptyRows = useMemo(() => data.rows.filter((r) => r.totalAssets != null && rawOf(r) === ZERO), [data.rows]);
  const unread = useMemo(() => data.rows.filter((r) => r.totalAssets == null), [data.rows]);

  return (
    <ProvReceiptsScope registry={registry}>
      {/* ── the denominator, before any row ─────────────────────────────── */}
      <section className="mb-5" data-skel-section="directory-denominator">
        <h2 className="text-sm font-semibold text-foreground" data-directory-heading>
          Browse Aave&rsquo;s vaults on Ethereum
        </h2>
        {!data.chainStale && (
          /* The block is the ANCHOR every receipt in this scope names, not a
             figure with a receipt of its own, so the link carries the coverage
             exemption the tripwire reads. Without it the sweep would report the
             page's own block number as an untraced stat. */
          <p className="mt-1 text-[11px] text-rb-500" data-directory-block={data.blockNumber} data-prov-exempt>
            Read at block{" "}
            <a
              href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="link-external"
            >
              {n(data.blockNumber)}
            </a>{" "}
            · a reading of its own, re-read at most every five minutes, so it can name a different block from the
            census&rsquo;s, which the listing states.
          </p>
        )}
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="directory-catalogue">
          <Prov info={aaveVaultCatalogueProv(coords, data)}>
            The {n(data.catalogSize)} ERC-4626 vaults Aave deploys and publishes on Ethereum
          </Prov>{" "}
          — savings GHO, {n(data.stataCount)} static aTokens and {n(data.stakeCount)} Umbrella stake tokens. Unlike a
          census swept from logs, this list is answered by Aave&rsquo;s own contracts at the block below:{" "}
          <code>getStataTokens()</code> and <code>getStkTokens()</code> each return their whole family in one read, so
          nothing deployed before that block is missing from it. Outside it: Aave&rsquo;s deployments on other chains,
          the legacy static-aToken factory, and any ERC-4626 Aave has not published in its own address book. No figure
          here is priced in USD, and none is a rate of return.
        </p>
      </section>

      {data.chainStale ? (
        <section className="mb-6" data-skel-section="directory-stale">
          <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
            The vaults could not be read from chain just now, so no figure is stated for any of them — not the roster
            either, because the roster is a read like everything else on this page.
          </p>
        </section>
      ) : (
        <>
          {/* ── one table per family ─────────────────────────────────────── */}
          <div data-skel-section="directory-groups">
            {AAVE_VAULT_FAMILY_ORDER.map((family) => {
              const all = data.rows.filter((r) => r.family === family);
              const rows = orderRows(funded.filter((r) => r.family === family));
              if (all.length === 0) return null;
              return (
                <FamilyGroup
                  key={family}
                  family={family}
                  rows={rows}
                  totalInFamily={all.length}
                  stataCount={data.stataCount}
                  coords={coords}
                />
              );
            })}
          </div>

          {/* ── the vaults that hold nothing: a reading, collapsed ──────── */}
          {emptyRows.length > 0 && (
            <section className="mb-6" data-skel-section="directory-empty" data-empty-group>
              <button
                type="button"
                onClick={() => setEmptyOpen((v) => !v)}
                aria-expanded={emptyOpen}
                className="group/empty flex cursor-pointer items-center gap-2 text-left text-sm font-semibold text-foreground hover:text-blue-500"
              >
                <DisclosureChevron isOpen={emptyOpen} />
                <span data-figure="empty-count">
                  <Prov info={aaveVaultEmptyCountProv(coords, emptyRows.length, data.catalogSize)}>
                    {emptyRows.length === 1
                      ? "1 vault holds nothing at this block"
                      : `${n(emptyRows.length)} vaults hold nothing at this block`}
                  </Prov>
                </span>
              </button>
              <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-rb-500">
                Each answered zero to <code>totalAssets()</code> at block {n(data.blockNumber)} — a reading about the
                vault, not a gap in the read. Each still answers a share price, and it is not parity: a static
                aToken&rsquo;s rate is the Pool&rsquo;s accrued index for the reserve it wraps, which does not care that
                the wrapper holds nothing.
              </p>
              {emptyOpen && (
                <div data-empty-rows>
                  <EmptyTable rows={orderRows(emptyRows)} coords={coords} />
                </div>
              )}
            </section>
          )}

          {/* ── the vaults the read did not answer for: an absence, stated ── */}
          {unread.length > 0 && (
            <section className="mb-6" data-skel-section="directory-unread" data-unread-group>
              <h2 className="text-sm font-semibold text-foreground">
                {unread.length === 1
                  ? "1 vault could not be read at this block"
                  : `${n(unread.length)} vaults could not be read at this block`}
              </h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-rb-500">
                Their <code>totalAssets()</code> call did not answer, so no figure is stated for them — not a zero, and
                not a dash. The enumerator still names them, which is why they are listed at all.
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                {unread.map((r) => (
                  <li
                    key={r.address}
                    data-vault-row={r.address}
                    data-group="unread"
                    data-family={r.family}
                    data-asset={r.asset.address}
                    data-total-assets-raw=""
                    data-share-price-raw={r.sharePrice?.raw ?? ""}
                  >
                    <Link href={ethereumVaultHref(r.address)} className="hover:underline" prefetch={false}>
                      {r.name ?? r.symbol ?? shortAddress(r.address)}{" "}
                      <span className="font-mono font-normal">{shortAddress(r.address)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ── the venue's own pages ───────────────────────────────────────
          A reader who cannot supply an address gets a grid of app guides on
          Base, because the record there identifies the wallet software behind
          holders. Here the answer is Aave's own documentation, and the block
          says in its own copy that a citation is not an attribution. */}
      <AaveFirstPartySources />
    </ProvReceiptsScope>
  );
}

/** One family: the heading, its mechanic in one line read from the contract, and
 *  its funded rows. */
function FamilyGroup({
  family,
  rows,
  totalInFamily,
  stataCount,
  coords,
}: {
  family: AaveVaultFamily;
  rows: AaveEthereumVaultRow[];
  totalInFamily: number;
  stataCount: number;
  coords: AaveVaultCoords;
}) {
  // What attests THIS family's membership: sGHO is an address the book names,
  // the other two are rosters their own contract answered.
  const attestation =
    family === "sgho"
      ? aaveVaultAttestation(rows[0]?.address ?? "", "sgho")
      : family === "stata"
        ? STATA_ENUMERATOR
        : UMBRELLA_ENUMERATOR;
  const sgho = family === "sgho" ? rows[0] : undefined;
  return (
    <section className="mb-7" data-family-group={family}>
      <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
        {/* The venue that deployed this family — the same mark the position
            cards carry, on the word it sits beside. */}
        <span className="inline-flex items-center gap-1.5">
          <VaultVenueMark family={family} />
          {AAVE_FAMILY_LABEL[family]}
        </span>
        <span className="text-[12px] font-normal text-rb-500" data-figure="family-count">
          <Prov
            info={aaveVaultFamilyCountProv(coords, family, { funded: rows.length, total: totalInFamily }, attestation)}
          >
            {rows.length === 1 ? "1 vault" : `${n(rows.length)} vaults`}
          </Prov>
        </span>
      </h2>
      <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-family-mechanic={family}>
        {family === "sgho" && (
          <>
            One vault over GHO. A holder&rsquo;s shares grow with a stored yield index rather than with a balance the
            vault holds, so <code>totalAssets()</code> is what that index says the shares are worth — and withdrawals
            are clamped to the GHO the contract actually holds.{" "}
            {sgho?.targetRateBps != null && (
              <>
                Its <code>targetRate()</code> reads{" "}
                <Prov info={aaveVaultTargetRateProv({ ...coords, vault: sgho.address }, sgho.targetRateBps)}>
                  {n(sgho.targetRateBps)} basis points
                </Prov>{" "}
                at this block — the risk council&rsquo;s setting, not a return.
              </>
            )}
          </>
        )}
        {family === "stata" && (
          <>
            Each is an ERC-4626 wrapper over exactly one Aave V3 aToken, so a holder&rsquo;s shares are a non-rebasing
            claim on a supply position in the{" "}
            <Link href={AAVE_V3_MARKET_HREF} className="hover:underline" prefetch={false} data-link="aave-v3-market">
              Aave V3 Core market
            </Link>{" "}
            and the share price IS that reserve&rsquo;s accrued index.{" "}
            <Prov info={aaveStataFactoryProv(coords, stataCount)}>
              The factory Aave publishes answered {n(stataCount)} of them
            </Prov>{" "}
            at this block, one per underlying asset. Each row names the aToken it wraps, read from its own{" "}
            <code>aToken()</code>.
          </>
        )}
        {family === "umbrella-stake" && (
          <>
            Staked, and slashable. Umbrella owns these tokens and can slash one to cover a deficit on the single reserve
            it covers, which lowers every holder&rsquo;s share price at once and emits nothing per holder. Redemption
            runs through a cooldown and a window that follows it; outside that window a holder with a positive balance
            reads <code>maxRedeem()</code> zero, which is a state and not missing data. Three of the four hold a wrapped
            aToken rather than the reserve asset, so the amounts below are in that wrapper&rsquo;s units.
          </>
        )}
      </p>
      <DirectoryTable rows={rows} coords={coords} family={family} />
    </section>
  );
}

/** The five shared columns, plus the family's own mechanic column. */
function DirectoryTable({
  rows,
  coords,
  family,
}: {
  rows: AaveEthereumVaultRow[];
  coords: AaveVaultCoords;
  family: AaveVaultFamily;
}) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[48rem] text-[12px]">
        <thead>
          <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
            <th className="py-2 pr-3 font-normal">Vault</th>
            <th className="py-2 pr-3 font-normal">Asset</th>
            <th className="py-2 pr-3 text-right font-normal">Total assets</th>
            <th className="py-2 pr-3 text-right font-normal">Shares issued</th>
            <th className="py-2 pr-3 text-right font-normal">Share price</th>
            <th className="py-2 font-normal">{MECHANIC_HEADER[family]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <VaultRow key={r.address} row={r} coords={coords} withMechanic />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The trailing group: mixed families, so it names the family and drops the
 *  mechanic column. */
function EmptyTable({ rows, coords }: { rows: AaveEthereumVaultRow[]; coords: AaveVaultCoords }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-[12px]">
        <thead>
          <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
            <th className="py-2 pr-3 font-normal">Vault</th>
            <th className="py-2 pr-3 font-normal">Asset</th>
            <th className="py-2 pr-3 text-right font-normal">Total assets</th>
            <th className="py-2 pr-3 text-right font-normal">Shares issued</th>
            <th className="py-2 pr-3 text-right font-normal">Share price</th>
            <th className="py-2 font-normal">Family</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <VaultRow key={r.address} row={r} coords={coords} withMechanic={false} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VaultRow({
  row: r,
  coords,
  withMechanic,
}: {
  row: AaveEthereumVaultRow;
  coords: AaveVaultCoords;
  withMechanic: boolean;
}) {
  const rowCoords: AaveVaultCoords = {
    ...coords,
    vault: r.address,
    vaultName: r.name ?? r.symbol ?? undefined,
    assetSymbol: r.asset.symbol,
    shareSymbol: r.symbol ?? undefined,
  };
  const raw = r.totalAssets?.raw ?? "";
  return (
    <tr
      className="border-b border-rb-200/60 dark:border-rb-500/20"
      data-vault-row={r.address}
      data-group={raw === "" ? "unread" : BigInt(raw) > ZERO ? "funded" : "empty"}
      data-family={r.family}
      data-asset={r.asset.address}
      data-total-assets-raw={raw}
      data-share-price-raw={r.sharePrice?.raw ?? ""}
    >
      <td className="py-2 pr-3">
        {/* The NAME goes to this vault's own page — a reading of the same
            address one column deeper. The raw ADDRESS keeps its explorer link,
            the way the Base directory splits the two: one is what this site
            says about the vault, the other is the chain record itself. */}
        <Link href={ethereumVaultHref(r.address)} className="text-foreground hover:underline" prefetch={false}>
          {r.name != null ? (
            <Prov info={aaveVaultNameProv(rowCoords, aaveVaultAttestation(r.address, r.family))}>{r.name}</Prov>
          ) : (
            <span className="font-mono">{shortAddress(r.address)}</span>
          )}
        </Link>{" "}
        <a
          href={explorerUrl(MAINNET_CHAIN_ID, "address", r.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external font-mono text-[11px] text-rb-500"
        >
          {shortAddress(r.address)}
        </a>{" "}
        {/* Every address that has ever held this vault — the position listing
            filtered to it. A market view links to the filtered listing rather
            than restating it. */}
        <Link
          href={ethereumVaultsListingHref({ vault: r.address })}
          className="text-[11px] text-blue-500 hover:underline"
          prefetch={false}
          data-link="vault-positions"
          data-positions-vault={r.address}
        >
          holders
        </Link>
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">
        <a
          href={explorerUrl(MAINNET_CHAIN_ID, "address", r.asset.address)}
          target="_blank"
          rel="noopener noreferrer"
          className={`link-external ${r.asset.named ? "text-rb-500" : "font-mono text-rb-500"}`}
        >
          {r.asset.symbol}
        </a>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground whitespace-nowrap" data-cell="total-assets">
        {r.totalAssets ? (
          <>
            <Prov info={aaveVaultTotalAssetsProv(rowCoords, r.family)}>
              {assetText(r.totalAssets, r.asset.decimals)}
            </Prov>{" "}
            <span className={r.asset.named ? "text-rb-500" : "font-mono text-rb-500"}>{r.asset.symbol}</span>
          </>
        ) : (
          <span className="text-rb-500">not read</span>
        )}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground whitespace-nowrap" data-cell="total-supply">
        {r.totalSupply && r.shareDecimals != null ? (
          <Prov info={aaveVaultTotalSupplyProv(rowCoords, r.shareDecimals)}>
            {shareText(r.totalSupply, r.shareDecimals)}
          </Prov>
        ) : (
          <span className="text-rb-500">not read</span>
        )}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground whitespace-nowrap" data-cell="share-price">
        {r.sharePrice && r.shareDecimals != null ? (
          <>
            <Prov info={aaveVaultSharePriceProv(rowCoords, r.shareDecimals)}>
              {sharePriceText(r.sharePrice, r.asset.decimals)}
            </Prov>{" "}
            <span className={r.asset.named ? "text-rb-500" : "font-mono text-rb-500"}>{r.asset.symbol}</span>
          </>
        ) : (
          <span className="text-rb-500">not read</span>
        )}
      </td>
      <td className="py-2 text-rb-500" data-cell={withMechanic ? "mechanic" : "family"}>
        {withMechanic ? (
          <MechanicCell row={r} coords={rowCoords} />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <VaultVenueMark family={r.family} />
            {AAVE_FAMILY_LABEL[r.family]}
          </span>
        )}
      </td>
    </tr>
  );
}

/** What the family's own contract answers about this vault — one to three reads,
 *  each with its own receipt, each in the contract's own units. */
function MechanicCell({ row: r, coords }: { row: AaveEthereumVaultRow; coords: AaveVaultCoords }) {
  if (r.family === "sgho") {
    return r.supplyCap ? (
      <span className="whitespace-nowrap tabular-nums">
        <Prov info={aaveVaultSupplyCapProv(coords)}>{assetText(r.supplyCap, r.asset.decimals)}</Prov>{" "}
        <span className="text-rb-500">{r.asset.symbol}</span>
      </span>
    ) : (
      <span>not read</span>
    );
  }
  if (r.family === "stata") {
    return r.aToken ? (
      <Link
        href={AAVE_V3_MARKET_HREF}
        className="font-mono hover:underline"
        prefetch={false}
        data-link="aave-v3-market"
      >
        <Prov info={aaveVaultATokenProv(coords)}>{shortAddress(r.aToken)}</Prov>
      </Link>
    ) : (
      <span>not read</span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      {r.cooldownSeconds != null && r.unstakeWindowSeconds != null ? (
        <Prov info={aaveVaultCooldownProv(coords, r.cooldownSeconds, r.unstakeWindowSeconds)}>
          <span className="whitespace-nowrap">
            {durationText(r.cooldownSeconds)}, then {durationText(r.unstakeWindowSeconds)} to redeem
          </span>
        </Prov>
      ) : (
        <span>cooldown not read</span>
      )}
      {r.reserve && (
        <span className="whitespace-nowrap">
          <Prov info={aaveVaultReserveHopProv(coords, r.reserve.symbol)}>covers {r.reserve.symbol}</Prov>
          {r.reserveSlashable != null && (
            <>
              {" · "}
              <Prov info={aaveVaultSlashableProv(coords, r.reserve.symbol, r.reserveSlashable)}>
                {r.reserveSlashable ? "a deficit is outstanding" : "no deficit outstanding"}
              </Prov>
            </>
          )}
        </span>
      )}
    </span>
  );
}
