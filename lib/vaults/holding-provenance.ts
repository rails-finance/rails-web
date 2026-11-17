// Receipts for the holder card (rails-ops ui-jobs 407 step 4, 410): one
// vocabulary for the three families, named per chain. The census figures keep
// lib/aave-vaults/vault-provenance.ts, which already names the census per chain.

import { withServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { VaultEarned } from "@/lib/vaults/earned";
import { formatDate } from "@/lib/date";

const n = (v: number) => v.toLocaleString("en-US");

export interface HoldingCoords {
  /** rails-server's read of `blockNumber`, when it answered every read of the page. */
  readBy?: ServerRead | null;
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
  text: `To check: ask any ${chainWord(c)} archive node for ${call} at block ${n(block)}.`,
});

/** `balanceOf(holder) ÷ totalSupply()`, both at the page's block. */
const holdingFractionProv_ = (c: HoldingCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Share of the vault. The shares this address holds over all shares issued, both at block ${n(c.blockNumber)}.`,
  contract: vaultContract(c),
  via: `${lane(c)} · balanceOf(holder) ÷ totalSupply() @ the pinned block`,
  formula: "balanceOf(holder) ÷ totalSupply()",
});

/** `convertToAssets(balanceOf(holder))`. */
const holdingClaimProv_ = (c: HoldingCoords, label = "Claim"): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: c.blockNumber },
  verify: recompute("convertToAssets(the holder's shares)", c),
  summary: `Claim. What this address's shares convert to at block ${n(c.blockNumber)}, in ${c.assetSymbol}, as the vault answers. Redeemable now is the vault's separate answer.`,
  contract: vaultContract(c),
  via: `${lane(c)} · convertToAssets(balanceOf(holder)) @ the pinned block`,
});

/** First seen from the replay: the block of this address's first Transfer in
 *  the vault, on a holding page that reads no census row (Yearn). */
const holdingFirstSeenProv_ = (c: HoldingCoords, block: number): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  source: { block },
  verify: {
    kind: "recompute",
    text: `To check: ask any ${chainWord(c)} archive node for this vault's Transfer logs that name this address, up to block ${n(c.blockNumber)}, and take the lowest block.`,
  },
  summary: `First seen. Block ${n(block)}, the lowest block of any transfer of this vault that names this address, read up to block ${n(c.blockNumber)}. The date is that block's time.`,
  contract: vaultContract(c),
  via: `${lane(c)} · Transfer logs to the pinned block`,
});

const KIND_WORD: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  "transfer-in": "Received",
  "transfer-out": "Sent",
};

/** The legs of Earned, each with its kind (decision 0048 point 1). */
/** Raw asset units as an exact decimal, a true minus where negative. */
function unitsText(c: HoldingCoords, raw: string): string {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(c.assetDecimals + 1, "0");
  const whole = digits.slice(0, digits.length - c.assetDecimals);
  const frac = digits.slice(digits.length - c.assetDecimals).replace(/0+$/, "");
  return `${neg ? "−" : ""}${BigInt(whole).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

type EarnedOk = Extract<VaultEarned, { status: "ok" }>;

/** Each leg of Earned as a receipt input, with its kind and how it was valued. */
function earnedLegs(c: HoldingCoords, legs: EarnedOk["legs"]): ProvInput[] {
  const units = (raw: string) => unitsText(c, raw);
  return legs.map((l) => ({
    label: `${KIND_WORD[l.kind] ?? l.kind} · block ${n(l.block)}`,
    value: `${l.dir === "in" ? "+" : "−"}${units(l.raw)} ${c.assetSymbol}`,
    kind: l.basis === "stated" ? "chain" : "chain-derived",
    pclass: l.basis === "stated" ? "emitted" : "state",
    note:
      l.basis === "stated"
        ? "stated: the assets word of the ERC-4626 event"
        : `read at block ${n(l.block)}: the shares × convertToAssets(1 share) there, valued at ${l.dir === "in" ? "receipt" : "transfer"}`,
  }));
}

function holdingEarnedProv_(c: HoldingCoords, e: EarnedOk, label = "Earned"): Provenance {
  const units = (raw: string) => unitsText(c, raw);
  const legs = earnedLegs(c, e.legs);
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: {
      kind: "recompute",
      text: `To check: ask any ${chainWord(c)} archive node for the vault's convertToAssets(balanceOf(the holder)) at block ${n(c.blockNumber)}, add the legs below that left, and take away those that came in.`,
    },
    summary: `${label}. The claim at block ${n(c.blockNumber)} (${units(e.claimRaw)} ${c.assetSymbol}) plus every asset amount that left (${units(e.outRaw)}) minus every amount that came in (${units(e.inRaw)}), in ${c.assetSymbol}. Shown because the replay of this address's transfers equals the shares it holds to the wei, and every leg's share price was read at that leg's block.`,
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

/** One side of Earned: Put in (`in`) or Taken out (`out`), its legs listed. */
function holdingFlowSideProv_(c: HoldingCoords, e: EarnedOk, dir: "in" | "out"): Provenance {
  const side = e.legs.filter((l) => l.dir === dir);
  const total = dir === "in" ? e.inRaw : e.outRaw;
  const label = dir === "in" ? "Put in" : "Taken out";
  return {
    kind: "chain-derived",
    pclass: "emitted",
    source: { block: c.blockNumber },
    verify: {
      kind: "recompute",
      text: `To check: ask any ${chainWord(c)} archive node for this address's ${dir === "in" ? "Deposit logs and incoming Transfer logs" : "Withdraw logs and outgoing Transfer logs"} on the vault up to block ${n(c.blockNumber)}, and add them up, valuing each transfer at convertToAssets at its block.`,
    },
    summary: `${label}. ${unitsText(c, total)} ${c.assetSymbol}: every amount that ${dir === "in" ? "came into" : "left"} the vault ${dir === "in" ? "from" : "to"} this address to block ${n(c.blockNumber)}. A ${dir === "in" ? "deposit" : "withdrawal"} is the asset amount of its ERC-4626 event; shares ${dir === "in" ? "received" : "sent"} by transfer are valued at the share price read at that block.`,
    contract: vaultContract(c),
    via: `${lane(c)} · the Lifetime flows replay to the pinned block`,
    formula:
      dir === "in"
        ? "Σ deposits + Σ shares received × share price at receipt"
        : "Σ withdrawals + Σ shares sent × share price at transfer",
    inputs: [
      ...earnedLegs(c, side),
      ...(e.legsOmitted > 0
        ? [
            {
              label: "Longer life",
              kind: "chain-derived" as const,
              note: `${n(e.legsOmitted)} more legs of either side are in the sum`,
            },
          ]
        : []),
    ],
  };
}

/** Profit or loss over Put in, the percentage beside it. */
const holdingProfitPctProv_ = (c: HoldingCoords, e: EarnedOk): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: c.blockNumber },
  summary: `Profit or loss as a share of what was put in: ${unitsText(c, e.earnedRaw)} ÷ ${unitsText(c, e.inRaw)} ${c.assetSymbol}, both to block ${n(c.blockNumber)}. A sum over the holding's life, with no window and nothing annualised.`,
  contract: vaultContract(c),
  via: `${lane(c)} · the Lifetime flows replay + convertToAssets(balanceOf(holder)) @ the pinned block`,
  formula: "(claim now + Σ out − Σ in) ÷ Σ in",
});

const NO_SUM: Record<Exclude<VaultEarned["status"], "ok">, (block: number) => string> = {
  carried: (b) =>
    `The share price at block ${n(b)}, a transfer leg's block, did not answer, and a carried price would make the sum an estimate.`,
  unreplayed: (b) =>
    `The replay of this address's transfers did not equal the shares it holds at block ${n(b)} to the wei, so no leg sum is stated.`,
  unread: (b) =>
    `The vault did not answer what this address's shares convert to at block ${n(b)}, so the sum has no end point.`,
};

/** Why Profit or loss has no figure, with the block that did not answer. */
const holdingNoSumProv_ = (c: HoldingCoords, e: Exclude<VaultEarned, EarnedOk>): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  source: { block: e.block },
  summary: `No figure. ${NO_SUM[e.status](e.block)}`,
  contract: vaultContract(c),
  via: `${lane(c)} · the Lifetime flows replay to the pinned block`,
});

/** The worth line: the replayed balance at each stored day's block × that
 *  day's stored share price; the last point the claim at the page's block. */
const holdingWorthLineProv_ = (
  c: HoldingCoords,
  w: { key: string; points: { day: number; block: number; raw: string }[] },
): Provenance => {
  const first = w.points[0];
  const last = w.points[w.points.length - 1];
  const day = (d: number) => formatDate(new Date(d * 86_400_000));
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: {
      kind: "recompute",
      text: `To check: for any day, ask any ${chainWord(c)} archive node for the vault's balanceOf(the holder) and convertToAssets(1 share) at that day's block, and multiply.`,
    },
    summary: `Its worth, one read a day. ${n(w.points.length)} points from ${day(first.day)} to ${day(last.day)}: this address's balance at each day's block, from the replay of its transfers, times the vault's share price read for that day, in ${c.assetSymbol}. The last point is the claim at block ${n(c.blockNumber)}. A day with no read is a gap.`,
    contract: vaultContract(c),
    via: `daily share-price reads · the Lifetime flows replay × the share price read that day`,
    formula: "replayed balanceOf at the day's block × convertToAssets(1 share) read that day",
    inputs: [first, last].map((p, i) => ({
      label: `${i === 0 ? "First" : "Last"} point · block ${n(p.block)}`,
      value: `${unitsText(c, p.raw)} ${c.assetSymbol}`,
      kind: "chain-derived" as const,
      note: day(p.day),
    })),
  };
};

export const holdingFractionProv = withServerRead(holdingFractionProv_);
export const holdingClaimProv = withServerRead(holdingClaimProv_);
export const holdingFirstSeenProv = withServerRead(holdingFirstSeenProv_);
export const holdingEarnedProv = withServerRead(holdingEarnedProv_);
export const holdingFlowSideProv = withServerRead(holdingFlowSideProv_);
export const holdingProfitPctProv = withServerRead(holdingProfitPctProv_);
export const holdingNoSumProv = withServerRead(holdingNoSumProv_);
export const holdingWorthLineProv = withServerRead(holdingWorthLineProv_);
