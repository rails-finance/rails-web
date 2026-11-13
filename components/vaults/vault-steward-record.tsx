"use client";

// The steward's record on a MetaMorpho vault page (Base and Ethereum) and a
// Maple pool page (rails-ops ui-jobs 554, piece C, first part): the vaults this
// steward runs now and what each holds, rolled up from the /vaults directory
// by lib/vaults/steward-record.ts. The steward is the curator, else the owner;
// a Maple pool's delegate. Rails states the facts with their receipts and
// scores nothing. Its bad-debt episodes (V14.1, components/vaults/vault-bad-
// debt-episodes.tsx) stream in under the vaults table on MetaMorpho pages.
// For a MetaMorpho steward, rails-server's roles route adds since when it runs
// each vault (V14.2, a Since column) and the vaults it ran before (V14.3),
// read by lib/vaults/steward-runs-read.ts; a Maple pool delegate has neither.
// The later parts (illiquid stretches, time to response) join this section.
//
// Held is total assets in each vault's asset. The directory carries no USD,
// so the rows order by asset: the page's vault's asset first, then the others
// A to Z, by amount within each. Vaults holding nothing wait behind "Show all".

import { useState, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { AssetUnit } from "@/components/shared/asset-unit";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableLeadCell,
  DataTableLeadHeader,
  DataTableLeadMark,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import type { ChainId } from "@/lib/shared/chains";
import { formatCompact } from "@/lib/shared/format-compact";
import { protocolForPathname } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { assetText, shortAddress } from "@/lib/shared/vault-amount-text";
import { stewardVaultCountProv, vaultStewardProv } from "@/lib/vaults/card-provenance";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import {
  VAULT_INDEX_PROTOCOL_LABEL,
  vaultIndexHref,
  vaultIndexProtocol,
  vaultIndexRosterHref,
} from "@/lib/vaults/index-rosters";
import { vaultIndexRowReceipts } from "@/lib/vaults/row-receipts";
import type { StewardRecordRead, StewardRecordRoster } from "@/lib/vaults/steward-record";
import { vaultDisplayName, type VaultSteward, type VaultSummary } from "@/lib/vaults/summary";
import { assetScaleAbsentTip, assetScaleReceiptNote, withScaleNote } from "@/lib/vaults/asset-scale-words";
import { formatDate } from "@/lib/date";
import type { StewardRunsRead } from "@/lib/vaults/steward-runs-read";
import { spanOf, type StewardBefore, type StewardRunRole, type StewardSince } from "@/lib/vaults/steward-runs";
import { stewardBeforeCountProv, stewardBeforeProv, stewardSinceProv } from "@/lib/vaults/config-changes-provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** The table draws this many rows, and the page's vault, until "Show all". */
const LIMIT = 12;

export const STEWARD_RECORD_SCOPE = "vault-steward-record";

const TITLE: Record<VaultSteward["role"], string> = {
  curator: "The curator’s record",
  owner: "The owner’s record",
  poolDelegate: "The pool delegate’s record",
  roleManager: "The role manager’s record",
};

/** The record's key for a vault, as lib/vaults/steward-record.ts writes `current`. */
const stewardVaultKey = (v: { chainId: number; address: string }) => `${v.chainId}:${v.address.toLowerCase()}`;

/** The token a vault's amounts are in: its symbol, its address where the symbol did not decode. */
const tokenOf = (v: VaultSummary) => (v.asset.named ? v.asset.symbol : v.asset.address);

/** The page's vault's asset first, then by asset A to Z; within each asset by
 *  total assets, most first, an unread figure last. */
const byAssetThenAmount =
  (first: string) =>
  (a: VaultSummary, b: VaultSummary): number => {
    const fa = tokenOf(a) === first;
    if (fa !== (tokenOf(b) === first)) return fa ? -1 : 1;
    const t = tokenOf(a).localeCompare(tokenOf(b), "en-US");
    if (t !== 0) return t;
    if (!a.totalAssets || !b.totalAssets) return a.totalAssets ? -1 : b.totalAssets ? 1 : 0;
    const x = BigInt(a.totalAssets.raw);
    const y = BigInt(b.totalAssets.raw);
    return x > y ? -1 : x < y ? 1 : 0;
  };

/** A vault whose total assets read zero. An unread figure is not empty. */
const holdsNothing = (v: VaultSummary) => v.totalAssets != null && BigInt(v.totalAssets.raw) === BigInt(0);

const rosterOf = (rosters: StewardRecordRoster[], v: VaultSummary) =>
  rosters.find((r) => r.chainId === v.chainId && r.protocol === vaultIndexProtocol(v));

/** The lead zone's `protocols.ts` id, as the /vaults index draws it. */
const leadOf = (v: VaultSummary) =>
  protocolForPathname(vaultIndexRosterHref(vaultIndexProtocol(v), v.chainId))?.id ?? VAULT_FAMILIES[v.family].venue;

export function VaultStewardRecord({
  record,
  role,
  runs,
  badDebt,
}: {
  record: StewardRecordRead;
  /** The steward's runs (V14.2, V14.3), MetaMorpho pages only; absent or null, none is shown. */
  runs?: StewardRunsRead | null;
  /** The bad-debt episodes (V14.1), drawn under the vaults table. */
  badDebt?: ReactNode;
  /** The page's read of the steward's role: the heading where the directory did not answer. */
  role: VaultSteward["role"];
}) {
  const [all, setAll] = useState(false);
  const title = TITLE[record?.steward.role ?? role];
  const head = (sub: ReactNode) => <SectionHeading title={title}>{sub}</SectionHeading>;

  if (!record || record.vaults.length === 0)
    return (
      <ProvSection scope={STEWARD_RECORD_SCOPE} data-anatomy="V14" data-steward-record="">
        {head(null)}
        <p className="mt-3 text-[13px] text-rb-500" data-steward-unread="">
          The vault directory did not answer, so no vault of this steward is stated.
        </p>
      </ProvSection>
    );

  const { steward, current, vaults, listed, rosters } = record;
  const address = steward.address.toLowerCase();
  const self = vaults.find((v) => stewardVaultKey(v) === current) ?? vaults[0];
  const selfRoster = rosterOf(rosters, self);
  const short = <Prov info={vaultStewardProv(self, steward, selfRoster?.readBy)}>{shortAddress(steward.address)}</Prov>;
  const count = vaults.length;
  const countProv = stewardVaultCountProv(steward.address, count, listed, rosters);
  const countFig = (
    <span className="font-semibold text-foreground" data-steward-count={count}>
      <Prov info={countProv}>{n(count)}</Prov>
    </span>
  );
  const sorted = [...vaults].sort(byAssetThenAmount(tokenOf(self)));
  const empty = sorted.filter((v) => holdsNothing(v) && stewardVaultKey(v) !== current).length;
  const shown = all
    ? sorted
    : sorted
        .filter((v) => stewardVaultKey(v) === current || !holdsNothing(v))
        .filter((v, i) => i < LIMIT || stewardVaultKey(v) === current);
  const only = count === 1 && stewardVaultKey(self) === current;
  const ok = runs?.kind === "ok" ? runs : null;
  const runRole = ok?.runs.role;
  const sinceOf = (v: VaultSummary) =>
    ok && vaultIndexProtocol(v) === "morpho" ? ok.runs.since[stewardVaultKey(v)] : undefined;
  const selfSince = sinceOf(self);
  const beforeCount = ok ? ok.runs.before.length : 0;
  const beforeLine = ok && runRole && (
    <>
      {" "}
      It ran{" "}
      <span className="font-semibold text-foreground" data-steward-before-count={beforeCount}>
        <Prov info={stewardBeforeCountProv(address, runRole, beforeCount, ok.runs.chains)}>
          {beforeCount === 0 ? "no other vault" : `${n(beforeCount)} other vault${beforeCount === 1 ? "" : "s"}`}
        </Prov>
      </span>{" "}
      as {runRole} before.
    </>
  );

  return (
    <ProvSection scope={STEWARD_RECORD_SCOPE} data-anatomy="V14" data-steward-record={address}>
      {head(
        <p className="mt-1 text-[13px] text-rb-500">
          <span className="font-mono">{short}</span> &middot; the vaults it runs now on Base and Ethereum, at the
          directory&rsquo;s read
        </p>,
      )}
      {only ? (
        <p className="mt-3 text-[13px] text-rb-500" data-steward-only="">
          <span className="font-mono">{short}</span> runs{" "}
          <span data-steward-count={count}>
            <Prov info={countProv}>no other vault</Prov>
          </span>{" "}
          Rails lists on Base and Ethereum.{beforeLine}
          {selfSince && runRole && (
            <>
              {" "}
              It has been this vault&rsquo;s {runRole} since{" "}
              <span data-anatomy="V14.2" data-steward-since={selfSince.run.fromBlock}>
                <Prov info={stewardSinceProv(address, runRole, selfSince)}>{formatDate(selfSince.run.fromTime)}</Prov>
              </span>
              .
            </>
          )}
        </p>
      ) : (
        <>
          <p className="mt-3 text-[13px] text-rb-500">
            It runs {countFig} vaults Rails lists on Base and Ethereum.{beforeLine}
          </p>
          <div className="mt-3">
            <DataTable
              label={`The vaults ${shortAddress(steward.address)} runs`}
              tableClassName="text-sm sm:[&_tbody_tr]:h-12 sm:[&_tbody_tr]:py-0"
              stacked
            >
              <DataTableHead>
                <DataTableLeadHeader plain />
                <DataTableHeader label="Vault" />
                <DataTableHeader label="Asset" />
                <DataTableHeader label="Held" align="right" />
                {ok && <DataTableHeader label="Since" align="right" />}
              </DataTableHead>
              <DataTableBody>
                {shown.map((v) => (
                  <StewardRow
                    key={stewardVaultKey(v)}
                    v={v}
                    isCurrent={stewardVaultKey(v) === current}
                    rosters={rosters}
                    since={ok && runRole ? { run: sinceOf(v), role: runRole, address } : undefined}
                  />
                ))}
              </DataTableBody>
            </DataTable>
          </div>
          {shown.length < sorted.length && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className={`mt-2 inline-block text-[13px] ${INLINE_LINK}`}
              data-steward-show-all=""
            >
              Show all {n(sorted.length)}
            </button>
          )}
          {!all && empty > 0 && (
            <span className="text-[13px] text-rb-500" data-steward-empty={empty}>
              {" "}
              &middot; {n(empty)} of them hold nothing
            </span>
          )}
          <p className="mt-2 text-[13px] text-rb-500" data-steward-order="">
            {tokenOf(self)} first, as this vault&rsquo;s asset, then the others A to Z; within each asset, by total
            assets. Held is each vault&rsquo;s total assets in its asset.
          </p>
        </>
      )}
      {runs?.kind === "unread" && (
        <p className="mt-2 text-[13px] text-rb-500" data-steward-runs-unread="">
          Rails&rsquo;s record of curator and owner changes did not answer, so since when it runs each vault and the
          vaults it ran before are not stated.
        </p>
      )}
      {ok && runRole && ok.runs.before.length > 0 && (
        <RanBefore before={ok.runs.before} hrefs={ok.hrefs} role={runRole} address={address} />
      )}
      {badDebt}
    </ProvSection>
  );
}

/** The ran-before table draws this many rows until "Show all", as the vaults table does. */
const BEFORE_LIMIT = 12;

/** The vaults the steward ran before (V14.3): each vault, its chain, and the span its runs cover. */
function RanBefore({
  before,
  hrefs,
  role,
  address,
}: {
  before: StewardBefore[];
  hrefs: Record<string, string>;
  role: StewardRunRole;
  address: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? before : before.slice(0, BEFORE_LIMIT);
  return (
    <div className="mt-5" data-anatomy="V14.3" data-steward-before={before.length}>
      <h3 className="text-sm font-semibold text-foreground">Vaults it ran before</h3>
      <p className="mt-1 text-[13px] text-rb-500">
        MetaMorpho vaults on Base and Ethereum where each of its runs as {role} has ended, the latest end first.
      </p>
      <div className="mt-3">
        <DataTable label="Vaults it ran before" tableClassName="text-sm" stacked>
          <DataTableHead>
            <DataTableLeadHeader plain />
            <DataTableHeader label="Vault" />
            <DataTableHeader label="Ran" align="right" />
          </DataTableHead>
          <DataTableBody>
            {shown.map((b) => (
              <BeforeRow
                key={`${b.chainId}:${b.vault}`}
                b={b}
                href={hrefs[`${b.chainId}:${b.vault}`]}
                role={role}
                address={address}
              />
            ))}
          </DataTableBody>
        </DataTable>
      </div>
      {shown.length < before.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={`mt-2 inline-block text-[13px] ${INLINE_LINK}`}
          data-steward-before-show-all=""
        >
          Show all {n(before.length)}
        </button>
      )}
    </div>
  );
}

const morphoLead = (chainId: number) =>
  protocolForPathname(vaultIndexRosterHref("morpho", chainId))?.id ?? VAULT_FAMILIES.metamorpho.venue;

function BeforeRow({
  b,
  href,
  role,
  address,
}: {
  b: StewardBefore;
  href: string | undefined;
  role: StewardRunRole;
  address: string;
}) {
  const { from, until } = spanOf(b);
  const name = b.name ?? <span className="font-mono">{shortAddress(b.vault)}</span>;
  return (
    <DataTableRow
      href={href}
      data-steward-before-vault={`${b.chainId}:${b.vault}`}
      data-steward-before-from={from.fromBlock}
      data-steward-before-until={until.untilBlock ?? undefined}
    >
      <DataTableLeadCell
        plain
        protocol={morphoLead(b.chainId)}
        protocolName={VAULT_INDEX_PROTOCOL_LABEL.morpho}
        chain={b.chainId as ChainId}
      />
      <DataTableCell rowHeader valign="middle" className="sm:w-full sm:max-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <DataTableLeadMark protocol={morphoLead(b.chainId)} chain={b.chainId as ChainId} />
          {href ? (
            <DataTableRowLink href={href} className="min-w-0 truncate text-sm font-semibold" title={b.name ?? b.vault}>
              {name}
            </DataTableRowLink>
          ) : (
            <span className="min-w-0 truncate text-sm font-semibold text-foreground" title={b.name ?? b.vault}>
              {name}
            </span>
          )}
        </span>
      </DataTableCell>
      <DataTableCell
        label="Ran"
        align="right"
        valign="middle"
        className="whitespace-nowrap tabular-nums text-foreground"
      >
        <Prov info={stewardBeforeProv(address, role, b)}>
          {formatDate(from.fromTime)} &ndash; {until.untilTime != null ? formatDate(until.untilTime) : "–"}
        </Prov>
        {b.runs.length > 1 && <span className="text-rb-500"> &middot; {n(b.runs.length)} runs</span>}
      </DataTableCell>
    </DataTableRow>
  );
}

function StewardRow({
  v,
  isCurrent,
  rosters,
  since,
}: {
  v: VaultSummary;
  isCurrent: boolean;
  rosters: StewardRecordRoster[];
  /** The Since column (V14.2): the open run where the roles route holds one. */
  since?: { run: StewardSince | undefined; role: StewardRunRole; address: string };
}) {
  const r = rosterOf(rosters, v);
  const receipts = vaultIndexRowReceipts({ blockNumber: r?.block, readBy: r?.readBy }, v);
  const href = isCurrent ? undefined : vaultIndexHref(v);
  const name = vaultDisplayName(v);
  const nameText = name ?? <span className="font-mono">{shortAddress(v.address)}</span>;
  const held = v.totalAssets;
  const withheld = v.assetScale ? assetScaleAbsentTip(v.asset.symbol, v.assetScale) : undefined;
  const heldProv: Provenance | undefined = receipts.totalAssets;
  return (
    <DataTableRow
      href={href}
      data-steward-vault={stewardVaultKey(v)}
      data-steward-token={tokenOf(v)}
      data-steward-current={isCurrent ? "" : undefined}
    >
      <DataTableLeadCell
        plain
        protocol={leadOf(v)}
        protocolName={VAULT_INDEX_PROTOCOL_LABEL[vaultIndexProtocol(v)]}
        chain={v.chainId as ChainId}
      />
      <DataTableCell rowHeader valign="middle" className="sm:w-full sm:max-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <DataTableLeadMark protocol={leadOf(v)} chain={v.chainId as ChainId} />
          {href ? (
            <DataTableRowLink href={href} className="min-w-0 truncate text-sm font-semibold" title={name ?? v.address}>
              {nameText}
            </DataTableRowLink>
          ) : (
            <span className="min-w-0 truncate text-sm font-semibold text-foreground" title={name ?? v.address}>
              {nameText}
            </span>
          )}
          {isCurrent && <span className="shrink-0 text-[12px] text-rb-500">this vault</span>}
        </span>
      </DataTableCell>
      <DataTableCell label="Asset" valign="middle" className="whitespace-nowrap">
        <span className="text-sm text-foreground">{v.asset.symbol}</span>
      </DataTableCell>
      <DataTableCell
        label="Held"
        align="right"
        valign="middle"
        className="whitespace-nowrap font-semibold tabular-nums text-foreground"
      >
        {held && withheld ? (
          // Decimals disagree (ui-jobs 664): no amount in the asset. The raw
          // read stays on the cell, where the order within the token uses it,
          // and in the receipt, which says so.
          <span
            className="text-rb-500"
            data-cell="steward-held"
            data-raw={held.raw}
            data-held-withheld=""
            title={withheld}
          >
            {heldProv && v.assetScale ? (
              <Prov info={withScaleNote(heldProv, assetScaleReceiptNote(v.asset.symbol, v.assetScale))}>
                <span aria-hidden>&ndash;</span>
                <span className="sr-only">{withheld}</span>
              </Prov>
            ) : (
              <>
                <span aria-hidden>&ndash;</span>
                <span className="sr-only">{withheld}</span>
              </>
            )}
          </span>
        ) : held ? (
          <span
            className="inline-flex items-center gap-1.5 sm:justify-end"
            data-cell="steward-held"
            data-raw={held.raw}
            title={`${assetText(held, v.asset.decimals)} ${v.asset.symbol}`}
          >
            {heldProv ? <Prov info={heldProv}>{formatCompact(held.value)}</Prov> : formatCompact(held.value)}
            <AssetUnit symbol={v.asset.symbol} address={v.asset.address} named={v.asset.named} />
          </span>
        ) : (
          <span className="text-rb-500">
            <span aria-hidden>&ndash;</span>
            <span className="sr-only">no figure</span>
          </span>
        )}
      </DataTableCell>
      {since && (
        <DataTableCell label="Since" align="right" valign="middle" className="whitespace-nowrap tabular-nums">
          {since.run ? (
            <span className="text-foreground" data-anatomy="V14.2" data-steward-since={since.run.run.fromBlock}>
              <Prov info={stewardSinceProv(since.address, since.role, since.run)}>
                {formatDate(since.run.run.fromTime)}
              </Prov>
            </span>
          ) : (
            <span className="text-rb-500" title="Rails's record of role changes holds no start for this run">
              <span aria-hidden>&ndash;</span>
              <span className="sr-only">no start in Rails&rsquo;s record</span>
            </span>
          )}
        </DataTableCell>
      )}
    </DataTableRow>
  );
}
