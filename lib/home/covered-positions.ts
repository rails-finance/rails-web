// Covered-positions shape — the roster-wide count behind the home headline.
// ----------------------------------------------------------------------------
// Client-safe: types only, no env reads and no backend client. The loader lives
// in `covered-positions-data.ts` (SERVER-ONLY — it reads API_BEARER_TOKEN), and
// the split is what lets HomeHero, a client component, name this shape without
// pulling the token-reading module into the browser bundle. Same split as
// live-example.ts / live-example-data.ts.

export type CoveredPositions = {
  /**
   * Every position the roster has ever held, open or closed.
   *
   * The steadiest of the three: it doesn't depend on any live claim. Whether a
   * position is open TODAY is a question a replay can get wrong; whether it EVER
   * EXISTED is settled by the events themselves, and a position wrongly called
   * open is still a real position that genuinely existed. Miscounting the split
   * cannot move the sum — which is why this figure alone carried the headline
   * while the split was untrustworthy (see `openPositions` for that history).
   */
  totalPositions: number;
  /**
   * Open positions summed across every explorer on the roster.
   *
   * Rendered again as of 2026-07-15. It was withheld for a week because the
   * Aave V3 lane held exited positions open, and the history is worth keeping —
   * it says exactly what has to stay true for this number to be renderable.
   *
   * WHAT WAS WRONG. Aave's scaled reducer reconstructed each balance as
   * `ray_div(nominal_event_amount, reconstructed_index)`, but a
   * `withdraw(uint256.max)` burns the account's EXACT scaled balance, which that
   * division only approximates. A full exit landed a few wei short, survived the
   * positions MV's `supply_balance > 0` gate, and read 'open' forever. Measured
   * against the chain: 39.0% of sampled open Aave V3 rows held NOTHING (one
   * claiming 925,480 USDT the chain said was fully withdrawn). It was a lossy
   * reconstruction, not a missing event — aToken BalanceTransfer was ingested.
   *
   * WHAT FIXED IT. Server migrations 115 (Aave V3) and 116 (Spark): `status` now
   * reads a chain-state `chain_open` bit written by the snapshot populators —
   * `getUserAccountData` USD > 0, else a `balanceOf` sweep of the reserves the
   * replay claims — and COALESCE-degrades to the replay only where the overlay
   * is missing, stale or unknown. Re-reconciled against the chain from the live
   * API: 0/60 open rows empty, and 0/60 closed rows still holding.
   *
   * WHY THE OTHER THIRTEEN ARE SOUND. The fault class is the `ray_div`
   * reconstruction, and it existed in exactly two lanes — Aave V3 and Spark, now
   * both chain-rooted. Every other explorer keys openness off an EXACT balance
   * lane (Moonwell's `mtoken_balance`, Maple's `shares_balance` — each equal to
   * the token's own `balanceOf` at the indexed head), which cannot accumulate
   * residue. Spark itself measured 0 false-open across its whole 4,886-wallet
   * universe even BEFORE 116; it was fixed so its status is chain-rooted by
   * construction rather than accurate by luck.
   *
   * IF YOU ADD AN EXPLORER: this figure is a chain-state claim over the WHOLE
   * roster, so it is only renderable while every explorer's openness is either
   * chain-read or an exact-balance lane. A new protocol that reconstructs
   * balances from nominal amounts re-breaks this number, silently and in the
   * direction that flatters the roster.
   */
  openPositions: number;
  /**
   * Positions no longer open, summed across the roster — derived as
   * (all-time − open) per explorer, NOT by asking for `status=closed`.
   *
   * "Closed" is not the complement of "open" in these backends: most keep
   * `liquidated` as a status of its own (MakerDAO alone: 1,584 open, 25,484
   * closed, 4,677 liquidated), PWN settles to `repaid`/`defaulted`, and Fluid
   * and Maple have no third status at all. A `status=closed` sum would silently
   * drop every liquidation on the roster — the positions a reader reconstructing
   * a tax year most needs. Subtracting from all-time counts each settled
   * position exactly once whatever its protocol calls the ending.
   *
   * Being derived from `openPositions`, it inherits that field's accuracy
   * exactly inverted — every position wrongly held open was one this undercounted
   * — so it became renderable at the same moment, and stops being renderable the
   * same way. Read the note there before touching either.
   *
   * Aave V3's fix moves rows here in BOTH directions: a fully-exited account that
   * was liquidated at some point now settles to `liquidated`, not `closed` —
   * migration 115 keeps `liq_count` the orthogonal flag it always was, so the
   * chain decides open-vs-not while the events still decide how it ended.
   */
  closedPositions: number;
  /** Explorers this count is drawn from: the launched roster
   *  (`LAUNCHED_PROTOCOLS` — an explorer nothing links contributes no figure)
   *  minus any explorer on a testnet chain (a Sepolia figure is a test figure,
   *  not a position in this claim), minus those with no listing to count
   *  (`NOT_POSITION_EXPLORERS`), and minus any explorer whose history is still
   *  backfilling this hour (its listing says so). So this is the counted set's
   *  size, not the roster's length.
   *
   *  Read, not just carried: the band renders the wallet clause only while the
   *  backend's `walletCountProtocols` equals it — see `walletClauseIsInScope`
   *  in components/home/covered-stats.tsx. */
  protocolCount: number;
};
