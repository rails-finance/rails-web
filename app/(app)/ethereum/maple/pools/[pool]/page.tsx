// ONE MAPLE POOL'S PAGE — /ethereum/maple/pools/<pool>, the pool's catalogue
// key ("syrupusdc"), its share symbol lowercased (rails-ops ui-jobs 549 step 4).
// ----------------------------------------------------------------------------
// The vault grammar (V4, V2, V3) drawn by components/vaults/maple-pool-page.tsx
// from one block's read of the pool (lib/sources/chain/maple-pool-state.ts).
// The pool's address is accepted and sent on to the key. `?holder=` is the
// finder's submit: a Maple lender's page is `/ethereum/maple/<address>`, which
// shows every pool the address holds, so the finder sends the reader there.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { FocusSourceGate } from "@/components/shared/aim-gate";
import { RailHeader } from "@/components/shared/rail-header";
import { MaplePoolPage } from "@/components/vaults/maple-pool-page";
import { Suspense } from "react";
import { VaultProtectsSection } from "@/components/vaults/vault-protects-section";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";
import { resolveMaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { maplePoolHref } from "@/lib/vaults/routes";
import { resolveYearnVaultHolder } from "@/lib/yearn/vault-holder";
import { loadStewardRecord } from "@/lib/vaults/steward-record";

// Every figure is a read at the head, and `?holder=` is per request.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ pool: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const firstParam = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const poolOf = (slug: string) => {
  const s = slug.toLowerCase();
  return MAPLE_POOLS.find((p) => p.key === s || p.pool === s) ?? null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = poolOf((await params).pool);
  if (!p) return { title: "Maple pool" };
  return {
    title: `${p.symbol} · Maple pool`,
    description: `What Maple's ${p.symbol} pool holds, how much of it is liquid now, the loans it funds and its withdrawal queue, read from the pool's contracts at one block.`,
    alternates: { canonical: maplePoolHref(p.key) },
  };
}

export default async function MaplePoolRoute({ params, searchParams }: Props) {
  const { pool } = await params;
  const p = poolOf(pool);
  if (!p) notFound();
  if (pool !== p.key) redirect(maplePoolHref(p.key));

  // The finder's submit (V4). `redirect()` throws, so it sits before the read.
  const typed = firstParam((await searchParams).holder)?.trim();
  const lookup = typed ? await resolveYearnVaultHolder(typed) : null;
  if (lookup?.address) redirect(`/ethereum/maple/${lookup.address}`);

  const [state, stewardRecord] = await Promise.all([resolveMaplePoolState(), loadStewardRecord(1, p.pool, null)]);
  const s = state.get(p.key);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <RailHeader session="maple" venue="subPage" />
        </header>

        {lookup?.error && (
          <p className="mb-3 text-[13px] text-rb-500" data-finder-error={lookup.error}>
            {lookup.error === "unresolved"
              ? `${lookup.typed} has no address on Ethereum.`
              : `${lookup.typed} is not an address or an ENS name.`}
          </p>
        )}

        {/* Focus (ui-jobs 557): the pool is held behind the gate when neither its
            share token nor its funds asset is in focus. */}
        <FocusSourceGate source={{ share: p.pool, asset: p.asset }} chain={1} what="This Maple pool">
          {s ? (
            <MaplePoolPage
              pool={p}
              state={s}
              readAt={new Date().toISOString()}
              stewardRecord={stewardRecord}
              protects={
                <Suspense fallback={null}>
                  <VaultProtectsSection
                    subject={{ chainId: 1, address: p.pool, kind: "maple-pool" }}
                    vaultName={p.symbol}
                  />
                </Suspense>
              }
            />
          ) : (
            <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500" data-maple-pool-unread="">
              This pool could not be read from chain just now, so no figure is stated for it.
            </p>
          )}
        </FocusSourceGate>

        {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
