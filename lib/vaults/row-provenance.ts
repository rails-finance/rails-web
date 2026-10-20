// The receipts the vault row (V1) draws for every family: Yield (decision
// 0047) and Holders (the position census). The row's other figures keep
// their family's own receipts (lib/morpho-base/vault-provenance.ts,
// lib/aave-vaults/vault-provenance.ts, lib/yearn/vault-provenance.ts).

import type { Provenance } from "@/components/shared/provenance";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import { formatUnitsExact } from "@/lib/utils/format";

const n = (v: number) => v.toLocaleString("en-US");

type Measured = Extract<VaultYield, { yearly: number }>;

/** Yield: Rails's interpretation of two share-price reads from the daily store. */
export const vaultYieldProv = (v: VaultSummary, y: Measured): Provenance => {
  const at = (r: Measured["from"]) =>
    `${formatUnitsExact(r.raw, v.asset.decimals)} ${v.asset.symbol} at block ${n(r.block)}`;
  return {
    kind: "derived",
    pclass: "state",
    source: { block: y.to.block },
    summary: `Yield — Rails's figure: the share price's growth over the ${y.days} days to block ${n(y.to.block)}, annualised simply. One share was ${at(y.from)} and ${at(y.to)}, each the vault's \`convertToAssets\` stored once a day in the daily price store. It is net of the fees the vault takes inside the share; rewards paid outside the share are not in it, and it is no forecast.`,
    contract: { name: v.name ?? v.catalogName ?? "vault", address: v.address },
    via: "daily price store · convertToAssets(10 ** decimals) once per UTC day @ the day's last block",
    formula: `(p1 / p0 − 1) × 365 / ${y.days}`,
    inputs: [
      {
        label: `p0 · block ${n(y.from.block)}`,
        value: `${formatUnitsExact(y.from.raw, v.asset.decimals)} ${v.asset.symbol}`,
        kind: "chain",
        pclass: "state",
        note: "convertToAssets of one whole share, stored for that day",
      },
      {
        label: `p1 · block ${n(y.to.block)}`,
        value: `${formatUnitsExact(y.to.raw, v.asset.decimals)} ${v.asset.symbol}`,
        kind: "chain",
        pclass: "state",
        note: "the latest stored day",
      },
      { label: "days between", value: n(y.days), kind: "derived", note: "30, or more where a day is missing" },
    ],
  };
};

/** Holders: the census's count of every address that has held a share. */
export const vaultHoldersProv = (v: VaultSummary, c: NonNullable<VaultSummary["census"]>): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.atBlock },
  verify: {
    kind: "recompute",
    text: `Sweep this vault's Transfer stream from its creation to block ${n(c.atBlock)} and count the distinct addresses either side of each log`,
  },
  summary: `Holders — ${n(c.holders)} address${c.holders === 1 ? " has" : "es have"} held a share of this vault, ${n(c.live)} holding one at census block ${n(c.atBlock)}: every address either side of a \`Transfer\` it has emitted. A floor: an address is often a wrapper or a contract holding for others. ${c.sumMatches ? "Σ `balanceOf` over the set equalled `totalSupply()` at that block, so the set is whole." : "Σ `balanceOf` over the set did not equal `totalSupply()` at that block, so the set is not stated as whole."}`,
  contract: { name: v.name ?? v.catalogName ?? v.symbol ?? "vault", address: v.address },
  via: "vault census · eth_getLogs(Transfer) @ the census block",
});
