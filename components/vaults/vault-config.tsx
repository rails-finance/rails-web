"use client";

// Configuration · Roles · Contracts, the last tile of a MetaMorpho vault page
// (Miles, 10 Nov 2026, after Morpho's vault page): three columns with a
// hairline between them from lg, one above the other below it. The tile has
// no heading; its read stamp and ⋮ sit at its top right. Every value carries
// its receipt (lib/vaults/config-provenance.ts); the reads are
// lib/vaults/config-read.ts and the card's.
//
// The row rule, the same in all three columns:
// - Column heading: the section heading's style (14px semibold foreground),
//   no rule under it.
// - Row: label left, value right-aligned to the column's edge, on one
//   baseline; a hairline between rows, none under a column's last row.
// - Label: 14px semibold muted, the value's size; dotted underline only
//   when it has a tip.
// - Value: 14px medium foreground. An address: short form in mono, copy
//   button, explorer icon button ("View on Etherscan" / "View on Basescan").
// - Detail of the value (chain id, block, a contract's name): 12px muted,
//   under the value, right-aligned.
// - Note about the entry (what a role can do): 12px muted, its own line
//   across the row's full width, left-aligned.

import type { ReactNode } from "react";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionMenu } from "@/components/shared/section-menu";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import { CopyFact } from "@/components/shared/event-page-aside";
import { formatDate } from "@/lib/date";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { ServerRead } from "@/lib/shared/server-head-read";
import type { AssetScale } from "@/lib/vaults/asset-scale-words";
import type { VaultConfig } from "@/lib/vaults/config-read";
import {
  configCallProv,
  configCreatedProv,
  configFeeProv,
  configReleaseProv,
  configVaultProv,
  configWrapsProv,
  type ConfigCoords,
  type VaultCreation,
} from "@/lib/vaults/config-provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** The section's receipts scope. */
const SCOPE = "vault-config";

const LABEL =
  "cursor-help text-[14px] font-semibold text-rb-500 underline decoration-rb-400 decoration-dotted underline-offset-4 dark:decoration-rb-500";

const MUTED = "text-[13px] font-normal text-rb-500";

function Term({ label, tip }: { label: string; tip?: string }) {
  return tip ? (
    <abbr title={tip} className={LABEL}>
      {label}
    </abbr>
  ) : (
    <span className="text-[14px] font-semibold text-rb-500">{label}</span>
  );
}

/** One row of a column: label left, value right; its detail under the value,
 *  its note across the row. */
function Row({
  hook,
  label,
  tip,
  value,
  sub,
  note,
}: {
  hook: Record<string, string>;
  label: string;
  tip?: string;
  value: ReactNode;
  sub?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-rb-200 py-2.5 last-of-type:border-b-0 dark:border-rb-500/30"
      data-anatomy="V12.1"
      {...hook}
    >
      <dt className="min-w-0">
        <Term label={label} tip={tip} />
      </dt>
      <dd className="flex justify-end text-right text-[14px] font-medium tabular-nums text-foreground">{value}</dd>
      {sub && <dd className="col-start-2 mt-0.5 text-right text-xs leading-snug text-rb-500">{sub}</dd>}
      {note && <dd className="col-span-2 mt-0.5 text-xs leading-snug text-rb-500">{note}</dd>}
    </div>
  );
}

/** One label/value pair in the Configuration column. */
function Fact({
  id,
  label,
  tip,
  value,
  sub,
}: {
  id: string;
  label: string;
  tip?: string;
  value: ReactNode | null;
  sub?: ReactNode;
}) {
  return (
    <Row
      hook={{ "data-vault-fact": id }}
      label={label}
      tip={tip}
      sub={sub}
      value={value ?? <span className={MUTED}>not read</span>}
    />
  );
}

/** An address value: its short form under its receipt, copy, and an explorer icon link. */
function AddressValue({
  id,
  label,
  address,
  explorer,
  href,
  prov,
}: {
  id: string;
  label: string;
  address: string;
  explorer: string;
  href: string;
  prov: Provenance;
}) {
  const view = `View on ${explorer}`;
  return (
    <span className="inline-flex items-center gap-2" data-address={address}>
      <span className="font-mono text-foreground" title={address}>
        <Prov info={prov}>{shortAddress(address)}</Prov>
      </span>
      <CopyFact value={address} label={`Copy the ${label.toLowerCase()} address`} name={id} />
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={view}
        title={view}
        className="shrink-0 text-rb-500 hover:text-foreground"
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 4h6v6" />
          <path d="M20 4l-9 9" />
          <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      </a>
    </span>
  );
}

/** One address row: what it is, its short form, copy and explorer link.
 *  `address` null: "none set" where the read answered the zero address,
 *  "not read" where it did not answer. */
function AddressRow({
  id,
  label,
  tip,
  sub,
  note,
  address,
  read = true,
  prov,
  explorer,
  href,
}: {
  id: string;
  label: string;
  tip?: string;
  sub?: string;
  note?: string;
  address: string | null;
  read?: boolean;
  prov: (address: string) => Provenance;
  explorer: string;
  href: (a: string) => string;
}) {
  return (
    <Row
      hook={{ "data-vault-address": id }}
      label={label}
      tip={tip}
      note={note}
      sub={sub}
      value={
        address ? (
          <AddressValue
            id={id}
            label={label}
            address={address}
            explorer={explorer}
            href={href(address)}
            prov={prov(address)}
          />
        ) : (
          <span className={MUTED}>{read ? "none set" : "not read"}</span>
        )
      }
    />
  );
}

/** A WAD fraction as a percentage, to two places. */
function wadPct(raw: string): string {
  const bp = Number((BigInt(raw) * BigInt(1_000_000)) / BigInt(10) ** BigInt(18)) / 10_000;
  return `${bp.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function VaultConfiguration({
  chainId,
  vault,
  vaultName,
  release,
  factory,
  createdBlock,
  asset,
  assetScale,
  morpho,
  owner,
  curator,
  block,
  readBy,
  config,
}: {
  chainId: 1 | 8453;
  vault: string;
  vaultName: string;
  /** "MetaMorpho V1.1". */
  release: string;
  /** The factory that made the vault, from the catalogue. */
  factory: string | null;
  createdBlock: number;
  asset: { address: string; symbol: string };
  /** What the asset wraps, where its decimals disagree. */
  assetScale?: AssetScale;
  /** `MORPHO()`, at `block`. */
  morpho: string;
  /** `owner()` and `curator()`, at `block`. */
  owner: string;
  curator: string | null;
  /** The card's pinned block, and rails-server's read of it. */
  block: number;
  readBy?: ServerRead | null;
  config: VaultConfig;
}) {
  const chain = chainMeta(chainId);
  const addr = (a: string) => explorerUrl(chainId, "address", a);
  const card: ConfigCoords = { chainId, vault, vaultName, block, readBy };
  const own: ConfigCoords | null =
    config.block != null ? { chainId, vault, vaultName, block: config.block, readBy: config.readBy } : null;
  const created: VaultCreation | null =
    createdBlock > 0
      ? { chainId, vault, vaultName, release, factory, block: createdBlock, at: config.createdAt }
      : null;
  const role = (c: ConfigCoords, label: string, call: string, what: string) => (a: string) =>
    configCallProv(c, { label, call, answer: a, what });

  return (
    <ProvSection scope={SCOPE} data-vault-config={vault} data-anatomy="V12">
      <div className="absolute right-0 top-5 flex items-center gap-2 sm:right-5">
        <SectionReadStamp
          chainId={chainId}
          block={block}
          readBy={readBy}
          info={(at) =>
            readStampProv({
              chainId,
              block,
              at,
              readBy,
              what: "The fee, the roles and the contracts",
              contracts: [
                {
                  name: vaultName,
                  address: vault,
                  reads: "fee(), feeRecipient(), guardian(), owner(), curator(), asset(), MORPHO()",
                },
              ],
            })
          }
        />
        <SectionMenu scope={SCOPE} title="Configuration and addresses" />
      </div>
      <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-3 lg:[&>div+div]:border-l lg:[&>div+div]:border-rb-200 lg:[&>div+div]:pl-8 lg:[&>div:not(:last-child)]:pr-8 dark:lg:[&>div+div]:border-rb-500/30">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Configuration</h2>
          <dl className="mt-1">
            <Fact
              id="network"
              label="Network"
              tip="The chain the vault and every address on this page live on."
              value={
                <span className="inline-flex items-center gap-1.5">
                  <ChainGlyph id={chainId} className="h-4 w-4 shrink-0" />
                  {chain.name}
                </span>
              }
              sub={`chain id ${chainId}`}
            />
            <Fact
              id="version"
              label="Version"
              tip="The MetaMorpho factory release that deployed the vault."
              value={created ? <Prov info={configReleaseProv(created)}>{release}</Prov> : release}
            />
            <Fact
              id="created"
              label="Created"
              tip="The date of the block the vault was deployed in."
              value={
                created && config.createdAt ? (
                  <Prov info={configCreatedProv(created)}>{formatDate(new Date(config.createdAt * 1000))}</Prov>
                ) : null
              }
              sub={
                created ? (
                  <>
                    block <Prov info={configCreatedProv(created)}>{n(createdBlock)}</Prov>
                  </>
                ) : undefined
              }
            />
            <Fact
              id="fee"
              label="Performance fee"
              tip="The share of the interest the vault earns that it pays to the fee recipient, as new shares. Read from fee(), a fraction of 10^18."
              value={
                own && config.fee != null ? (
                  <span data-fee-raw={config.fee}>
                    <Prov info={configFeeProv(own, config.fee, wadPct(config.fee))}>{wadPct(config.fee)}</Prov>
                  </span>
                ) : null
              }
            />
            <Row
              hook={{ "data-vault-fact": "fee-recipient" }}
              label="Fee recipient"
              tip="The address the performance fee's new shares go to. Read from feeRecipient()."
              value={
                own && config.feeRecipient ? (
                  <AddressValue
                    id="fee-recipient"
                    label="Fee recipient"
                    address={config.feeRecipient}
                    explorer={chain.explorerName}
                    href={addr(config.feeRecipient)}
                    prov={role(
                      own,
                      "Fee recipient",
                      "feeRecipient()",
                      "The performance fee's new shares are minted to it.",
                    )(config.feeRecipient)}
                  />
                ) : (
                  <span className={MUTED}>{own ? "none set" : "not read"}</span>
                )
              }
            />
          </dl>
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Roles</h2>
          <dl className="mt-1">
            <AddressRow
              id="owner"
              label="Owner"
              note="sets the curator, the guardian and the fee"
              address={owner}
              prov={role(card, "Owner", "owner()", "It sets the curator, the guardian and the fee.")}
              explorer={chain.explorerName}
              href={addr}
            />
            <AddressRow
              id="curator"
              label="Curator"
              note="chooses the markets and their caps"
              address={curator}
              prov={role(card, "Curator", "curator()", "It chooses the markets and their caps.")}
              explorer={chain.explorerName}
              href={addr}
            />
            <AddressRow
              id="guardian"
              label="Guardian"
              note="can cancel a change while it waits"
              address={config.guardian}
              read={own != null}
              prov={role(own ?? card, "Guardian", "guardian()", "It can cancel a change while the timelock runs.")}
              explorer={chain.explorerName}
              href={addr}
            />
          </dl>
          <p className="mt-2 text-xs text-rb-500">Allocators are not listed here.</p>
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Contracts</h2>
          <dl className="mt-1">
            <AddressRow
              id="vault"
              label="Vault"
              tip="The MetaMorpho contract that holds the deposits and issues the shares."
              sub={vaultName}
              address={vault}
              prov={() =>
                created
                  ? configVaultProv(created)
                  : configCallProv(card, {
                      label: "Vault",
                      call: "name()",
                      answer: vaultName,
                      what: "The contract every figure on this page is read from.",
                    })
              }
              explorer={chain.explorerName}
              href={addr}
            />
            <AddressRow
              id="asset"
              label="Asset"
              tip="The token the vault takes in deposits and lends out."
              sub={asset.symbol}
              address={asset.address}
              prov={role(card, "Asset", "asset()", `The token the vault takes in deposits and lends: ${asset.symbol}.`)}
              explorer={chain.explorerName}
              href={addr}
            />
            {assetScale && (
              <AddressRow
                id="wraps"
                label="What the asset wraps"
                tip="The token the asset holds underneath."
                sub={`${assetScale.wraps.symbol}, ${asset.symbol}'s asset(), ${assetScale.wraps.decimals} decimals`}
                address={assetScale.wraps.address}
                prov={() => configWrapsProv(chainId, asset, assetScale.wraps)}
                explorer={chain.explorerName}
                href={addr}
              />
            )}
            <AddressRow
              id="morpho-blue"
              label="Morpho Blue"
              tip="The Morpho Blue contract the vault supplies to; every market it lends in lives there."
              note="the lending protocol"
              address={morpho}
              prov={role(card, "Morpho Blue", "MORPHO()", "The Morpho Blue contract the vault supplies to.")}
              explorer={chain.explorerName}
              href={addr}
            />
          </dl>
        </div>
      </div>
    </ProvSection>
  );
}
