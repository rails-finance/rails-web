// Receipts for the holder card (rails-ops ui-jobs 407 step 4, 410): one
// vocabulary for the three families, named per chain. The census figures keep
// lib/aave-vaults/vault-provenance.ts, which already names the census per chain.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { VaultEarned } from "@/lib/vaults/earned";

const n = (v: number) => v.toLocaleString("en-US");

export interface HoldingCoords {
  chainId: number;
  /** The page's block: every live figure is a call at it. */
  blockNumber: number;
  vault: string;
  vaultName?: string;
  shareSymbol: string;
  shareDecimals: number;
  assetSymbol: string;
  assetDecimals: number;
  holder: string;
}

const chainWord = (c: HoldingCoords) => (c.chainId === 8453 ? "Base" : "Ethereum");
const lane = (c: HoldingCoords) => `live ${chainWord(c)} chain reads`;
const vaultContract = (c: HoldingCoords): Provenance["contract"] => ({
  name: c.vaultName ? `${c.vaultName} (ERC-4626)` : "the vault",
  address: c.vault,
});
const recompute = (call: string, c: HoldingCoords, block = c.blockNumber): Provenance["verify"] => ({
  kind: "recompute",
  text: `Re-run ${call} at block ${n(block)} against any ${chainWord(c)} archive node`,
});

/** `balanceOf(holder)`. */
export const holdingSharesProv = (c: HoldingCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("balanceOf(the holder)", c),
  summary: `Balance. The vault's \`balanceOf()\` for ${c.holder} at block ${n(c.blockNumber)}, in ${c.shareSymbol}, scaled by the share token's \`decimals()\` (${c.shareDecimals}).`,
  contract: vaultContract(c),
  via: `${lane(c)} · balanceOf(holder) @ the pinned block`,
});

/** `balanceOf(holder) ÷ totalSupply()`, both at the page's block. */
export const holdingFractionProv = (c: HoldingCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Share of the vault. This address's \`balanceOf()\` over the vault's \`totalSupply()\`, both read at block ${n(c.blockNumber)}. Two integers in one unit, so no price enters it.`,
  contract: vaultContract(c),
  via: `${lane(c)} · balanceOf(holder) ÷ totalSupply() @ the pinned block`,
  formula: "balanceOf(holder) ÷ totalSupply()",
});

/** `totalSupply()`, the fraction's denominator, on its subline. */
export const holdingTotalSupplyProv = (c: HoldingCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("totalSupply()", c),
  summary: `Shares issued. The vault's \`totalSupply()\` at block ${n(c.blockNumber)}, in ${c.shareSymbol}. The denominator of the share of the vault beside it.`,
  contract: vaultContract(c),
  via: `${lane(c)} · totalSupply() @ the pinned block`,
});

/** `convertToAssets(balanceOf(holder))`. */
export const holdingClaimProv = (c: HoldingCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("convertToAssets(the holder's shares)", c),
  summary: `Claim. \`convertToAssets()\` asked with this address's exact balance at block ${n(c.blockNumber)}, in ${c.assetSymbol}. The vault's conversion at one block; what a redemption returns is \`maxWithdraw()\`.`,
  contract: vaultContract(c),
  via: `${lane(c)} · convertToAssets(balanceOf(holder)) @ the pinned block`,
});

/** `maxWithdraw(holder)`: Redeemable now on every family. */
export const holdingMaxWithdrawProv = (c: HoldingCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("maxWithdraw(the holder)", c),
  summary: `Redeemable now. \`maxWithdraw()\` for this address at block ${n(c.blockNumber)}, in ${c.assetSymbol}. The vault's answer for what could leave at that block; it can be less than the claim, and the next block's answer can differ.`,
  contract: vaultContract(c),
  via: `${lane(c)} · maxWithdraw(holder) @ the pinned block`,
});

/** `maxRedeem(holder)`: the shares an Umbrella stake token lets leave. */
export const holdingMaxRedeemProv = (c: HoldingCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("maxRedeem(the holder)", c),
  summary: `Redeemable shares. \`maxRedeem()\` for this address at block ${n(c.blockNumber)}, in ${c.shareSymbol}. A stake token answers zero outside the holder's unstake window, so a zero beside a positive balance is a state.`,
  contract: vaultContract(c),
  via: `${lane(c)} · maxRedeem(holder) @ the pinned block`,
});

/** The page's block, as the Read at stat states it. */
export const holdingReadAtProv = (c: HoldingCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: { kind: "recompute", text: `Open block ${n(c.blockNumber)} on any ${chainWord(c)} explorer` },
  summary: `Read at. Block ${n(c.blockNumber)}, pinned once for this page. The balance, the share of the vault, the claim and Redeemable now are calls answered at it.`,
  contract: vaultContract(c),
  via: `${lane(c)} · eth_blockNumber, once per request`,
});

/** The census block, as the Census at stat states it. */
export const holdingCensusAtProv = (c: HoldingCoords, censusBlock: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: censusBlock },
  verify: {
    kind: "recompute",
    text: `Sweep this vault's Transfer logs to block ${n(censusBlock)} and check Σ balanceOf equals totalSupply() there`,
  },
  summary: `Census at. Block ${n(censusBlock)}, the block the daily ${chainWord(c)} vault census swept this vault's whole Transfer stream to, proven complete by Σ \`balanceOf\` equalling \`totalSupply()\`. The transfer count, first seen and the USD line are counted there.`,
  contract: vaultContract(c),
  via: `the daily ${chainWord(c)} vault census · eth_getLogs(Transfer) @ the census block`,
});

/** First seen from the replay: the block of this address's first Transfer in
 *  the vault, where no census exists (Yearn). */
export const holdingFirstSeenProv = (c: HoldingCoords, block: number): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block },
  verify: {
    kind: "recompute",
    text: `Sweep this vault's Transfer logs naming this address to block ${n(c.blockNumber)} and take the lowest block`,
  },
  summary: `First seen. Block ${n(block)}, the lowest block of any \`Transfer\` of this vault naming this address, out of this page's sweep to block ${n(c.blockNumber)}. The date is that block's \`timestamp\`.`,
  contract: vaultContract(c),
  via: `${lane(c)} · eth_getLogs(Transfer) to the pinned block`,
});

const KIND_WORD: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  "transfer-in": "Received",
  "transfer-out": "Sent",
};

/** The legs of Earned, each with its kind (decision 0048 point 1). */
export function holdingEarnedProv(c: HoldingCoords, e: Extract<VaultEarned, { status: "ok" }>): Provenance {
  const units = (raw: string) => {
    const neg = raw.startsWith("-");
    const digits = (neg ? raw.slice(1) : raw).padStart(c.assetDecimals + 1, "0");
    const whole = digits.slice(0, digits.length - c.assetDecimals);
    const frac = digits.slice(digits.length - c.assetDecimals).replace(/0+$/, "");
    return `${neg ? "−" : ""}${BigInt(whole).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
  };
  const legs: ProvInput[] = e.legs.map((l) => ({
    label: `${KIND_WORD[l.kind] ?? l.kind} · block ${n(l.block)}`,
    value: `${l.dir === "in" ? "+" : "−"}${units(l.raw)} ${c.assetSymbol}`,
    kind: l.basis === "stated" ? "chain" : "chain-derived",
    pclass: l.basis === "stated" ? "emitted" : "state",
    note:
      l.basis === "stated"
        ? "stated: the assets word of the ERC-4626 event"
        : `read at block ${n(l.block)}: the shares × convertToAssets(1 share) there, valued at ${l.dir === "in" ? "receipt" : "transfer"}`,
  }));
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: {
      kind: "recompute",
      text: `Sum the legs below and add convertToAssets(balanceOf) at block ${n(c.blockNumber)}`,
    },
    summary: `Earned. The claim at block ${n(c.blockNumber)} (${units(e.claimRaw)} ${c.assetSymbol}) plus every asset amount that left (${units(e.outRaw)}) minus every amount that came in (${units(e.inRaw)}), in ${c.assetSymbol}. Rendered because the replay of this address's transfers equals its \`balanceOf\` to the wei and every read leg's share price was read at that leg's block.`,
    contract: vaultContract(c),
    via: `${lane(c)} · the Lifetime flows replay + convertToAssets(balanceOf(holder)) @ the pinned block`,
    formula: "claim now + Σ out − Σ in",
    inputs: [
      ...legs,
      ...(e.legsOmitted > 0
        ? [{ label: `${n(e.legsOmitted)} more legs`, kind: "chain-derived" as const, note: "in the sums above" }]
        : []),
    ],
  };
}
