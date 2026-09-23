// ============================================================================
// FETCH LIQUITY V1 SYSTEM (chain state)
// ============================================================================
//
// The protocol view's read: Liquity V1's whole system at one head block,
// straight from the singleton contracts. The response (typed in
// lib/sources/chain/liquity-v1-system.ts) carries the protocol's own price
// (simulated fetchPrice; `priceStale` when only the lagging lastGoodPrice
// answered), the contract's own TCR and recovery-mode verdict, the shared base
// rate with the fees that decay from it, the Stability Pool's depth, and the
// CR-ordered redemption queue — every ICR the TroveManager's own getCurrentICR.

// LiquityV1QueueEntry is deliberately NOT re-exported. The system view stopped
// rendering per-Trove queue rows on 2026-08-30 — the listing sorted by ratio is
// that queue — so nothing on the client types a single entry any more. The
// route still SERVES the array (the page's aggregates are read off it, and
// scripts/verify/verify-v1-queue-link.mjs compares the listing against it), and
// the type stays where it is defined, beside the loader that builds it.
import type { LiquityV1SystemChainResponse } from "@/lib/sources/chain/liquity-v1-system";

export type { LiquityV1SystemChainResponse };
