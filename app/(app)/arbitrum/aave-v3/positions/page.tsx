// Aave V3 on Arbitrum — the wallets rails-server has recorded a position read
// for (GET /api/aave-v3-arbitrum/positions), newest visit first. Private: no
// roster sub-page, no nav entry, no sitemap row, noindex, and a 404 on the
// production deployment.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { formatAgeShort, formatDate } from "@/lib/date";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { shortAddr } from "@/lib/shared/format-event";
import { loadAaveV3ArbitrumPositions } from "@/lib/sources/api/aave-v3-arbitrum-positions";
import type { AaveV3ArbitrumPositionRow } from "@/lib/aave-v3-arbitrum/api-contract";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Positions read · Aave V3 on Arbitrum",
  robots: { index: false, follow: false },
};

/** Vercel names the production deployment; local dev and preview render. */
const isProductionDeployment = () => process.env.VERCEL_ENV === "production";

const TH = "py-2 pr-3 font-normal";
const TH_NUM = `${TH} text-right`;
const TD = "py-2 pr-3 whitespace-nowrap";
const TD_NUM = `${TD} text-right tabular-nums text-foreground`;

function usd(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return "< $0.01";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "19 Oct 2026 17:26 UTC". */
function stamp(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm} UTC`;
}

function HealthFactor({ row }: { row: AaveV3ArbitrumPositionRow }) {
  if (row.healthFactor == null || row.chainHasDebt === false) return <span className="text-rb-400">No debt</span>;
  return <>{row.healthFactor >= 100 ? ">100" : row.healthFactor.toFixed(2)}</>;
}

function History({ row }: { row: AaveV3ArbitrumPositionRow }) {
  const h = row.history;
  if (!h) return <span className="text-rb-400">—</span>;
  const detail =
    h.status === "confirmed" && h.confirmedThroughBlock != null
      ? ` through ${h.confirmedThroughBlock.toLocaleString("en-US")}`
      : h.status === "disputed"
        ? ` · ${h.droppedCount.toLocaleString("en-US")} dropped`
        : "";
  return (
    <span
      className={h.status === "disputed" ? "text-amber-600 dark:text-amber-400" : "text-rb-500"}
      title={h.error ?? undefined}
    >
      {h.status}
      {detail}
    </span>
  );
}

export default async function AaveV3ArbitrumPositionsPage() {
  if (isProductionDeployment()) notFound();
  const answer = await loadAaveV3ArbitrumPositions({ readerIp: await readerIpFromHeaders() });
  const now = new Date();
  const newestRead = answer?.rows.reduce<string | null>(
    (m, r) => (r.refreshedAt && (!m || r.refreshedAt > m) ? r.refreshedAt : m),
    null,
  );

  return (
    <div className="py-8">
      <header className="mb-8">
        <div className="mb-6">
          <RailHeader session="aave-v3-arbitrum" venue="subPage" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-foreground">Positions read</h1>
        <p className="text-sm text-rb-500">The wallets whose position page has been opened, newest first.</p>
      </header>

      {!answer ? (
        <p className="text-sm text-rb-500">The store did not answer; the list could not be read.</p>
      ) : answer.rows.length === 0 ? (
        <p className="text-sm text-rb-500">No position has been read yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-[12px]" data-arbitrum-positions={answer.total}>
              <thead>
                <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
                  <th className={TH}>Wallet</th>
                  <th className={TH_NUM}>Health factor</th>
                  <th className={TH_NUM}>Collateral</th>
                  <th className={TH_NUM}>Debt</th>
                  <th className={TH_NUM}>Supplies</th>
                  <th className={TH_NUM}>Borrows</th>
                  <th className={TH}>Last visited</th>
                  <th className={TH_NUM}>Visits</th>
                  <th className="py-2 font-normal">History</th>
                </tr>
              </thead>
              <tbody>
                {answer.rows.map((r) => (
                  <tr
                    key={r.wallet}
                    className="border-b border-rb-200/60 dark:border-rb-500/20"
                    data-wallet-row={r.wallet}
                  >
                    <td className={TD}>
                      <Link
                        href={`/arbitrum/aave-v3/${r.wallet}`}
                        className="font-mono text-foreground hover:text-blue-500"
                        prefetch={false}
                      >
                        {shortAddr(r.wallet)}
                      </Link>
                    </td>
                    <td className={TD_NUM}>
                      <HealthFactor row={r} />
                    </td>
                    <td className={TD_NUM}>{usd(r.totalCollateralUsd)}</td>
                    <td className={TD_NUM}>{usd(r.totalDebtUsd)}</td>
                    <td className={TD_NUM}>{r.supplyCount}</td>
                    <td className={TD_NUM}>{r.borrowCount}</td>
                    <td className={`${TD} text-rb-500`} title={r.lastVisitedAt ? stamp(r.lastVisitedAt) : undefined}>
                      {r.lastVisitedAt ? relative(r.lastVisitedAt, now) : "—"}
                    </td>
                    <td className={TD_NUM}>{r.visitCount.toLocaleString("en-US")}</td>
                    <td className="py-2 whitespace-nowrap">
                      <History row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-rb-500">
            {answer.rows.length < answer.total
              ? `${answer.rows.length.toLocaleString("en-US")} of ${answer.total.toLocaleString("en-US")} positions`
              : `${answer.total.toLocaleString("en-US")} ${answer.total === 1 ? "position" : "positions"}`}
            {newestRead ? ` · newest read ${stamp(newestRead)}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

function relative(iso: string, now: Date): string {
  const age = formatAgeShort(iso, now);
  return age === "now" ? "just now" : `${age} ago`;
}
