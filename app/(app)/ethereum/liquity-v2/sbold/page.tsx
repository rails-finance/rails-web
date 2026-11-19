// THE sBOLD VAULT'S PAGE — /ethereum/liquity-v2/sbold (rails-ops ui-jobs 749).
// ----------------------------------------------------------------------------
// The Yearn vault page's shell (app/(app)/ethereum/yearn/vaults/[vault]) for
// one ERC-4626 vault on BOLD, drawn by components/vaults/sbold-vault-page.tsx
// from one block's read (lib/sources/chain/sbold-vault.ts) and the daily
// lines (lib/sources/chain/sbold-daily.ts). Chain facts only.

import type { Metadata } from "next";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { RailHeader } from "@/components/shared/rail-header";
import { SboldVaultPage } from "@/components/vaults/sbold-vault-page";
import { FocusSourceGate } from "@/components/shared/aim-gate";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { loadSboldVault } from "@/lib/sources/chain/sbold-vault";
import { loadSboldSeries } from "@/lib/sources/chain/sbold-daily";
import { loadSboldPausedLog } from "@/lib/sources/chain/sbold-paused";
import { SBOLD_ASSET, SBOLD_PAGE_PATH } from "@/lib/liquity-v2/sbold";

// Every figure is a getter's answer at the head.
export const dynamic = "force-dynamic";

export const metadata: Metadata = listingMetadata({
  title: "sBOLD · Liquity V2",
  description:
    "The sBOLD vault's total assets, shares issued, share price and its deposits in Liquity V2's three Stability Pools, read from the contracts at one block.",
  canonicalPath: SBOLD_PAGE_PATH,
});

export default async function SboldVaultRoute() {
  const data = await loadSboldVault();
  // The latest Paused log is read only where paused() answers true (ui-jobs 765).
  const [series, pausedLog] = data.chainStale
    ? [null, null]
    : await Promise.all([
        loadSboldSeries(data),
        data.vault.paused === true ? loadSboldPausedLog(data.blockNumber) : Promise.resolve(null),
      ]);
  return (
    <FocusSourceGate source={{ asset: SBOLD_ASSET }} chain={1} what="This vault">
      <div className="min-h-screen">
        <div className="py-8">
          <header className="mb-5" data-skel-section="page-header">
            <RailHeader session="liquity-v2" venue="subPage" />
          </header>

          {data.chainStale ? (
            <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for it.
            </p>
          ) : (
            <SboldVaultPage data={data} series={series} pausedLog={pausedLog} />
          )}

          {/* The inspector, armed from the profile menu's switch. */}
          <ProvInspectorLayer />
        </div>
      </div>
    </FocusSourceGate>
  );
}
