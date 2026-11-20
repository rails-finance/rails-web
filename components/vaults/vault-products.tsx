// The vault products table (rails-ops ui-jobs 773; anatomy E7): one row per
// vault family the index lists, stating how a deposit is redeemed, the
// steward roles, the timelock, the fees, the count of vaults at the roster's
// block and where a vault's withdrawable figure is stated. From lg a table,
// below lg a card per family, as /vaults/fronts draws its rows.
//
// The words are lib/vaults/products-words.ts. The one figure is each count,
// read from the vault index (cached five minutes, shared with /vaults) and
// stated in its roster's receipt with its read stamp.
//
// Links (Miles, 20 Nov 2026): the family's name, its count and each pointer
// to "each vault's page" open the family's roster (Maple's pools page,
// sBOLD's vault page), where the reader picks a vault; each row also links
// the family's vaults info page and the docs that page cites. No link goes to
// a protocol's app. Every href comes from the route helpers.

import Link from "next/link";
import type { ReactNode } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
} from "@/components/shared/data-table/data-table";
import { IndexNotice } from "@/components/shared/index-notice";
import { Prov } from "@/components/shared/provenance";
import { ProvSection } from "@/components/shared/section-menu";
import { RosterReadStamp } from "@/components/vaults/roster-read-stamp";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { VAULT_FAMILIES, type VaultFamily } from "@/lib/vaults/families";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import {
  chainName,
  VAULT_INDEX_LISTED,
  VAULT_INDEX_PROTOCOL_LABEL,
  vaultIndexInfoHref,
  vaultIndexProtocol,
  vaultIndexRosterHref,
  vaultIndexRosterKey,
  type VaultIndexProtocol,
} from "@/lib/vaults/index-rosters";
import {
  PRODUCT_DOCS,
  PRODUCT_FAMILY_WORDS,
  PRODUCT_LINKS,
  PRODUCTS_PAGE,
  vaultCountText,
  type ProductCell,
  type ProductLine,
  type ProductRole,
} from "@/lib/vaults/products-words";
import { rosterCountProv, rosterFamilyCountProv, type RosterRead } from "@/lib/vaults/roster-provenance";

const C = PRODUCTS_PAGE.columns;
const MUTED = "text-xs text-rb-500";

/** The families in the index's order; a family draws only where a roster of
 *  its protocol is listed (IPOR Fusion at its launch). */
const ORDER: readonly VaultFamily[] = [
  "metamorpho",
  "sgho",
  "stata",
  "umbrella-stake",
  "yearn-v3",
  "maple-pool",
  "sbold",
  "ipor-fusion",
];

/** The protocol a family's roster sits under. */
const PROTOCOL: Record<VaultFamily, VaultIndexProtocol> = {
  metamorpho: "morpho",
  sgho: "aave",
  stata: "aave",
  "umbrella-stake": "aave",
  "yearn-v3": "yearn",
  "maple-pool": "maple",
  sbold: "sbold",
  "ipor-fusion": "ipor-fusion",
};

/** A family's vaults on one chain, at its roster's read. */
interface ProductCount {
  chainId: number;
  protocol: VaultIndexProtocol;
  read: RosterRead;
  /** Null where the roster's read failed. */
  count: number | null;
  /** Where the roster carries several families (Aave's): its whole count. */
  rosterTotal: number | null;
  /** The roster (Maple's pools page, sBOLD's vault page) and its link's name. */
  href: string;
  rosterName: string;
  /** The family's vaults info page; null for sBOLD. */
  infoHref: string | null;
}

/** What a roster link opens. */
const NOUN: Partial<Record<VaultIndexProtocol, string>> = { maple: "pools page", sbold: "vault page" };

interface ProductRow {
  family: VaultFamily;
  counts: ProductCount[];
}

const isoSeconds = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

/** The rows, from the index read: a count per family and listed chain. */
async function readProducts(): Promise<{ rows: ProductRow[]; indexDown: boolean }> {
  const { rosters, vaults, indexDown } = await loadVaultIndex();
  const listed = VAULT_INDEX_LISTED();
  const byKey = new Map(rosters.map((r) => [vaultIndexRosterKey(r), r]));
  const rows = ORDER.flatMap((family): ProductRow[] => {
    const protocol = PROTOCOL[family];
    const counts = listed
      .filter((l) => l.protocol === protocol)
      .map((l): ProductCount => {
        const r = byKey.get(vaultIndexRosterKey(l));
        const read: RosterRead = {
          label: `${VAULT_FAMILIES[family].label} on ${chainName(l.chainId)}`,
          block: r?.blockNumber ?? 0,
          at: r?.readBy?.blockTime || isoSeconds(r?.readAt),
        };
        const counted = r != null && r.blockNumber > 0;
        const shared = ORDER.filter((f) => PROTOCOL[f] === protocol).length > 1;
        return {
          chainId: l.chainId,
          protocol,
          read,
          href: vaultIndexRosterHref(protocol, l.chainId),
          rosterName: PRODUCT_LINKS.roster(
            VAULT_FAMILIES[family].label,
            VAULT_INDEX_PROTOCOL_LABEL[protocol],
            chainName(l.chainId),
            NOUN[protocol] ?? "roster",
            shared,
          ),
          infoHref: vaultIndexInfoHref(protocol, l.chainId),
          rosterTotal: counted && shared ? r.count : null,
          count: counted
            ? vaults.filter((v) => v.family === family && v.chainId === l.chainId && vaultIndexProtocol(v) === protocol)
                .length
            : null,
        };
      });
    return counts.length > 0 ? [{ family, counts }] : [];
  });
  return { rows, indexDown };
}

/** "Open the roster", one per chain where the family has several, each named
 *  for its family and chain. */
function RosterLinks({ counts }: { counts: ProductCount[] }) {
  const named = counts.length > 1;
  return (
    <>
      {counts.map((c, i) => (
        <span key={c.chainId}>
          {i > 0 && " · "}
          <Link
            href={c.href}
            aria-label={PRODUCT_LINKS.open(c.rosterName)}
            className={INLINE_LINK}
            prefetch={false}
            data-product-link="pointer"
          >
            {named ? chainName(c.chainId) : PRODUCT_LINKS.open(NOUN[c.protocol] ?? "roster")}
          </Link>
        </span>
      ))}
    </>
  );
}

function Line({ line, counts }: { line: ProductLine; counts: ProductCount[] }) {
  if (typeof line === "string") return <span className={`mt-0.5 block ${MUTED}`}>{line}</span>;
  return (
    <span className={`mt-0.5 block ${MUTED}`} data-product-pointer="">
      {line.pointer} <RosterLinks counts={counts} />
    </span>
  );
}

const lineKey = (l: ProductLine) => (typeof l === "string" ? l : l.pointer);

function Cell({ cell, hook, counts }: { cell: ProductCell; hook: string; counts: ProductCount[] }) {
  return (
    <span className="block" data-product-cell={hook} data-product-read={cell.read ? "read" : "not-read"}>
      <span className={`block ${cell.read ? "font-medium text-foreground" : "text-rb-500"}`}>{cell.head}</span>
      {cell.lines.map((l) => (
        <Line key={lineKey(l)} line={l} counts={counts} />
      ))}
    </span>
  );
}

function Stewards({ stewards, counts }: { stewards: ProductRole[] | ProductCell; counts: ProductCount[] }) {
  if (!Array.isArray(stewards)) return <Cell cell={stewards} hook="stewards" counts={counts} />;
  return (
    <span className="flex flex-col gap-1.5" data-product-cell="stewards" data-product-read="read">
      {stewards.map((s) => (
        <span key={s.role} className="block" data-product-role={s.role}>
          <span className="block font-medium text-foreground">{s.role}</span>
          <span className={`mt-0.5 block ${MUTED}`}>{s.what}</span>
        </span>
      ))}
    </span>
  );
}

function Counts({ counts, familyLabel }: { counts: ProductCount[]; familyLabel: string }) {
  const named = counts.length > 1;
  return (
    <span className="flex flex-col gap-1.5" data-product-cell="vaults">
      {counts.map((c) => (
        <span
          key={c.chainId}
          className="block"
          data-product-count={c.count ?? ""}
          data-product-block={c.read.block}
          data-product-roster={vaultIndexRosterKey(c)}
        >
          {c.count == null ? (
            <span className="block text-rb-500">
              {named ? `${chainName(c.chainId)}: ` : ""}
              {PRODUCTS_PAGE.countNotRead}
            </span>
          ) : (
            <span className="block text-foreground">
              {named ? `${chainName(c.chainId)}: ` : ""}
              <Link
                href={c.href}
                aria-label={`${vaultCountText(c.count)}, ${c.rosterName}`}
                className={INLINE_LINK}
                prefetch={false}
                data-product-link="count"
              >
                <Prov
                  info={
                    c.rosterTotal != null
                      ? rosterFamilyCountProv(
                          c.read,
                          VAULT_INDEX_PROTOCOL_LABEL[c.protocol],
                          familyLabel,
                          c.count,
                          c.rosterTotal,
                        )
                      : rosterCountProv(c.read, c.count)
                  }
                >
                  {vaultCountText(c.count)}
                </Prov>
              </Link>
            </span>
          )}
          <span className="block text-[11px] text-rb-500">
            <RosterReadStamp reads={[c.read]} />
          </span>
        </span>
      ))}
    </span>
  );
}

/** The family's name, linking its roster (one link per chain where it has
 *  several); its kind; then About and Docs. */
function Family({ row, part = "all" }: { row: ProductRow; part?: "all" | "name" | "links" }) {
  const f = VAULT_FAMILIES[row.family];
  const docs = PRODUCT_DOCS[row.family];
  const one = row.counts.length === 1 ? row.counts[0] : null;
  const infos = row.counts.filter((c) => c.infoHref != null);
  const name = part !== "links";
  return (
    <>
      {name && (
        <span className="block font-semibold text-foreground">
          {one ? (
            <Link
              href={one.href}
              aria-label={one.rosterName}
              className={INLINE_LINK}
              prefetch={false}
              data-product-link="family"
            >
              {f.label}
            </Link>
          ) : (
            f.label
          )}
        </span>
      )}
      {name && !one && (
        <span className="block text-sm">
          {row.counts.map((c, i) => (
            <span key={c.chainId}>
              {i > 0 && " · "}
              <Link
                href={c.href}
                aria-label={c.rosterName}
                className={INLINE_LINK}
                prefetch={false}
                data-product-link="family"
              >
                {chainName(c.chainId)}
              </Link>
            </span>
          ))}
        </span>
      )}
      {/* The kind, where it says more than the family's name. */}
      {name && f.kind !== f.label && f.kind !== f.singular && <span className={`mt-0.5 block ${MUTED}`}>{f.kind}</span>}
      {part !== "name" && (infos.length > 0 || docs) && (
        <span className={`mt-1.5 block ${MUTED}`}>
          {infos.map((c, i) => (
            <span key={c.chainId}>
              {i > 0 && " · "}
              <Link
                href={c.infoHref!}
                aria-label={PRODUCT_LINKS.aboutName(f.label, chainName(c.chainId))}
                className={INLINE_LINK}
                prefetch={false}
                data-product-link="about"
              >
                {infos.length > 1 ? `${PRODUCT_LINKS.about} (${chainName(c.chainId)})` : PRODUCT_LINKS.about}
              </Link>
            </span>
          ))}
          {docs && (
            <>
              {infos.length > 0 && " · "}
              <a
                href={docs.href}
                target="_blank"
                rel="noopener"
                aria-label={docs.label}
                className="link-external"
                data-product-link="docs"
              >
                {PRODUCT_LINKS.docs}
              </a>
            </>
          )}
        </span>
      )}
    </>
  );
}

/** The six facts in drawing order, each with its column's label. */
function facts(row: ProductRow): [string, ReactNode][] {
  const w = PRODUCT_FAMILY_WORDS[row.family];
  return [
    [C.withdrawals, <Cell key="w" cell={w.withdrawals} hook="withdrawals" counts={row.counts} />],
    [C.stewards, <Stewards key="s" stewards={w.stewards} counts={row.counts} />],
    [C.timelock, <Cell key="t" cell={w.timelock} hook="timelock" counts={row.counts} />],
    [C.fees, <Cell key="f" cell={w.fees} hook="fees" counts={row.counts} />],
    [C.vaults, <Counts key="v" counts={row.counts} familyLabel={VAULT_FAMILIES[row.family].label} />],
    [C.withdrawable, <Cell key="l" cell={w.withdrawable} hook="withdrawable" counts={row.counts} />],
  ];
}

function ProductsTable({ rows }: { rows: ProductRow[] }) {
  return (
    <DataTable
      caption={PRODUCTS_PAGE.caption}
      className="hidden lg:block"
      tableClassName="table-fixed text-sm"
      data-product-layout="table"
    >
      <DataTableHead>
        <DataTableHeader label={C.family} className="w-[11%]" />
        <DataTableHeader label={C.withdrawals} className="w-[17%]" />
        <DataTableHeader label={C.stewards} className="w-[18%]" />
        <DataTableHeader label={C.timelock} className="w-[19%]" />
        <DataTableHeader label={C.fees} className="w-[13%]" />
        <DataTableHeader label={C.vaults} className="w-[10%]" />
        <DataTableHeader label={C.withdrawable} className="w-[12%]" />
      </DataTableHead>
      <DataTableBody>
        {rows.map((r) => (
          <tr key={r.family} className="align-top" data-anatomy="E7.1" data-product-row={r.family}>
            <DataTableCell rowHeader>
              <Family row={r} />
            </DataTableCell>
            {facts(r).map(([label, body]) => (
              <DataTableCell key={label}>{body}</DataTableCell>
            ))}
          </tr>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

/** Below lg: a card per family, every fact named. */
function ProductCards({ rows }: { rows: ProductRow[] }) {
  return (
    <ul className="flex flex-col gap-3 lg:hidden" data-product-layout="cards">
      {rows.map((r) => (
        <li
          key={r.family}
          className="rounded-xl border border-rb-300 px-4 py-3 dark:border-rb-700"
          data-anatomy="E7.1"
          data-product-row={r.family}
        >
          <h2 className="text-base">
            <Family row={r} part="name" />
          </h2>
          <Family row={r} part="links" />
          <dl className="mt-2">
            {facts(r).map(([label, body]) => (
              <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-1.5">
                <dt className={MUTED}>{label}</dt>
                <dd className="min-w-0 text-sm">{body}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export async function VaultProducts() {
  const { rows, indexDown } = await readProducts();
  return (
    <>
      {indexDown && (
        <IndexNotice
          chainFilled={rows.some((r) => r.counts.some((c) => c.count != null))}
          className="mb-4 text-sm text-rb-500"
        />
      )}
      {/* One receipts scope over the rows, so each count opens its receipt (decision 0062). */}
      <ProvSection scope="vault-products" as="div" data-vault-products="">
        <ProductsTable rows={rows} />
        <ProductCards rows={rows} />
      </ProvSection>
    </>
  );
}
