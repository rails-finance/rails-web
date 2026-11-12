"use client";

// Configuration · Roles · Contracts, the last tile of a vault page's grid
// (Miles, 10 Nov 2026, after Morpho's vault page; every family since ui-jobs
// 584): a column each, with a hairline between them from lg, one above the
// other below it. A family passes its columns (components/vaults/
// vault-config-columns.tsx); a column with no rows is not drawn. The tile has
// no heading; its read stamp and ⋮ sit at its top right. Every value carries
// its receipt.
//
// The row rule, the same in every column:
// - Column heading: the section heading's style (14px semibold foreground),
//   no rule under it.
// - Row: label left, value right-aligned to the column's edge, on one
//   baseline; a hairline between rows, none under a column's last row.
// - Label: 14px semibold muted, the value's size; with a tip, the shared
//   HeadingTip (its cue on hover).
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
import { readStampProv, SectionReadStamp, type ReadContract } from "@/components/shared/read-stamp";
import { CopyFact } from "@/components/shared/event-page-aside";
import { HeadingTip } from "@/components/shared/tip-label";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { ServerRead } from "@/lib/shared/server-head-read";

/** The section's receipts scope. */
const SCOPE = "vault-config";

const LABEL = "text-[14px] font-semibold text-rb-500";

const MUTED = "text-[13px] font-normal text-rb-500";

function Term({ label, tip }: { label: string; tip?: string }) {
  // The shared heading tip: a keyboard control that opens on a press (ui-jobs 602).
  return (
    <span className={LABEL}>
      <HeadingTip text={label} tip={tip} />
    </span>
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

/** One row of a column. */
export type ConfigEntry =
  | {
      kind: "fact";
      id: string;
      label: string;
      tip?: string;
      /** Null: "not read". */
      value: ReactNode | null;
      sub?: ReactNode;
    }
  | {
      kind: "address";
      id: string;
      label: string;
      tip?: string;
      sub?: string;
      note?: string;
      /** Null: "none set" where the read answered the zero address, "not read" where it did not answer. */
      address: string | null;
      read?: boolean;
      prov: (address: string) => Provenance;
      /** `fact`: the row is a Configuration fact whose value is an address (`data-vault-fact`). */
      hook?: "fact" | "address";
    };

/** One column: a heading, its rows, and an optional line under them. */
export interface ConfigColumn {
  title: string;
  entries: ConfigEntry[];
  foot?: string;
}

/** The Network row every family opens its Configuration column with. */
export function networkEntry(chainId: ChainId): ConfigEntry {
  return {
    kind: "fact",
    id: "network",
    label: "Network",
    tip: "The chain the vault and every address on this page live on.",
    value: (
      <span className="inline-flex items-center gap-1.5">
        <ChainGlyph id={chainId} className="h-4 w-4 shrink-0" />
        {chainMeta(chainId).name}
      </span>
    ),
    sub: `chain id ${chainId}`,
  };
}

/** From lg, one grid column per tile column. */
const COLS: Record<number, string> = { 1: "", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

export function VaultConfiguration({
  chainId,
  vault,
  vaultName,
  block,
  readBy,
  stampWhat,
  stampContracts,
  columns,
}: {
  chainId: ChainId;
  vault: string;
  vaultName: string;
  /** The card's pinned block, and rails-server's read of it. */
  block: number;
  readBy?: ServerRead | null;
  /** The read stamp's receipt: what it covers and the calls behind it. */
  stampWhat: string;
  stampContracts: ReadContract[];
  columns: ConfigColumn[];
}) {
  const chain = chainMeta(chainId);
  const addr = (a: string) => explorerUrl(chainId, "address", a);
  const shown = columns.filter((c) => c.entries.length > 0);

  return (
    <ProvSection scope={SCOPE} data-vault-config={vault} data-anatomy="V12">
      <div className="absolute right-0 top-5 flex items-center gap-2 sm:right-5">
        <SectionReadStamp
          chainId={chainId}
          block={block}
          readBy={readBy}
          info={(at) => readStampProv({ chainId, block, at, readBy, what: stampWhat, contracts: stampContracts })}
        />
        <SectionMenu scope={SCOPE} title="Configuration and addresses" />
      </div>
      <div
        className={`grid grid-cols-1 gap-y-6 ${COLS[shown.length] ?? COLS[3]} lg:[&>div+div]:border-l lg:[&>div+div]:border-rb-200 lg:[&>div+div]:pl-8 lg:[&>div:not(:last-child)]:pr-8 dark:lg:[&>div+div]:border-rb-500/30`}
        data-vault-config-columns={shown.length}
      >
        {shown.map((col) => (
          <div key={col.title} className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{col.title}</h2>
            <dl className="mt-1">
              {col.entries.map((e) =>
                e.kind === "fact" ? (
                  <Fact key={e.id} id={e.id} label={e.label} tip={e.tip} value={e.value} sub={e.sub} />
                ) : (
                  <Row
                    key={e.id}
                    hook={e.hook === "fact" ? { "data-vault-fact": e.id } : { "data-vault-address": e.id }}
                    label={e.label}
                    tip={e.tip}
                    note={e.note}
                    sub={e.sub}
                    value={
                      e.address ? (
                        <AddressValue
                          id={e.id}
                          label={e.label}
                          address={e.address}
                          explorer={chain.explorerName}
                          href={addr(e.address)}
                          prov={e.prov(e.address)}
                        />
                      ) : (
                        <span className={MUTED}>{e.read === false ? "not read" : "none set"}</span>
                      )
                    }
                  />
                ),
              )}
            </dl>
            {col.foot && <p className="mt-2 text-xs text-rb-500">{col.foot}</p>}
          </div>
        ))}
      </div>
    </ProvSection>
  );
}
