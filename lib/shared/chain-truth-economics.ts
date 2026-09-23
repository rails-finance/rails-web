// Shared economics-tower contract for the chain-state tier (MakerDAO, Morpho,
// Spark). One normalized shape each protocol's settle logic emits, rendered by
// the single <ChainTruthTower>. Keeps the faithful primitive — principal vs accrued
// interest, which is SAME-TOKEN and therefore stackable with no price — central,
// so the three explorers can't drift apart.
//
// Two modes, because the tier is uneven on pricing:
//   • `valued` (USD)  — every line carries a USD value (Maker has the OSM price),
//     so collateral and debt stack into one comparable dual tower.
//   • token (amounts) — no oracle at this tier (Morpho / Spark), so each side is
//     drawn in its own token units; the two towers are NOT height-comparable and
//     the component labels them so.
// The accrued-interest segment is gated on a chain-state current balance: absent
// → it renders as an explicit "needs the live index" placeholder, never silently
// dropped (the don't-mislead rule of the chain-truth charter).

import type { Provenance, ProvKind } from "@/components/shared/provenance";

/** One valued line in a tower side — a token amount, its USD value when
 *  priceable, and the provenance that traces it back to the chain. */
export interface TowerLine {
  key: string;
  symbol: string;
  /** Token units (always present). */
  amount: number;
  /** USD value when the protocol can price it; null in amounts-only tiers. */
  usd: number | null;
  /** The token's own contract address, where the feeder holds it.
   *
   *  The icon chip resolves a mark from (chain, address). Handed only a symbol
   *  it has to find the address in the hand-kept table in
   *  lib/shared/token-addresses.ts, which by construction cannot name the
   *  assets of a permissionless market — so an unlisted asset reaches neither
   *  CDN and the tower draws its initial letter. A feeder over a curated
   *  roster gains nothing by setting this (the table already names its
   *  symbols) and may leave it undefined; one over an open market set should
   *  carry it, because there a symbol identifies nothing in particular — two
   *  markets can both call a different contract "USDC". */
  address?: string;
  prov: Provenance;
  /** Legend caption override for a FLOW line (exited / liquidated buckets),
   *  where the side's default ("Withdrawn"/"Repaid"/"Liquidated") misnames the
   *  mechanic — e.g. Liquity redemptions, which are involuntary but not
   *  liquidations. Ignored on `current` lines (those caption by symbol). */
  flowLabel?: string;
  /** Mechanic tag for a FLOW line that the side's default hatch would misname
   *  visually: both values draw the shared pink checker (another party's act
   *  on the position) instead of the bucket's liquidation/exit pattern.
   *  `"redeemed"` is the leg an actual redemption moved (Liquity V2, and a
   *  Polaris PSM redemption-share outflow — both are literally a redemption's
   *  leg). `"external"` is the same mechanic where "redeemed" would misname
   *  the direction (a Polaris PSM mint-share INFLOW is another party's act
   *  too, but it is a mint, not a redemption). Ignored on `current` lines. */
  flowKind?: "redeemed" | "external";
}

/** One side of the tower (collateral or debt) as faithful, attributable lines. */
export interface TowerSideData {
  /** Solid "held now" lines — collateral held / debt principal. */
  current: TowerLine[];
  /** Accrued interest / stability fee (debt side only). Present → chain-state
   *  current debt was available and the principal/interest split is real;
   *  null/absent → gated, the component shows `interestNote` instead. */
  interest?: TowerLine | null;
  /** Hatched reverse-diagonal (╲) — voluntary exits (withdrawn / repaid). */
  exited: TowerLine[];
  /** Inflow that is NOT a fresh deposit — an account-to-account position move
   *  received from elsewhere (CV3 collateral transferAsset). Rendered as a
   *  "+ <flowLabel>" line beneath the all-time inflow and added to the faded
   *  inflow reference bar, so `Deposited (all time)` stays true to real
   *  supplies. Optional: only feeders with custody-transfer semantics set it. */
  received?: TowerLine[];
  /** Hatched forward-diagonal (╱) — involuntary (liquidated). */
  liquidated: TowerLine[];
  /** Lifetime gross inflow magnitude for the faded side bar (Σ deposited /
   *  Σ borrowed), in this side's scalar (USD when valued, else token amount). */
  lifetimeInflow: number;
  /** DEBT SIDE ONLY: further accrual breakdown rows sitting beside `interest`
   *  (Liquity V2's upfront + delegate fees) — the FEE_SOLID swatch, indented
   *  under Accrued interest, so a reader sees the full cost-of-carry
   *  decomposition. Not stacked into the bar (their value is already inside
   *  `current`/`interest`, same non-double-counting rule as `received`).
   *  Feeders that never set this render identically to today. */
  costs?: TowerLine[];
  /** COLLATERAL SIDE ONLY: a solid segment beside `current` for collateral
   *  the owner can still withdraw but that isn't the position's live balance
   *  — Liquity V2's liquidation-surplus claim. Always visible (never gated by
   *  the "Hide inactive / repaid" toggle, like `current`). Feeders that never
   *  set this render identically to today. */
  claimable?: TowerLine[];
  /** EITHER SIDE: growth with no event behind it — the gap between what the
   *  side's events record (`current`) and its state read at head, where that
   *  gap adds (a stability-pool deposit's pending gains). A lighter solid
   *  segment above `current` and one "+" row per line, captioned by
   *  `flowLabel`; it joins the held total. `interest` is the debt side's
   *  single-line form of the same gap. Decision 0022. Feeders that never set
   *  this render identically to today. */
  eventlessGains?: TowerLine[];
  /** EITHER SIDE: the same gap where it takes away (a deposit burned by
   *  liquidations since its last touch), in the side's own token. Carved out
   *  of `current`'s segment into a hatched one above it, one "−" row per line;
   *  the held total is `current` less these. Decision 0022. */
  eventlessLosses?: TowerLine[];
  /** Draw this side as one bar per entry, each a side of its own in ONE token,
   *  scaled to its own base in token mode (a deposit's paid-in side: the
   *  collateral and the yield it was paid). When set, the side's own lines stay
   *  empty. Decision 0022. */
  bars?: TowerSideData[];
}

export interface ChainTruthTowerData {
  /** USD-stacked dual tower (Maker) vs per-token amounts (Morpho / Spark). */
  valued: boolean;
  /** Provenance of the USD price backing a `valued` tower — `chain-derived` when
   *  it's the protocol's own on-chain oracle (Maker's OSM), `offchain` when it's a
   *  market-price cache. Undefined in token mode (no price). Declarative: each
   *  feeder asserts what backs its bars (the per-total guard convention the
   *  tower's USD-hint receipts lean on); nothing branches on it at render. */
  priceKind?: ProvKind;
  collateral: TowerSideData;
  debt: TowerSideData;
  /** Token-mode unit labels (e.g. collateral "WBTC", debt "USDC"). */
  collateralUnit?: string;
  debtUnit?: string;
  /** What each SIDE is, in the feeder's own words. Purely additive: unset, the
   *  tower says "Collateral" and "Current debt" exactly as it always has, so
   *  every feeder that does not set them renders byte-identically.
   *
   *  A feeder sets them where the two slots are not a borrow position at all.
   *  The vault-position tower is the case they exist for: its left side is the
   *  ASSETS a holder put in and can claim, its right side the SHARES that are
   *  the exact, gated ledger of it — and calling that right side "Current debt"
   *  would name a mechanic the position does not have. The words appear on the
   *  side's result row, on its empty-side placeholder, and (unless the list
   *  labels below override them) as the gated list's column headings. */
  collateralTitle?: string;
  debtTitle?: string;
  /** The caption on each side's all-time inflow row, default "Deposited" and
   *  "Borrowed". Same rule: unset changes nothing. A side whose inflow is not
   *  a borrow ("Minted", on a share ledger) names its own mechanic here rather
   *  than wearing the debt side's word. */
  collateralInflowLabel?: string;
  debtInflowLabel?: string;
  /** Caption shown beneath the debt tower when the interest split is gated off
   *  (no chain-state current debt) — e.g. "accrued interest needs the live
   *  market index". */
  interestNote?: string;
  /** Legend caption for the interest segment (default "Accrued interest").
   *  A feeder whose eventless debt growth is not interest names its own
   *  mechanic instead — f(x)'s socialized lane rides this segment and labels
   *  it "Socialized accrual". */
  interestLabel?: string;
  /** Why lifetime flows are absent, shown (as the "No lifetime flows" note's
   *  tooltip) when the bars render but neither side carries flows. A feeder sets
   *  this when it knows the reason — capture doesn't reach the position's open,
   *  or the explorer doesn't replay history yet; the tower has a generic
   *  doesn't-reconcile default. */
  flowsNote?: string;
  /** Column header for the gated (no-bars) collateral list. Defaults to
   *  "Collateral". A protocol overrides it when the amounts shown aren't bare
   *  principal — e.g. Comet's chain overlay lists a value WITH interest. */
  collateralListLabel?: string;
  /** Column header for the gated (no-bars) debt list. Defaults to
   *  "Debt · principal". Overridden when the listed amount isn't principal (e.g.
   *  Comet's current value incl. interest from the live Comet index). */
  debtListLabel?: string;
  /** GATED LIST ONLY: the protocol has no debt axis at all for this position
   *  kind (a lender-side explorer — Maple) — the list renders the claim side
   *  alone instead of an empty "Debt · principal — None" column, which would
   *  assert a borrowable axis the protocol never offers here. Bar mode ignores
   *  it (a debt-side figure forces bar mode, so the two can't meet). */
  debtAxisAbsent?: boolean;
}

/** The scalar a tower stacks by: USD when valued, else the token amount. */
export const lineScalar = (l: TowerLine, valued: boolean): number => (valued ? (l.usd ?? 0) : l.amount);

/** Whether replayed lifetime flows reconcile to the current chain-state balance.
 *  Lifetime flows are only chain-state if the captured event history is COMPLETE
 *  from the position's genesis — net(inflow − outflow) must equal the current
 *  state. When it doesn't (e.g. an old vault whose events the index didn't
 *  capture back to open), the flows aren't really "all time", so the settle
 *  logic must suppress them rather than mislabel a partial window. 1% tolerance absorbs
 *  rounding; an incomplete capture is off by orders of magnitude.
 *
 *  `gross` is the summed magnitude of the flows behind `net` (inflows +
 *  outflows). On a closed position `current` is 0 and `net` is a difference of
 *  large float sums, so the relative term vanishes while the float error scales
 *  with the SUMS — a gross-scaled epsilon (1e-9 relative, far above float-64
 *  accumulation noise, far below any real capture gap) keeps a genuinely
 *  complete terminal history from failing on arithmetic dust. */
export const flowsReconcile = (net: number, current: number, gross = 0): boolean => {
  const tol = Math.max(Math.abs(current), Math.abs(net)) * 0.01 + gross * 1e-9 + 1e-9;
  return Math.abs(net - current) <= tol;
};
