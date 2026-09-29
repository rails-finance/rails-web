// MakerDAO vault timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/makerdao/vault/:id/timeline) returns the
// frob/grab deltas (dink/dart) in block order, each with the urn's running
// ink/art after it, plus the vault meta. This builder takes each row's balance
// from those served columns and shapes each BaseActivityEvent +
// MakerDAOContext. It never adds the deltas up: under a `?recent` window the
// first row sits mid-history, and a sum from zero there is short by the
// balance at the cut. A row without the columns states "Not loaded".

import { ilkToCollateralSymbol, ilkDebtMeta } from "@/lib/makerdao/asset-catalog";
import type { BaseActivityEvent, AssetFlow, MakerDAOContext, MakerDAOEventType } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface MakerTimelineResult {
  cdpId: string | null;
  urn: string | null;
  ilk: string | null;
  collateralSymbol: string | null;
  owner: string | null;
  /** LockStake Engine urn (decision 0013) — cdp-less, USDS debt. */
  lse: boolean;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history. */
  cutoffBlock?: number | null;
}

const WAD = BigInt(10) ** BigInt(18);
const ZERO = BigInt(0);

/** One raw delta row from the rails timeline route. `fork-out` / `fork-in` are
 *  the two sides of a Vat.fork (mig 095) — the position moved between urns with
 *  no tokens transferred; deltas are pre-signed for this urn's replay. `give`
 *  (mig 097) is a CdpManager ownership transfer — a zero-delta row carrying the
 *  transfer parties instead. `lse-kick` / `lse-take` / `lse-remove` (mig 104)
 *  are the LockStake auction lifecycle — zero-delta markers whose balance
 *  effect rides the paired grab. */
export interface RawMakerTimelineRow {
  // The index's own row identity, unique by construction. OPTIONAL because the
  // backend deploys separately: a response from before it, or a cached one,
  // simply has no key and the id falls back to its former shape.
  event_key?: string;
  src: "frob" | "grab" | "fork-out" | "fork-in" | "give" | "lse-kick" | "lse-take" | "lse-remove";
  ilk: string;
  dink: string;
  dart: string;
  /** The urn's running ink / art after this row (Vat wad), from the served
   *  view. Optional: a response from before the route sent them has none, and
   *  the row's balances then read "Not loaded". */
  ink_after?: string | null;
  art_after?: string | null;
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_timestamp: string | null;
  /** Vat rate accumulator (ray, 1e27) as-of this event's block — added by the
   *  events-MV `rate_at_block` column (`1e27 + Σ maker_fold.rate_delta`). Absent
   *  on older payloads / before the column lands; passed straight through. */
  rate_at_block?: string | null;
  /** The rate accumulator at the urn's previous row (ray): the route reads it
   *  from the row above, or for a read's first row from the urn's last row
   *  below the read. Null on the urn's first row and on older payloads. */
  prev_rate_at_block?: string | null;
  /** Third-party-action facts (the tx signer + the tx entry contract), set
   *  ONLY on two-fact external frobs — the route ships them exactly when both
   *  differ from the owner (and tx_to from the vault's proxy); NULL otherwise. */
  tx_from?: string | null;
  tx_to?: string | null;
  /** The owner IN FORCE at this event's block (era-aware) — present exactly
   *  when the marking facts are; the receipt names it. */
  owner_at?: string | null;
  /** give rows only: the transfer's dst (new holder, often a DSProxy), its
   *  DSProxy-hop resolution (head read; null when the hop failed), and the
   *  give's LogNote caller. */
  give_dst?: string | null;
  give_dst_owner?: string | null;
  give_caller?: string | null;
  /** The ilk's own OSM price at this event's block (maker_historic_prices,
   *  mig 111: Vat spot × Spotter mat) — non-NULL only on priced grab blocks. */
  price_usd?: string | null;
  price_source?: string | null;
  /** On a grouped or span answer: whether this is the vault's first row. The
   *  route states it, since a grouped answer's first event row need not be. */
  is_open?: boolean;
}

/** The rails timeline response envelope. */
export interface RawMakerTimelineResponse {
  cdpId: string | null;
  urn: string | null;
  ilk: string | null;
  owner: string | null;
  /** LockStake Engine urn marker (mig 104). Absent on pre-104 payloads. */
  lse?: boolean;
  lseIndex?: string | null;
  rows: RawMakerTimelineRow[];
  totalEvents: number;
  /** Where `?recent=N` drew the line. Null (or absent) means the rows ARE the
   *  whole history. */
  cutoffBlock?: number | null;
}

function fmtWad(bi: bigint): string {
  const neg = bi < ZERO;
  const a = neg ? -bi : bi;
  const whole = (a / WAD).toString();
  const frac = (a % WAD).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

const numWad = (bi: bigint): number => Number(bi) / 1e18;

const RAY = BigInt(10) ** BigInt(27);

/** What the Vat says the vault owes: art (wad) × rate (ray) ÷ 1e27, in wad. */
const owed = (art: bigint, rate: bigint): bigint => (art * rate) / RAY;

/** The row's debt in the debt token (DAI, or USDS on a LockStake urn): after
 *  the event, the change it made, and the stability fee accrued since the
 *  urn's previous row. Every figure is art × rate at a block, so it matches
 *  `Vat.urns(ilk, urn).art × Vat.ilks(ilk).rate` read there. `interest` is
 *  the debt just before this event (art before × this block's rate) less the
 *  debt just after the previous row (the same art × that row's rate); it is
 *  absent where the previous rate is unknown or no fee accrued. */
function debtFigures(
  artAfter: bigint | null,
  dart: bigint,
  rateRay: string | null | undefined,
  prevRateRay: string | null | undefined,
): { debtAfter?: string; debtChange?: string; interestSincePrevious?: string } {
  if (artAfter == null || rateRay == null) return {};
  const rate = BigInt(rateRay);
  if (rate <= ZERO) return {};
  const artBefore = artAfter - dart;
  const out: { debtAfter?: string; debtChange?: string; interestSincePrevious?: string } = {
    debtAfter: fmtWad(owed(artAfter, rate)),
    debtChange: fmtWad(owed(artAfter, rate) - owed(artBefore, rate)),
  };
  if (prevRateRay != null && artBefore > ZERO) {
    const interest = owed(artBefore, rate) - owed(artBefore, BigInt(prevRateRay));
    if (interest !== ZERO) out.interestSincePrevious = fmtWad(interest);
  }
  return out;
}

function labelFor(
  eventType: MakerDAOEventType,
  dink: bigint,
  dart: bigint,
  isOpen: boolean,
  debtSymbol: string,
): { actionType: string; actionLabel: string } {
  if (eventType === "grab") return { actionType: "grab", actionLabel: "Liquidated" };
  // A fork moves the position (collateral AND debt together) between urns —
  // no tokens reach or leave the wallet, so neither side is a deposit/withdraw.
  if (eventType === "fork-out") return { actionType: "fork", actionLabel: "Move to Another Vault" };
  if (eventType === "fork-in") return { actionType: "fork", actionLabel: "Move from Another Vault" };
  // A give re-homes the vault in the CdpManager's owner record — nothing in
  // the urn moves, so no deposit/withdraw/repay reading applies.
  if (eventType === "give") return { actionType: "give", actionLabel: "Ownership Transferred" };
  // LockStake auction lifecycle (mig 104): zero-delta markers — the seizure's
  // balance effect is the paired grab row. Never observed yet (zero LSE
  // liquidations); wired so a first one renders without a code change.
  if (eventType === "lse-kick") return { actionType: "lse-liq", actionLabel: "Auction Started" };
  if (eventType === "lse-take") return { actionType: "lse-liq", actionLabel: "Auction Sale" };
  if (eventType === "lse-remove") return { actionType: "lse-liq", actionLabel: "Auction Settled" };
  if (isOpen) return { actionType: "frob", actionLabel: "Open Vault" };
  const collIn = dink > ZERO;
  const collOut = dink < ZERO;
  const debtUp = dart > ZERO;
  const debtDown = dart < ZERO;
  let label = "Adjust Vault";
  if (collIn && debtUp) label = "Deposit & Generate";
  else if (collIn && debtDown) label = "Deposit & Repay";
  else if (collOut && debtUp) label = "Withdraw & Generate";
  else if (collOut && debtDown) label = "Repay & Withdraw";
  else if (collIn) label = "Deposit";
  else if (collOut) label = "Withdraw";
  else if (debtUp) label = `Generate ${debtSymbol}`;
  else if (debtDown) label = `Repay ${debtSymbol}`;
  return { actionType: "frob", actionLabel: label };
}

function flowsFor(dink: bigint, dart: bigint, collateralSymbol: string, ilk: string): AssetFlow[] {
  const flows: AssetFlow[] = [];
  if (dink !== ZERO) {
    const mag = dink < ZERO ? -dink : dink;
    flows.push({
      token: "",
      tokenSymbol: collateralSymbol,
      tokenDecimals: 18,
      amount: mag.toString(),
      amountFormatted: numWad(mag),
      direction: dink > ZERO ? "in" : "out",
    });
  }
  if (dart !== ZERO) {
    // DAI for CdpManager vaults, USDS for LockStake urns — same Vat unit,
    // different join mints the ERC-20 (asset-catalog ilkDebtMeta).
    const debt = ilkDebtMeta(ilk);
    const mag = dart < ZERO ? -dart : dart;
    flows.push({
      token: debt.address,
      tokenSymbol: debt.symbol,
      tokenDecimals: debt.decimals,
      amount: mag.toString(),
      amountFormatted: numWad(mag),
      direction: dart > ZERO ? "out" : "in",
    });
  }
  return flows;
}

/** The at-block OSM price → ctx shape; undefined keeps the event token-only
 *  (unpriced block, or a non-grab row the filler never targets). */
function priceOf(
  usd: string | null | undefined,
  source: string | null | undefined,
): { usd: number; source: "maker-spotter" } | undefined {
  if (usd == null || source !== "maker-spotter") return undefined;
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? { usd: n, source } : undefined;
}

/** Build the vault timeline from the rails route's raw delta rows. */
export function buildMakerTimeline(resp: RawMakerTimelineResponse): MakerTimelineResult {
  const urn = resp.urn;
  if (!urn) {
    return {
      cdpId: null,
      urn: null,
      ilk: null,
      collateralSymbol: null,
      owner: null,
      lse: false,
      events: [],
      totalEvents: 0,
    };
  }
  const lse = resp.lse ?? false;
  const ilk = resp.ilk ?? resp.rows[0]?.ilk ?? null;
  const collateralSymbol = ilk ? ilkToCollateralSymbol(ilk) : null;
  const cdpId = resp.cdpId ?? null;
  const owner = resp.owner ?? null;
  const wallet = (owner ?? urn).toLowerCase();

  // A window's first row is not the vault's first.
  const wholeHistory = resp.cutoffBlock == null;
  const events: BaseActivityEvent[] = resp.rows.map((r, idx) => {
    const dink = BigInt(r.dink);
    const dart = BigInt(r.dart);
    const eventType: MakerDAOEventType = r.src;
    const isOpen = (r.is_open ?? (wholeHistory && idx === 0)) && eventType === "frob";
    const { actionType, actionLabel } = labelFor(eventType, dink, dart, isOpen, ilkDebtMeta(r.ilk).symbol);
    const sym = collateralSymbol ?? ilkToCollateralSymbol(r.ilk);

    const context: MakerDAOContext = {
      eventType,
      ilk: r.ilk,
      collateralSymbol: sym,
      urn,
      cdpId: cdpId ?? undefined,
      dink: fmtWad(dink),
      dart: fmtWad(dart),
      inkAfter: r.ink_after != null ? fmtWad(BigInt(r.ink_after)) : undefined,
      artAfter: r.art_after != null ? fmtWad(BigInt(r.art_after)) : undefined,
      rateAtBlock: r.rate_at_block ?? undefined,
      ...debtFigures(r.art_after != null ? BigInt(r.art_after) : null, dart, r.rate_at_block, r.prev_rate_at_block),
      isOpen,
      // The acting parties, present only on two-fact external frobs (the
      // route pre-filters). The card derives third-party marking from these.
      // owner_at rides along: the owner the verdict was judged against
      // (era-aware — a later give may have replaced the current owner).
      ...(r.tx_from && r.tx_to
        ? {
            txFrom: r.tx_from.toLowerCase(),
            txTo: r.tx_to.toLowerCase(),
            ...(r.owner_at ? { ownerAt: r.owner_at.toLowerCase() } : {}),
          }
        : {}),
      // give rows: the transfer parties (dst / resolved new owner / caller).
      ...(r.give_dst ? { giveDst: r.give_dst.toLowerCase() } : {}),
      ...(r.give_dst_owner ? { giveDstOwner: r.give_dst_owner.toLowerCase() } : {}),
      ...(r.give_caller ? { giveCaller: r.give_caller.toLowerCase() } : {}),
      // grab rows: the ilk's own OSM price at the block (mig 111) — feeds the
      // liquidation forensics; absent until the filler prices the block.
      ...(eventType === "grab" ? { priceAtBlock: priceOf(r.price_usd, r.price_source) } : {}),
    };

    return {
      // `${txHash}:${logIndex}` is NOT unique: a Vat fork() whose src and dst
      // are the SAME urn emits a fork-in AND a fork-out row for that urn from
      // one log. `id` is the React key and the numbering key, so the index's
      // own event_key is used wherever the backend supplies it.
      id: r.event_key || `${r.tx_hash}:${r.log_index}`,
      txHash: r.tx_hash,
      blockNumber: Number(r.block_number),
      timestamp: r.block_timestamp != null ? Number(r.block_timestamp) : 0,
      wallet,
      actionType,
      actionLabel,
      flows: flowsFor(dink, dart, sym, r.ilk),
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", r.tx_hash),
      context: { protocol: "makerdao", data: context },
    };
  });

  return { cdpId, urn, ilk, collateralSymbol, owner, lse, events, totalEvents: events.length };
}
