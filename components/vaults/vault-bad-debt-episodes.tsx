"use client";

// Bad debt in the steward's vaults (V14.1; rails-ops ui-jobs 554, piece C),
// under the vaults table of the steward's record (V14). One row per vault hit
// by a liquidation that left bad debt, in a market its withdraw queue holds
// now, newest first: the date, the vault, the market, the market's bad debt,
// the vault's share of the market's supply at the block before, the vault's
// part, and that part over the vault's total assets ("Of the vault"). The
// table shows the rows at 0.01% of the vault or more, up to twelve; the rest
// wait behind "Show all" with their count. Read by
// lib/vaults/bad-debt-episodes.ts; each figure's receipt is
// lib/vaults/bad-debt-provenance.ts. Facts with receipts: no colour, no
// totals across assets.

import { useState } from "react";
import { formatUnits } from "viem";
import { Prov } from "@/components/shared/provenance";
import { AssetUnit } from "@/components/shared/asset-unit";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { formatDate } from "@/lib/date";
import { formatCompact } from "@/lib/shared/format-compact";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { BadDebtEpisode, BadDebtRead } from "@/lib/vaults/bad-debt-episodes";
import { ONE_BP_PPM } from "@/lib/vaults/bad-debt-share";
import {
  badDebtAssetsProv,
  badDebtCountProv,
  badDebtDateProv,
  badDebtLargeCountProv,
  badDebtOfVaultProv,
  badDebtMarketProv,
  badDebtPartProv,
  badDebtShareProv,
  lltvText,
} from "@/lib/vaults/bad-debt-provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** The table draws this many rows until "Show all", as the vaults table does. */
const LIMIT = 12;

const TITLE = "Bad debt in its vaults";

const NOTE = (
  <p className="mt-2 text-[13px] text-rb-500" data-bad-debt-scope="">
    Markets a vault has left are not yet checked.
  </p>
);

export function VaultBadDebtEpisodes({ read }: { read: BadDebtRead }) {
  const [all, setAll] = useState(false);
  if (read.kind === "unread") return null;
  const head = <h3 className="text-sm font-semibold text-foreground">{TITLE}</h3>;

  if (read.kind === "unavailable")
    return (
      <div className="mt-6" data-anatomy="V14.1" data-bad-debt="" data-bad-debt-unread="">
        {head}
        <p className="mt-1 text-[13px] text-rb-500">
          Rails&rsquo;s liquidation record did not answer, so no bad-debt episode is stated.
        </p>
        {NOTE}
      </div>
    );

  const { episodes, liquidations } = read;
  const countProv = badDebtCountProv(liquidations, read.vaults, read.markets, read.atBlockReads);
  if (episodes.length === 0)
    return (
      <div className="mt-6" data-anatomy="V14.1" data-bad-debt="">
        {head}
        <p className="mt-1 text-[13px] text-rb-500" data-bad-debt-count={0}>
          <Prov info={countProv}>No liquidation</Prov> left bad debt in the markets its vaults supply now.
        </p>
        {NOTE}
      </div>
    );

  const first = episodes.reduce(
    (a, e) => (e.timestamp != null && (a == null || e.timestamp < a) ? e.timestamp : a),
    null as number | null,
  );
  const reaches = (e: BadDebtEpisode) => e.ofVaultPpm != null && e.ofVaultPpm >= ONE_BP_PPM;
  const large = episodes.filter(reaches);
  const largeCount = new Set(large.map((e) => e.key)).size;
  const small = episodes.filter((e) => e.ofVaultPpm != null && e.ofVaultPpm < ONE_BP_PPM).length;
  const shown = all ? episodes : large.slice(0, LIMIT);
  const largeProv = badDebtLargeCountProv(largeCount, liquidations);
  return (
    <div className="mt-6" data-anatomy="V14.1" data-bad-debt="" data-bad-debt-reads={read.atBlockReads}>
      {head}
      <p className="mt-1 text-[13px] text-rb-500">
        <span className="font-semibold text-foreground" data-bad-debt-count={liquidations}>
          <Prov info={countProv}>{n(liquidations)}</Prov>
        </span>{" "}
        {liquidations === 1 ? "liquidation" : "liquidations"} left bad debt in its vaults
        {first != null && <> since {formatDate(first)}</>}
        {largeCount > 0 && (
          <>
            ;{" "}
            <span className="font-semibold text-foreground" data-bad-debt-large={largeCount}>
              <Prov info={largeProv}>{n(largeCount)}</Prov>
            </span>{" "}
            of them cost a vault 0.01% of its assets or more
          </>
        )}
        .
      </p>
      {shown.length === 0 ? (
        <p className="mt-3 text-[13px] text-rb-500" data-bad-debt-none="">
          <Prov info={largeProv}>None</Prov> of them cost a vault 0.01% of its assets or more.
        </p>
      ) : (
        <div className="mt-3">
          <DataTable label={TITLE} tableClassName="text-sm" stacked stackBelow="lg">
            <DataTableHead>
              <DataTableHeader label="Date" />
              <DataTableHeader label="Vault" />
              <DataTableHeader label="Market" />
              <DataTableHeader label="Market’s bad debt" align="right" />
              <DataTableHeader label="Vault’s share" align="right" />
              <DataTableHeader label="Vault’s part" align="right" />
              <DataTableHeader label="Of the vault" align="right" />
            </DataTableHead>
            <DataTableBody>
              {shown.map((e) => (
                <EpisodeRow key={`${e.key}:${e.vault.address}`} e={e} />
              ))}
            </DataTableBody>
          </DataTable>
        </div>
      )}
      {shown.length < episodes.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={`mt-2 inline-block text-[13px] ${INLINE_LINK}`}
          data-bad-debt-show-all=""
        >
          Show all {n(episodes.length)}
        </button>
      )}
      {!all && small > 0 && (
        <span className="text-[13px] text-rb-500" data-bad-debt-small={small}>
          {" "}
          &middot; {n(small)} under 0.01% of the vault
        </span>
      )}
      {NOTE}
    </div>
  );
}

/** A raw amount in the loan token, compact, the full figure in the title. */
function Amount({ raw, e }: { raw: string; e: BadDebtEpisode }) {
  const full = formatUnits(BigInt(raw), e.market.loanDecimals);
  return (
    <span className="whitespace-nowrap" title={`${full} ${e.market.loanSymbol}`}>
      {formatCompact(Number(full))}
    </span>
  );
}

/** "Of the vault" as a percentage: "0%" for a part of zero, "<0.01%" under one
 *  basis point, else two places, floored. */
const ofVaultText = (e: BadDebtEpisode, ppm: number) =>
  e.vaultPart === "0"
    ? "0%"
    : ppm < ONE_BP_PPM
      ? "<0.01%"
      : `${(Math.floor(ppm / 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** The share as a percentage; under 0.01% it says so. */
const shareText = (p: number) =>
  p >= 0.01 ? `${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "<0.01%";

function EpisodeRow({ e }: { e: BadDebtEpisode }) {
  const unit = <AssetUnit symbol={e.market.loanSymbol} address={e.market.loanToken} named={e.market.loanNamed} />;
  return (
    <DataTableRow
      data-bad-debt-episode={e.key}
      data-bad-debt-vault={`${e.chainId}:${e.vault.address}`}
      data-bad-debt-current={e.vault.isCurrent ? "" : undefined}
      data-bad-debt-of-vault={e.ofVaultPpm ?? undefined}
    >
      <DataTableCell rowHeader valign="middle" className="whitespace-nowrap">
        <Prov info={badDebtDateProv(e)}>
          <span className="text-foreground">
            {e.timestamp != null ? formatDate(e.timestamp) : `block ${n(e.block)}`}
          </span>
        </Prov>
      </DataTableCell>
      <DataTableCell label="Vault" valign="middle">
        {e.vault.isCurrent ? (
          <span className="text-foreground">this vault</span>
        ) : (
          <a href={e.vault.href} className={INLINE_LINK} title={e.vault.name ?? e.vault.address}>
            {e.vault.name ?? <span className="font-mono">{shortAddress(e.vault.address)}</span>}
          </a>
        )}
      </DataTableCell>
      <DataTableCell label="Market" wide valign="middle" className="break-all lg:whitespace-nowrap lg:break-normal">
        <Prov info={badDebtMarketProv(e)}>
          <a href={e.market.href} className={INLINE_LINK} title={e.marketId}>
            {e.market.loanSymbol} / {e.market.collateralSymbol}
          </a>{" "}
          <span className="text-rb-500">{lltvText(e.market.lltv)}</span>
        </Prov>
      </DataTableCell>
      <DataTableCell label="Market’s bad debt" align="right" valign="middle" className="tabular-nums">
        <span
          className="inline-flex items-center gap-1.5 lg:justify-end"
          data-cell="bad-debt-market"
          data-raw={e.badDebtAssets}
        >
          <Prov info={badDebtAssetsProv(e)}>
            <Amount raw={e.badDebtAssets} e={e} />
          </Prov>
          {unit}
        </span>
      </DataTableCell>
      <DataTableCell label="Vault’s share" align="right" valign="middle" className="tabular-nums whitespace-nowrap">
        <span data-cell="bad-debt-share" data-share={e.sharePercent}>
          <Prov info={badDebtShareProv(e)}>{shareText(e.sharePercent)}</Prov>
        </span>
      </DataTableCell>
      <DataTableCell label="Vault’s part" align="right" valign="middle" className="tabular-nums font-semibold">
        <span
          className="inline-flex items-center gap-1.5 lg:justify-end"
          data-cell="bad-debt-part"
          data-raw={e.vaultPart}
        >
          <Prov info={badDebtPartProv(e)}>
            <Amount raw={e.vaultPart} e={e} />
          </Prov>
          {unit}
        </span>
      </DataTableCell>
      <DataTableCell label="Of the vault" align="right" valign="middle" className="tabular-nums whitespace-nowrap">
        {e.ofVaultPpm != null ? (
          <span data-cell="bad-debt-of-vault">
            <Prov info={badDebtOfVaultProv(e)}>{ofVaultText(e, e.ofVaultPpm)}</Prov>
          </span>
        ) : (
          <span className="text-rb-500">
            <span aria-hidden>&ndash;</span>
            <span className="sr-only">no figure</span>
          </span>
        )}
      </DataTableCell>
    </DataTableRow>
  );
}
