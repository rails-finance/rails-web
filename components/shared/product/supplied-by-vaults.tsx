"use client";

// "Supplied by vaults" (rails-ops ui-jobs 549 step 4): the section of a market
// or reserve page that lists the vaults on Rails's rosters holding a position
// there, each row opening the vault's page. A section of its own (K1): the
// heading, the read stamp (K2), the "?" and the ⋮ (the roster's page, Copy,
// View as Markdown, Download CSV), one line, then one
// house table (D1, D4, D6): Vault (name over its kind) · Steward (short
// address over its role) · Amount (in the market's asset, with its receipt).
// It takes plain data (lib/vaults/supplied-by.ts), so a server page and a
// client page draw it alike; the reserve shell (R3) mounts it under its
// sections, and the Morpho market page mounts it until that page moves onto
// the shells.

import { useState, type ReactNode } from "react";
import { ProvSection, SectionHeading, SectionMenu, type SectionMenuLink } from "@/components/shared/section-menu";
import { LearnMore, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import { AssetUnit } from "@/components/shared/asset-unit";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { assetText, shortAddress } from "@/lib/shared/vault-amount-text";
import { serverReadAt, stampServerRead } from "@/lib/shared/server-head-read";
import type { SuppliedByRead, SuppliedByRow } from "@/lib/vaults/supplied-by";

/** The section's name (`data-prov-scope`). */
export const SUPPLIED_BY_SCOPE = "supplied-by-vaults";

const n = (v: number) => v.toLocaleString("en-US");

/** Rows drawn before "Show all". */
const FIRST_ROWS = 10;

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function amountProv(read: SuppliedByRead, r: SuppliedByRow): Provenance {
  return stampServerRead(
    {
      kind: "chain",
      pclass: "state",
      source: { block: read.block },
      summary: `Amount in this market — ${r.name}: ${r.amountWhat} Read at block ${n(read.block)}.`,
      contract: { name: r.name, address: r.address },
      via: `chain · ${r.amountVia} @ the pinned block`,
      inputs: [{ label: "vault", value: r.address, kind: "chain", pclass: "state" }],
    },
    serverReadAt(read.head, read.block),
  );
}

function stewardProv(read: SuppliedByRead, r: SuppliedByRow): Provenance {
  const s = r.steward!;
  return stampServerRead(
    {
      kind: "chain",
      pclass: "state",
      source: { block: read.block },
      summary: `Steward — the vault's ${s.role}, ${s.address}, as ${read.roster} read it at block ${n(read.block)}. An address: who holds it is stated nowhere on chain.`,
      contract: { name: r.name, address: r.address },
      via: `chain · ${s.role === "curator" ? "curator()" : "owner()"} @ the pinned block`,
    },
    serverReadAt(read.head, read.block),
  );
}

export function SuppliedByVaults({
  read,
  line,
  learnMore,
  links = [],
  what,
  noun = "market",
}: {
  read: SuppliedByRead;
  /** The page's object, for the empty line: "market", "reserve". */
  noun?: string;
  /** The one line under the heading. */
  line: ReactNode;
  learnMore: LearnMoreContent;
  /** Rails pages and off-site rows of the ⋮, above the exports. */
  links?: SectionMenuLink[];
  /** The market as the exports name it: "the WETH reserve of Aave V3 Core". */
  what: string;
}) {
  const a = read.asset;
  const [all, setAll] = useState(false);
  const shown = all ? read.rows : read.rows.slice(0, FIRST_ROWS);
  const readBy = serverReadAt(read.head, read.block);
  const csv = () =>
    [
      ["vault", "name", "kind", "steward", "steward_role", "amount", "asset", "block"].join(","),
      ...read.rows.map((r) =>
        [
          r.address,
          csvCell(r.name),
          csvCell(r.kind),
          r.steward?.address ?? "",
          r.steward?.role ?? "",
          r.amount ? assetText(r.amount, a.decimals).replace(/,/g, "") : "",
          a.symbol,
          String(read.block),
        ].join(","),
      ),
    ].join("\n");
  const markdown = () =>
    [
      `## Supplied by vaults: ${what}`,
      "",
      "| Vault | Kind | Steward | Amount |",
      "|---|---|---|---|",
      ...read.rows.map(
        (r) =>
          `| ${r.name} (${r.address}) | ${r.kind} | ${r.steward ? `${r.steward.address} (${r.steward.role})` : "none named"} | ${r.amount ? `${assetText(r.amount, a.decimals)} ${a.symbol}` : "not read"} |`,
      ),
      "",
      `Read at block ${n(read.block)}.`,
    ].join("\n");

  return (
    <ProvSection
      scope={SUPPLIED_BY_SCOPE}
      className="mb-6 mt-6"
      data-anatomy="R3.1"
      data-supplied-by={read.rows.length.toString()}
      data-skel-section="supplied-by-vaults"
    >
      <SectionHeading
        title="Supplied by vaults"
        stamp={
          read.block > 0 ? (
            <SectionReadStamp
              chainId={read.chainId}
              block={read.block}
              readBy={readBy}
              info={(at) =>
                readStampProv({
                  chainId: read.chainId,
                  block: read.block,
                  at,
                  readBy,
                  what: `Every amount in this section, and ${read.roster}`,
                  contracts: read.contracts,
                })
              }
            />
          ) : undefined
        }
        help={<LearnMore inline content={learnMore} ariaLabel="Supplied by vaults, learn more" />}
        menu={
          <SectionMenu
            scope={SUPPLIED_BY_SCOPE}
            title="Supplied by vaults"
            links={links}
            exports={
              read.rows.length > 0
                ? {
                    markdown: { build: markdown, copySubtitle: "The vaults as Markdown, for an LLM" },
                    csv: {
                      filename: `supplied-by-vaults-${a.symbol}-${read.block}.csv`,
                      build: csv,
                      subtitle: "One row per vault",
                    },
                  }
                : undefined
            }
          />
        }
      >
        <p className="mt-1 text-[13px] text-rb-500" data-prov-exempt>
          {read.failed
            ? "The vaults could not be read just now."
            : read.rows.length === 0
              ? `No vault on Rails's rosters supplies this ${noun}.`
              : line}
        </p>
      </SectionHeading>
      {read.rows.length > 0 && (
        <DataTable
          className="mt-3"
          tableClassName="text-[12px]"
          label={`Vaults supplying ${what}`}
          stacked
          rowHeight="two"
        >
          <DataTableHead>
            <DataTableHeader label="Vault" />
            <DataTableHeader label="Steward" />
            <DataTableHeader label="Amount" align="right" />
          </DataTableHead>
          <DataTableBody>
            {shown.map((r) => (
              <DataTableRow key={r.address} href={r.href} data-supplied-by-vault={r.address}>
                <DataTableCell rowHeader className="sm:w-full sm:max-w-0">
                  <span className="block text-foreground sm:truncate" title={r.name} data-cell="vault">
                    <DataTableRowLink href={r.href} data-link="supplied-by-vault">
                      {r.name}
                    </DataTableRowLink>
                  </span>
                  <span className="block text-[11px] text-rb-500 sm:truncate">{r.kind}</span>
                </DataTableCell>
                <DataTableCell label="Steward" className="whitespace-nowrap">
                  {r.steward ? (
                    <>
                      <span className="block font-mono text-foreground" data-steward={r.steward.address}>
                        <Prov info={stewardProv(read, r)}>{shortAddress(r.steward.address)}</Prov>
                      </span>
                      <span className="block text-[11px] text-rb-500">{r.steward.role}</span>
                    </>
                  ) : (
                    <span className="text-rb-500" title="The contract names no steward">
                      none named
                    </span>
                  )}
                </DataTableCell>
                <DataTableCell label="Amount" align="right" className="whitespace-nowrap tabular-nums text-foreground">
                  {r.amount ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span data-cell="supplied-amount" data-raw={r.amount.raw}>
                        <Prov info={amountProv(read, r)}>{assetText(r.amount, a.decimals)}</Prov>
                      </span>
                      <AssetUnit symbol={a.symbol} address={a.address} />
                    </span>
                  ) : (
                    <span className="text-rb-500">not read</span>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      {read.rows.length > FIRST_ROWS && (
        <button
          type="button"
          onClick={() => setAll((x) => !x)}
          className="mt-2 cursor-pointer text-[13px] text-blue-600 hover:underline dark:text-[var(--text-link)]"
          aria-expanded={all}
          data-supplied-by-more=""
        >
          {all ? `Show the first ${FIRST_ROWS}` : `Show all ${n(read.rows.length)} vaults`}
        </button>
      )}
    </ProvSection>
  );
}
