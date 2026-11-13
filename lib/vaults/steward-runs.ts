// The steward's runs in MetaMorpho vaults (V14; rails-ops ui-jobs 554, piece
// C): since when it has run each vault it runs now, and the vaults it ran
// before, from rails-server's /api/metamorpho/:chain/roles/:address on
// Ethereum and Base (lib/api/fetch-metamorpho-changes.ts). A run goes from the
// SetCurator or OwnershipTransferred that gave the address the role to the one
// that passed it on. "Ran before": every run in the vault has ended, and the
// directory does not list the address as the vault's steward now.
//
// Pure, no `@/` import (scripts/test/vault-config-changes.test.mjs loads it).

import type { MetaMorphoCoverage, MetaMorphoRoleRun, MetaMorphoRoleVault } from "./config-changes";

export type StewardRunRole = "curator" | "owner";

export interface StewardRunsChain {
  chainId: number;
  coverage: MetaMorphoCoverage;
  vaults: MetaMorphoRoleVault[];
}

/** The open run of a vault run now: its start. */
export interface StewardSince {
  chainId: number;
  vault: string;
  name: string | null;
  run: MetaMorphoRoleRun;
  coverage: MetaMorphoCoverage;
}

/** A vault whose runs have all ended. */
export interface StewardBefore {
  chainId: number;
  vault: string;
  name: string | null;
  symbol: string | null;
  /** Every run, oldest first; all ended. */
  runs: MetaMorphoRoleRun[];
  coverage: MetaMorphoCoverage;
}

export interface StewardRuns {
  role: StewardRunRole;
  chains: StewardRunsChain[];
  /** `<chainId>:<address>` → the open run. */
  since: Record<string, StewardSince>;
  /** Ended runs, the latest end first. */
  before: StewardBefore[];
}

const key = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

const lastEnd = (b: StewardBefore) => b.runs.reduce((m, r) => Math.max(m, r.untilBlock ?? 0), 0);

/** Since-dates and ran-before vaults from each chain's answer. `current` holds the
 *  directory's vaults this steward runs now, as `<chainId>:<address>`. */
export function stewardRuns(
  role: StewardRunRole,
  chains: StewardRunsChain[],
  current: ReadonlySet<string>,
): StewardRuns {
  const since: Record<string, StewardSince> = {};
  const before: StewardBefore[] = [];
  for (const ch of chains) {
    for (const v of ch.vaults) {
      const k = key(ch.chainId, v.vault);
      const runs = [...v.runs].sort((a, b) => a.fromBlock - b.fromBlock);
      const open = runs.find((r) => r.untilBlock == null);
      if (open) {
        since[k] = {
          chainId: ch.chainId,
          vault: v.vault.toLowerCase(),
          name: v.name,
          run: open,
          coverage: ch.coverage,
        };
        continue;
      }
      if (current.has(k) || runs.length === 0) continue;
      before.push({
        chainId: ch.chainId,
        vault: v.vault.toLowerCase(),
        name: v.name,
        symbol: v.symbol,
        runs,
        coverage: ch.coverage,
      });
    }
  }
  before.sort((a, b) => lastEnd(b) - lastEnd(a) || a.vault.localeCompare(b.vault, "en-US"));
  return { role, chains, since, before };
}

/** The span a ran-before vault's runs cover: the first start and the last end. */
export function spanOf(b: StewardBefore): { from: MetaMorphoRoleRun; until: MetaMorphoRoleRun } {
  const from = b.runs[0];
  const until = b.runs.reduce((m, r) => ((r.untilBlock ?? 0) > (m.untilBlock ?? 0) ? r : m), b.runs[0]);
  return { from, until };
}
