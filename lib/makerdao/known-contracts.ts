// Contracts the MakerDAO vault page can name when they appear in a vault's
// transactions: who created a vault, which tool ran a transaction, where a
// flash loan came from. Each entry states where its identity was checked. An
// address not listed here is described by what a chain read shows it to be
// (a wallet, a DSProxy and its owner, an Instadapp account) and never named.

export interface MakerKnownContract {
  /** How a sentence names it. */
  name: string;
  /** A shorter form for a header chip. */
  short: string;
  role: "maker" | "tool" | "flash-loan" | "registry";
  /** Where the identity was checked. */
  source: string;
}

export const MAKER_KNOWN_CONTRACTS: Record<string, MakerKnownContract> = {
  // ScdMcdMigration. tub() = the Sai Tub, cdpManager() = the CDP manager.
  "0xc73e0383f3aff3215e6f04b0331d58cecf0ab849": {
    name: "Maker's Sai-to-Dai migration contract",
    short: "Maker migration",
    role: "maker",
    source: "Maker changelog, release 1.0.0: MIGRATION",
  },
  // The Single-Collateral Dai CDP registry the migration moved CDPs out of.
  "0x448a5065aebb8e423f0896e6c5d525c040f59af3": {
    name: "the Single-Collateral Dai Tub",
    short: "Sai Tub",
    role: "maker",
    source: "ScdMcdMigration.tub() on chain",
  },
  "0x5c55b921f590a89c1ebe84df170e655a82b62126": {
    name: "DeFi Saver",
    short: "DeFi Saver",
    role: "tool",
    source: "DeFi Saver's logger (defisaver-sdk access lists)",
  },
  "0x2971adfa57b20e5a416ae5a708a8655a9c74f723": {
    name: "Instadapp",
    short: "Instadapp",
    role: "registry",
    source: "Instadapp dsa-connect, mainnet core addresses: index",
  },
  "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e": {
    name: "dYdX",
    short: "dYdX",
    role: "flash-loan",
    source: "dYdX solo, migrations/deployed.json: SoloMargin",
  },
};

export const MAKER_MIGRATION = "0xc73e0383f3aff3215e6f04b0331d58cecf0ab849";
export const SAI_TUB = "0x448a5065aebb8e423f0896e6c5d525c040f59af3";
export const INSTA_INDEX = "0x2971adfa57b20e5a416ae5a708a8655a9c74f723";
export const DYDX_SOLO = "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e";

export function knownContract(address: string | null | undefined): MakerKnownContract | undefined {
  return address ? MAKER_KNOWN_CONTRACTS[address.toLowerCase()] : undefined;
}
