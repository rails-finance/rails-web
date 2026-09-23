// Frankencoin positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/frankencoin/positions) does the structural work
// — filter, sort, paginate over the reduced per-position state at the POSITION
// grain (the Position contract address IS the key) — and returns the page
// slice as raw rows: the latest MintingUpdate absolutes (collateral / price /
// minted — each equal to the position's stored state at its block), the
// reduced lifecycle status, the challenge tallies, and identity (event-time
// owner, honored through OwnershipTransferred; clone lineage via `original`).
//
// UNITS ARE NATIVE: minted is ZCHF, collateral is the position's own token,
// the price is ZCHF per whole token (raw stored at 1e(36 − decimals)). NO USD
// exists on these rows — Frankencoin runs no oracle, and none is invented.
//
// STATUS IS TWO-AXIS: `status` is the REPLAYED lifecycle (open / closed /
// denied — the API's whole vocabulary), and the challenge tallies are the
// orthogonal flag — a challenged position can survive (ChallengeAverted, or a
// partial ChallengeSucceeded that left it standing), so `challengeCount > 0`
// on an OPEN row is a real state.
//
// ⚠️ EXPIRATION DOES NOT EXIST HERE. It is a constructor fact no event
// carries, and the serving tier is zero-RPC — the chain overlay is the SOLE
// source of expiration/cooldown/isClosed. Likewise the replayed status can
// disagree with head on edge positions (measured: 3 of 218 — two no-ledger
// positions read closed while open on chain; one reads open on a 1-wei
// forced-sale remainder while isClosed() at head) — the detail page is
// chain-first and never asserts index-status == chain-status.

export type FrankencoinPositionStatus = "open" | "closed" | "denied";
// Mirrors the rails route's sortBy allowlist (route-only — no migration,
// mv_frankencoin_positions already carries minted/collateral/price). Prior
// "lastActivity" shape had no caller (nothing forwarded sortBy on the wire) —
// this is a rename to the URL grammar FRANKENCOIN_LIST_DEFAULTS already uses
// ("recent"), not a widening.
export type FrankencoinPositionSort = "recent" | "debt" | "coll";

export interface FrankencoinPositionSummary {
  /** Lowercased Position contract address — the grain and the page key. */
  position: string;
  hub: "v1" | "v2";
  /** Current owner as the index replays it (event-time, transfer-honored). */
  owner: string;
  original: string | null;
  isClone: boolean;
  collateralToken: string;
  collateralSymbol: string;
  collateralDecimals: number;
  /** Latest MintingUpdate absolutes — display-scaled + raw integer twins.
   *  ⚠️ collateral NULL ≠ zero: NULL means the ledger never spoke (two live
   *  positions hold direct-transferred collateral invisible to events; the
   *  chain overlay corrects at head). Rendered as a dash, never as 0. */
  collateral: number | null;
  collateralRaw: string | null;
  minted: number;
  mintedRaw: string;
  /** Owner-declared liquidation price, ZCHF per whole token. */
  liqPrice: number | null;
  priceRaw: string | null;
  /** Lifetime peaks over the MintingUpdate ledger — the headline of a closed
   *  card (its latest absolutes are back at zero). Null when the backend
   *  doesn't carry them. */
  peakCollateral: number | null;
  peakMinted: number | null;
  status: FrankencoinPositionStatus;
  /** The orthogonal challenge axis. */
  challengeCount: number;
  challengeSucceededCount: number;
  everChallenged: boolean;
  everChallengeSucceeded: boolean;
  everForcedSale: boolean;
  openedAt: number | null;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  eventCount: number;
  txCount: number;
}

/** One position's page-slice row from the rails route (pre-presentation).
 *  numeric/bigint columns arrive as strings from pg. */
export interface RawFrankencoinPositionRow {
  position: string;
  hub_version: string;
  owner: string;
  original: string | null;
  collateral_token: string;
  collateral_symbol: string | null;
  collateral_decimals: number | null;
  /** Latest MintingUpdate absolutes (raw integer strings). */
  collateral_raw: string | null;
  minted_raw: string | null;
  price_raw: string | null;
  /** Lifetime maxima over the ledger (closed-card headlines). */
  peak_collateral_raw?: string | null;
  peak_minted_raw?: string | null;
  /** open | closed | denied — the API's whole status vocabulary (there is no
   *  `expired`: expiration is not an event fact and the serving tier is
   *  zero-RPC). */
  status: string;
  challenge_count: number | null;
  challenge_succeeded_count: number | null;
  opened_at: number | string | null;
  last_activity_at: number | string;
  last_block_number: number | string;
  last_tx_hash: string | null;
  event_count: number | string | null;
  tx_count: number | string | null;
  // ── shipped extras (optional; consumed where the UI has a surface) ────────
  hub?: string;
  owner_at_open?: string | null;
  is_clone?: boolean | null;
  denied_at?: number | string | null;
  denied_message?: string | null;
  challenge_averted_count?: number | null;
  ever_challenge_succeeded?: boolean | null;
  ever_forced_sale?: boolean | null;
  last_challenge_at?: number | string | null;
  succeeded_slice_count?: number | null;
  collateral_auctioned_raw?: string | null;
  auction_proceeds_zchf_raw?: string | null;
  forced_sale_count?: number | null;
  collateral_force_sold_raw?: string | null;
  opened_block?: number | string | null;
  opened_tx_hash?: string | null;
  state_at?: number | string | null;
  state_block?: number | string | null;
  state_tx_hash?: string | null;
  minting_update_count?: number | null;
}

const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

function scale(raw: bigint, decimals: number): number {
  if (raw === ZERO) return 0;
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return neg ? -Number(a) : Number(a);
  const div = BigInt("1" + "0".repeat(decimals));
  const v = Number(a / div) + Number(a % div) / Number(div);
  return neg ? -v : v;
}

const intOf = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function statusOf(s: string): FrankencoinPositionStatus {
  return s === "open" || s === "denied" ? s : "closed";
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side — order is preserved.
 *  Rows whose collateral identity is missing degrade to a truncated address +
 *  raw integers (scaling by a guessed decimals would mis-state a decimals=0
 *  token by 1e18) rather than mis-scale. */
export function buildFrankencoinPositionRows(raw: RawFrankencoinPositionRow[]): FrankencoinPositionSummary[] {
  return raw.map((r) => {
    const position = r.position.toLowerCase();
    const original = r.original ? r.original.toLowerCase() : null;
    const symbol = r.collateral_symbol ?? `${r.collateral_token.slice(0, 6)}…${r.collateral_token.slice(-4)}`;
    // No identity → RAW integers (decimals 0), never a guessed scale.
    const decimals = r.collateral_decimals ?? 0;
    // NULL collateral means the ledger never spoke — NOT zero (two live
    // positions hold direct-transferred collateral invisible to events; the
    // chain overlay corrects at head). Preserved as null → rendered a dash.
    const ledgerSpoke = r.collateral_raw != null && r.collateral_raw !== "";
    const collateralRaw = ledgerSpoke ? bigintOf(r.collateral_raw) : null;
    const mintedRaw = bigintOf(r.minted_raw);
    const priceRaw = r.price_raw != null && r.price_raw !== "" ? bigintOf(r.price_raw) : null;
    const challengeCount = intOf(r.challenge_count);

    return {
      position,
      // The wire spells it "V1"/"V2" — normalize case, never string-match one
      // spelling (a mismatch silently relabels every V1 row as v2).
      hub: String(r.hub_version).toLowerCase() === "v1" ? "v1" : "v2",
      owner: r.owner.toLowerCase(),
      original,
      isClone: original != null && original !== position,
      collateralToken: r.collateral_token.toLowerCase(),
      collateralSymbol: symbol,
      collateralDecimals: decimals,
      collateral: collateralRaw != null ? scale(collateralRaw, decimals) : null,
      collateralRaw: collateralRaw != null ? collateralRaw.toString() : null,
      minted: scale(mintedRaw, 18),
      mintedRaw: mintedRaw.toString(),
      // price is stored at 1e(36 − decimals); with unknown decimals the raw
      // figure still travels, but no scaled price is asserted.
      liqPrice: priceRaw != null && r.collateral_decimals != null ? scale(priceRaw, 36 - decimals) : null,
      priceRaw: priceRaw != null ? priceRaw.toString() : null,
      peakCollateral: r.peak_collateral_raw != null ? scale(bigintOf(r.peak_collateral_raw), decimals) : null,
      peakMinted: r.peak_minted_raw != null ? scale(bigintOf(r.peak_minted_raw), 18) : null,
      status: statusOf(r.status),
      challengeCount,
      challengeSucceededCount: intOf(r.challenge_succeeded_count),
      everChallenged: challengeCount > 0,
      everChallengeSucceeded: r.ever_challenge_succeeded ?? intOf(r.challenge_succeeded_count) > 0,
      everForcedSale: r.ever_forced_sale ?? false,
      openedAt: r.opened_at != null ? intOf(r.opened_at) : null,
      lastActivityAt: intOf(r.last_activity_at),
      lastBlockNumber: intOf(r.last_block_number),
      lastTxHash: r.last_tx_hash,
      eventCount: intOf(r.event_count),
      txCount: intOf(r.tx_count),
    };
  });
}
