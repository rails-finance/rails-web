// Provenance vocabulary for the Frankencoin system view (/frankencoin/system).
// ----------------------------------------------------------------------------
// Two lanes, graded apart:
//
//   • CHAIN — the protocol's own slots at one head block (ZCHF's supply and
//     capital accounts, the Equity contract's FPS figures, the Leadrate, the
//     hub's opening fee). `state`-class eth_calls; the reserve identity and
//     the FPS price rule are `chain-derived` cross-checks over those slots.
//   • API — the minting book: aggregates over the SAME indexed rows the
//     listing pages, reduced per request (never hardcoded).
//
// Everything is native ZCHF / FPS. No USD exists on this page — Frankencoin
// is oracle-free, and the vocabulary says so wherever a reader might expect
// a dollar.

import type { Provenance } from "@/components/shared/provenance";
import { FRANKENCOIN_ADDRESSES } from "./asset-catalog";

const zchfContract = { name: "Frankencoin (ZCHF)", address: FRANKENCOIN_ADDRESSES.ZCHF };
const equityContract = (address?: string | null) => ({
  name: "Frankencoin Equity (FPS)",
  address: address ?? undefined,
});
const BOOK_VIA = "live index sweep · the same rows /frankencoin pages";

const headCall = (method: string) => ({
  kind: "recompute" as const,
  text: `Re-run ${method} against any node at the stamped block — the figure is the contract's own slot.`,
});

/** ZCHF in existence — totalSupply(). */
export const zchfSupplyProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: headCall("Frankencoin.totalSupply()"),
  summary:
    "Every ZCHF in existence — the Frankencoin token's own totalSupply() at the stamped block. The minting hubs are not its only minters (the bridge and savings interest also mint), so this is the franc count itself, never asserted equal to the hub book below.",
  contract: zchfContract,
  via: "eth_call · totalSupply() @ head",
});

/** The FPS holders' capital — equity(). */
export const equityProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: headCall("Frankencoin.equity()"),
  summary:
    "The equity capital standing behind ZCHF — the Frankencoin contract's own equity() at the stamped block: the reserve's ZCHF that belongs to FPS holders. It is the junior tranche of the system — a challenge shortfall is absorbed here after the borrower's own reserve contribution.",
  contract: zchfContract,
  via: "eth_call · equity() @ head",
});

/** Borrowers' held-back contributions — minterReserve(). */
export const minterReserveProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: headCall("Frankencoin.minterReserve()"),
  summary:
    "ZCHF held back from borrowers — the Frankencoin contract's own minterReserve() at the stamped block: the sum of every position's reserve contribution (a fixed share of each mint, held back and returned on repayment). It sits in the same reserve pool as the equity, on the borrowers' side of the ledger.",
  contract: zchfContract,
  via: "eth_call · minterReserve() @ head",
});

/** The reserve identity — balanceOf(reserve()) = equity + minterReserve. */
export const reserveIdentityProv = (reserveAddress?: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run balanceOf(reserve()), equity() and minterReserve() at one block — the first equals the sum of the other two by the contract's own accounting.",
  },
  summary:
    "The reserve's actual ZCHF balance — balanceOf(reserve()) at the stamped block, read beside its two components: it equals equity() + minterReserve() by the Frankencoin contract's own accounting, and this page reads all three sides of that identity at the same block so the split it shows is a checked fact, not a description.",
  contract: equityContract(reserveAddress),
  via: "balanceOf(reserve()) = equity() + minterReserve() · one block",
  formula: "reserve balance = equity + minter reserve",
});

/** FPS outstanding — Equity.totalSupply(). */
export const fpsSupplyProv = (reserveAddress?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: headCall("Equity.totalSupply()"),
  summary:
    "Frankencoin Pool Shares outstanding — the Equity contract's own totalSupply() at the stamped block. FPS is the claim on the system's equity capital; the Equity contract is the reserve itself (its address comes from Frankencoin.reserve(), never a catalog).",
  contract: equityContract(reserveAddress),
  via: "eth_call · Equity.totalSupply() @ head",
});

/** ZCHF per FPS — Equity.price(), the contract's own cubic rule. */
export const fpsPriceProv = (reserveAddress?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run Equity.price() at the stamped block, or reproduce it from the rule: 3 × equity() ÷ Equity.totalSupply().",
  },
  summary:
    "ZCHF per FPS — the Equity contract's own price() at the stamped block. The figure follows the contract's issuance rule (price = 3 × equity ÷ FPS supply), so it reproduces from the two slots beside it. It is a ZCHF price, native like everything here — no dollar exists anywhere in the system.",
  contract: equityContract(reserveAddress),
  via: "eth_call · Equity.price() @ head (= 3 × equity ÷ supply)",
});

/** The system base rate — Leadrate.currentRatePPM(), hub-discovered. */
export const leadrateProv = (leadrateAddress?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run currentRatePPM() on the module HubV2.rate() names — or cross-check against any open V2 position: its annualInterestPPM() − riskPremiumPPM() equals this figure.",
  },
  summary:
    "The system base rate for NEW V2 minting — currentRatePPM() on the Leadrate module (its address read from HubV2.rate(), never a catalog), parts-per-million ÷ 10,000 = percent. A V2 position prices each mint as this rate plus its own fixed risk premium, charged up front for the remaining term. ⚠️ Governance moves this rate, so today's reading is NOT the rate any existing position paid at its mints — each mint was charged at the rate of its own moment.",
  contract: { name: "Frankencoin Leadrate", address: leadrateAddress ?? undefined },
  via: "eth_call · HubV2.rate() → currentRatePPM() @ head",
});

/** The flat opening fee — HubV2.OPENING_FEE(). */
export const openingFeeProv = (): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: headCall("MintingHubV2.OPENING_FEE()"),
  summary:
    "The flat fee for opening an original position — the V2 hub's own OPENING_FEE() constant, in ZCHF. A spam gate on the veto pipeline: every new original position pays it before its veto window even starts; clones of vetted originals skip both.",
  contract: { name: "MintingHub V2", address: FRANKENCOIN_ADDRESSES.HUB_V2 },
  via: "eth_call · OPENING_FEE() @ head",
});

// ── the minting book (index lane) ────────────────────────────────────────────

/** A roster count over the whole indexed book. */
export const bookCountProv = (what: string, how: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${what} — counted over the full indexed roster (every position the two hubs' PositionOpened logs ever announced, replayed to its current state), reduced per request. ${how}`,
  contract: { name: "Rails index · frankencoin positions" },
  via: BOOK_VIA,
});

/** The open book's minted total — Σ latest MintingUpdate absolutes. */
export const openMintedProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    "ZCHF minted by the open book — the sum of every open position's latest MintingUpdate `minted` absolute (each equal to that position's stored minted() slot at its block). The listing beneath this view pages the same rows, so the two can never disagree. This is the hub book, not the franc supply — ZCHF has other minters (the bridge, savings interest).",
  contract: { name: "Rails index · frankencoin positions" },
  via: `${BOOK_VIA} · Σ minted over status=open`,
});
