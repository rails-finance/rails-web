// The lifetime flows of ONE vault position, fed into the shared tower.
// ----------------------------------------------------------------------------
// Two sides, both in native units, `valued: false` — there is no price at this
// tier and none is wanted (rails-ops decision `0017`: a vault surface carries
// no USD, no APY, no rate and no P&L).
//
// ── WHICH SIDE LEADS, AND WHY ───────────────────────────────────────────────
// A vault holder asks three things: what went in, what came out, what the
// shares are worth now. THE ASSET SIDE answers all three in the contract's own
// words — the `assets` word of each `Deposit` and each `Withdraw`, and
// `convertToAssets(balanceOf)` at the page's block — so it takes the tower's
// left slot, whose native captions ("Deposited (all time)", "Withdrawn")
// already fit. THE SHARE SIDE takes the right slot, retitled "Shares": it is
// the exact, gated ledger that proves the left one is whole, and the only
// place a transfer can be drawn at all, because a transfer moves shares and no
// asset. Nobody thinks in waEthUSDC shares; nobody should have to.
//
// ── WHAT THE TWO SIDES DO AND DO NOT CLAIM ──────────────────────────────────
// The SHARE side reconciles wei-exact and is asserted to: mints plus shares
// transferred in, less burns and shares transferred out, IS `balanceOf` at the
// page's block. That is the same identity the timeline's own gate checks, so
// the tower and the rows below it cannot disagree — and the tower is drawn only
// where that gate passed.
//
// The ASSET side does NOT reconcile, and nothing here says it does. Deposits
// and withdrawals are the contract's words at the blocks they happened at; the
// claim is the contract's word now. A vault's share price moves between them,
// so the two are different quantities and the difference between them is not
// drawn, not captioned and not named. It is not a rate: no read here touches
// any block between a row and the page's block, and a figure computed from two
// of them would be exactly the sampled series `0017` §6 refuses. `interest` is
// null on both sides for the same reason.
//
// NOTHING IS CONVERTED. A row with no asset leg — every plain transfer, and any
// mint or burn whose ERC-4626 event this address's leg was not emitted with —
// is COUNTED beside the side and never turned into an asset figure by
// multiplying its shares by a price.

import { flowsReconcile, type ChainTruthTowerData, type TowerLine } from "@/lib/shared/chain-truth-economics";
import type { VaultHolderEvent, VaultHolderTimeline, VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";
import {
  vaultClaimNowProv,
  vaultFlowProv,
  vaultSharesNowProv,
  type VaultFlowKind,
} from "@/lib/aave-vaults/vault-timeline-provenance";

const ZERO = BigInt(0);

export interface VaultPositionEconomicsInput {
  timeline: VaultHolderTimeline;
  coords: VaultTimelineCoords;
  /** `balanceOf(holder)` at the page's block, raw share units — the same
   *  reading the timeline's gate compared its replay against. */
  sharesRaw: string;
  /** `convertToAssets(balanceOf)` at the page's block, raw asset units. Null
   *  where the call did not answer, which leaves the asset side's current line
   *  absent rather than zero. */
  claimRaw: string | null;
  shareSymbol: string;
  shareDecimals: number;
  assetSymbol: string;
  assetDecimals: number;
  /** The vault's own address (the share token) and the asset's, for the token
   *  chips: a symbol alone leaves the mark to be guessed from a hand-kept
   *  table, and these vaults' share tokens are not in it. */
  vaultAddress: string;
  assetAddress?: string;
}

/** The counts and sums the tower and its Explanation both read. Every figure is
 *  a BigInt sum over the rows the timeline drew, scaled once at the edge — a
 *  float accumulated over four thousand rows is blind to exactly the wei-level
 *  break the gate exists to catch. */
export interface VaultPositionFlows {
  mintedShares: bigint;
  burnedShares: bigint;
  transferredInShares: bigint;
  transferredOutShares: bigint;
  depositedAssets: bigint;
  withdrawnAssets: bigint;
  counts: {
    mints: number;
    burns: number;
    transfersIn: number;
    transfersOut: number;
    /** Rows that moved shares and no asset: every transfer, either direction,
     *  and a self-transfer. */
    assetlessTransfers: number;
    /** Mints or burns whose ERC-4626 leg was not emitted for this owner — the
     *  asset word does not exist for them, so they are in the share sums and
     *  not in the asset ones, and the page says so rather than converting. */
    legless: number;
  };
}

const scale = (raw: bigint, decimals: number): number => Number(raw) / Math.pow(10, decimals);

/** Sum one holder's drawn rows into the six lifetime figures. */
export function reduceVaultPositionFlows(events: VaultHolderEvent[]): VaultPositionFlows {
  const f: VaultPositionFlows = {
    mintedShares: ZERO,
    burnedShares: ZERO,
    transferredInShares: ZERO,
    transferredOutShares: ZERO,
    depositedAssets: ZERO,
    withdrawnAssets: ZERO,
    counts: { mints: 0, burns: 0, transfersIn: 0, transfersOut: 0, assetlessTransfers: 0, legless: 0 },
  };
  for (const e of events) {
    const delta = BigInt(e.sharesDelta);
    switch (e.kind) {
      case "deposit":
        f.mintedShares += delta;
        f.counts.mints += 1;
        if (e.assets != null) f.depositedAssets += BigInt(e.assets);
        else f.counts.legless += 1;
        break;
      case "withdrawal":
        f.burnedShares -= delta;
        f.counts.burns += 1;
        if (e.assets != null) f.withdrawnAssets += BigInt(e.assets);
        else f.counts.legless += 1;
        break;
      case "transfer-in":
        f.transferredInShares += delta;
        f.counts.transfersIn += 1;
        f.counts.assetlessTransfers += 1;
        break;
      case "transfer-out":
        f.transferredOutShares -= delta;
        f.counts.transfersOut += 1;
        f.counts.assetlessTransfers += 1;
        break;
      case "transfer-self":
        f.counts.assetlessTransfers += 1;
        break;
      case "cooldown":
        break;
    }
  }
  return f;
}

/** The tower and the figures behind it. */
export interface VaultPositionEconomics {
  data: ChainTruthTowerData;
  flows: VaultPositionFlows;
}

/** The tower for one vault position, or null where none may be drawn.
 *
 *  Null on every path the timeline itself refused: a read that did not answer,
 *  a gate that did not pass, a life above what Rails stores, a life still being
 *  built into the store, and a life with no rows. The tower is a statement
 *  about a complete history, so it is drawn under exactly the condition the
 *  rows are.
 *
 *  ⚠️ `timeline.events` MUST BE THE WHOLE LIFE HERE. The loader caps what
 *  crosses to the browser at `VAULT_TIMELINE_DRAW_ROWS` and states the cap in
 *  `coverage.drawn`; the server hands this function the uncapped array
 *  (`VaultTimelineResult.allEvents`) before that slice is taken. A caller that
 *  passed the window instead would produce a tower whose bars are a slice's
 *  sums — and it would not even reconcile, because the share ledger below is
 *  asserted against `balanceOf` and a slice of a life does not add up to it.
 *  That assertion is the guard, not a comment. */
export function computeVaultPositionEconomics(input: VaultPositionEconomicsInput): VaultPositionEconomics | null {
  const { timeline, coords } = input;
  if (timeline.unread) return null;
  if (!timeline.reconcile?.reconciled) return null;
  if (timeline.coverage.withheldAbove != null) return null;
  if (timeline.history?.building) return null;
  if (timeline.events.length === 0) return null;

  const flows = reduceVaultPositionFlows(timeline.events);
  const sharesRaw = BigInt(input.sharesRaw);

  // The share ledger, asserted rather than assumed. It is the timeline gate's
  // own identity split by kind, so a build that mis-classified one row would
  // fail here and draw no tower instead of drawing a wrong one.
  const netShares = flows.mintedShares + flows.transferredInShares - flows.burnedShares - flows.transferredOutShares;
  if (netShares !== sharesRaw) return null;

  const sd = input.shareDecimals;
  const ad = input.assetDecimals;
  const sharesNow = scale(sharesRaw, sd);
  const minted = scale(flows.mintedShares, sd);
  const burned = scale(flows.burnedShares, sd);
  const inShares = scale(flows.transferredInShares, sd);
  const outShares = scale(flows.transferredOutShares, sd);
  const deposited = scale(flows.depositedAssets, ad);
  const withdrawn = scale(flows.withdrawnAssets, ad);
  const claimNow = input.claimRaw == null ? null : scale(BigInt(input.claimRaw), ad);

  // The shared contract's own float-level guard, run on the side that claims to
  // reconcile. It cannot disagree with the wei-exact check above; it is here
  // because the tower's grammar is that a side carrying flows is a side whose
  // flows reconcile, and a feeder asserts that in the shared helper's words.
  const sharesGross = minted + inShares + burned + outShares;
  if (!flowsReconcile(minted + inShares - burned - outShares, sharesNow, sharesGross)) return null;

  const line = (
    key: string,
    amount: number,
    symbol: string,
    address: string | undefined,
    kind: VaultFlowKind,
    count: number,
    flowLabel?: string,
    flowKind?: TowerLine["flowKind"],
  ): TowerLine[] =>
    amount > 0
      ? [
          {
            key,
            symbol,
            address,
            amount,
            usd: null,
            prov: vaultFlowProv(coords, kind, symbol, count),
            ...(flowLabel ? { flowLabel } : {}),
            ...(flowKind ? { flowKind } : {}),
          },
        ]
      : [];

  const data: ChainTruthTowerData = {
    valued: false,
    collateralUnit: input.assetSymbol,
    debtUnit: input.shareSymbol,
    // The two slots are not collateral and debt here, and the words say so.
    collateralTitle: "Assets",
    debtTitle: "Shares",
    collateralInflowLabel: "Deposited",
    // A share side's inflow is a mint, not a borrowing.
    debtInflowLabel: "Minted",

    // ── the assets: the contract's own words, and its own answer now ───────
    collateral: {
      current:
        claimNow != null && claimNow > 0
          ? [
              {
                key: "claim-now",
                symbol: input.assetSymbol,
                address: input.assetAddress,
                amount: claimNow,
                usd: null,
                prov: vaultClaimNowProv(coords),
              },
            ]
          : [],
      // No yield figure exists on this side and no field here could hold one.
      interest: null,
      exited: line(
        "assets-withdrawn",
        withdrawn,
        input.assetSymbol,
        input.assetAddress,
        "withdrawn",
        flows.counts.burns,
        "Withdrawn",
      ),
      liquidated: [],
      lifetimeInflow: deposited,
    },

    // ── the shares: the exact ledger, and the only place transfers live ────
    debt: {
      current:
        sharesNow > 0
          ? [
              {
                key: "shares-now",
                symbol: input.shareSymbol,
                address: input.vaultAddress,
                amount: sharesNow,
                usd: null,
                prov: vaultSharesNowProv(coords),
              },
            ]
          : [],
      interest: null,
      // Shares handed over by another holder are kept OUT of the minted bar,
      // exactly as a Comet collateral `transferAsset` is: they came into this
      // address without anything being deposited for them.
      received: line(
        "shares-in",
        inShares,
        input.shareSymbol,
        input.vaultAddress,
        "transferred-in",
        flows.counts.transfersIn,
        "Transferred in",
        "external",
      ),
      exited: [
        ...line(
          "shares-burned",
          burned,
          input.shareSymbol,
          input.vaultAddress,
          "burned",
          flows.counts.burns,
          "Withdrawn",
        ),
        ...line(
          "shares-out",
          outShares,
          input.shareSymbol,
          input.vaultAddress,
          "transferred-out",
          flows.counts.transfersOut,
          "Transferred out",
          "external",
        ),
      ],
      liquidated: [],
      lifetimeInflow: minted,
    },

    interestNote:
      "No yield figure is drawn: the claim is a call at one block and the flows are the contract's own words at the blocks they happened at, and the difference between them is not a rate.",
    flowsNote:
      "The share side adds up wei-exact against the vault's own balanceOf; the asset side is the contract's own Deposit and Withdraw words beside its answer now, which are different quantities and are not reconciled against each other.",
  };

  return { data, flows };
}
