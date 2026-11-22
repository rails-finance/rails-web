// The branch shutdowns a Liquity-family wallet read takes (rails-ops
// TO-DO-ui-jobs 802; SERVER-ONLY): per branch, the catalog's record
// (lib/shared/liquity-family-shutdown.ts) with the live shutdownTime() read
// (lib/sources/chain/liquity-fork-shutdown.ts, one multicall per deployment,
// cached as its header says). A read that does not answer within its wait
// leaves the record alone; a branch with neither reads live.

import { forkShutdownCached, readForkShutdown } from "@/lib/sources/chain/liquity-fork-shutdown";
import type { LiquityForkBranchConfig, LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { branchShutdownState, type BranchShutdownLive, type BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import { recordedShutdown } from "@/lib/shared/liquity-family-shutdown";
import { LIQUITY_V2_BRANCHES, DEBT_SYMBOL as LIQUITY_V2_DEBT } from "@/lib/liquity/asset-catalog";
import { EBISU_BRANCHES, DEBT_SYMBOL as EBISU_DEBT, resolveBranch as ebisuBranch } from "@/lib/ebisu/asset-catalog";
import {
  ASYMMETRY_BRANCHES,
  DEBT_SYMBOL as ASYMMETRY_DEBT,
  resolveBranch as asymmetryBranch,
} from "@/lib/asymmetry/asset-catalog";
import {
  BASEDOLLAR_BRANCHES,
  DEBT_SYMBOL as BASEDOLLAR_DEBT,
  resolveBranch as basedollarBranch,
} from "@/lib/basedollar/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";

type Resolve = (collateralType: string) => LiquityForkBranchConfig | undefined;
const V2_BRANCHES = LIQUITY_V2_BRANCHES as Record<string, LiquityForkBranchConfig>;

/** Each Liquity-family deployment's shutdown read and branch lookup. */
export const SHUTDOWN_READS: Record<
  "liquity-v2" | "ebisu" | "asymmetry" | "basedollar",
  { cfg: LiquityForkConfig; resolve: Resolve }
> = {
  "liquity-v2": {
    cfg: { protocol: "liquity-v2", debtSymbol: LIQUITY_V2_DEBT, branches: V2_BRANCHES, chainId: MAINNET_CHAIN_ID },
    resolve: (c) => V2_BRANCHES[c.toLowerCase()],
  },
  ebisu: {
    cfg: { protocol: "ebisu", debtSymbol: EBISU_DEBT, branches: EBISU_BRANCHES, chainId: MAINNET_CHAIN_ID },
    resolve: ebisuBranch,
  },
  asymmetry: {
    cfg: { protocol: "asymmetry", debtSymbol: ASYMMETRY_DEBT, branches: ASYMMETRY_BRANCHES, chainId: MAINNET_CHAIN_ID },
    resolve: asymmetryBranch,
  },
  basedollar: {
    cfg: { protocol: "basedollar", debtSymbol: BASEDOLLAR_DEBT, branches: BASEDOLLAR_BRANCHES, chainId: BASE_CHAIN_ID },
    resolve: basedollarBranch,
  },
};

/** How long a wallet read waits for the live answer before the record stands alone. */
const WAIT_MS = 2_000;

export interface WalletBranchShutdowns {
  /** Each collateral type's branch state, null where it reads live. */
  states: Map<string, BranchShutdownState | null>;
  /** Chain reads made: 0 where every answer came from the cache, else 1. */
  reads: number;
}

export async function walletBranchShutdowns(
  protocol: keyof typeof SHUTDOWN_READS,
  collateralTypes: string[],
): Promise<WalletBranchShutdowns> {
  const { cfg, resolve } = SHUTDOWN_READS[protocol];
  const types = [...new Set(collateralTypes)];
  const cached = forkShutdownCached(cfg);
  let live: Record<string, BranchShutdownLive> = {};
  if (types.length > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      live = await Promise.race([
        readForkShutdown(cfg),
        new Promise<Record<string, BranchShutdownLive>>((resolveWait) => {
          timer = setTimeout(() => resolveWait({}), WAIT_MS);
        }),
      ]);
    } catch {
      // Not known: the record stands alone.
    } finally {
      clearTimeout(timer);
    }
  }
  const states = new Map<string, BranchShutdownState | null>();
  for (const c of types) {
    const key = resolve(c)?.key;
    states.set(c, branchShutdownState(recordedShutdown(cfg.protocol, c), key ? live[key] : null));
  }
  return { states, reads: types.length === 0 || cached ? 0 : 1 };
}

/** A deposit module's shaping with each open deposit's branch state set
 *  (`WalletPosition.shutdown`): the shaping runs whether or not a head read
 *  answers, so a deposit card reads "Shut down" from the same state as the
 *  Troves. `branchOf` names a position's collateral branch. */
export async function withShutdowns(
  protocol: keyof typeof SHUTDOWN_READS,
  positions: WalletPosition[],
  branchOf: (p: WalletPosition) => string,
): Promise<WalletPosition[]> {
  const open = positions.filter((p) => p.status === "open");
  if (open.length === 0) return positions;
  const { states } = await walletBranchShutdowns(protocol, open.map(branchOf));
  return positions.map((p) => (p.status === "open" ? { ...p, shutdown: states.get(branchOf(p)) ?? null } : p));
}
