// The receipts of a vault page's Configuration and addresses: each role and
// contract the vault names (on MetaMorpho `owner()`, `curator()`,
// `guardian()`, `feeRecipient()`, `asset()`, `MORPHO()`; on Aave and Yearn
// the calls their pages read) and `fee()` at the card's pinned block; the
// release and the creation block from the factory's creation log
// (`CreateMetaMorpho`, Yearn's `NewVault`); what the asset wraps from its
// `asset()`.

import { powerOfTen, type Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { stampServerRead, type ServerRead } from "@/lib/shared/server-head-read";

const n = (v: number) => v.toLocaleString("en-US");

/** Where the calls were read: the vault, the block, and rails-server's stamp. */
export interface ConfigCoords {
  chainId: ChainId;
  vault: string;
  vaultName: string;
  block: number;
  readBy?: ServerRead | null;
}

const vaultContract = (c: ConfigCoords) => ({ name: c.vaultName, address: c.vault });

/** One call on the vault at the pinned block, answering an address or a word. */
export function configCallProv(
  c: ConfigCoords,
  { label, call, answer, what }: { label: string; call: string; answer: string; what: string },
): Provenance {
  return stampServerRead(
    {
      kind: "chain",
      pclass: "state",
      source: { block: c.block },
      verify: {
        kind: "recompute",
        text: `To check: ask any ${chainMeta(c.chainId).name} archive node for the vault's ${call} at block ${n(c.block)}.`,
      },
      summary: `${label} — the vault's \`${call}\` at block ${n(c.block)}: ${answer}. ${what}`,
      contract: vaultContract(c),
      via: `chain · ${call} @ the pinned block`,
    },
    c.readBy,
  );
}

/** `fee()`: a fraction of 10^18, shown as a percentage. */
export function configFeeProv(c: ConfigCoords, raw: string, shown: string): Provenance {
  return stampServerRead(
    {
      kind: "chain",
      pclass: "state",
      source: { block: c.block },
      verify: {
        kind: "recompute",
        text: `To check: ask any ${chainMeta(c.chainId).name} archive node for the vault's fee() at block ${n(c.block)}.`,
      },
      summary: `Performance fee — the vault's \`fee()\` at block ${n(c.block)}: ${shown} of the interest it earns, paid to the fee recipient as new shares.`,
      contract: vaultContract(c),
      via: "chain · fee() @ the pinned block",
      scaling: {
        raw,
        from: "call",
        places: 16,
        why: `The vault states its fee as a fraction of ${powerOfTen(18)}, where ${powerOfTen(18)} stands for 100%`,
        unit: "%",
      },
    },
    c.readBy,
  );
}

/** What the factory's creation log states about the vault. */
export interface VaultCreation {
  chainId: ChainId;
  vault: string;
  vaultName: string;
  /** "MetaMorpho V1.1", "Yearn V3 3.0.4". */
  release: string;
  /** The factory's creation log: "CreateMetaMorpho", "NewVault". */
  log: string;
  /** The factory's address, from the catalogue; null where it holds none. */
  factory: string | null;
  /** The block of the creation log. */
  block: number;
  /** That block's time, seconds; null where it was not read. */
  at: number | null;
}

const factoryContract = (k: VaultCreation) =>
  k.factory ? { name: `${k.release} factory`, address: k.factory } : { name: `${k.release} factory` };

/** The release: which MetaMorpho factory created the vault. */
export function configReleaseProv(k: VaultCreation): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: k.block },
    verify: {
      kind: "etherscan",
      href: explorerUrl(k.chainId, "block", k.block),
      text: `Block ${n(k.block)} on ${chainMeta(k.chainId).explorerName}`,
    },
    summary: `Version — ${k.release}: the ${k.release} factory${k.factory ? ` ${k.factory}` : ""} emitted the \`${k.log}\` log naming ${k.vault} at block ${n(k.block)}, as Rails's roster of each factory's creation logs records it.`,
    contract: factoryContract(k),
    via: `${k.log} log on the factory · the Rails roster`,
  };
}

/** The creation block and its date. */
export function configCreatedProv(k: VaultCreation): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: k.block },
    verify: {
      kind: "etherscan",
      href: explorerUrl(k.chainId, "block", k.block),
      text: `Block ${n(k.block)} on ${chainMeta(k.chainId).explorerName}`,
    },
    summary: `Created — block ${n(k.block)}${k.at != null ? `, ${formatDate(new Date(k.at * 1000))}` : ""}: the block of the factory's \`${k.log}\` log naming the vault${k.at != null ? "; the date is that block's timestamp" : ""}.`,
    contract: factoryContract(k),
    via: `${k.log} log · eth_getBlockByNumber(creation block).timestamp`,
    inputs: [
      { label: "creation block", value: n(k.block), kind: "chain", pclass: "emitted" },
      ...(k.at != null
        ? [{ label: "block time", value: String(k.at), kind: "chain" as const, pclass: "state" as const }]
        : []),
    ],
  };
}

/** The vault's address: the contract the factory's log names. */
export function configVaultProv(k: VaultCreation): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: k.block },
    verify: {
      kind: "etherscan",
      href: explorerUrl(k.chainId, "address", k.vault),
      text: `The vault on ${chainMeta(k.chainId).explorerName}`,
    },
    summary: `Vault — ${k.vault}, ${k.vaultName}: the contract the ${k.release} factory's \`${k.log}\` log names at block ${n(k.block)}, and the address every figure on this page is read from.`,
    contract: factoryContract(k),
    via: `${k.log} log on the factory · the Rails roster`,
  };
}

/** What the asset wraps: the asset's `asset()`, read at head. */
export function configWrapsProv(
  chainId: ChainId,
  asset: { symbol: string; address: string },
  wraps: { symbol: string; address: string; decimals: number },
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: {
      kind: "etherscan",
      href: explorerUrl(chainId, "address", asset.address),
      text: `${asset.symbol} on ${chainMeta(chainId).explorerName}`,
    },
    summary: `What the asset wraps — ${asset.symbol}'s \`asset()\`: ${wraps.symbol} ${wraps.address}, whose \`decimals()\` is ${wraps.decimals}.`,
    contract: { name: asset.symbol, address: asset.address },
    via: "chain · asset(), then decimals() and symbol() on what it names @ head",
  };
}
