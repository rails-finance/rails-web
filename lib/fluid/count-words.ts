// The words for Fluid's position counts (rails-ops ui-jobs 633; register entry
// 2 in reference/official-docs/fluid.md). Two counts, two sources:
//   • open — positions holding collateral or debt, from Rails's index (the
//     positions listing's Status: Open, one rule);
//   • opened — the VaultResolver's `vaultState.totalPositions`, every position
//     NFT a vault has minted, open or closed.
// Imports nothing, so scripts/test/fluid-count-words.test.mjs reads it as is.

export const COUNT_WORDS = {
  /** The vaults head's figure: the open count. */
  openLabel: "Open positions",
  openTip: "Positions that hold collateral or debt now, across every vault",
  /** Where Rails's index gave no answer. */
  openMissing: "Rails's index gave no answer at this read",
  /** The per-vault figure, in the vaults table and on a vault's page. */
  openedLabel: "Opened",
  openedTip: "Every position the vault has minted, open or closed",
} as const;

const count = (n: number) => n.toLocaleString("en-US");

/** The line under the vaults head's open count. */
export const openedInAll = (n: number) => `${count(n)} opened in all`;

/** "13 Nov 2026 01:24 UTC", from an ISO time, the same on server and browser. */
export function utcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
