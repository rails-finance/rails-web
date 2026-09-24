/**
 * The explorer depth matrix — the one statement of how deep each protocol
 * explorer currently goes, per capability. Rendered by /coverage; the
 * structural notes are also mirrored in spirit by each explorer's /info page, so what
 * an explorer can't offer is stated where the reader actually is.
 *
 * A missing capability has three very different meanings, and the cell type
 * keeps them apart:
 *   `true`         — shipped in this explorer today.
 *   `false`        — the protocol carries the data; the explorer just hasn't
 *                    built the surface yet. Temporary by definition.
 *   `{ awaiting }` — the surface is built and wired, but the chain hasn't yet
 *                    produced an instance to show or verify against. Flips to
 *                    `true` when reality delivers one, not when work ships.
 *   `{ why }`      — the protocol itself can't provide it (no oracle, no
 *                    per-position events, …). Permanent, and the note says why.
 *
 * There are deliberately no cohort presets here: every explorer's row is an
 * audited per-capability statement, not membership in a group. When an
 * explorer gains a capability, flip its cell in the same change (CLAUDE.md).
 */

import { LAUNCHED_PROTOCOLS, PROTOCOLS, isLaunchedChain, type ProtocolEntry } from "@/lib/shared/protocols";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export type DepthKey =
  | "dashboard"
  | "oracleUsd"
  | "atBlockPrices"
  | "verification"
  | "llm"
  | "explainers"
  | "forensics"
  | "views";

export const CAPABILITIES: { key: DepthKey; label: string; detail: string }[] = [
  {
    key: "dashboard",
    label: "Live dashboard",
    detail: "health factor, collateral ratio, rates read live from the protocol's contracts",
  },
  {
    key: "oracleUsd",
    label: "Oracle USD",
    detail: "USD from the protocol's own oracle — the same prices it liquidates with, not a price-API approximation",
  },
  {
    key: "atBlockPrices",
    label: "Prices at the block",
    // Orthogonal to `oracleUsd`, which is USD at HEAD: this is the protocol's
    // own oracle read back at each event's block and stored, so a card values
    // the event as the protocol did when it happened. Morpho is `{ why }` on
    // one and `true` on the other (its at-block price is in loan-token units).
    detail:
      "the protocol's own oracle read back at each event's block, what the position was worth when it happened, never today's price",
  },
  {
    key: "verification",
    label: "Chain verification",
    // Two narrowings, 2026-07-20. The claim used to read "the position
    // re-derived … and checked against the index", which a reader could only
    // take as a check running behind the page they were looking at. It isn't:
    // every verifier is an offline script (16 web `verify-*-chain.mjs`, 8
    // server `verify-*-replay.mjs`), run by hand when an explorer is built or
    // changed, and nothing under app/ or lib/ imports one. Six of them also
    // read no index at all — they re-derive against chain and the explorer's
    // stated constants — so "checked against the index" overstated those too.
    detail:
      "an offline verifier re-derives the explorer's figures directly from the chain via a second data path, and checks them against the indexed values and the constants the explorer states — run against mainnet when the explorer is built or changed, not a check that runs as the page renders",
  },
  {
    key: "llm",
    label: "Copy for LLM",
    detail: "export the position as Markdown or CSV, ready to paste into an LLM or agent context",
  },
  {
    key: "explainers",
    label: "Event explainers",
    detail: "a plain-language explainer on every event card",
  },
  {
    key: "forensics",
    label: "Liquidation forensics",
    detail:
      "what was seized, the premium paid, health at the moment it fired — every explorer flags and links liquidations on the timeline",
  },
  {
    key: "views",
    label: "Protocol views",
    detail:
      "protocol-level pages that read the whole system's own state live at head — market rosters, branch comparisons, redemption queues, balance sheets; what each explorer's view shows opens from its own row of the matrix",
  },
];

/** One matrix cell: shipped, shipped with named exceptions, not yet,
 *  built-but-awaiting-an-instance, or not possible on this protocol. An
 *  `{ except }` cell is a tick that names what it does not cover — a dash
 *  would state the whole capability missing. */
export type DepthCell = boolean | { except: string } | { awaiting: string } | { why: string };

/** Fill an explorer's row: everything not stated is "not yet" (`false`). An
 *  entry is stated only when it's shipped (`true`), waiting on a first
 *  instance (`{ awaiting }`), or ruled out (`{ why }`). */
function explorerDepth(cells: Partial<Record<DepthKey, DepthCell>>): Record<DepthKey, DepthCell> {
  return {
    dashboard: false,
    oracleUsd: false,
    atBlockPrices: false,
    verification: false,
    llm: false,
    explainers: false,
    forensics: false,
    views: false,
    ...cells,
  };
}

/** Where each explorer currently stands, keyed by `ProtocolEntry.id`. */
export const DEPTH: Record<string, Record<DepthKey, DepthCell>> = {
  // Market notes (2026-09-04): a trove's timeline now states the stretches
  // between two of its own events where the branch's oracle price moved far
  // enough to matter to it — both prices are the ones the trove's own rows
  // already carry (Liquity's PriceFeed at each event's block), and the note
  // states what that move did to the collateral ratio the earlier event
  // recorded, against the branch minimum. No capability cell moves: the prices
  // are the same ones `atBlockPrices` already stands for, and a note is a
  // reading of rows the explorer had, not a new source.
  liquity: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    // chain verification (scripts/verify-liquity-chain.mjs): the three-branch
    // address graph, constants, price, ordering, the ICR identity, system state
    // and debt-in-front re-derived from the protocol's own getters at head.
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  "aave-v4": explorerDepth({
    dashboard: true,
    oracleUsd: true,
    // The walk has sat on the lane's floor since 2026-09-08 (price_walk_state
    // aave-v4 = 24,770,662). What it leaves unpriced, by the timeline's own
    // read (aaveV4PriceAtBlockSql: newest on-chain row within 14,400 blocks):
    // 50 of 70,904 rows in mv_aave_v4_events (anti-join on the onboarding box's
    // postgres-api, 2026-09-22 03:20 UTC): PT-USDe-7MAY2026 3 rows, and 47 USDG
    // rows on bluechip #11 and usdg_pendle #4, reserves missing from
    // aave_v4_reserves, so the read never learns their asset. RLUSD joined the
    // oracle registry on 2026-09-22 (server 7bf56da) and all 98 of its rows are
    // priced at their own block.
    atBlockPrices: {
      except:
        "three PT-USDe rows and 47 USDG rows on two reserves the catalog does not list yet, which carry no price at their block — 50 of 70,904",
    },
    // Market notes (2026-09-06): the price-gap kind on the spoke position page
    // — ONE asset's oracle price at two of the position's own rows, and the
    // health factor the whole basket it recorded there makes at each price.
    // Per asset, not per basket; the liquidation threshold is the one the spoke
    // reports now, and where a row does not price the whole basket the note is
    // price-only. No matrix cell exists for notes. The LIVE note (newest row →
    // chain head) reads BOTH of its ends from the feeds at page time: the later
    // at head, the earlier from the same registry pinned to the earlier row's
    // own block. It depends on no index lane, so it is present whenever the
    // page's own figures are (lib/aave-v4/market-notes.ts).
    // chain verification (scripts/verify-aave-v4-chain.mjs): the ten-spoke →
    // three-hub address graph derived from the contracts' own getReserve(),
    // per-reserve config, the hub spoke-grouping, a sampled position's health
    // factor and collateral factor, and its oracle valuation reconciled against
    // Aave's Chainlink feeds — re-derived from chain at head.
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Liquidation forensics (2026-07-14): the valued two-leg breakdown — seized
  // vs cleared at the market's own oracle price AT the event's block (mig 092
  // capture), with the liquidator's realized premium derived from the pair.
  // Protocol views (2026-07-15): /aave-v3/market — the Core Pool's full
  // reserve roster (sizes, rates, risk config, oracle prices) read live from
  // the Pool + IAaveOracle; shares its whole surface with SparkLend's.
  // Market notes, rate-step kind (2026-09-06): a position page now states the
  // stretches between two of its OWN touches where a reserve's own rate moved
  // at least a percentage point, plus a live note per held (reserve, side)
  // against the Pool's getReserveData at the head. One note per RESERVE and
  // SIDE, not per position: a V3-family account is one cross-collateralised
  // account holding several reserves at once and each reserve carries a supply
  // rate it earns and a variable borrow rate it pays. The rate is on neither
  // row — it is the reserve's own ReserveDataUpdated, read at or before the
  // earlier touch and strictly before the later one but NEVER from inside that
  // touch's own transaction, so a move the position itself caused (a large
  // borrow lifting utilisation) is not stated as the market's. A live note is
  // withheld where the rate is nothing at both ends — a reserve nobody borrows
  // pays no supply rate, and "0.00% → 0.00%" is an absence, not a reading.
  // Served by POST /api/aave-v3/reserve-rates. No matrix cell covers notes;
  // none is added.
  "aave-v3": explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    // chain verification (scripts/verify-aave-v3-chain.mjs, shared V3-fork core):
    // the PoolAddressesProvider address graph, reserve-config constants, oracle
    // prices, reserve state + rate bounds, and a real position's HF + USD totals
    // re-derived from getUserAccountData at head. (The curated catalog LTs are a
    // stale FALLBACK the live getConfiguration supersedes — audited, not gated.)
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Aave V3 on Base (2026-08-23) — a wallet-first explorer, and the row says so.
  //
  // Everything a single account needs is reachable on Base for free, and this
  // row reflects exactly that: the Pool's own account view carries HF, LT, LTV
  // and per-reserve balances (`dashboard`), the oracle it liquidates with
  // carries USD (`oracleUsd`), and the reserve roster with every risk parameter
  // decoded from each reserve's own configuration word is the protocol view
  // (`views`) — no curated liquidation-threshold table behind it, unlike the
  // Ethereum sibling.
  //
  // `explainers` and `forensics` landed 2026-08-24 with the event history. The
  // history is read from the Base box's index of the Pool's events (the route
  // sweeps the Pool's own logs only when the index cannot answer), replayed
  // into per-reserve balances the way mig 160 does in SQL on Ethereum, and fed
  // to the SAME timeline cards, explainers and economics tower the Ethereum
  // explorer uses — so these two cells mean exactly what they mean on the
  // sibling row. Liquidations are
  // captured and flagged (`forensics`), read off LiquidationCall's `user`, the
  // owner.
  //
  // `llm` arrived 2026-08-26 with the shared position card: the position page
  // now carries the L1 card, risk slot, explanation and Copy-for-LLM export
  // (the serializer names the swept lane).
  //
  // `verification` (2026-09-22): scripts/verify-aave-v3-base-chain.mjs runs the
  // shared V3-fork core against Base through BASE_RPC_URL — the address graph
  // from the pinned PoolAddressesProvider both directions, every reserve's
  // configuration word for internal consistency and decimals, the oracle's base
  // unit and prices, the reserve identities, the strategy rate bounds, and a
  // borrowing wallet's account identity and USD totals re-read at head. The
  // catalog cross-check has nothing to cross-check and says so: this explorer
  // publishes no liquidation-threshold table, which is the point of it. The
  // listing is not re-derived, because a row here is already a chain read at a
  // pinned block; what is checked instead is the timeline — every drawn row
  // against the Pool's own log at its own block, and the chain's debt against
  // the principal the replay states.
  //
  // The listing arrived 2026-08-25 (the Seamless lane, by config): every
  // account from the Pool's own event scalars, each row's balances a chain
  // read at a named block, and the page stating how complete both are from
  // base_lending_coverage (BaseLendingCoverageBanner reads the row per visit;
  // every Base lending backfill reached its Sieve checkpoint by 2026-09-21).
  "aave-v3-base": explorerDepth({
    dashboard: true,
    oracleUsd: true,
    atBlockPrices: true,
    explainers: true,
    forensics: true,
    views: true,
    llm: true,
    verification: true,
  }),
  // Seamless (2026-08-23) — the same wallet-first shape as Aave V3 Base, which
  // it is a fork of, and it now carries the same five cells for the same
  // reasons: the Pool's own account view carries HF, LT, LTV and per-reserve
  // balances (`dashboard`), the market's own oracle carries USD (`oracleUsd`),
  // the reserve roster with every risk parameter decoded from each reserve's
  // own configuration word is the protocol view (`views`), and as of
  // 2026-08-24 the whole event history is swept live from the Pool's logs with
  // the shared V3 cards on top (`explainers`, `forensics`).
  //
  // The fork holds all the way down to the event signatures — checked rather
  // than assumed: a sample of this Pool's own logs carries the identical
  // topic-0 for all five events, so the Aave V3 reader serves it unchanged.
  //
  // One thing IS different, and it is a fact about the market rather than about
  // the explorer: the Pool has been frozen since April 2025, so nothing here
  // can grow. That does not raise or lower a capability cell — a frozen
  // market's state, risk and prices are as live and as enforced as any
  // other's — but it is why COVERAGE_NOTES leads with it, and it does give the
  // history an unusual shape: both ends of this market's life are known
  // constants, and every supply and borrow in any timeline here is finished
  // business.
  //
  // `verification` (2026-09-22): scripts/verify-seamless-chain.mjs runs the same
  // core as Aave V3 Base's against this Pool, and adds the one thing that is
  // true of this market and no other — the closure, re-derived rather than
  // taken from the catalog. All eighteen reserves carry the frozen bit; all
  // eighteen carry it at block 28,952,883 and none of them at the block before,
  // read with archive eth_call, which is the "one governance action" claim
  // proved rather than restated; the provider's owner is the zero address, so
  // the Pool and oracle it names cannot be swapped. The rate-bound and
  // open-borrower checks were the ones a frozen Pool might have had nothing to
  // say to — both answer in full (ten borrowing reserves, twelve wallets).
  seamless: explorerDepth({
    dashboard: true,
    oracleUsd: true,
    atBlockPrices: true,
    explainers: true,
    forensics: true,
    views: true,
    llm: true,
    verification: true,
  }),
  // Liquidation forensics (2026-07-14): the grab seizure valued — |dink| at
  // the ilk's own OSM price recovered at the block (Vat spot × Spotter mat,
  // server mig 111) against |dart| × rate@block in the Vat's own DAI unit;
  // the third stat is the CUSHION carried into the Dutch auction (penalty and
  // surplus settle there), not a liquidator's bonus.
  //
  // Protocol view (2026-07-15): /makerdao/system — deliberately neither shipped
  // mold. The Aave market roster's spine is "utilisation drives the rate", and
  // Maker has no utilisation: DAI is minted, not lent from depositors, Jug.base
  // is 0 and each ilk's duty is governance-set. Worse, `debt ÷ line` is a
  // tautology wherever the DssAutoLine runs — it holds line at debt + gap — and
  // where line is 0 with debt outstanding the ilk is CLOSED, not fully utilised.
  // The Liquity branch shape doesn't fit either: no redemptions, one duty per
  // ilk that every vault pays, so no queue and nothing to order. So the view is
  // the Vat's own balance sheet decomposed by ilk: the identity Vat.debt =
  // Σ(Art × rate) + vice asserted live and exact, the split showing that only
  // ~5.6% of Maker's debt is a user's vault (which is why the roster is ~1.6k
  // vaults against $12bn), and every ilk on the terms governance set for it —
  // ceiling STATE rather than a utilisation. The roster read found what no vault
  // page could: IlkRegistry.list() is not a complete enumeration — SAI, RWA012-A
  // and RWA013-A are delisted from it and still hold a wei of art each, so a sum
  // over the registry alone misses the Vat's total by exactly their dust.
  //
  // Market notes, rate-step kind (2026-09-06): a vault page now states the
  // stretches between two of its own touches where the ilk's STABILITY FEE
  // moved at least a percentage point, plus a live note against the Jug's own
  // fee at the head. Maker states that fee nowhere a row can carry it —
  // governance files a `duty` on the Jug and the spell's own block is not
  // indexed — so it is derived from the Vat's rate accumulator (every Jug.drip
  // encodes the duty it compounded at) and CONFIRMED by reading the Jug at each
  // set's own block. The confirmation is not belt-and-braces: `maker_fold` has
  // a GAP — no ilk holds a drip in blocks 25,400,000–25,419,999, and from there
  // the replayed accumulator sits 0.08–0.35% under the Vat's head rate on
  // ETH-A, ETH-B, ETH-C, WSTETH-A and LSEV2-SKY-A (WSTETH-B, WBTC-A/B/C and
  // RETH-A are exact). A fee derived after the gap is overstated by that ratio
  // (ETH-A 8.5085 for a true 8.50) and the drip spanning it reads as a spurious
  // 0.3712% set, so a derived set the Jug says never moved the duty is listed
  // as an artefact rather than served. `mv_makerdao_events.rate_at_block` is
  // the same running sum and carries the same shortfall — noted here, not
  // fixed by this pass. No matrix cell covers notes; none is added.
  makerdao: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Day-one template onboard (2026-07-14): the settled lane (the pool's own
  // getPosition view, swept server-side) IS the dashboard's current state —
  // f(x)'s socialized funding/rebalances never emit per-position events; the
  // tick-lineage replay attributes tick rebalances to the positions inside
  // (derived timeline rows, tick-level amounts), archive boundary reads
  // decompose the drift per interval, and USD comes from the pool oracle
  // price snapshotted at a named block.
  //
  // Verification + Copy for LLM (2026-07-15): scripts/verify-fx-chain.mjs is
  // now a self-contained chain-only verifier (the onboarding spike it
  // replaces needed a postgres-derived sample and Etherscan, so its cell was
  // honestly `false`). It re-derives the pool's X96 index accounting
  // BigInt-exact (rawDebts = shares × debtIndex ÷ 2^96; rawColls = shares ×
  // 2^96 ÷ collIndex — the debt index multiplies, the collateral index
  // divides, which IS funding), proves getPositionDebtRatio == debts × 1e36 ÷
  // (colls × ANCHOR price), and pins the two unit systems against wstETH's
  // own stEthPerToken. Its centrepiece proves the explorer's central claim
  // WITHOUT reading a single log: invert the index accounting to recover a
  // position's shares at two blocks — identical shares, moved amounts, i.e.
  // eventless mutation (wsteth #462 has had no event since block 22396761 and
  // still shed 0.245 stETH in the last 50k blocks). It also established that
  // the sweep snapshots the oracle's MIN "liquidate" leg for USD while the
  // debt ratio is judged at the ANCHOR leg — two different prices on one
  // card, now named in both receipts and the export.
  //
  // Protocol view (2026-07-16): /fx/pools — the tick ladder read off the
  // pools' own tickBitmap/tick-tree storage (all 256 words swept, exhaustive
  // by construction), Σ tick debt shares == the pool's total asserted
  // integer-exact, collateral reconciled to a NAMED gap (debt-free positions
  // hold collateral but no tick). Ticks are judged at the oracle's MIN leg —
  // the engines' own price, verified in pool source — where positions judge
  // at the anchor; the page names both.
  fx: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Day-one template onboard (2026-07-14): the lender's on-chain side of an
  // institutional credit book. The dashboard is the ACCESS split (liquid cash
  // vs loans on off-chain custody, queue vs cash, exit rate) read live from
  // the pool's own contracts; share balances replay wei-exact; every
  // value-bearing event is self-priced by its own log. What Maple can't
  // provide is stated as such below.
  //
  // Verification + Copy for LLM close 2026-07-15. scripts/verify-maple-chain.mjs
  // is now a self-contained chain-only verifier (the onboarding spike it
  // replaces was a scoping probe — it narrated console output with no
  // assertion, no pass/fail and no exit code, over Etherscan getLogs — so its
  // cell was honestly `false`). It re-derives cash + Σ strategy AUM ==
  // totalAssets and both share-price identities BigInt-exact, and proves the
  // explorer's central claim WITHOUT reading a single log: over a window where
  // the LoanManager's anchor is byte-identical at both ends — so nothing was
  // emitted — AUM still grew by exactly issuanceRate × Δt ÷ 1e27, and a real
  // holder's unchanged share balance was worth more at the end. A Maple
  // lender's SHARES are event-exact and their VALUE never is.
  //
  // The same run corrected this row: the oracleUsd note used to say "Maple
  // runs no oracle", which is false — MapleGlobals prices WETH off a live
  // registered feed. The true reason is sharper and is now stated below.
  maple: explorerDepth({
    dashboard: true,
    explainers: true,
    verification: true,
    llm: true,
    oracleUsd: {
      why: "Maple runs an oracle, and for USDC that oracle IS a $1 pin: getLatestPrice returns a governance-set manualOverridePrice of exactly 1e8, overriding the registered feed (for USDT it reverts — no price at all). Rendering it would launder a pin as a market reading, which is what a $1 pin is charter-forbidden for; the pool assets ARE the unit, so values render in the asset itself",
    },
    forensics: {
      why: "a Maple lender has no liquidation surface — borrower defaults resolve at off-chain custodians, and the on-chain trace is the delegate's impairment bookkeeping (unrealizedLosses), which socializes through the exit rate rather than seizing from any lender. Chain-proven: the exit price takes a share count and no address, so under an impairment every holder's claim drops by exactly its pro-rata slice — there is no per-lender term for a loss to be aimed at",
    },
    // Protocol view (2026-07-16): /maple/pools — both syrup pools' own state
    // at head: the liquid / fixed-term / open-term split per LoanManager,
    // queue coverability against liquid cash, NAV vs exit rate as the pool's
    // own quantized one-share conversions (never re-multiplied). No USD
    // anywhere, per the oracleUsd ruling above — the page explains the pin
    // in prose instead of rendering it.
    views: true,
  }),
  // Forensics flipped from `awaiting` to `true` on 2026-09-24, its note beside
  // the cell below: the 2026-07-14 forensics wave wired the LiquidateBorrow
  // lane (repay + seize legs, liquidator link, explainer) against ZERO
  // liquidations since the 2026-05-27 deploy, and the deployment's first two
  // have since landed.
  moonwell: explorerDepth({
    // At-block prices (2026-09-24): the Base lane's Ethereum twin, the
    // Comptroller's own oracle, exchange rates, incentive and close factor at
    // every captured event block (rails-server-onboarding mig 325,
    // scripts/fill-moonwell-prices.mjs on the shared roster runner), merged
    // onto /api/moonwell/timeline rows as `oracle_at_block`, which
    // lib/sources/api/moonwell-timeline.ts already read. A finite universe
    // (~1,410 blocks on 2026-09-24) run to completion, so every row is priced
    // at its own block; the newest blocks join within the 15-minute tick.
    // Verifier: scripts/verify/verify-at-block-prices-moonwell-base.mjs with
    // EXPLORER=moonwell. Two liquidations now exist on this deployment
    // (2026-07-24 and 2026-08-30); the same verifier's liquidation arm is
    // what flips forensics below.
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    // Forensics (2026-09-24): flipped from `awaiting`, its instances now on
    // record. Two liquidations exist on this deployment, 2026-07-24 (USDT debt, mUSDT
    // seized) and 2026-08-30 (USDC debt, mcbBTC seized, wallet
    // 0xcc2f8a9725aa6682478ccb62d9f0dcbed34daad3), and the chain sweep
    // (scripts/verify-moonwell-chain.mjs) matches both, log for log, against
    // mainnet. Verifier: scripts/verify/verify-at-block-prices-moonwell-base.mjs
    // with EXPLORER=moonwell, whose liquidation arm confirms both legs valued
    // at the Comptroller's own oracle read at the event's block, against the
    // incentive read at the same block.
    forensics: true,
    // Protocol view (2026-07-16): /moonwell/markets — the four markets against
    // their own caps, ported from the Compound V2 markets reader with the two
    // fork facts honored: rates annualize on each model's own
    // timestampsPerYear() (borrowRatePerBlock reverts — accrual is
    // per-timestamp), and one Chainlink-wrapper oracle prices everything, so
    // V2's frozen-constant section has no analog. Caps render as text, never
    // on the utilisation bar — cap, CF and utilisation are three axes.
    views: true,
  }),
  // Moonwell on Base (2026-08-23) — the protocol's real deployment, and a
  // wallet-first explorer like Aave V3 Base beside it.
  //
  // The relationship to the Ethereum row above is worth stating plainly,
  // because the numbers invert the usual one: Moonwell Ethereum is the newer,
  // smaller outpost — four markets, a few million dollars — while Base is
  // where Moonwell actually lives (twenty-one markets, tens of millions
  // supplied). So the deeper row belongs to the smaller book. That is not an
  // accident of effort; it is what an index buys. Ethereum's history is
  // indexed, so its explorer can replay a wallet's whole life and enumerate
  // every borrower. Base's is not, so this one reads the contracts directly
  // and answers about one account at a time.
  //
  // What that reaches is complete on its own terms: the Comptroller's own
  // verdict on an account — what it supplied, what it owes, which supplies are
  // actually entered as collateral, and how far it sits from the shortfall
  // line (`dashboard`); USD from the Chainlink wrapper the Comptroller itself
  // prices with, never a price API (`oracleUsd`); and every market the
  // Comptroller lists, with its caps, collateral factor, rate model and
  // utilisation, as the protocol view (`views`).
  //
  // As of 2026-08-25 the history is here too, and with it the two cells that
  // hang off it. A wallet's whole life is swept from the chain's own logs on
  // every request — not the Aave sweep with different topics, because a
  // Compound v2 market indexes nothing on its own events; it anchors on the
  // reward distributor, the one contract that indexes the account on every
  // action, and expands each anchored transaction (lib/sources/chain/
  // moonwell-events.ts carries the reasoning and the measurement: zero
  // transactions missed against an exhaustive read of 100,000 blocks). The
  // Ethereum explorer's event cards, explainers and economics tower render it
  // unchanged through three seams — chain, capture source, deployment — so
  // `explainers` holds. `forensics` is `true` rather than Ethereum's
  // `awaiting`: Base has real liquidations, and the lane was verified on one
  // (the repay leg, the liquidation row and both seize transfers, the
  // protocol's cut included, replaying to the mToken's own balance).
  //
  // Still false: `verification` waits on a verifier script with a chain
  // parameter — scripts/verify-moonwell-chain.mjs reads a single mainnet RPC.
  // `llm` arrived 2026-08-26 with the shared position card (the serializer
  // names the swept lane).
  //
  // The listing arrived 2026-08-26 (the third family on the Base listing
  // lane): every wallet that ever held a position, its per-market balances
  // and the Comptroller's own verdict read at a pinned block.
  "moonwell-base": explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    explainers: true,
    forensics: true,
    views: true,
    llm: true,
  }),
  // Reference-depth pass (2026-07-15): live per-position chain lane
  // (VaultResolver.positionByNftId — the vault's OWN fetchLatestPosition
  // settlement math, settled at head), the position-ratio strip + liquidation
  // runway in the vault's own price space, chain verification
  // (scripts/verify-fluid-chain.mjs — raw-slot second path BigInt-exact),
  // Copy for LLM. USD is ruled out by the protocol itself: a Fluid vault
  // oracle prices the collateral IN THE DEBT TOKEN (debt per col) and no USD
  // feed exists anywhere — the Morpho loan-token treatment applies.
  //
  // Forensics is `true` as of 2026-07-15: the valued treatment the row was
  // waiting on landed (mig 114 + fill-fluid-prices.mjs), and it is the Morpho
  // debt-token mold because Fluid's shape is the same one — seized collateral
  // valued at the vault's OWN oracle at the fire block, over the debt cleared,
  // with no USD asserted anywhere.
  //
  // What makes the price a proven fact rather than a plausible one: the premium
  // it implies lands on each vault's OWN liquidationPenalty, read from the same
  // block, across SEVEN distinct constants (1%/2%/2.5%/3%/4%/4.5%/5%) and three
  // decimals regimes — 98.5% of the 17,461 sweeps clearing ≥1 debt unit
  // reproduce their vault's own figure exactly. A wrong price scale would land
  // on none of them. The card shows that constant beside the premium, so every
  // row carries the check rather than asking to be trusted.
  //
  // Stated precisely, because the card states it: the penalty is a FLOOR the
  // engine guarantees, not a figure it targets. 99.90% of those sweeps realize
  // at or above their vault's constant (18 below, worst by 0.438pp — rounding),
  // and the excess ones cleared their tick on better terms than the minimum.
  // So a premium ABOVE the constant is ordinary and is shown, not smoothed.
  // Absorbs answer to no such constant at all (only 20.6% land on it) — they
  // hand out no bonus, the vault takes the position onto its own book past
  // liquidationMaxLimit — so they carry Comet's "Absorption margin" label and
  // no reference figure.
  //
  // Two shape facts the build had to answer to. The VaultResolver's
  // `configs.oraclePriceLiquidate` — the obvious source, and the right number
  // at head — cannot serve this cell at all: the resolver has no bytecode at
  // the blocks these liquidations happened in. The filler reads the oracle the
  // vault's own storage named at that block and calls it there. And Fluid's
  // oracle interface CHANGED mid-life: ~7% of liquidation history sits on
  // oracles that predate the operate/liquidate split and expose only the single
  // rate, which IS the liquidate price there.
  //
  // The carve-out, stated because the cell doesn't state it: T1 token-pair
  // vaults are valued (87% of liquidation blocks, 74% of per-position impacts).
  // The smart variants (T2/T3/T4) hold Fluid DEX shares on a leg, carry no
  // oracle in that storage layout, and render token-only — they need the
  // DexResolver share→token conversion first, which is the same thing their
  // position display is waiting on.
  //
  // Protocol view (2026-07-15): /fluid/vaults — the whole roster off ONE
  // getVaultsEntireData() call to the VaultResolver at head. The shape is
  // Fluid's own claim rather than a borrowed template: every vault carries its
  // own THREE rungs on one axis — borrow to collateralFactor, liquidate from
  // liquidationThreshold, and past liquidationMaxLimit the vault stops selling
  // to liquidators and absorbs the position onto its own book. That third rung
  // is the protocol-level statement of what the forensics lane proves one row
  // at a time: it is why an absorb pays no bonus and answers to no penalty
  // constant. Each vault's own penalty floor sits beside its rungs.
  //
  // The resolver answers for all 181 vaults at head — including the smart ones,
  // whose history it cannot serve (no bytecode at the fire blocks). So the view
  // needs NO carve-out where forensics does: all 181 render, and the smart legs
  // name the DEX pool their shares are of (`ETH / USDC·USDT shares`) rather
  // than convert them, which still waits on the DexResolver. Two shapes the
  // roster actually holds, both stated: 8 vaults were minted and never
  // configured (no ladder, no oracle, no funds — listed, but given no rungs,
  // since a 0% rung would assert a parameter they don't have), and 2 funded
  // vaults name an oracle that answers 0.
  fluid: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: {
      why: "debt-token units by design — each vault's oracle prices the collateral in the vault's debt token (the exact space its liquidation engine judges in); Fluid runs no USD feed",
    },
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Onboard (2026-07-16): three years of LLAMMA lending at the (controller,
  // user) grain across every market from Curve's three factories (59 at
  // onboarding; 60 as of 2026-07-27, and the roster line on /llamalend/markets
  // counts them live rather than restating a number that ages) — 614k
  // rows replayed with the liquidation's same-tx Repay pre-claimed (every
  // one of 2,427 claimed exactly once), proven live by
  // verify-llamalend-replay.mjs in rails-server-onboarding (236 checks:
  // the admin-fee identity exact on 57/57 V1 controllers, the
  // soft-liquidation stablecoin lane wei-exact, band math BigInt-exact
  // against the AMMs' own answers) and by the frontend's second path
  // (scripts/verify-llamalend-chain.mjs — an independent re-implementation
  // of the band math, 96/96). `oracleUsd` is the AMM's own price_oracle in
  // the borrowed token — crvUSD on 55 markets; the four that borrow
  // WETH/tBTC/ynETH/CRV stay in that token's units and are never summed
  // into USD. `forensics` stays `false`, not `{why}`: the liquidation
  // record renders with both legs (collateral seized AND the
  // already-converted crvUSD taken — different numbers, stated
  // separately), but the VALUED treatment needs oracle-at-block capture;
  // the AMM answers price_oracle at any block, so the named path to
  // `true` is an overlay walk, not a new pipeline.
  // Liquidation forensics (2026-08-03): the valued two-leg seizure — the
  // unconverted collateral leg at AMM.price_oracle read back AT the event's
  // block (an archive eth_call per liquidation, no captured price pipeline),
  // plus the already-converted borrowed-token leg at face, against the
  // Liquidate log's own debt — all in the market's borrowed token. No
  // premium reference: LlamaLend has no fixed bonus (health < 0 arms it;
  // the realized gap varies with conversion depth).
  llamalend: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Onboard (2026-07-16): six years of oracle-free ZCHF minting — 218
  // positions, each a minimal-proxy contract of its own, replayed from the
  // two MintingHubs' events with every per-position getLogs scoped to the
  // roster (dEURO's gateway emits byte-identical event signatures, so
  // nothing scans by topic0 alone). Proven twice: the backend replay
  // (verify-frankencoin-replay.mjs in rails-server-onboarding, 77 checks —
  // minted/collateral/price wei-exact on all 68 ledger-bearing open
  // positions) and the frontend's second path
  // (scripts/verify-frankencoin-chain.mjs, 10 checks — the five-slice
  // challenge auction reproduced field-for-field against a neutral third
  // party). `forensics` is the challenge record itself: two-phase auctions
  // grouped by (hub, challenge number), who paid what in which token, in
  // native units — the valued treatment needs no oracle because the
  // protocol never had one.
  // Protocol view (2026-08-08): /frankencoin/system — the oracle-free
  // system's balance sheet and enforcement record: ZCHF supply, the reserve's
  // two accounts read as the contract's own three-sided identity
  // (balanceOf(reserve) = equity + minterReserve, wei-exact), FPS price by
  // the contract's cubic rule, the Leadrate (hub-discovered, with the
  // not-an-at-mint-rate boundary stated), and the book + challenge record
  // reduced per request from the same rows the listing pages. Deliberately
  // NO collateral total and NO collateralization ratio — 26 heterogeneous
  // tokens with no oracle mean no sum exists without importing a feed the
  // protocol runs without.
  frankencoin: explorerDepth({
    atBlockPrices: {
      why: "oracle-free by design — the liquidation price is owner-declared and enforced by challenge auctions; no USD feed exists anywhere in the protocol",
    },
    dashboard: true,
    oracleUsd: {
      why: "oracle-free by design — the liquidation price is owner-declared and enforced by challenge auctions; no USD feed exists anywhere in the protocol",
    },
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Liquidation forensics (2026-07-14): the valued two-leg block in the
  // market's OWN denomination — seized collateral at the market oracle's
  // price captured at the event's block (server mig 112) against the loan
  // cleared, both in the loan token (Morpho's only unit; the realized
  // premium reproduces the market's Liquidation Incentive Factor). USD
  // stays ruled out — forensics doesn't need it.
  // Protocol views (2026-07-15): /morpho/markets — every Blue market Blue has
  // ever created (the CreateMarket census is COMPLETE, not a floor: the
  // singleton has one market-making entry point and no direct-deploy bypass),
  // grouped by loan token, each carrying the single lltv that is its whole risk
  // surface. Only oracleUsd remains ruled out, so Morpho now sits at its
  // maximum.
  morpho: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: { why: "loan-token units by design — Morpho Blue has no USD oracle" },
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Morpho Blue on Base (2026-08-23) — the third wallet-first Base explorer,
  // and the one where that shape is a genuine gain rather than a concession.
  //
  // Blue is a singleton at the same address on both chains, so what makes this
  // a separate explorer is the roster: 4,306 markets against Ethereum's 1,648,
  // disjoint sets with disjoint positions. And the roster is the one thing Blue
  // will not state about itself — `idToMarketParams(id)` answers only for an id
  // already in hand, and there is no enumeration at all. So it is censused from
  // the CreateMarket log and shipped as data, exactly as on Ethereum.
  //
  // Having the ids is what makes the wallet surface possible, and it does
  // something the Ethereum explorer cannot: it opens on a WALLET and finds
  // every market that wallet holds anything in, by asking the singleton about
  // all 4,306 at once (eleven batched calls, about a second). On Ethereum that
  // question is answered by the index; here it is answered by the chain, and
  // exactly — every market is asked, so the most obscure position is found as
  // reliably as the largest.
  //
  // `oracleUsd` is ruled out for the same reason as its sibling's and will
  // never be true: a Blue market measures in its own loan token and the
  // protocol states no dollar anywhere. The rest is the event history —
  // Timeline + economics tower (2026-08-25): the whole life of every market a
  // wallet has ever touched, swept live from the singleton's own logs from its
  // first block (13,977,148) and replayed per market — the Ethereum cards,
  // explainers and liquidation forensics reused unchanged (`explainers`,
  // `forensics`). The forensics price is the market's own oracle asked at the
  // liquidation's block, not a captured one. `llm` is the per-market position
  // page's export menu (components/protocol/morpho/morpho-export-menu.tsx over
  // lib/morpho/position-to-markdown.ts, the Ethereum surface reused); the
  // wallet hub, where one wallet is several isolated positions in different
  // loan tokens, has no multi-market document yet. `verification` waits on a
  // Base verifier of its own — scripts/verify-morpho-chain.mjs is a mainnet
  // job, and the V3-fork core the two Aave Base rows now run through does not
  // fit a Blue singleton.
  "morpho-base": explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: { why: "loan-token units by design — Morpho Blue has no USD oracle" },
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Aave's vault layer (rails-ops decision 0028). The row states what is built
  // and rules the two risk columns out rather than leaving them reading "not
  // yet" (decision 0027 call 2): neither is a capability this subject can gain.
  // `dashboard` is the holder's reading of one vault — shares, claim, what is
  // redeemable now, read live from the vault's own contract; `views` is the
  // roster of vaults, a chain read at one block it names; `verification` is
  // scripts/verify/verify-ethereum-vault{s,-page,-position-page,-timeline}.mjs,
  // which re-derive the roster, the factsheet and a holder's whole history from
  // the contracts. No event explainers and no LLM copy on a vault timeline yet.
  "aave-vaults": explorerDepth({
    dashboard: true,
    verification: true,
    views: true,
    oracleUsd: {
      why: "a vault share has no protocol oracle to value it — the one priced figure is the census's, the balance through the vault's own convertToAssets and the chain's Aave V3 oracle on the ASSET at that block",
    },
    forensics: {
      why: "nobody in a vault holds a loan — there is no threshold to breach and nothing to seize, so there is no liquidation to trace",
    },
  }),
  // Yearn V3 (rails-ops decisions 0027 and 0028). A vault-native subject, so
  // the two risk columns are ruled out with a `why` the way Aave's vault layer
  // has them — neither is a capability this subject can gain. `views` is the
  // roster of every vault the five V3 factories made, a chain read at one block
  // it names, with endorsement read per vault beside the totals; `verification`
  // is scripts/verify/verify-ethereum-yearn-vaults.mjs, which re-derives the
  // roster's totals, share prices, grouping and endorsements, and one vault's
  // whole factsheet, from the contracts at the block each page states, plus
  // verify-ethereum-yearn-vault-timeline.mjs, which re-derives one address's
  // whole life from its own log sweeps and break-tests both the gate and the
  // share exponent.
  // `dashboard` FLIPPED TRUE 2026-09-20: /ethereum/yearn/vaults/<vault>/<holder>
  // is one address's reading of one vault — shares, claim, lifetime flows and
  // every `Transfer` the vault emitted about it, replayed and reconciled
  // against `balanceOf` wei-exact before a row is drawn. What it still does not
  // have is a POSITION LISTING, and that is not this column: every (vault,
  // holder) pair on this roster needs a whole-`Transfer` census per vault, the
  // share-ledger job parked at TO-DO-infra-and-backend §5.4.
  yearn: explorerDepth({
    views: true,
    verification: true,
    dashboard: true,
    oracleUsd: {
      why: "72 distinct assets across the roster and no per-asset feed to value them against, so every figure stays in the vault's own asset and no two assets are ever added together",
    },
    forensics: {
      why: "nobody in a vault holds a loan — there is no threshold to breach and nothing to seize, so there is no liquidation to trace",
    },
  }),
  // Liquidation forensics (2026-07-14): same valued two-leg treatment as Aave
  // V3 (single market — SparkLend's own oracle at the event's block).
  // Protocol views (2026-07-15): /spark/market — the single SparkLend Pool's
  // reserve roster read live, on the same shared surface as /aave-v3/market.
  // Market notes, rate-step kind (2026-09-06): the same kind the Aave V3 row
  // above describes, read through the same selector and the same table —
  // SparkLend is an Aave V3 fork and its Pool emits the same
  // ReserveDataUpdated. One note per (reserve, side), served by POST
  // /api/spark/reserve-rates; the receipts name SparkLend's own single Pool.
  // No matrix cell covers notes; none is added.
  spark: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    // chain verification (scripts/verify-spark-chain.mjs, shared V3-fork core):
    // Spark's pinned Pool/provider/oracle graph, its catalog LTs asserted equal to
    // getConfiguration to the basis point, oracle prices, reserve state + rate
    // bounds, and a real position's HF + USD totals re-derived at head. This is NOT
    // verify-spark-fork-deltas.mjs (that only checks contract shape vs Aave V3).
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Liquidation forensics (2026-07-14): Comet's absorption modelled as the
  // valued two-leg block — seized vs cleared at the absorb events' OWN emitted
  // usdValue (the protocol's oracle reckoning at absorption; no overlay price
  // walk), with the absorption margin derived from the pair.
  // Protocol view (2026-07-16): /compound/markets — the three Ethereum Comets
  // at head: utilisation against each contract's own supplyKink/borrowKink
  // (all three kink at 90%; the roster is the catalog's and the stamp says
  // "stated, not read" — Comet exposes no getAllMarkets), rates at current
  // utilisation, reserves vs targetReserves, and the collateral table with
  // supplied÷cap. The WETH market stays in ETH — quote units are never
  // summed with USD.
  compound: explorerDepth({
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Compound V3 on Base (2026-08-23) — the fourth wallet-first Base explorer,
  // and the one where the roster is small enough that "wallet-first" costs
  // nothing at all. Five Comets: cUSDCv3, cWETHv3, cUSDSv3, cAEROv3, cUSDbCv3,
  // none of them the Ethereum ones and nothing shared with them.
  //
  // Comet enumerates neither its markets nor its accounts, so BOTH halves of
  // the usual question have to come from somewhere else. The markets come from
  // a stated roster — the five the protocol's own Configurator deployed, which
  // on this chain has to be settled by deployer rather than by name: four
  // distinct proxies on Base answer symbol() = "cUSDCv3" and only one is
  // Compound's. The accounts do not come from anywhere, which is why there is
  // no listing. But one account across the whole deployment is three batched
  // calls, so the wallet surface is exhaustive rather than a sample, and it
  // answers more than the Ethereum explorer's detail page does: every market at
  // once instead of one (market, wallet) pair.
  //
  // `oracleUsd` is true on the same terms as Ethereum's: values are the
  // market's own getPrice on the feed it liquidates with, in the market's own
  // numeraire — dollars in four markets and ETH in cWETHv3, never summed
  // across the two.
  //
  // `explainers` and `forensics` landed 2026-08-25 with the event history,
  // and `llm` with it: the Ethereum page's export menu is the same component.
  // The history is read from the Base box's index of the five Comets' events
  // (the route sweeps their logs only when the index cannot answer), replays
  // the signed base and per-asset collateral the way mig 053 does in SQL on
  // Ethereum, and feeds the SAME cards, explainers, tower and export the
  // Ethereum explorer uses — so these cells mean exactly what they mean on the
  // sibling row. Absorptions are captured with their own emitted usdValue
  // legs (`forensics`). `verification` waits on a Base verifier of its own —
  // scripts/verify-compound-v3-chain.mjs is a mainnet job, and a Comet is not
  // an Aave Pool, so the core the two Aave Base rows now run through does not
  // serve it.
  //
  // The listing arrived 2026-08-26 on the Base lending lane at Comet's grain:
  // every (Comet, account) pair from the five Comets' own events, each row's
  // base and collateral a chain read of that Comet at a named block, and the
  // page stating how complete both are from base_lending_coverage, read per
  // visit (the backfill reached its Sieve checkpoint by 2026-09-21).
  "compound-base": explorerDepth({
    dashboard: true,
    oracleUsd: true,
    explainers: true,
    forensics: true,
    llm: true,
    views: true,
  }),
  // Compound V2 (2026-07-15): the protocol view landed first — /compound-v2/markets
  // reads every listed market at head and states what is parked in it, with USD
  // from the Comptroller's own oracle. The position explorer is IN FLIGHT (its
  // backend — migrations, backfill worker, verifier — is built separately), so
  // Position explorer (2026-07-16): six years replayed at account grain —
  // 3.83M rows across all twenty markets, proven wei-exact against chain by
  // the standing verifier (scripts/verify-compound-v2-replay.mjs in
  // rails-server-onboarding: Σ holders == totalSupply − Σ balanceOf(excluded)
  // per market, 23/23 at per-market ingest watermarks). Liquidation is a flag,
  // not a fate: close factor 0.5 means borrowers commonly survive (26,639
  // liquidations across 5,864 borrowers), and the card says so. `forensics`
  // (2026-07-20): the VALUED two-leg treatment now lands — rails-server mig 151
  // + fill-compound-v2-prices.mjs capture Compound's OWN getUnderlyingPrice at
  // each liquidation block (the oracle resolved per block: comptroller.oracle()
  // swaps ~6× over the protocol's life), and the detail card values the seized
  // collateral and cleared debt at it, self-auditing against the liquidation
  // incentive read at the same block. NATIVE-ONLY across the two eras: legs
  // render in ETH before the oracle migration (block 10,678,764) and USD after
  // — the exact numeraire Compound computed each seizure in (no on-chain USD
  // feed spans the deep-ETH era, so none is invented; verify-compound-v2-
  // oracle-history.mjs pins this). Token-only where the walk hasn't reached the
  // block yet — a safe partial-fill state.
  "compound-v2": explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    views: true,
    forensics: true,
  }),
  // Onboard (2026-07-16): thirteen months of Solo-fork margin at the
  // contract's own (owner, account number) grain — balances replayed from
  // emitted absolutes (newPar is the after-state, so the reducer is a lag,
  // not a sum), proven wei-exact by scripts/verify-dolomite-replay.mjs in
  // rails-server-onboarding (totalPar identity on all 21 markets with no
  // exclusion list; 485 accounts / 993 balance legs against
  // getAccountBalances; the census closes over 293,462 logs). The margin
  // verdict is the protocol's own: multiplicative premiums re-derived
  // BigInt-exact, and the LST/ETH risk-override carve-out (111.11% / 4%,
  // premiums skipped) read per account from the core.
  // Liquidation forensics (2026-08-09): the valued two-leg block on the
  // narrating legs of each LogLiquidate — both emitted deltaWei amounts
  // valued at the core's own getMarketPrice read back AT the event's block
  // (archive eth_call; every liquidation postdates the core's deploy, so the
  // read always answers), against getLiquidationSpreadForPair from the same
  // block as the reference constant. The engine sizes the seizure from that
  // constant, so a full seizure lands on it exactly (both pinned fixtures
  // reproduce +15.0000% = 5% base × WLFI's 3× pair factor) and the card
  // audits itself.
  dolomite: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    views: true,
    forensics: true,
  }),
  // Small depth pass (2026-07-15): the three capabilities PWN's own shape
  // leaves open, closed against what the explorer actually surfaces. Chain
  // verification (scripts/verify-pwn-chain.mjs) re-derives the loan terms from
  // the raw LOANCreated log — a genuinely second path, since the indexed lane
  // parses sieve's stringified tuple — and independently proves the custody
  // model the cards assert: SimpleLoan escrows the collateral, the LOAN note is
  // the lender's claim, the Token Bundler holds every wrapped asset, and each
  // loan's status re-derives from chain events alone. Copy for LLM and event
  // explainers follow the reference mold. The other three cells stay ruled out —
  // they are absent from the protocol, not from the roadmap. The fourth, `views`,
  // is `false` rather than `{ why }` on purpose: undecided, not ruled out. PWN has
  // no pools, rates or branches, so what a protocol view would even assert is the
  // open question — decide before building.
  // Protocol view (2026-07-16): /pwn/book — the loan book, the aggregate the
  // per-loan listing never states: outcome record, the open book by soonest
  // deadline (past-due marked claimable — PWN's own default condition is a
  // clock event), what secures the loans per collateral asset, what they owe
  // per credit token (no cross-token totals, no USD, per the rulings above;
  // an open-book sum is withheld entirely rather than rendered partial when
  // any loan lacks a fixed repay total). The cell was "undecided, not ruled
  // out" — this is the decision. PWN now stands at its own maximum depth.
  // Onboard (2026-09-05): the first testnet explorer. Two markets (USDp,
  // GOLDp) on Sepolia, every CDP replayed from the market's own CDPUpdated
  // ledger (the twelve-field identity is exact on 761/761 transitions) over an
  // RPC follower — no Sieve. `dashboard` and `oracleUsd` are the overlay: the
  // cdpManager's own entire-debt/entire-coll/ICR/rate getters at head, and
  // USD from the protocol's own price feed (bonding curve × ETH/USD
  // medianiser). `views` is /sepolia/polaris/markets — both markets side by
  // side, book + live state. `forensics` (2026-09-10): the liquidation card
  // values the legs at the market's own feed price read at the event's own
  // block, in the market's own unit (USDp / GOLDp, never dollars). The premium
  // is measured on the leg the protocol's penalty applies to — the seized
  // total less the owner's surplus and the liquidator's compensation — and
  // lands on the cdpManager's own LIQUIDATION_PENALTY_SP() of 5% to four
  // decimal places on both of Sepolia's liquidations; the whole seized amount
  // over the same debt is the collateral ratio at the moment it fired, stated
  // as its own fact. The redistribution branch (15%) is built from the log's
  // fields but unexercised on Sepolia so far. `verification` is
  // scripts/verify-polaris-chain.mjs (2026-09-05, 32 checks, live against the
  // index at watermark 11,639,133): the address graph, the replay identity
  // BigInt-exact on every served transition of the eight fixture CDPs with
  // the last resulting figures equal to getCDP's stored slots at the
  // watermark, the entire-debt/entire-coll/getICR identities at head, and an
  // independent eth_getLogs census equal to the index's counters — with the
  // op-0 count equal to the NFT mint count on both markets.
  // Phase 3 (2026-09-05): the timeline also carries rate-step market notes —
  // stretches of at least a percentage point in the market's own primary
  // rate between two of a CDP's own touches, receipted against the
  // cdpManager's PrimaryRateSet log.
  // 2026-09-06: a second market-note kind, the price gap — the same rule the
  // Liquity V2 branch applies to its own oracle price, read here from the
  // oracle-at-block lane's priceAtBlock on the CDP's own touches. The
  // minimum it reads against is always the market's normal-mode MCR(); a
  // defensive-mode minimum in force at a past block is not indexed. The same
  // touch also gets a PSM-outcome strip beside the tower: every priced PSM
  // mint/redemption share, valued at the feed it settled at, summed into the
  // CDP's net equity effect from the PSM alone.
  // 2026-09-11: the position page also carries a "Since its last touch" block —
  // the live window split into the feed's effect (the stated collateral times
  // the move in previewPrice between the touch's block and the head) and the
  // protocol's pending legs at the feed now, the two summing by construction to
  // the change in equity at the feed. Not a new capability: it is the existing
  // oracle-at-block lane and the overlay's own per-leg getters, stated as the
  // one window where the split needs no basis (lib/polaris/since-last-touch.ts).
  polaris: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    forensics: true,
    verification: true,
    llm: true,
    explainers: true,
    views: true,
  }),
  pwn: explorerDepth({
    atBlockPrices: { why: "no protocol oracle — the two parties set the price" },
    dashboard: { why: "terms are fixed at origination — no health factor or floating rate to read" },
    oracleUsd: { why: "no protocol oracle — the two parties set the price" },
    verification: true,
    llm: true,
    explainers: true,
    forensics: { why: "loans default at expiry and the lender claims the collateral — nothing is liquidated" },
    views: true,
  }),
  // Liquidation forensics (2026-07-14): the whole-trove variant of the valued
  // two-leg block — the trove's entire ETH at the protocol's own PriceFeed
  // price captured at the event's block (mig 110) against its LUSD debt at
  // the $1 redemption face the ICR math itself uses; the premium is the ICR
  // at fire − 100%, realized by the Stability Pool.
  // Protocol view (2026-07-15): /liquity-v1/system — deliberately NOT the V2
  // family's shape. V1 has one market (no branches to compare) and no user-set
  // rates (nothing to order a queue by but the collateral ratio), so the view
  // is the system's own state: TCR against the recovery line, the Stability
  // Pool's depth against system debt, and the shared base rate the two fees
  // decay from.
  //
  // The queue stopped being LISTED there on 2026-08-30, and the reason is worth
  // recording rather than the change: the listing gained a ratio sort, so
  // /ethereum/liquity-v1?status=open&sortBy=ratio&sortOrder=asc IS the queue —
  // every Trove rather than a preview, paged and searchable, in the card
  // grammar the rest of the site speaks. The view keeps what only the whole
  // queue can say (its depth, its front ratio, and how many Troves sit below
  // the 110% minimum — every ICR the TroveManager's own getCurrentICR at the
  // protocol's own price) and links out for the rest. The link is exact here
  // where the forks' equivalent is approximate: V1 has no zombie state, and the
  // index's open set was brought level with SortedTroves at the wei on the same
  // day, so the two orders agree 75 of 75.
  // scripts/verify/verify-v1-queue-link.mjs is what holds that claim up — a
  // renamed sort value would otherwise leave the listing serving recency under
  // a heading promising the queue, with nothing going red.
  "liquity-v1": explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Reference-depth pass (2026-07-14): live per-trove chain lane (the branch's
  // own getLatestTroveData / getCurrentICR / simulated fetchPrice), branch-
  // oracle USD with the $1 redemption face on debt, chain verification
  // (scripts/verify-liquity-forks-chain.mjs), Copy for LLM, explainers.
  //
  // Forensics was built once for both twins, but the two cells sit apart.
  // Ebisu's is `true` as of 2026-07-15: the deploy the cell was waiting on
  // landed (mig 113 + fill-liquity-fork-prices.mjs on the box), so all 7
  // liquidations carry the branch's own PriceFeed figure at the fire block and
  // render valued — seized, cleared and the realized premium. Both decimals
  // regimes are pinned by their own specimen, which is what makes the
  // 1e(36 − decimals) scale a proven fact rather than a plausible one:
  // weETH (18-dec) at 24559227 priced $2,121.11 → 119.70% ICR, and WBTC
  // (8-dec, ÷1e28) at 24388526 priced $69,844.14 → 119.92% — each landing
  // just under its branch's 120% MCR, the identity a liquidation must satisfy.
  //
  // Protocol view (2026-07-15): /{ebisu,asymmetry}/branches — one shared
  // surface off one head-block read of every branch's own contracts. The V2
  // reference's shape, which these forks genuinely share: the branches side by
  // side — each one's own oracle price, size, TCR against its own CCR/SCR, and
  // the span of rates its borrowers set.
  //
  // The per-branch queues stopped being LISTED there on 2026-08-29: a branch's
  // queue is its troves in rate order, which is the listing with the branch
  // facet, the open status and the rate sort, so the view links there per
  // branch instead. The SortedTroves walk STAYS — the rate span, the average
  // rate, the TCR and the zombie count are all read off it. What the link
  // cannot express is said in prose beside it: a zombie sits outside the sorted
  // list and is redeemed ahead of everything in it whatever its rate, so those
  // are excluded from the link rather than mis-sorted into it.
  // Explanation-depth pass (migs 165-169, 2026-08-22) — all three forks. The
  // `explainers` cell was already true and stays true; what changed is the depth
  // behind it, which the cell cannot express and this note therefore must.
  //
  // The Liquity V2 TroveOperation log decomposes every balance move into WHY it
  // moved, and the fork events MVs had been reading that row for the actor and
  // the action while discarding the rest. Carrying it turns the upfront borrowing
  // fee from a worded mechanic into a figure (Ebisu 320 events, Asymmetry 1,387,
  // Basedollar 37), gives a rate change its first figures of any kind, and yields
  // a per-event accrued-interest figure as the residual of the identity — the item
  // the fork clause file had recorded as uncomputable. Alongside it, the
  // Redemption / RedemptionFeePaidToTrove logs are now mirrored, so a redeemed
  // Trove states the price the branch acted at, the fee the redeemer left in the
  // Trove, and the whole act it was a slice of.
  //
  // Two facts this note owes the reader, because they are visible on the cards:
  //   * Ebisu has never had a redemption, so its redemption clauses render nothing
  //     today. The lane is wired; the first one lights it up with no code change.
  //   * 528 of Asymmetry's 30,926 redemption rows (1.7%) show no price or act
  //     context. Their transactions' trove-level logs were backfilled out-of-band
  //     without the branch-level Redemption log, so the fact was never captured —
  //     absent, and visibly so, rather than guessed. Coverage is complete above
  //     block ~25.1M.

  ebisu: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: true,
    views: true,
  }),
  // Asymmetry is `awaiting`: the same wired lane, but 287 troves and zero
  // liquidations ever — nothing to show or verify against, and no amount of
  // roadmap changes that. The Moonwell posture; flips with the first real one.
  asymmetry: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: {
      awaiting:
        "the liquidation lane is built, but Asymmetry has never had a liquidation — 287 troves, none ever fired — so there is nothing yet to show or verify against",
    },
    views: true,
  }),
  // Basedollar is the first explorer whose contracts are not on Ethereum.
  //
  // `verification` (2026-09-22): scripts/verify-liquity-forks-chain.mjs now
  // names a chain and an RPC key per fork, and re-derives Basedollar's five
  // branches on Base through BASE_RPC_URL — contract graph, collateral token
  // and its decimals, TroveNFT, MCR/CCR/SCR/BCR, the simulated fetchPrice
  // against the TroveManager's own redemption view, the ICR identity at the
  // branch's price scale, and the rate-ordered redemption queue. Every branch
  // read is pinned to one block. wcbBTC's decimals are read off the token, not
  // its ticker: it is an 18-decimal wrapper, and a scale taken from the name
  // would be off by 10^10.
  //
  // `forensics` is `awaiting` for the plain reason: Basedollar has never had a
  // liquidation. That is the Asymmetry posture — the lane is built, reality has
  // not delivered an instance — and it is worth stating carefully, because this
  // cell used to give a different and partly wrong reason. It said a Basedollar
  // liquidation could not be valued at all, since the branch-price-at-block
  // capture behind mig 113 is a mainnet job with no Base counterpart.
  //
  // Half of that is still true and half of it was never true. A REDEMPTION needs
  // no filler on any chain: the TroveManager emits the branch price in the
  // Redemption log beside the act, and mig 165/166 now carry it, so Basedollar's
  // redemptions render valued today. A LIQUIDATION is the case that genuinely
  // depends on the filler — the price is not on the Trove's own liquidation row —
  // so if one ever fires before that job has a Base counterpart, its forensics
  // will be token-only. Nothing is withheld by it in the meantime.
  basedollar: explorerDepth({
    atBlockPrices: true,
    dashboard: true,
    oracleUsd: true,
    verification: true,
    llm: true,
    explainers: true,
    forensics: {
      awaiting:
        "Basedollar liquidations would render token-only: the per-block branch-price capture that values seized collateral is a mainnet filler with no Base counterpart yet. None have fired so far either",
    },
    views: true,
  }),
};

/**
 * Explorers that do NOT keep the foundation's first promise — "every position,
 * not just yours". The coverage page's closing band claims that of every
 * explorer, and on a deployment listing one of these it would be false.
 *
 * This is not a capability cell, which is why it lives here rather than in
 * `DEPTH`: the seven cells describe how DEEP an explorer goes, and this is
 * about whether it can enumerate its subjects at all. Same reasoning decision
 * 0014 used for NOT_POSITION_EXPLORERS — when a roster-wide claim stops being
 * true of one member, say so where the claim is made.
 *
 * An entry leaves this set in the same change that gives its explorer a
 * discovery listing.
 */
export const EXPLORERS_WITHOUT_LISTING = new Set<string>([
  // Empty since 2026-08-26 — every explorer on the roster can enumerate its
  // subjects. The set stays so the next explorer that ships without a listing
  // has somewhere to say so; the history below is why each member left.
  // aave-v3-base left 2026-08-26: the listing lane by config over the Seamless
  // shape (same aToken/debt-token grain, the live Pool for status) — its history
  // is still backfilling, but a partial history is a coverage cell, not a
  // missing listing.
  // morpho-base left 2026-08-26: the fourth worker family on the listing lane
  // — (market, borrower) grain over the singleton, each pair's position and
  // market slots read at a pinned block with the market's own oracle beside
  // them, the pair set reduced from the singleton's own logs on the Base box.
  // moonwell-base left 2026-08-26: a third worker family on the listing lane
  // (wallet grain under one Comptroller, per-market mToken reads + the
  // Comptroller's own account verdict at a pinned block), with the account
  // set reduced from the twenty-one mTokens' own logs on the Base box.
  // compound-base left 2026-08-26: the first Comet lane — its own fragment,
  // backfill and (market, account) reduction, the Seamless shape at Comet's
  // grain. seamless left this set 2026-08-25: the first Base lender with a listing —
  // its account set is closed (frozen Pool), so a census taken once stays
  // complete, and the listing lane (index scalars + a chain read per account)
  // was proven on it first.
]);

export function cellFor(protocolId: string, key: DepthKey): DepthCell {
  return DEPTH[protocolId]?.[key] ?? false;
}

/** An announced-but-not-built explorer — the page's `COMING_SOON` shape.
 *  `chainId` places it on the right per-chain coverage page (the matrix is
 *  split by chain); an entry without one shows on the Ethereum page. */
export type ComingSoonEntry = {
  id: string;
  label: string;
  href: string;
  iconId: string;
  note: string;
  chainId?: ChainId;
};

/** One row of the coverage matrix: either a live explorer's audited row, or a
 *  coming-soon placeholder that makes no capability claims. */
export type CoverageRow = { kind: "explorer"; entry: ProtocolEntry } | { kind: "soon"; entry: ComingSoonEntry };

/** One chain's slice of the roster in its curated order, each coming-soon
 *  entry spliced into its alphabetical slot by label. Existing rows keep
 *  their exact order — this inserts, it never re-sorts (re-sorting would
 *  reshuffle f(x)/PWN/case-edge rows that aren't in strict alphabetical order
 *  themselves). Desktop and mobile both call this so the two layouts
 *  interleave identically. */
export function coverageExplorers(chainId: ChainId): ProtocolEntry[] {
  // A coverage page is a directory and its rows are links, so on a LAUNCHED
  // chain it lists that chain's launched explorers and no others — an
  // unlaunched one would be exactly the door the flag closes.
  //
  // On a chain whose every explorer is unlaunched, the page itself is
  // unlaunched: nothing links to it, it is out of the sitemap, it is
  // `index: false` and it carries the work-in-progress strip. A link from it
  // into one of its own explorers is a link between two surfaces a reader
  // reached by typing a URL, which is the thing this change leaves working —
  // so it lists the whole chain, and a reader who came looking gets the
  // directory rather than a matrix with no rows in it. The day the chain's
  // first explorer launches, the page is launched with it and this narrows to
  // that explorer.
  return (isLaunchedChain(chainId) ? LAUNCHED_PROTOCOLS : PROTOCOLS).filter((entry) => entry.chainId === chainId);
}

export function coverageRows(comingSoon: ComingSoonEntry[], chainId: ChainId): CoverageRow[] {
  // The coverage surface is per-chain routes (/coverage/<chain-slug>), so the
  // matrix shows one chain's explorers and the page's toggle links to the
  // other — the chain is said by the URL, not a mark repeated per row.
  const rows: CoverageRow[] = coverageExplorers(chainId).map((entry) => ({
    kind: "explorer",
    entry,
  }));

  for (const entry of comingSoon.filter((e) => (e.chainId ?? MAINNET_CHAIN_ID) === chainId)) {
    const at = rows.findIndex((r) => r.entry.label.localeCompare(entry.label) > 0);
    const row: CoverageRow = { kind: "soon", entry };
    if (at === -1) {
      rows.push(row);
    } else {
      rows.splice(at, 0, row);
    }
  }
  return rows;
}

/**
 * Per-protocol one-liner for the "Protocol views" capability — what that
 * explorer's protocol-level page actually shows, stated where the reader is
 * looking (the /coverage row drawer + mobile card) rather than in one run-on
 * legend sentence. Wording is drawn from each protocol's own DEPTH comment
 * block above; do not invent capabilities a view doesn't offer.
 *
 * Invariant: an entry exists here iff that protocol's `views` cell is `true`.
 * All nineteen qualify — frankencoin's /frankencoin/system (2026-08-08)
 * closed the matrix's last views dash.
 */
export const VIEW_NOTES: Record<string, string> = {
  frankencoin:
    "The oracle-free system's balance sheet — ZCHF supply, the reserve's two accounts read as the contract's own identity, the Leadrate, and the challenge-auction enforcement record.",
  liquity:
    "The branches side by side — the span of rates borrowers set on each, and redemption exposure as debt-in-front.",
  "aave-v4": "The hubs compared side by side.",
  yearn:
    "Every vault the five V3 factories made — the endorsed and the rest alike — grouped by the token each takes, with its totals, share price and endorsement read from the contracts at one block the page names.",
  "aave-vaults":
    "Every vault Aave's three families deploy — savings GHO, the Umbrella stake tokens and the static aTokens — grouped by family, each row carrying its totals, share price and mechanic read from the contracts at one block the page names.",
  seamless:
    "The full reserve roster of a market that is closing — eighteen reserves, every one of them carrying the frozen bit, with the sizes, rates and risk parameters the Pool still enforces on what is left.",
  "aave-v3-base":
    "The Base Pool's full reserve roster — sizes, rates, risk configuration and oracle prices — with every risk parameter decoded from the reserve's own configuration rather than a copied governance table.",
  "aave-v3":
    "The Core Pool's full reserve roster — sizes, rates, risk configuration and oracle prices — read live from the Pool and its oracle.",
  spark: "The single SparkLend Pool's reserve roster read live, on the same shared surface as Aave V3's.",
  makerdao:
    "The Vat's balance sheet decomposed by ilk — Vat.debt = Σ(Art × rate) + vice asserted live, with every ilk on the terms governance set for it.",
  fluid:
    "Every vault's own borrow, liquidation and absorption ladder — three rungs on one axis, with each vault's own penalty floor beside them.",
  llamalend: "Every market's own amplification and band geometry, judged in the token it borrows.",
  "compound-v2":
    "Every listed market's utilisation against its own rate-model kink, with USD from the oracle the Comptroller itself reads.",
  compound:
    "Each Comet's utilisation against its own kink, rates at current utilisation, and reserves against targetReserves.",
  moonwell:
    "The four markets against their own caps — cap, collateral factor and utilisation stated as three separate axes.",
  "moonwell-base":
    "The same surface as Moonwell Ethereum's, over the twenty-one markets Base actually runs — including the two whose supply cap now sits below what they hold, which is how governance closes a market to new deposits.",
  maple: "Both syrup pools' liquid/deployed split and queue coverability against liquid cash.",
  fx: "The tick ladders read off the pools' own tick storage, with tick debt shares reconciled integer-exact against the pool totals.",
  pwn: "The loan book — the outcome record, the open book by soonest deadline, what secures the loans and what they owe per token.",
  polaris:
    "The two markets side by side — each one's collateral and debt, the algorithmic rate in force, its mode and reserve ratio, the stability pool's depth, and the price legs the protocol values pETH with, beside the CDP counts the index holds.",
  morpho:
    "Every Blue market grouped by the token it measures in, each carrying the single immutable loan-to-value that is its whole risk surface.",
  "compound-base":
    "The five Comets on Base, each with its own base asset, collateral roster, rate curve and reserve line — and one of them reading above 100% utilised, which is what a growing reserve line looks like.",
  "morpho-base":
    "The same surface over Base's markets — more than 4,300 of them, over twice Ethereum's roster, and the same nine loan-to-values across all of it.",
  dolomite:
    "Every market's own margin ladder — a multiplicative premium over the 117.65% base, including the LST/ETH override.",
  "liquity-v1":
    "The system's own state — TCR against the recovery line, the Stability Pool's depth against system debt, the shared base rate, and how deep the redemption queue currently is. The queue itself is the Trove listing sorted by ratio, and the view links there rather than drawing it twice.",
  ebisu:
    "The branches side by side — each one's own oracle price, size, TCR and rate span, and a link per branch into the listing sorted by rate, which is that branch's redemption queue.",
  asymmetry:
    "The same branch surface as Ebisu's — each branch's own price, size, TCR and rate span, and the same per-branch link into the listing sorted by rate.",
  basedollar:
    "The same branch surface as Ebisu's, read on Base — each branch's own price, size, TCR and rate span, and the same per-branch link into the listing sorted by rate.",
};

/**
 * Structural coverage notes, keyed by `ProtocolEntry.id` — why full depth
 * isn't reachable on this protocol, stated once as prose. Only protocols
 * where the protocol itself (not the roadmap) sets the limit appear here.
 * Rendered on /coverage; each explorer's /info page carries the
 * reader-facing consequence in plain words instead.
 */
export const COVERAGE_NOTES: Record<string, string> = {
  "aave-vaults":
    "Each vault position's timeline replays that wallet's whole share-transfer history live from the vault's own logs on every request and checks it wei-exact against the vault's own balance before drawing anything — a mismatch means no rows rather than a wrong one. The roster of holders comes from a daily sweep of every vault's whole history (Aave's own enumerators for its vaults, the two MetaMorpho factories for those), proven complete against each vault's own total supply; a sweep that can't prove complete doesn't get published. There's no USD, APY or yield figure — just the flows and share prices as they happened.",
  yearn:
    "A Yearn V3 vault takes one token and issues shares against it; nobody in it borrows, so there is no threshold to breach and no liquidation to trace. The roster is every vault the five V3 factories made, found from each factory's creation logs and censused at a block the page names — a floor, because a vault deployed by hand, without a factory, emits no creation log and appears on no list. At the census block those vaults take 72 different tokens, with no per-asset feed to value them against, so every figure stays in its vault's asset and no two tokens are ever added together. A holder's timeline replays every share transfer the vault emitted about that address, swept from the vault's logs on every request, and checks it wei-exact against the balance the vault reports before drawing anything — a mismatch means no rows rather than a wrong one. There's no USD, APY or yield figure — just the flows and share prices as they happened.",
  "aave-v3-base":
    "Aave V3 on Base is a separate deployment from Aave V3 on Ethereum — its own Pool, its own reserves, its own risk parameters and its own oracle — so a wallet's position on one says nothing about its position on the other, and the two are separate explorers rather than a switch inside one. What sets this explorer apart from the Ethereum one is not what it shows but where each figure comes from. The Ethereum listing is a replay of an indexed event stream; this one is not a replay at all. Every account that ever touched the Pool is found from the Pool's own events, and each account's balances and dollar values are read from the Pool, its reserve tokens and its oracle at the block its row names and read again after any event; risk is read live on the position page. So a listing figure here is a fact the chain stated at a block the row names, never a reconstruction. That is also why the listing states its own completeness: the account set comes from the Base box's capture of the Pool's history from its first block, and the chain read covers a budget of accounts per pass, so the listing says on its face how far each has got, from the coverage record Rails keeps for both, rather than letting a partial roster look whole. Opening a position reads that one wallet's whole history from the same capture, from the Pool's first block, which is why the timeline reaches the position's genesis rather than a recent window, why the economics tower can state lifetime deposits, withdrawals and the interest inside the debt, and why a timeline states underneath itself anything its history is missing. When the capture cannot answer, Rails sweeps the Pool's own logs for the wallet instead. Since 4 September 2026 every event block the Base box captures is also read for the Pool's own oracle — every reserve's price, liquidation bonus and protocol fee, all at that block and stored — so a liquidation card served from the index values both legs at the prices the seizure was computed with and states the premium against the bonus read from the same block, and an ordinary row names its reserve's price at its own block. The newest blocks are priced within minutes and every liquidation block is priced; older ordinary rows are priced as the historic walk reaches them and render token-only until then, and a position holding such rows says so above its timeline, with the date the walk is expected to reach them.",
  seamless:
    "Seamless is an Aave V3 fork on Base, verified as one by interface rather than by reputation: its Pool answers the identical account, reserve and configuration calls, which is what lets the same reader serve it. So the model is Aave's — one Pool, one cross-collateralised account per wallet, one health factor — and everything the Aave V3 Base explorer says about reading risk off each reserve's own configuration word holds here too. What is different is that this market is closed. All eighteen reserves were frozen in a single block on 15 April 2025, which is one governance action rather than a market fading asset by asset, and the freeze was read off the chain by binary search over the frozen bit rather than taken from an announcement. A frozen reserve still accrues interest, still liquidates, and still lets a holder repay and withdraw; what it will not accept is a new supply or a new borrow. So every rate and threshold this explorer shows is live and enforced, and none of it is an invitation — which is why the surfaces say so rather than leaving a reader to infer it from a borrow APR on a market nobody can borrow from. The listing here is not a replay: every account that ever touched the Pool is found from the Pool's own events, and each account's balances and dollar values are read from the Pool, its reserve tokens and its oracle at the block its row names and read again after any event — risk is read live on the position page — so a listing figure is a fact the chain stated rather than a reconstruction — and the page states on its face how far the history walk and the sweep have each got, rather than letting a partial roster look whole. The census has an unusual shape here, and it is worth naming: because the Pool is frozen, the set of accounts that can ever hold a position on it is closed and can only shrink, so once taken it stays complete rather than going stale. That is true of no other explorer on this roster. Opening a position reads that one wallet's whole history from the Base box's capture of this Pool's events, from its first block (a live sweep of the Pool's own logs stands in when the capture cannot answer), which is why the timeline reaches the position's genesis rather than a recent window. Since 4 September 2026 every event block the Base box captures is also read for the Pool's own oracle — every reserve's price and liquidation bonus at that block, stored — so a liquidation card served from the index values both legs at the prices the seizure was computed with and states the premium against the bonus read from the same block (this Pool keeps no protocol share of it), and an ordinary row names its reserve's price at its own block. The historic walk has reached the Pool's first event, so every row names its reserve's price at its own block.",
  "moonwell-base":
    "Moonwell is a Compound v2 fork, and Base is where it actually runs: twenty-one markets against Ethereum's four, and tens of millions supplied against a few million. The two are separate deployments with separate contracts, so they are separate explorers rather than a switch inside one — a wallet's position on Base says nothing about its position on Ethereum. What sets this explorer apart from Moonwell Ethereum's is where each figure comes from. The Ethereum listing is a replay of an indexed event stream; this one is not a replay at all. Every wallet that ever held a position is found from the twenty-one markets' own events on the Base box — with a routed mint or redeem resolved to its real owner through the same-transaction transfer leg, the way the Ethereum index does it — and each account's balances, debt, exchange rates and dollar values are read from the mTokens, the Comptroller and its own oracle at the block its row names and read again after any event; risk is read live on the position page. So a listing figure here is a fact the chain stated at a block the row names, never a reconstruction, and the page states its own completeness — how far the history walk and the sweep have each got — rather than letting a partial roster look whole. Opening a position reads that one wallet's whole history from the Base box's capture of the twenty-one markets' events, from the Comptroller's first block. That is why the timeline reaches the position's genesis rather than a recent window, why the economics tower can state lifetime deposits, withdrawals and the interest inside the debt, and why the account surface can say which of a wallet's supplies are actually entered as collateral (minting alone does not enter a market, and an un-entered supply backs nothing) beside the Comptroller's own verdict on how far it sits from liquidation. When the capture cannot answer, Rails sweeps the chain instead, and not in the way it is cheap on Aave: a Compound v2 market indexes nothing on its own events, so the sweep anchors on the reward distributor — the one contract on this deployment that names the account on every action — and reads each transaction it names. A timeline states underneath itself anything its history is missing — on the few accounts too large to send whole, from which date onward it is drawn. Two facts of this deployment are stated rather than smoothed over: two markets carry a supply cap BELOW what they already hold, which is governance closing them to new deposits rather than a ceiling being breached, and two different markets both answer to the mToken symbol \"mUSDC\" (the bridged and the native USDC), so only an address identifies a market here. Since 4 September 2026 every event block the Base box captures is also read for the Comptroller's own oracle — every market's price and exchange rate, the incentive and the close factor, all at that block and stored — so a liquidation card values both legs at the prices the seizure was computed with and states the premium against the incentive read from the same block, and an ordinary row names its market's price at its own block. The newest blocks are priced within minutes and every liquidation block is priced; older ordinary rows are priced as the historic walk reaches them and render token-only until then, and a position holding such rows says so above its timeline, with the date the walk is expected to reach them. Since 4 September 2026 a position that held a market’s shares across a step in that market’s own exchange rate also carries a market note on its timeline — a receipted row rather than an event, never counted in any total, placed between the two of the account’s own events that bracket the step, stating the rate at each end and what the position’s own shares were worth at each. The rate is derived rather than read: every Mint and Redeem in a market emits the underlying amount and the mTokens it was exchanged for, and their quotient is the market’s rate at that block, so this needs no oracle. A step is stated only where the change over the whole market’s series exceeds ten times the interest the market could have accrued over the same seconds — across the twenty-one markets’ entire history three such steps exist. A live note sits above the newest row for any entered market the account still holds: the same market’s own exchange rate read live at the chain head, against the account’s own newest Mint or Redeem in it, holding the account’s CURRENT holding fixed and moving only the rate — shown whatever the move, because nothing having changed since is itself the fact it states.",
  "compound-base":
    "Compound V3 on Base is a separate deployment from Compound V3 on Ethereum — five Comet markets of its own, with their own collateral rosters, their own risk parameters and their own accounts — so the two are separate explorers rather than a switch inside one. A Comet market is single-base and multi-collateral: one asset is both the lend and the borrow side, every collateral asset backs borrowing of that base alone, and nothing is cross-collateralised between markets. So a wallet has a separate standing and a separate liquidation line in each market it touches, and this explorer never states a combined one. It also never totals across them, because they do not all measure in the same unit: four quote in dollars and cWETHv3 quotes in ETH, which is the unit each market's own oracle answers in. That unit is a fact about the market rather than about its base asset — cAEROv3's base is the volatile asset and it still quotes in dollars. What sets this explorer apart from Compound V3 Ethereum's is where each figure comes from, and in one respect it reaches further. The Ethereum listing is a replay of an indexed event stream; this one is not a replay at all: every (market, account) pair that ever held a position is found from the five Comets' own events, and each account's base and collateral are read from that Comet at the block its row names and read again after any event — risk is read live on the position page — so a listing figure is a fact the chain stated rather than a reconstruction — and the page states its own completeness, how far the history walk and the sweep have each got, rather than letting a partial roster look whole. Opening a row answers the whole wallet at once — every market in the roster asked about the account, and the address's history read from the Base box's capture of every Comet's events from the earliest market's first block (a live sweep of their logs stands in when the capture cannot answer), so the history reaches each position's genesis rather than a recent window, and the economics tower can state lifetime flows and the interest inside the debt. Comet has no borrow or repay event — a withdrawal past the balance is the borrow and a supply against a negative balance is the repayment — so those flows are read off the running balance's zero crossings, as the protocol itself defines them. A timeline states underneath itself anything its history is missing. Two facts of this deployment are stated rather than smoothed over: one market's borrows stand above its supplies, which is the borrow index outrunning the supply index by the spread between the two rates rather than a shortfall, and four different proxies on Base answer to the name cUSDCv3, only one of which Compound governance deployed — so the roster here is settled from the Configurator's own deployment log rather than from a name.",
  "morpho-base":
    "Morpho Blue is one immutable singleton, deployed to the same address on Base as on Ethereum — so what separates these two explorers is not the contract but the markets. A Blue market is a parameter tuple, not a deployment, and Base carries more than 4,300 of them against Ethereum's more than 1,700, with disjoint positions. Everything the Ethereum explorer says about the protocol's shape holds here: each market measures in its own loan token with no dollar anywhere, its single loan-to-value is both the borrow limit and the liquidation line, and its totals are the last-settled balance rather than the balance now, because Blue accrues only when a market is touched. What is different is how the explorer finds anything. Blue will not enumerate itself — a position is a slot you can only read with a market id already in hand, and there is no per-user or per-market list — so the roster is censused from the CreateMarket log and shipped as data, complete as of the census block stated on every surface. Having every id is what lets this explorer open on a wallet rather than on a market: it asks the singleton about every one of those markets at once and finds every position the wallet holds. The sweep is exact rather than a sample, so an obscure market hides nothing — as of the census block, which every surface states; a market created after it is found once the roster is censused again. The listing of every borrower comes from Rails' own index of the singleton's logs, kept on a Base capture box: each (market, borrower) pair those logs name, with its position read from the chain at a pinned block. Behind each position the explorer reads the wallet's whole history from the same index — every event naming it since the contract's first block — and reads it from the chain instead whenever the index cannot vouch for the whole life, replaying it per market into the same cards, economics tower and liquidation forensics the Ethereum explorer draws; the replayed shares are checked against the live slots to the wei before a card stands on them. Each vault position's timeline replays that wallet's whole share-transfer history from chain and checks it wei-exact against the vault's own balance before drawing anything — a mismatch means no rows rather than a wrong one. The roster of holders comes from a daily sweep of every vault's whole history, proven complete against the vault's own total supply; a sweep that can't prove complete doesn't get published, and yesterday's set stands instead. There's no USD, APY or yield figure — just the flows and share prices as they happened, plus, on each row, which of the vault's underlying markets the deposit sat in at that point.",
  fluid:
    "Fluid prices each vault's collateral in its debt token — the vault oracle quotes debt-per-col, the exact quantity the liquidation engine judges, and the protocol has no USD feed. Positions, ratios and liquidation prices are stated in the vault's own token pair rather than converted through a feed the protocol doesn't use. Smart-vault legs hold Fluid DEX pool shares, and the protocol view resolves them into the tokens they are made of — the pool states its own per-share composition, which is a fact about what the shares ARE, not a price. Their liquidations still stay amounts-only: the DEX resolver that answers this at the head has no bytecode at the blocks those liquidations fired in, so nothing on chain can say what a share was made of back then. Liquidations sweep price-band ticks and name no position — the timeline's per-position impacts are the vault's own settlement math read at the boundary blocks, valued at the vault's own oracle read at that same block. Each token-pair vault's realized premium is shown against that vault's own liquidation penalty, read from the block it fired in — a floor the engine guarantees rather than a figure it targets. The two are computed independently, so a sweep landing on its vault's constant is the check that the price is the one the engine used; one landing above it simply cleared on better terms than the minimum, and is shown as it happened.",
  llamalend:
    "LlamaLend's liquidation is a band, not a line: collateral sits in the market's AMM across a range of prices, and as the oracle falls through it the AMM converts collateral to the borrowed token continuously — soft-liquidation is a state a position lives in, not an event that happens to it. So the explorer reads it as state: the converted amount comes from the protocol's own user_state and is cross-checked wei-exact against a second contract's answer (get_sum_xy), and the band edges are re-derived from the deployed contracts' own integer math rather than approximated. Two consequences of the design shape the record. A partial hard-liquidation emits no after-state — the deployed controller logs nothing on that path — so those figures render as unstated, never zero, until the position's next event. And a hard liquidation seizes both legs of the AMM holding, the remaining collateral and the crvUSD it had already converted — two different numbers, stated separately, with the same-tx debt repayment pre-claimed so it never double-counts as the borrower's own repay. Most markets borrow crvUSD; the four that borrow WETH, tBTC, ynETH or CRV stay in that token's units.",
  frankencoin:
    "Frankencoin has no oracle anywhere — the system's one price is the liquidation price each position's owner declares, and the protocol keeps it honest with a two-phase challenge auction instead of a feed: anyone who thinks a declared price is too high posts collateral against it, and the auction's outcome, averted or succeeded, is the protocol's own judgment. So the explorer states everything in native units — debt in ZCHF, collateral in the position's own token — with no dollar figure and no health factor, because neither exists on chain. Two facts of the design shape what a page can say. Collateral can arrive by direct ERC-20 transfer, which emits nothing on the position, so where the event ledger never spoke the live chain read carries the true balance and the card says so. And a veto does different things by version — V1's deny pins the position's cooldown forever, V2's closes it outright and leaves it indistinguishable at head from an ordinary close — so DENIED is served from the indexed event record, the only place it survives.",
  "compound-v2":
    "Compound V2 is the original cToken deployment, and what stands out about it is how little of it is still in use: it holds on the order of $100M supplied, but under 12% of that is borrowed — and two markets, cDAI and cUSDC, carry almost all of even that. Eight of its twenty markets have had their collateral factor set to zero, which does not mean a 0% limit; it means the market has been switched off as collateral entirely. The protocol view states that from the markets' own numbers: what each holds in its own token, how much of it is working, the collateral factor it does or doesn't have, and the utilisation its own rate model was tuned to expect. Dollars come from the oracle the Comptroller itself reads, never a price API — with one caveat surfaced rather than hidden: three markets are priced by a constant stored in that oracle with no feed behind it, and the legacy SAI market's constant sits at $14.43 for a token that targets a dollar. Nothing keys on a token symbol, because symbols collide: twenty markets carry eighteen distinct ones, two different markets both answer \"cDAI\", and the legacy SAI token itself reports the string \"DAI\" — so only a cToken address identifies a market. The position explorer replays the other side of that stillness: six years of account history — 3.83M events, 26,639 liquidations across 5,864 borrowers, the deepest liquidation record on the roster — proven wei-exact against the chain per market, with each account's live standing read from the Comptroller itself. The present is quiet; the history is why the explorer exists.",
  dolomite:
    "Dolomite is a fork of dYdX's Solo Margin, and its grain is the contract's own: a position is an (owner, account number) pair — cross-margined within an account number, isolated across them — so that is what a page is. The core has no borrow action; a negative balance IS debt, and every balance is replayed from the emitted after-state rather than summed from deltas, which is why the whole book proves wei-exact against the contract's own totals with no exclusions. The margin line is the protocol's own arithmetic re-derived exactly: a global 117.65% minimum, per-market premiums applied multiplicatively (WLFI's effective requirement is 150.0%), and an on-chain override that gives ETH-and-LST pair accounts a 111.11% line with premiums skipped — the explorer reads that override per account rather than asserting the ladder as universal. On mainnet Dolomite is in practice WLFI Markets — USD1 and WLFI dominate the book — and the pages state what is there without editorialising. Liquidations carry four named legs each, and the two that tell the story are valued at the core's own oracle price read back at the block the seizure fired in, beside the liquidation spread the core set for that exact pair of markets at that same block — the engine sizes every seizure from that constant, so the realized premium landing on it is the check that the arithmetic shown is the arithmetic the engine ran.",
  morpho:
    "Each Morpho Blue market measures everything in one token: the loan token it was created with (USDC, for example). Debt is simply a count of that token, and the market's own oracle prices the collateral in it too — the protocol never states a dollar value anywhere. So the explorer doesn't either: showing USD would add an assumption the contracts never make, that the loan token itself is worth $1. Two more limits are the protocol's rather than the roadmap's. Blue keeps no market-wide collateral total — collateral is per-position state, so a market's loan-to-value is a fact about each borrower and not about the market, and there is no such figure to plot; what a market can state about its own shape is how much of what was supplied is currently borrowed. And a market's totals are its last-settled balance rather than its balance now: Blue accrues interest only when someone touches a market, so a market left alone carries the figures from the block it was last touched, and the explorer shows them as they are stored with the current rate beside them. Projecting them forward would be the explorer's arithmetic rather than the protocol's record, and on markets untouched for months at rates the adaptive curve has driven into the hundreds of percent, that arithmetic is the loudest number on the page.",
  fx: "f(x) socializes funding, rebalances and liquidations across whole ticks without emitting per-position events. The explorer reads exact current state from the pool's own views, reconciles the socialized share explicitly, and replays tick lineage to place each tick rebalance on the timelines it touched — but those amounts are the whole tick's clear: no log states a single position's slice.",
  pwn: "PWN loans are peer-to-peer on fixed terms: the parties set the price, so there is no protocol oracle, no health factor, and no liquidation — an expired loan defaults and the lender claims the collateral. Those surfaces aren't missing; they don't exist in the protocol.",
  polaris:
    "Polaris runs on the Sepolia testnet, and every figure this explorer shows is a testnet figure: the pETH, USDp and GOLDp here are test tokens, the ETH/USD and gold prices come from the protocol's own testnet medianisers, and none of it is money. What the explorer states about the protocol's shape is real, though. A position is a CDP NFT in one of two markets — USDp tracks the dollar, GOLDp tracks gold — and both mint against a single collateral, pETH, the protocol's bonding-curve wrapper of ETH; a transfer of the NFT moves custody of the position without opening or closing anything, and the card names the current holder from the last such transfer. Interest is algorithmic: the market sets a primary rate on nearly every touch and adds a utilisation-driven secondary rate, so no holder ever chose a rate and no event carries one as a choice — the rate in force at each touch is stated as a fact of the row instead. A CDP's debt also moves without the holder acting: interest is charged into it at each touch, stability-pool rewards are credited against it, and the PSM's mints and redemptions are shared across every CDP as a pro-rata adjustment to both collateral and debt — every such leg is stated on the event that carried it and summed on the position's economics. Two things the protocol has are not shown yet: the reserve loans against fpETH, which the index captures but no page renders, and the stability-pool deposits, which are positions of their own kind. Since 6 September 2026 every CDP touch's own block is also read for the market's own price feed — a Sepolia lane's previewPrice() at the end of that block, the same six-call read the protocol's own mint math uses — so an ordinary row states pETH's price at its own block as a footnote, matching the PSM's own mint logs exactly except on the rare block where another user's bonding-curve write landed after the touch. The listing states a collateral ratio as an approximation, marked with a ≈: each row's last stated collateral and debt priced at the market's own feed as of one read of the market board taken when the page loaded, never a read per CDP — a CDP's own page states the contract's own getICR instead, which also carries the interest and PSM share that settle only at the next touch. Since 11 September 2026 an open CDP's page also states the window between its own last touch and the chain head, split into the only two things that can have moved it: the market's own feed, against the collateral the CDP stated at that touch, and the protocol's own pending legs — interest, the stability gain, the pETH reward and the CDP's share of every PSM mint and redemption since — valued at the feed now. The two add up to the whole change in the CDP's equity at the feed, and they can be stated as facts rather than as a choice precisely because the holder did nothing inside that window: a CDP's stated collateral and debt do not move between its own touches, so there is no basis to pick and nothing to call a profit. A wider window would need a price for the holder's own deposits, which is a decision rather than a fact, and no surface here makes it. A search that names a holder states that wallet's own CDPs at a glance above the cards — how many it holds open, closed and liquidated, all the pETH they hold and what their debts come to in one unit, and which of them sits closest to its market's minimum — and never a ratio for the wallet, because liquidation happens per CDP and an average of several would read as safety no CDP has.",
  makerdao:
    "LockStake urns that ever borrow appear here as vaults (attributed through the engine's own owner record — decision 0013). What stays out is out by nature: pure staking urns carry no debt to explore, and the PSM/RWA singletons are protocol-owned plumbing, not user positions.",
  maple:
    "Maple's share price is on-chain bookkeeping of an off-chain loan book: the chain proves what the contracts recorded — principal deployed, a posted interest rate, the delegate's impairment marks — not that the loans' custodied collateral (BitGo/Copper/Anchorage/Hex Trust, tri-party) exists. Impairments are a delegate judgment posted on-chain, and withdrawals travel a delegate-operated queue. The explorer shows what a lender actually reaches: the liquid buffer versus the deployed book, live, with the caveat on every receipt.",
};
