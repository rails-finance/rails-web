// The vault comparison's own receipts (rails-ops ui-jobs 779): the Fees line,
// read at the family loader's block (lib/vaults/compare-read.ts). The other
// figures carry the receipts their roster row and vault page give them
// (lib/vaults/row-receipts.ts, lib/vaults/row-provenance.ts,
// lib/vaults/health-provenance.ts).

import type { Provenance } from "@/components/shared/provenance";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (x: number) => `${(x * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

interface FeeVault {
  address: string;
  name: string;
}

/** MetaMorpho's `fee()`: a WAD share of the interest the vault earns. */
export const metaMorphoFeeProv = (v: FeeVault, block: number, raw: string, fee: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block },
  summary: `Fees — the vault's \`fee()\` answered ${raw} at block ${n(block)}, ${pct(fee)} of the interest it earns.`,
  contract: { name: v.name, address: v.address },
  via: `eth_call fee() @ block ${n(block)}`,
  inputs: [{ label: "fee() (WAD, 10^18 = 100%)", value: raw, kind: "chain" }],
});

/** A Yearn V3 vault's fees: its accountant's `getVaultConfig(vault)`, in basis points. */
export const yearnFeeProv = (
  v: FeeVault,
  accountant: string,
  block: number,
  performanceBps: number,
  managementBps: number,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block },
  summary: `Fees — the vault's accountant answered \`getVaultConfig\` at block ${n(block)}: a performance fee of ${n(performanceBps)} and a management fee of ${n(managementBps)} basis points.`,
  contract: { name: "the vault's accountant", address: accountant },
  via: `eth_call getVaultConfig(${v.address}) @ block ${n(block)}`,
  inputs: [
    { label: "performance fee", value: `${pct(performanceBps / 10_000)}`, kind: "chain" },
    { label: "management fee", value: `${pct(managementBps / 10_000)} a year`, kind: "chain" },
  ],
});

/** A Yearn V3 vault whose `accountant()` is the zero address. */
export const yearnNoAccountantProv = (v: FeeVault, block: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block },
  summary: `Fees — the vault's \`accountant()\` named no contract at block ${n(block)}, so nothing charges a fee.`,
  contract: { name: v.name, address: v.address },
  via: `eth_call accountant() @ block ${n(block)}`,
});

/** A static aToken or an Umbrella stake token: the contract has no fee. */
export const noFeeProv = (v: FeeVault, what: "stata" | "umbrella"): Provenance => ({
  kind: "derived",
  pclass: "state",
  summary:
    what === "stata"
      ? "Fees — the static aToken wrapper's contract charges no fee; Aave's reserve factor is taken before interest reaches the reserve's suppliers."
      : "Fees — the Umbrella stake token's contract charges no fee.",
  contract: { name: v.name, address: v.address },
  via: "the contract's code: no fee is set or taken",
});
