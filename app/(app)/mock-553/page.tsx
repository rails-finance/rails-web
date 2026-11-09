// ui-jobs 553, step 1: the mock's index. One example vault per family for
// door 1, the asset door, and the comparison sketch.

import Link from "next/link";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import { VAULT_FAMILIES, type VaultFamily } from "@/lib/vaults/families";
import { formatCompact } from "@/lib/shared/format-compact";
import { chainName } from "@/lib/vaults/index-rosters";
import type { VaultSummary } from "@/lib/vaults/summary";
import { mockHref, nameOf } from "./_signals";
import { CARD, LINK, MUTED, MockNote } from "./_ui";

export const dynamic = "force-dynamic";
export const PROV_EXEMPT = "ui-jobs 553 mock index";

export default async function MockIndex() {
  const { vaults } = await loadVaultIndex();
  const held = (v: VaultSummary) => (v.totalAssets?.value ?? 0) - (v.lostAssets?.value ?? 0);
  // The largest vault of each family and chain, USDC first where there is one.
  const pick = new Map<string, VaultSummary>();
  for (const v of [...vaults].sort(
    (a, b) => Number(b.asset.symbol === "USDC") - Number(a.asset.symbol === "USDC") || held(b) - held(a),
  )) {
    const k = `${v.family}:${v.chainId}`;
    if (!pick.has(k) && !v.illiquid) pick.set(k, v);
  }
  const edge = [...vaults].filter((v) => v.illiquid).sort((a, b) => held(b) - held(a))[0];
  const order = Object.keys(VAULT_FAMILIES) as VaultFamily[];
  const examples = [...pick.values()].sort(
    (a, b) => order.indexOf(a.family) - order.indexOf(b.family) || a.chainId - b.chainId,
  );

  return (
    <div className="py-8">
      <MockNote>
        Three doors for a newcomer. Live figures; the readout shows per family what Rails can answer today.
      </MockNote>
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Vaults for newcomers</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <section className={`${CARD} p-4`}>
          <h2 className="mb-1 font-semibold text-foreground">1. I have a vault position</h2>
          <p className={`mb-3 text-sm ${MUTED}`}>The position, and how the vault is doing. One vault per family:</p>
          <ul className="space-y-1 text-sm">
            {examples.map((v) => (
              <li key={`${v.chainId}:${v.address}`}>
                <Link href={mockHref(v)} className={LINK}>
                  {nameOf(v)}
                </Link>{" "}
                <span className={MUTED}>
                  {VAULT_FAMILIES[v.family].singular}, {chainName(v.chainId)}, {formatCompact(held(v))} {v.asset.symbol}
                </span>
              </li>
            ))}
          </ul>
          {edge && (
            <p className={`mt-3 text-sm ${MUTED}`}>
              An edge case:{" "}
              <Link href={mockHref(edge)} className={LINK}>
                {nameOf(edge)}
              </Link>
              , the largest illiquid vault.
            </p>
          )}
        </section>
        <section className={`${CARD} p-4`}>
          <h2 className="mb-1 font-semibold text-foreground">2. I have USDC</h2>
          <p className={`mb-3 text-sm ${MUTED}`}>Where could it go: cards, the index one click behind.</p>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/mock-553/asset/usdc" className={LINK}>
                USDC
              </Link>
            </li>
            <li>
              <Link href="/mock-553/asset/usdc?order=steady" className={LINK}>
                USDC, steadiest first
              </Link>
            </li>
            <li>
              <Link href="/mock-553/asset/weth" className={LINK}>
                WETH
              </Link>
            </li>
          </ul>
        </section>
        <section className={`${CARD} p-4`}>
          <h2 className="mb-1 font-semibold text-foreground">3. I&apos;m comparing vaults</h2>
          <p className={`mb-3 text-sm ${MUTED}`}>Side by side, ordered by a preference.</p>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/mock-553/compare" className={LINK}>
                Largest USDC vault of each family, steady
              </Link>
            </li>
            <li>
              <Link href="/mock-553/compare?prefer=yield" className={LINK}>
                The same, yield
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
