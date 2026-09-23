// ============================================================================
// FETCH LIQUITY-FORK BRANCH ROSTER (chain state) — Ebisu + Asymmetry
// ============================================================================
//
// The protocol view's read: every branch of a fork at one head block, straight
// from its own contracts. The response (typed in
// lib/sources/chain/liquity-fork-branches.ts) carries each branch's oracle
// price (simulated fetchPrice; `priceStale` when only the lagging
// lastGoodPrice answered), its aggregates and TCR against the chain-verified
// CCR/SCR, and its whole redemption queue in redemption order — lowest
// user-set rate first, zombies ahead of the list entirely.

import type { LiquityForkBranchesResponse, LiquityForkBranchState } from "@/lib/sources/chain/liquity-fork-branches";

// The queue entry type is NOT re-exported: the branches view stopped rendering
// per-trove rows on 2026-08-29 (the listing produces that view, filtered and
// sorted), so nothing on the client side names one. The loader still builds the
// queue — the branch card's rate span, average rate and TCR are read off it.
export type { LiquityForkBranchesResponse, LiquityForkBranchState };
