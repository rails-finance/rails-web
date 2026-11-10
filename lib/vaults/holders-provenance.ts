// The receipts of a vault page's Who holds it: each figure is the Rails
// census's, read at its block and kept (lib/vaults/holders-read.ts).

import type { Provenance } from "@/components/shared/provenance";
import { pctText, shortAddress } from "@/lib/shared/vault-amount-text";

const n = (v: number) => v.toLocaleString("en-US");
const ppmPct = (ppm: number) => pctText(ppm / 1_000_000);

/** The census the figures were read at, and the share token they speak of. */
export interface HoldersCoords {
  vault: string;
  vaultName: string;
  shareSymbol: string;
  censusBlock: number;
}

const base = (c: HoldersCoords) => ({
  pclass: "state" as const,
  source: { block: c.censusBlock },
  contract: { name: c.vaultName, address: c.vault },
});

/** One holder's share of the vault's shares. */
export const holderShareProv = (c: HoldersCoords, holder: string, ppm: number): Provenance => ({
  ...base(c),
  kind: "chain",
  summary: `Share of the vault's shares at the census — ${shortAddress(holder)} held ${ppmPct(ppm)} of ${c.shareSymbol}: its balanceOf() over the share token's totalSupply(), both read by the Rails census at block ${n(c.censusBlock)} and kept.`,
  via: "Rails census · balanceOf(holder) / totalSupply() @ the census block",
});

/** One holder's shares. */
export const holderBalanceProv = (c: HoldersCoords, holder: string, exact: string): Provenance => ({
  ...base(c),
  kind: "chain",
  summary: `Shares held at the census — ${shortAddress(holder)} held ${exact} ${c.shareSymbol}: its balanceOf() on the share token, read by the Rails census at block ${n(c.censusBlock)} and kept.`,
  via: "Rails census · balanceOf(holder) @ the census block",
});

/** The live holders at the census. */
export const holdersCountProv = (c: HoldersCoords, live: number): Provenance => ({
  ...base(c),
  kind: "chain-derived",
  summary: `Holders at the census — ${n(live)} addresses held a share of ${c.shareSymbol} at block ${n(c.censusBlock)}: the Rails census swept every Transfer of the vault to that block and read balanceOf() for each address it named.`,
  via: "Rails census · eth_getLogs(Transfer) + balanceOf(holder) > 0 @ the census block",
});

/** The holders the list does not name. */
export const otherHoldersCountProv = (c: HoldersCoords, live: number, rest: number, named: number): Provenance => ({
  ...holdersCountProv(c, live),
  summary: `Other holders at the census — ${n(rest)} addresses: the ${n(live)} holding a share of ${c.shareSymbol} at block ${n(c.censusBlock)}, less the ${n(named)} named above.`,
});

/** The share the list does not name. */
export const otherHoldersShareProv = (c: HoldersCoords, rest: number, restPpm: number, named: number): Provenance => ({
  ...base(c),
  kind: "chain-derived",
  summary: `The other holders' share at the census — ${n(rest)} addresses held ${ppmPct(restPpm)} of ${c.shareSymbol}: the whole supply less the ${n(named)} named above, from the census at block ${n(c.censusBlock)}, where every balance summed to totalSupply().`,
  via: "Rails census · 1 − Σ balanceOf(top holders) / totalSupply() @ the census block",
});
