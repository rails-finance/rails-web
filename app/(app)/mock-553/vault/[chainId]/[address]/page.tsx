// ui-jobs 553, door 1 mock: "I have a vault position: how is it doing?"
// The position first, the vault's plain health readout beside it. The
// position is an example deposit priced through the vault's real daily
// share price; the readout is live for any vault in the index, so each
// family shows which lines Rails can answer today.

import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCompact } from "@/lib/shared/format-compact";
import { vaultIndexHref } from "@/lib/vaults/index-rosters";
import { dayText, findVault, loadDaily, readout } from "../../../_signals";
import { CARD, LINK, MUTED, MockNote, ReadoutCard, SectionHead, Spark, VaultTitle } from "../../../_ui";

export const dynamic = "force-dynamic";
export const PROV_EXEMPT = "ui-jobs 553 mock: receipts are written out as text; the build carries them";

const STABLES = new Set(["USDC", "USDT", "DAI", "USDS", "GHO", "PYUSD", "USDe", "sUSDe", "EURC", "RLUSD", "FRAX"]);

export default async function MockVaultPosition({
  params,
  searchParams,
}: {
  params: Promise<{ chainId: string; address: string }>;
  searchParams: Promise<{ amount?: string }>;
}) {
  const [{ chainId, address }, sp] = await Promise.all([params, searchParams]);
  const v = await findVault(Number(chainId), address);
  if (!v) notFound();
  const daily = (await loadDaily([v])).get(`${v.chainId}:${v.address}`);
  const r = readout(v, daily);
  const sym = v.asset.symbol;

  // The example position: `amount` of the asset deposited 90 days ago (or on
  // the series' first day), priced through the stored share price.
  const amount = Number(sp.amount) > 0 ? Number(sp.amount) : STABLES.has(sym) ? 10_000 : 10;
  const price = daily?.price ?? [];
  const end = price.length ? price[price.length - 1].day : 0;
  const window = price.filter((p) => p.day >= end - 90);
  const start = window[0];
  const shares = start ? amount / start.value : 0;
  const worth = start ? shares * window[window.length - 1].value : null;
  const valueLine = window.map((p) => ({ day: p.day, value: shares * p.value }));
  const fmt = (x: number) =>
    x.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: STABLES.has(sym) || x >= 1000 ? 2 : 4,
    });

  return (
    <div className="py-8">
      <MockNote>
        The position is an example: {fmt(amount)} {sym} deposited {start ? `on ${dayText(start.day)}` : "90 days ago"},
        priced through the vault&apos;s stored share price. On the build it is the reader&apos;s holding (the holder
        finder, V4). The readout is live. Try another family from the{" "}
        <Link href="/mock-553" className={LINK}>
          mock index
        </Link>
        .
      </MockNote>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <VaultTitle v={v} />
        <Link href={vaultIndexHref(v)} className={`text-sm ${LINK}`}>
          The vault&apos;s full page
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section className={`${CARD} p-4`} data-door="position">
          <SectionHead title="Your position" sub="In the vault's asset. Rails prices nothing in dollars here." />
          {worth == null || !start ? (
            <p className={`text-sm ${MUTED}`}>No share-price series to price a position with.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className={`text-xs ${MUTED}`}>Deposited</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {fmt(amount)} {sym}
                  </dd>
                  <dd className={`text-xs ${MUTED}`}>on {dayText(start.day)}</dd>
                </div>
                <div>
                  <dt className={`text-xs ${MUTED}`}>Worth now</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {fmt(worth)} {sym}
                  </dd>
                  <dd className={`text-xs ${MUTED}`}>{dayText(end)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className={`text-xs ${MUTED}`}>Profit or loss</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {worth - amount >= 0 ? "+" : "−"}
                    {fmt(Math.abs(worth - amount))} {sym}{" "}
                    <span className={`text-sm font-normal ${MUTED}`}>
                      ({((worth / amount - 1) * 100).toFixed(2)}% in {end - start.day} days)
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <div className={`mb-1 text-xs ${MUTED}`}>Its worth, one read a day</div>
                <Spark reads={valueLine} />
                <div className={`flex justify-between text-xs ${MUTED}`}>
                  <span>{dayText(start.day)}</span>
                  <span>{dayText(end)}</span>
                </div>
              </div>
              <p className={`mt-4 text-xs ${MUTED}`}>
                History on the build: deposits and withdrawals from the holder&apos;s timeline (the flows panel), with
                the vault&apos;s size {v.totalAssets ? `(${formatCompact(v.totalAssets.value)} ${sym} now)` : ""} for
                scale.
              </p>
            </>
          )}
        </section>

        <ReadoutCard r={r} />
      </div>
    </div>
  );
}
