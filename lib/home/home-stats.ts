// Home-page overview stats shape — the earliest captured transaction and the
// roster-wide wallet count that ride under the covered-positions headline.
// ----------------------------------------------------------------------------
// Client-safe: types only, no env reads and no backend client. The loader lives
// in `home-stats-data.ts` (SERVER-ONLY — it reads API_BEARER_TOKEN), same split
// as covered-positions.ts / covered-positions-data.ts.

export type HomeStats = {
  /**
   * The earliest block_timestamp captured across every explorer's OWN events
   * surface, ISO-8601. Computed backend-side (rails-server-onboarding's
   * `/api/stats/overview`) as a MIN over all nineteen rosters — never derived
   * from a positions MV's first-event column here, since a couple of those
   * COALESCE to a later fallback when the true opening event is missing.
   */
  earliestTransactionAt: string;
  /**
   * Distinct wallets across every explorer's own address surface. All 19
   * roster protocols contribute: Ebisu and Asymmetry gained TroveNFT-Transfer
   * ownership MVs (backend mig 150) with the same owner/last-owner semantics
   * as core Liquity V2, closing their former structural exclusion.
   */
  walletCount: number;
  /** How many of the roster's protocols fed `walletCount`.
   *
   *  Read, not just carried: the home band renders the wallet clause only
   *  while this equals `CoveredPositions.protocolCount`, which is what makes
   *  the two figures in one sentence figures about the same explorers. See
   *  `walletClauseIsInScope` in components/home/covered-stats.tsx. */
  walletCountProtocols: number;
};
