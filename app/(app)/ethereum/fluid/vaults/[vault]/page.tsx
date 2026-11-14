// One Fluid vault (/ethereum/fluid/vaults/<id>, the factory's vault id),
// archetype A2 on the shared product shell (rails-ops ui-jobs 549 step 7;
// decision 0059). A vault is one borrow market, a pair, so the page carries
// what an R3 page would: the head, the rate curve, the parameters with the
// ladder, and the holders.
//
// Rendered on first request and kept ten minutes, never at build. The route
// 404s an id the factory has not minted.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FluidVaultPage } from "@/lib/fluid/product";
import { loadFluidVaultFromChain } from "@/lib/sources/chain/fluid-vaults";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;

export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ vault: string }> };

const idOf = (raw: string): number | null => (/^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null);

const load = cache(async (id: number) => {
  try {
    return { data: await loadFluidVaultFromChain(id), failed: false };
  } catch (e) {
    console.error("Fluid vault read failed:", e);
    return { data: null, failed: true };
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = idOf((await params).vault);
  const v = id ? (await load(id)).data?.vault : null;
  const pair = v ? `${v.supplySymbol ?? "DEX shares"} / ${v.borrowSymbol ?? "DEX shares"}` : "Fluid vault";
  return {
    title: id ? `${pair} · Fluid vault ${id}` : "Fluid vault",
    description: `One Fluid vault, ${pair}: its collateral and debt, rates, positions and the ladder that decides when a position is liquidated.`,
    ...(id ? { alternates: { canonical: `/ethereum/fluid/vaults/${id}` } } : {}),
  };
}

export default async function FluidVaultRoute({ params }: Params) {
  const id = idOf((await params).vault);
  if (!id) notFound();
  const { data, failed } = await load(id);
  if (!data && !failed) notFound();
  return (
    <>
      <FluidVaultPage data={data} vaultId={id} />
      <ProvInspectorLayer />
    </>
  );
}
