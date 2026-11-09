"use client";

// The reserve page's Deficit section (anatomy M3.9): on any Aave V3 reserve
// with a write-off held. The lead says in one sentence what the outstanding
// deficit means, Aave's sources in its figure's receipt; then Written off · Covered ·
// Outstanding, each with its receipt; then the write-offs, largest first, ten
// shown and the rest behind one row. Where the route holds the covers
// (Ethereum), Covered is Σ DeficitCovered, then the covers table, the
// record's check against the Pool's getter, and the step chart
// (aave-reserve-deficit-covers.tsx). Elsewhere Covered is derived, written off
// less outstanding (deficitCoveredProv states the rule and cites it), and a
// line says the cover events are not indexed. A write-off from a liquidation
// Aave governance carried out (GOVERNANCE_LIQUIDATIONS) gets one line naming
// the proposal, its payloads and sources in the receipt.

import { useState, type ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { AssetUnit } from "@/components/shared/asset-unit";
import { Account } from "@/components/shared/product/position-entry";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import type { ReserveDeficit, WriteOff, DeficitToken } from "@/lib/api/fetch-aave-reserve-reads";
import { CoversTable, DeficitStepChart } from "@/components/shared/aave-reserve-deficit-covers";
import {
  coveredSumProv,
  deficitCoveredProv,
  deficitIdentityProv,
  GOVERNANCE_LIQUIDATIONS,
  governanceLiquidationProv,
  liquidationLegProv,
  writeOffProv,
  writtenOffSumProv,
  type TxExplorer,
} from "@/lib/shared/aave-reserve-reads-provenance";
import { deficitFigureProv } from "@/lib/aave-family/deficit-sources";
import { formatCompact } from "@/lib/shared/format-compact";
import { shiftDecimal } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { fmtUsd } from "@/lib/aave-v4/format";

const NOTE = "text-[13px] text-rb-500";
const TOP = 10;

/** A raw amount in whole tokens. */
const tokensOf = (raw: string, decimals: number | null): number | null =>
  decimals == null ? null : Number(shiftDecimal(raw, decimals));

/** A token amount in words: grouped whole tokens from 100, two places from 1, compact below. */
export function tokenWords(n: number): string {
  const a = Math.abs(n);
  if (a >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatCompact(n);
}

/** An amount with its token's mark, its exact figure in a title, and its receipt. */
function Amount({ raw, token, info }: { raw: string; token: DeficitToken; info: Provenance | null }) {
  const n = tokensOf(raw, token.decimals);
  const sym = token.symbol ?? `${token.address.slice(0, 6)}…`;
  const text =
    n == null ? (
      <span title={`${raw} in the token's smallest unit`}>{raw}</span>
    ) : (
      <span title={`${shiftDecimal(raw, token.decimals ?? 0)} ${sym}`}>{formatCompact(n)}</span>
    );
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap tabular-nums">
      {info ? <Prov info={info}>{text}</Prov> : text}
      <AssetUnit symbol={sym} address={token.address} named={token.symbol != null} />
    </span>
  );
}

function Figure({ label, children, hook }: { label: string; children: ReactNode; hook: string }) {
  return (
    <div data-deficit-figure={hook}>
      <dt className="text-[12px] text-rb-500">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

export interface DeficitHead {
  symbol: string;
  address: string;
  priceUsd: number | null;
  /** Pool.getReserveDeficit, whole tokens and raw, at `block`. */
  outstanding: number;
  outstandingRaw: string | null;
  block: number | null;
  outstandingProv: Provenance;
}

function WriteOffRow({
  w,
  d,
  head,
  ex,
  positionHref,
}: {
  w: WriteOff;
  d: ReserveDeficit;
  head: DeficitHead;
  ex: TxExplorer;
  positionHref: (wallet: string) => string;
}) {
  const href = positionHref(w.user);
  const own = writeOffProv(w, head.symbol, d, ex);
  const liq = w.liquidation;
  const asset: DeficitToken = { ...d.asset, symbol: d.asset.symbol ?? head.symbol };
  return (
    <DataTableRow href={href} data-write-off={w.user} data-write-off-tx={w.txHash}>
      <DataTableCell label="Date" className="whitespace-nowrap tabular-nums">
        <Prov info={own}>{formatDate(new Date(w.timestamp * 1000))}</Prov>
      </DataTableCell>
      <DataTableCell rowHeader className="max-w-0 sm:max-w-none">
        <Account wallet={w.user} href={href} />
      </DataTableCell>
      <DataTableCell label="Collateral seized" align="right">
        {liq ? (
          <Amount raw={liq.collateralSeized} token={liq.collateral} info={liquidationLegProv("seized", w, ex)} />
        ) : (
          <span className="text-rb-500">not paired</span>
        )}
      </DataTableCell>
      <DataTableCell label="Repaid by the liquidator" align="right">
        {liq ? (
          <Amount raw={liq.debtRepaid} token={liq.debtAsset} info={liquidationLegProv("repaid", w, ex)} />
        ) : (
          <span className="text-rb-500">not paired</span>
        )}
      </DataTableCell>
      <DataTableCell label="Written off" align="right" data-write-off-raw={w.writtenOff.raw}>
        <Amount raw={w.writtenOff.raw} token={asset} info={own} />
      </DataTableCell>
    </DataTableRow>
  );
}

/** The section's body. `coversHeld`: the write-offs are whole, so covered can be derived. */
export function ReserveDeficitBody({
  d,
  head,
  ex,
  positionHref,
  heldFrom,
}: {
  d: ReserveDeficit;
  head: DeficitHead;
  ex: TxExplorer;
  positionHref: (wallet: string) => string;
  /** "25 Oct 2026" where the write-offs are held only from a date (Base). */
  heldFrom: string | null;
}) {
  const [open, setOpen] = useState(false);
  const sym = head.symbol;
  const asset: DeficitToken = { ...d.asset, symbol: d.asset.symbol ?? sym };
  const dec = d.asset.decimals;
  const writtenOff = tokensOf(d.totals.writtenOff, dec);
  // Covered = Σ written off − outstanding, in raw units where the head gave the raw.
  const coveredRaw =
    heldFrom == null && head.outstandingRaw != null
      ? (BigInt(d.totals.writtenOff) - BigInt(head.outstandingRaw)).toString()
      : null;
  const held = d.covers?.status === "held" ? d.covers : null;
  const covered = held
    ? tokensOf(held.totals.covered, dec)
    : coveredRaw != null && !coveredRaw.startsWith("-")
      ? tokensOf(coveredRaw, dec)
      : null;
  const identity = held ? (d.identity ?? null) : null;
  const whole = identity != null && head.outstandingRaw != null && identity.outstanding === head.outstandingRaw;
  const usd = head.priceUsd != null ? fmtUsd(head.outstanding * head.priceUsd).display : null;
  const shown = open ? d.rows : d.rows.slice(0, TOP);
  const rest = d.rows.slice(TOP);
  const restRaw = rest.reduce((s, w) => s + BigInt(w.writtenOff.raw), BigInt(0)).toString();
  const restTokens = tokensOf(restRaw, dec);
  // A write-off from a liquidation Aave governance carried out: one line naming the proposal.
  const govTx = [...new Set(d.rows.map((w) => w.txHash.toLowerCase()))].find((h) => GOVERNANCE_LIQUIDATIONS[h]);
  const govProv = govTx ? governanceLiquidationProv(sym, d, govTx, ex) : null;
  const govRows = govTx ? d.rows.filter((w) => w.txHash.toLowerCase() === govTx) : [];
  const coveredProv = deficitCoveredProv(sym, d, { raw: head.outstandingRaw, block: head.block }, coveredRaw);

  return (
    <div data-reserve-deficit-section="" data-deficit-count={d.totals.count}>
      <p className="max-w-3xl text-[14px] leading-relaxed text-foreground" data-deficit-lead="">
        {head.outstanding > 0 ? (
          <>
            Liquidations have left{" "}
            <Prov info={deficitFigureProv(head.outstandingProv)}>
              {tokenWords(head.outstanding)} {sym}
            </Prov>
            {usd && ` (${usd})`} of this reserve&apos;s loans with no borrower: suppliers are still owed it, and nobody
            owes it to the Pool.
          </>
        ) : (
          <>
            <Prov info={deficitFigureProv(head.outstandingProv)}>
              Every write-off on this reserve has been covered.
            </Prov>
          </>
        )}
      </p>

      <dl className="mt-4 grid max-w-xl grid-cols-3 gap-4">
        <Figure label="Written off" hook="written-off">
          <Prov info={writtenOffSumProv(sym, d, { raw: d.totals.writtenOff, count: d.totals.count, label: "all" })}>
            {writtenOff != null ? tokenWords(writtenOff) : d.totals.writtenOff}
          </Prov>{" "}
          <span className="text-[12px] font-normal text-rb-500">{sym}</span>
        </Figure>
        <Figure label="Covered" hook="covered">
          {covered != null ? (
            <>
              <Prov info={held ? coveredSumProv(sym, d, held) : coveredProv}>{tokenWords(covered)}</Prov>{" "}
              <span className="text-[12px] font-normal text-rb-500">{sym}</span>
            </>
          ) : (
            <span
              className="text-[13px] font-normal text-rb-500"
              title={
                heldFrom
                  ? `Covered needs every write-off; Rails holds this market's from ${heldFrom}.`
                  : "Covered needs the outstanding deficit in raw units."
              }
            >
              n/a
            </span>
          )}
        </Figure>
        <Figure label="Outstanding" hook="outstanding">
          <Prov info={head.outstandingProv}>{tokenWords(head.outstanding)}</Prov>{" "}
          <span className="text-[12px] font-normal text-rb-500">{sym}</span>
        </Figure>
      </dl>

      {heldFrom && (
        <p className={`${NOTE} mt-3`} data-deficit-held-from="">
          Write-offs from {heldFrom}.
        </p>
      )}

      <DataTable
        label={`${sym} write-offs`}
        stacked
        tableClassName="text-[13px]"
        className="mt-4"
        data-write-offs={d.totals.count}
      >
        <DataTableHead>
          <DataTableHeader label="Date" />
          <DataTableHeader label="Position" />
          <DataTableHeader label="Collateral seized" align="right" />
          <DataTableHeader label="Repaid by the liquidator" align="right" />
          <DataTableHeader label="Written off" align="right" />
        </DataTableHead>
        <DataTableBody>
          {shown.map((w) => (
            <WriteOffRow
              key={`${w.txHash}:${w.logIndex}`}
              w={w}
              d={d}
              head={head}
              ex={ex}
              positionHref={positionHref}
            />
          ))}
          {!open && rest.length > 0 && (
            <DataTableRow data-write-offs-more={rest.length}>
              <DataTableCell colSpan={5} wide>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="cursor-pointer text-blue-600 hover:underline dark:text-[var(--text-link)]"
                  aria-expanded={false}
                >
                  {rest.length.toLocaleString("en-US")} smaller write-off{rest.length === 1 ? "" : "s"}
                </button>
                ,{" "}
                <Prov info={writtenOffSumProv(sym, d, { raw: restRaw, count: rest.length, label: "smaller" })}>
                  {restTokens != null ? tokenWords(restTokens) : restRaw}
                </Prov>{" "}
                {sym}
              </DataTableCell>
            </DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
      {open && rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${NOTE} mt-1.5 cursor-pointer hover:underline`}
          aria-expanded
          data-write-offs-fewer=""
        >
          Show the {TOP} largest only
        </button>
      )}

      {govTx && govProv && govRows.length > 0 && (
        <p className={`${NOTE} mt-3`} data-deficit-governance={GOVERNANCE_LIQUIDATIONS[govTx].proposal}>
          <Prov info={govProv}>
            {govRows.length === 1 ? "The write-off" : "The write-offs"} of{" "}
            {formatDate(new Date(govRows[0].timestamp * 1000))}{" "}
            {govRows.length === 1 ? "came from a liquidation" : "came from liquidations"} Aave governance carried out in
            proposal {GOVERNANCE_LIQUIDATIONS[govTx].proposal}, against the attacker&apos;s positions after the April
            2026 rsETH incident.
          </Prov>
        </p>
      )}

      {held ? (
        <div className="mt-6" data-deficit-covers="held">
          <h3 className="text-[14px] font-semibold text-foreground">Covered</h3>
          {held.rows.length > 0 ? (
            <CoversTable d={d} c={held} symbol={sym} ex={ex} />
          ) : (
            <p className={`${NOTE} mt-1`} data-deficit-covers-none="">
              Nothing has been covered on this reserve.
            </p>
          )}
          {identity && (
            <p className={`${NOTE} mt-3`} data-deficit-identity={whole ? "whole" : "differs"}>
              {whole ? (
                <Prov info={deficitIdentityProv(sym, d, identity, { raw: head.outstandingRaw, block: head.block })}>
                  Rails holds every write-off and cover on this reserve: written off less covered equals the Pool&apos;s
                  deficit.
                </Prov>
              ) : (
                <>
                  Written off less covered is{" "}
                  <Prov info={deficitIdentityProv(sym, d, identity, { raw: head.outstandingRaw, block: head.block })}>
                    {tokenWords(tokensOf(identity.outstanding, dec) ?? 0)} {sym}
                  </Prov>{" "}
                  through block {identity.atBlock.toLocaleString("en-US")}; the Pool reports{" "}
                  {tokenWords(head.outstanding)} {sym}. A write-off or cover after that block is not in this record yet.
                </>
              )}
            </p>
          )}
          <h3 className="mt-6 text-[14px] font-semibold text-foreground">Outstanding over time</h3>
          <p className={`${NOTE} mb-2`}>Each write-off steps it up and each cover steps it down.</p>
          <DeficitStepChart d={d} c={held} symbol={sym} ex={ex} />
        </div>
      ) : covered == null ? (
        <p className={`${NOTE} mt-3`} data-deficit-covers="">
          Rails has not indexed Aave&apos;s deficit cover events yet, so who covered any of it is not listed.
        </p>
      ) : covered > 0 ? (
        <p className={`${NOTE} mt-3`} data-deficit-covers="">
          Rails has not indexed Aave&apos;s deficit cover events yet, so who covered the {tokenWords(covered)} {sym} is
          not listed.
        </p>
      ) : null}
    </div>
  );
}

/** The write-offs and, where held, the covers as one CSV in chain order (`kind`: write_off | cover), raw
 *  amounts with their decimals. A cover's paid_by is the Umbrella event beside it, its payer the address whose aTokens paid it. */
export function writeOffsCsv(d: ReserveDeficit): string {
  const head = [
    "kind",
    "timestamp",
    "block",
    "transaction",
    "log_index",
    "pool",
    "amount_raw",
    "amount_decimals",
    "user",
    "collateral",
    "collateral_seized_raw",
    "collateral_decimals",
    "debt_repaid_asset",
    "debt_repaid_raw",
    "debt_repaid_decimals",
    "liquidator",
    "liquidation_log_index",
    "caller",
    "paid_by",
    "umbrella_log_index",
    "payer",
    "tx_from",
  ];
  type Row = { block: number; order: number; cells: unknown[] };
  const writeOffs: Row[] = d.rows.map((w) => {
    const l = w.liquidation;
    return {
      block: w.block,
      order: w.logIndex,
      cells: [
        "write_off",
        w.timestamp,
        w.block,
        w.txHash,
        w.logIndex,
        w.pool,
        w.writtenOff.raw,
        w.writtenOff.decimals,
        w.user,
        l?.collateral.address,
        l?.collateralSeized,
        l?.collateral.decimals,
        l?.debtAsset.address,
        l?.debtRepaid,
        l?.debtAsset.decimals,
        l?.liquidator,
        l?.logIndex,
        null,
        null,
        null,
        null,
        l?.txFrom,
      ],
    };
  });
  const covers: Row[] =
    d.covers?.status === "held"
      ? d.covers.rows.map((r) => ({
          block: r.block,
          order: 1e6 + r.logIndex,
          cells: [
            "cover",
            r.timestamp,
            r.block,
            r.txHash,
            r.logIndex,
            d.pool,
            r.amount.raw,
            r.amount.decimals,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            r.caller,
            r.umbrella?.event,
            r.umbrella?.logIndex,
            r.paidBy,
            r.txFrom,
          ],
        }))
      : [];
  const rows = [...writeOffs, ...covers].sort((a, b) => a.block - b.block || a.order - b.order).map((r) => r.cells);
  return [head, ...rows].map((r) => r.map((v) => (v == null ? "" : String(v))).join(",")).join("\n");
}
