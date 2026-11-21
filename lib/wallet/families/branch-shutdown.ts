// The branch shutdowns a Liquity-family wallet head read takes (rails-ops
// TO-DO-ui-jobs 802; SERVER-ONLY): per branch, the catalog's record
// (lib/shared/liquity-family-shutdown.ts) with the live shutdownTime() read
// (lib/sources/chain/liquity-fork-shutdown.ts, one multicall per deployment,
// cached as its header says). A read that does not answer leaves the record
// alone; a branch with neither reads live.

import { readForkShutdown } from "@/lib/sources/chain/liquity-fork-shutdown";
import type { LiquityForkBranchConfig, LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { branchShutdownState, type BranchShutdownLive, type BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import { recordedShutdown } from "@/lib/shared/liquity-family-shutdown";

/** Each collateral type's branch state, null where it reads live. */
export async function walletBranchShutdowns(
  cfg: LiquityForkConfig,
  resolve: (collateralType: string) => LiquityForkBranchConfig | undefined,
  collateralTypes: string[],
): Promise<Map<string, BranchShutdownState | null>> {
  let live: Record<string, BranchShutdownLive> = {};
  try {
    live = await readForkShutdown(cfg);
  } catch {
    // Not known: the record stands alone.
  }
  const out = new Map<string, BranchShutdownState | null>();
  for (const c of new Set(collateralTypes)) {
    const key = resolve(c)?.key;
    out.set(c, branchShutdownState(recordedShutdown(cfg.protocol, c), key ? live[key] : null));
  }
  return out;
}
