// The steward's runs for its record (V14.2, V14.3; rails-ops ui-jobs 554,
// piece C): rails-server's roles route on Ethereum and Base for a MetaMorpho
// steward (curator, or owner where no curator is set, the steward line's
// rule), worked by lib/vaults/steward-runs.ts against the vaults the directory
// says it runs now. A chain whose answer failed, or came back with no coverage
// (the index has not read it), is unread: its vaults get no start date and
// none of them counts as ran before. A Maple pool delegate has no such
// record: null.
//
// SERVER-ONLY: the reads use RAILS_API_URL and the bearer token.

import "server-only";
import { fetchMetaMorphoRoles } from "@/lib/api/fetch-metamorpho-changes";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import { vaultIndexHref, vaultIndexProtocol } from "@/lib/vaults/index-rosters";
import type { StewardRecordRead } from "@/lib/vaults/steward-record";
import { stewardRuns, type StewardRuns, type StewardRunsChain } from "@/lib/vaults/steward-runs";

export type StewardRunsRead =
  | {
      kind: "ok";
      runs: StewardRuns;
      /** `<chainId>:<address>` → the vault page, for ran-before vaults the directory still lists. */
      hrefs: Record<string, string>;
      /** The chains whose record did not answer; the other chain's is stated. */
      unread: number[];
    }
  | { kind: "unread" };

const CHAINS = [1, 8453] as const;

/** Null where the steward is no MetaMorpho curator or owner (a Maple pool delegate) or the record is unread. */
export async function loadStewardRuns(record: StewardRecordRead): Promise<StewardRunsRead | null> {
  if (!record) return null;
  const role = record.steward.role;
  if (role !== "curator" && role !== "owner") return null;
  const answers = await Promise.all(CHAINS.map((c) => fetchMetaMorphoRoles(c, record.steward.address, role)));
  const chains: StewardRunsChain[] = [];
  const unread: number[] = [];
  answers.forEach((a, i) => {
    if (a.kind !== "ok" || (a.data.coverage.index == null && a.data.coverage.sieve == null)) unread.push(CHAINS[i]);
    else chains.push({ chainId: a.data.chainId, coverage: a.data.coverage, vaults: a.data.vaults });
  });
  if (chains.length === 0) return { kind: "unread" };
  const current = new Set(
    record.vaults
      .filter((v) => vaultIndexProtocol(v) === "morpho")
      .map((v) => `${v.chainId}:${v.address.toLowerCase()}`),
  );
  const runs = stewardRuns(role, chains, current);
  const hrefs: Record<string, string> = {};
  if (runs.before.length) {
    try {
      const index = await loadVaultIndex();
      const listed = new Map(
        index.vaults
          .filter((v) => vaultIndexProtocol(v) === "morpho")
          .map((v) => [`${v.chainId}:${v.address.toLowerCase()}`, v]),
      );
      for (const b of runs.before) {
        const v = listed.get(`${b.chainId}:${b.vault}`);
        if (v) hrefs[`${b.chainId}:${b.vault}`] = vaultIndexHref(v);
      }
    } catch {
      // No links: the names still stand.
    }
  }
  return { kind: "ok", runs, hrefs, unread };
}
