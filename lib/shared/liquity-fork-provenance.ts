// Liquity-V2-fork provenance vocabulary FACTORY (chain-state tier).
// ----------------------------------------------------------------------------
// Every Liquity V2 fork shares the same on-chain anatomy: each branch's
// TroveManager emits TroveUpdated(trove_id, debt, coll, stake, rate) with the
// Trove's ABSOLUTE debt + collateral after every change — directly EMITTED
// values from the chain (kind "chain", pclass "emitted"). BEFORE-values are the previous
// TroveUpdated's emitted values (one step less direct → pclass "indexed"), and
// the signed DELTA is after − before: deterministic arithmetic over two chain
// values → kind "chain-derived" (survives the chain-state gate). For BATCHED troves the
// emitted event carries batch_debt_shares, not an absolute debt, so the debt is
// derived shares/total × batch.debt at that event — still a chain value,
// flagged in the copy. USD, collateral ratio and liquidation price are
// interpreted layers, absent at this tier.
//
// Because the anatomy is identical, the fork vocabularies differ ONLY in what
// names the deployment: the protocol's display name, the stablecoin it mints,
// the backend table prefix, and the branch → TroveManager mapping. Those are
// the factory's blanks; everything else — the kinds, classes, formulas,
// summaries — is the shared truth of the contract family. A NEW fork onboard
// fills the config and gets the full vocabulary (event header deltas, detail
// after/before absolutes, position-card + tower current state) for free.
//
// What the factory deliberately does NOT cover: the reference Liquity V2
// vocabulary (lib/liquity/*) — the gold standard carries raw-wei via lines and
// formula-operand threading beyond this template — and Liquity V1, whose
// TroveUpdated has a different signature and interest story (a cousin, not a
// clone). Editorial judgment stays per-protocol where the chains differ.

import type { Provenance, ProvInput, ProvScaling, ProvVerify } from "@/components/shared/provenance";
import type { OriginEnvelope } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { formatExact } from "@/lib/utils/format";

/** Event/position coordinates a caller threads through to the receipts. */
export interface LiquityForkCoords {
  txHash?: string;
  blockNumber?: number;
  /** Branch symbol or key — selects the TroveManager for the provenance contract. */
  collateralType?: string;
  troveId?: string;
  isBatched?: boolean;
}

/** Operand values for the delta reconstructions — pass the emitted after and
 *  the reconstructed previous-event value so the receipt traces both. */
export interface DeltaOps {
  after?: number | string | null;
  before?: number | string | null;
}

/** A lifetime gross flow — the sum of one kind of signed delta across the
 *  Trove's recorded history (the economics tower's flow rows). */
export type LiquityForkLifetimeFlow =
  | "deposited"
  | "withdrawn"
  | "borrowed"
  | "repaid"
  | "liquidated collateral"
  | "liquidated debt"
  | "redeemed collateral"
  | "redeemed debt";

export interface LiquityForkVocabularyConfig {
  /** Display name — "Ebisu", "Asymmetry". */
  protocolName: string;
  /** The stablecoin the fork mints — "ebUSD", "USDaf". */
  stablecoin: string;
  /** Backend table prefix — "ebisu" reads as "captured Ebisu events (ebisu_*)". */
  tablePrefix: string;
  /** Branch resolver: the coords' collateralType → that branch's TroveManager
   *  (name + address), with the deployment's own default branch as fallback. */
  troveManagerContract: (collateralType?: string) => { name: string; address: string };
  /** Branch resolver for the liquidation-forensics receipts: the branch's own
   *  PriceFeed (name + address) and its collateral decimals — the raw
   *  lastGoodPrice scale is 1e(36 − decimals). */
  priceFeedContract: (collateralType?: string) => { name: string; address: string; decimals: number };
  /** The chain the fork is deployed on — the "confirm in the tx event logs"
   *  link every receipt offers resolves on its explorer. Defaults to mainnet; a
   *  fork on any other chain MUST set it, or its receipts send the reader to an
   *  explorer that has never seen the transaction. */
  chainId?: ChainId;
  /** The branch PriceFeed's graded formula and redemption rule, where the
   *  fork has one (lib/basedollar/price-feeds.ts); the price rows name it. */
  priceGrade?: (collateralType?: string) => { formula: string; redemption: string | null } | undefined;
  /** The contract that emits the Redemption and RedemptionFeePaidToTrove logs.
   *  Defaults to the branch TroveManager; Ebisu moved redemptions into a
   *  per-branch EbisuBranchManager. */
  redemptionEmitter?: (collateralType?: string) => { name: string; address: string };
}

/** Operand value a caller threads in (the same number the card renders);
 *  absent/non-numeric values leave the row label-only. */
const opVal = (v: number | string | null | undefined): string | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? formatExact(n) : undefined;
};

/** Log-anatomy via segment driven by the origin envelope — {event, param, raw,
 *  scale}, stamped in the timeline transform beside the MV-row mapping (the
 *  fork lanes' analogue of the reference lane's rails-server stamping). The
 *  envelope is AUTHORITATIVE when delivered: it is truthful per row where a
 *  hand-written string can't be (a batched row's collateral names
 *  BatchedTroveUpdated and an 8-decimal branch divides by 10^8; the vocabulary
 *  could only claim the regular 18-decimal arm). The fallback renders for
 *  pre-envelope cached responses. */
const originSeg = (o: OriginEnvelope | null | undefined, fallback: string, prior = false): string =>
  o
    ? `${prior ? "previous " : ""}${o.event} log · ${o.raw != null && o.raw !== "" ? `${o.param}: ${o.raw}` : o.param} · ÷10^${o.scale}`
    : fallback;

/** Envelope-driven Δ via segment — the delta itself is derived (after − the
 *  previous event's value), but its operands' log anatomy comes from THIS
 *  event's envelope: which log, which param, which scale. */
const originDeltaSeg = (o: OriginEnvelope | null | undefined, fallback: string): string =>
  o ? `${o.event} logs · Δ${o.param} · ÷10^${o.scale}` : fallback;

export function makeLiquityForkVocabulary(cfg: LiquityForkVocabularyConfig) {
  // Custody, not origin — the via line's leading segment only (the embedded
  // receipt renderer drops it; provenance-receipts-grammar §3). A via line
  // without this lead is written as one segment, or its first would drop.
  const streamVia = (): string => `captured ${cfg.protocolName} events (${cfg.tablePrefix}_*)`;

  const troveManagerContract = (coords?: LiquityForkCoords) => cfg.troveManagerContract(coords?.collateralType);
  const redemptionContract = (coords?: LiquityForkCoords) =>
    (cfg.redemptionEmitter ?? cfg.troveManagerContract)(coords?.collateralType);

  /** The branch collateral's decimals (8 on the BTC branches that keep
   *  WBTC's, 18 elsewhere) — the fallback via's scale when no envelope came. */
  const collDecimals = (coords?: LiquityForkCoords): number => cfg.priceFeedContract(coords?.collateralType).decimals;
  const collSym = (coords?: LiquityForkCoords): string => coords?.collateralType ?? "collateral";

  const txVerify = (coords?: LiquityForkCoords): ProvVerify | undefined =>
    coords?.txHash
      ? {
          kind: "etherscan",
          href: explorerUrl(cfg.chainId ?? MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
          text: "Confirm in the tx event logs",
        }
      : undefined;

  function eventInputs(coords: LiquityForkCoords | undefined): ProvInput[] {
    const inputs: ProvInput[] = [];
    if (coords?.troveId) inputs.push({ label: "trove", value: coords.troveId, kind: "chain", note: "Trove NFT id" });
    if (coords?.blockNumber != null)
      inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
    if (coords?.txHash) inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: "transaction" });
    return inputs;
  }

  /** The scaling sentence for one logged field, from its envelope's raw.
   *  No raw, no sentence (grammar §5). */
  const scalingOf = (
    o: OriginEnvelope | null | undefined,
    unit: { token: string } | "rate",
  ): ProvScaling | undefined => {
    if (o?.raw == null || o.raw === "") return undefined;
    return unit === "rate"
      ? {
          raw: o.raw,
          places: o.scale,
          why: `${cfg.protocolName} writes a rate as a fraction with 18 decimal places, where 1 means 100%`,
          unit: "%",
        }
      : { raw: o.raw, places: o.scale, why: `${unit.token} amounts have ${o.scale} decimal places` };
  };

  /** A batched Trove's debt, said once for every receipt that shows one. */
  const batchDebtSentence = (when: string): string =>
    `The log records no debt figure for a Trove in a batch, only its shares of the batch's debt, so this is the Trove's shares divided by the batch's total shares, times the batch's debt, as the batch last logged them at or before ${when}.`;

  // ── Header: the signed collateral / debt this event applied ────────────────

  const collDeltaProv = (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null): Provenance => ({
    kind: "chain-derived",
    pclass: "indexed",
    verify: txVerify(coords),
    summary: `Collateral moved by this operation — the balance the contract logged after this event, minus the balance it logged at the Trove's previous change.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · ${originDeltaSeg(origin, `TroveUpdated logs · Δ_coll · ÷10^${collDecimals(coords)}`)}`,
    formula: "coll after − coll before",
    inputs: [
      {
        label: "coll after",
        value: opVal(ops?.after),
        kind: "chain",
        pclass: "emitted",
        note: origin ? `this ${origin.event}'s ${origin.param}` : "this TroveUpdated's coll",
      },
      {
        label: "coll before",
        value: opVal(ops?.before),
        kind: "chain",
        pclass: "emitted",
        note: "the previous event's coll",
      },
      ...eventInputs(coords),
    ],
  });

  const debtDeltaProv = (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null): Provenance => ({
    kind: "chain-derived",
    pclass: "indexed",
    verify: txVerify(coords),
    summary: coords.isBatched
      ? `${cfg.stablecoin} debt moved by this operation — this Trove's share of its batch's debt after this event, minus its debt at the Trove's previous change. The share is the Trove's debt shares divided by the batch's total shares, times the batch's debt.`
      : `${cfg.stablecoin} debt moved by this operation — the debt the contract logged after this event, minus the debt it logged at the Trove's previous change.`,
    contract: troveManagerContract(coords),
    // A batched row's debt is derived (no envelope, by design) — the Δ via
    // states the shares derivation instead of claiming a log param.
    via: `${streamVia()} · ${originDeltaSeg(
      origin,
      coords.isBatched
        ? "Δ of the batch-derived debt (shares/total × batch debt at each event) · ÷10^18"
        : "TroveUpdated logs · Δ_debt · ÷10^18",
    )}`,
    formula: "debt after − debt before",
    inputs: [
      {
        label: "debt after",
        value: opVal(ops?.after),
        kind: "chain",
        pclass: "emitted",
        note: origin
          ? `this ${origin.event}'s ${origin.param}`
          : coords.isBatched
            ? "this event's batch-derived debt"
            : "this TroveUpdated's debt",
      },
      {
        label: "debt before",
        value: opVal(ops?.before),
        kind: "chain",
        pclass: "emitted",
        note: "the previous event's debt",
      },
      ...eventInputs(coords),
    ],
  });

  // ── Detail: after-values ────────────────────────────────────────────────────

  const collAfterProv = (coords: LiquityForkCoords, origin?: OriginEnvelope | null): Provenance => ({
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `Collateral after this event — every time a Trove changes, the contract logs its full ${collSym(coords)} balance. This is that balance after this event.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · ${originSeg(origin, `TroveUpdated log · coll · ÷10^${collDecimals(coords)}`)}`,
    scaling: scalingOf(origin, { token: collSym(coords) }),
    inputs: eventInputs(coords),
  });

  const debtAfterProv = (coords: LiquityForkCoords, origin?: OriginEnvelope | null): Provenance => ({
    kind: coords.isBatched ? "chain-derived" : "chain",
    pclass: coords.isBatched ? "indexed" : "emitted",
    verify: txVerify(coords),
    summary: coords.isBatched
      ? `${cfg.stablecoin} debt after this event — ${batchDebtSentence("this event")}`
      : `${cfg.stablecoin} debt after this event — every time a Trove changes, the contract logs its full debt, with interest added up to that moment. This is that debt after this event.`,
    contract: troveManagerContract(coords),
    // Batched rows carry NO debt envelope (derived) → the shares-derivation
    // via renders; regular rows' envelope states the TroveUpdated param.
    via: origin
      ? `${streamVia()} · ${originSeg(origin, "")}`
      : coords.isBatched
        ? `${streamVia()} · BatchedTroveUpdated log · _batchDebtShares ÷ BatchUpdated _totalDebtShares × _debt`
        : `${streamVia()} · TroveUpdated log · debt · ÷10^18`,
    scaling: coords.isBatched ? undefined : scalingOf(origin, { token: cfg.stablecoin }),
    inputs: eventInputs(coords),
  });

  // ── Detail: before-values (the previous event's logged figure) ─────────────
  //
  // `origin` here is the BEFORE-state envelope (originBefore in the context),
  // keyed on the previous event's batchedness (was_batched). `hasOriginBefore`
  // is whether the context delivered a before-envelope section at all — when it
  // did and the debt entry is absent, the previous state was batched and its
  // debt share-derived, so the receipt states that instead of a log param.

  const collBeforeProv = (coords: LiquityForkCoords, origin?: OriginEnvelope | null): Provenance => ({
    kind: "chain",
    pclass: "indexed",
    summary: `Collateral before this event — the full balance the contract logged at this Trove's previous change, or zero if this is its first.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · ${originSeg(origin, `previous TroveUpdated log · coll · ÷10^${collDecimals(coords)}`, true)}`,
    scaling: scalingOf(origin, { token: collSym(coords) }),
    inputs: eventInputs(coords),
  });

  const debtBeforeProv = (
    coords: LiquityForkCoords,
    origin?: OriginEnvelope | null,
    hasOriginBefore = false,
  ): Provenance =>
    hasOriginBefore && !origin
      ? {
          kind: "chain-derived",
          pclass: "indexed",
          summary: `${cfg.stablecoin} debt before this event — at its previous change this Trove was in a batch. ${batchDebtSentence("that change")}`,
          contract: troveManagerContract(coords),
          via: `${streamVia()} · previous BatchedTroveUpdated log · _batchDebtShares ÷ BatchUpdated _totalDebtShares × _debt`,
          inputs: eventInputs(coords),
        }
      : {
          kind: "chain",
          pclass: "indexed",
          summary: `${cfg.stablecoin} debt before this event — the full debt the contract logged at this Trove's previous change, or zero if this is its first.`,
          contract: troveManagerContract(coords),
          via: `${streamVia()} · ${originSeg(origin, "previous TroveUpdated log · debt · ÷10^18", true)}`,
          scaling: scalingOf(origin, { token: cfg.stablecoin }),
          inputs: eventInputs(coords),
        };

  // ── Liquidation forensics (the valued legs) ────────────────────────────────
  //
  // This family liquidates the WHOLE trove. The legs are the previous logged
  // update's balances (collBefore / debtBefore); the collateral is valued at
  // the branch PriceFeed's lastGoodPrice at the end of the event's block
  // (mig 113), the stablecoin at $1. Of the collateral, the contract pays the
  // liquidator a gas compensation, caps the Stability Pool's (or the
  // redistributed Troves') take at debt × (1 + penalty) ÷ price, and leaves
  // the rest as a surplus the owner can claim — so the premium below is the
  // most the liquidation could pass on.

  const gradeNote = (coords: LiquityForkCoords, base: string, redemption = false): string => {
    const g = cfg.priceGrade?.(coords.collateralType);
    if (!g) return base;
    return `${base} · PriceFeed = ${g.formula}${redemption && g.redemption ? ` · ${g.redemption}` : ""}`;
  };

  /** The PriceFeed's odd scale, said once for both price receipts. */
  const priceScaleSentence = (coords: LiquityForkCoords): string => {
    const d = collDecimals(coords);
    return `The PriceFeed stores a price with ${36 - d} decimal places: 36 minus the ${d} decimal places of ${collSym(coords)}.`;
  };

  /** The branch's collateral price at the event's block. */
  const atBlockPriceProv = (coords: LiquityForkCoords, priceUsd: number): Provenance => {
    const pf = cfg.priceFeedContract(coords.collateralType);
    return {
      kind: "chain",
      pclass: "oracle",
      verify: {
        kind: "recompute",
        text:
          coords.blockNumber != null
            ? `Re-run the PriceFeed.lastGoodPrice eth_call at block ${coords.blockNumber} against an archive node`
            : "Re-run the PriceFeed.lastGoodPrice eth_call against an archive node",
      },
      summary: `${collSym(coords)} price at this block — the US-dollar price the branch's PriceFeed contract held at the end of this block. A liquidation or a redemption updates that price before it acts, so this is the price the branch last used in the block. ${priceScaleSentence(coords)}`,
      contract: { name: pf.name, address: pf.address },
      via: `PriceFeed.lastGoodPrice() at the event's block, ÷10^${36 - pf.decimals}`,
      inputs: [
        {
          label: `${collSym(coords)} price`,
          value: formatExact(priceUsd),
          kind: "chain",
          note: gradeNote(coords, "lastGoodPrice, at block"),
        },
        ...eventInputs(coords),
      ],
    };
  };

  // ── The operation decomposition (migs 165/166) ─────────────────────────────
  //
  // The V2 TroveManager logs the balance move broken into its causes, in
  // TroveOperation, alongside the TroveUpdated that carries the new totals.
  // Each of these is a decoded log param bar the accrued-interest residual.

  /** The protocol's upfront fee added to the debt by THIS act. */
  const upfrontFeeProv = (coords: LiquityForkCoords, vals: { fee: string }): Provenance => ({
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `Upfront fee added to the debt — a one-off fee ${cfg.protocolName} adds to a Trove's debt when it opens, borrows more or joins a batch (about a week of the branch's average interest), and when the owner changes the rate soon after the last change. Nothing is paid at the time; the fee becomes part of what the Trove owes.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · TroveOperation log · _debtIncreaseFromUpfrontFee · ÷10^18`,
    inputs: [
      {
        label: "upfront fee",
        value: formatExact(Number(vals.fee)),
        kind: "chain",
        pclass: "emitted",
        note: `${cfg.stablecoin}, added to debt`,
      },
      ...eventInputs(coords),
    ],
  });

  /** Interest accrued into the debt since the Trove's last touch — the residual
   *  of the decomposition identity. */
  const accruedInterestProv = (
    coords: LiquityForkCoords,
    vals: { interest: string; debtDelta: string; fromOperation: string; fee: string; redist: string },
  ): Provenance => ({
    kind: "chain-derived",
    pclass: "indexed",
    verify: txVerify(coords),
    summary: `Interest accrued since the Trove's last change — the contract does not log this figure, but it logs every other reason the debt moved: the owner's borrowing or repayment, the upfront fee, and any share of a liquidated Trove's debt passed to this one. The interest is the change in debt minus those.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · TroveUpdated Δ_debt − TroveOperation legs · ÷10^18`,
    formula: "debt change − borrower's move − upfront fee − redistribution",
    inputs: [
      {
        label: "debt change",
        value: formatExact(Number(vals.debtDelta)),
        kind: "chain-derived",
        note: "after − before",
      },
      {
        label: "borrower's move",
        value: formatExact(Number(vals.fromOperation)),
        kind: "chain",
        pclass: "emitted",
        note: "_debtChangeFromOperation",
      },
      {
        label: "upfront fee",
        value: formatExact(Number(vals.fee)),
        kind: "chain",
        pclass: "emitted",
        note: "_debtIncreaseFromUpfrontFee",
      },
      {
        label: "redistribution",
        value: formatExact(Number(vals.redist)),
        kind: "chain",
        pclass: "emitted",
        note: "_debtIncreaseFromRedist",
      },
      ...eventInputs(coords),
    ],
  });

  // ── The redemption act (migs 165/166) ──────────────────────────────────────

  /** The redemption fee the REDEEMER paid, which stays in this Trove. */
  const redemptionFeeKeptProv = (coords: LiquityForkCoords, vals: { fee: string }): Provenance => ({
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `Redemption fee left in this Trove — the redeemer pays the fee in ${collSym(coords)}, and it stays in this Trove. The Trove gives up collateral worth the debt it sheds and keeps this fee on top.`,
    contract: redemptionContract(coords),
    via: `${streamVia()} · RedemptionFeePaidToTrove log · _ETHFee · ÷10^${collDecimals(coords)}`,
    inputs: [
      {
        label: "fee kept",
        value: formatExact(Number(vals.fee)),
        kind: "chain",
        pclass: "emitted",
        note: `${collSym(coords)}, into this Trove`,
      },
      ...eventInputs(coords),
    ],
  });

  /** The branch-wide redemption this Trove was one slice of. */
  const redemptionActProv = (coords: LiquityForkCoords, vals: { actual: string; attempted: string }): Provenance => ({
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The whole redemption on this branch — how much ${cfg.stablecoin} this redemption asked the branch to redeem, and how much the branch redeemed. A redemption takes from the branch's Troves in order of lowest interest rate, so this Trove's figures are one part of it.`,
    contract: redemptionContract(coords),
    via: `${streamVia()} · Redemption log · _actualBoldAmount / _attemptedBoldAmount · ÷10^18`,
    inputs: [
      {
        label: "redeemed",
        value: formatExact(Number(vals.actual)),
        kind: "chain",
        pclass: "emitted",
        note: `${cfg.stablecoin}, branch-wide`,
      },
      {
        label: "attempted",
        value: formatExact(Number(vals.attempted)),
        kind: "chain",
        pclass: "emitted",
        note: `${cfg.stablecoin} asked of this branch`,
      },
      ...eventInputs(coords),
    ],
  });

  /** The branch price EMITTED with the redemption (the Redemption log's _price). Distinct
   *  from atBlockPriceProv, which describes a price read back out of the
   *  PriceFeed afterwards — this one was never re-read, so its receipt must not
   *  claim an archive-node call the reader would fail to reproduce. */
  const emittedRedemptionPriceProv = (coords: LiquityForkCoords, priceUsd: number): Provenance => ({
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `${collSym(coords)} price for this redemption — the price the branch checked each Trove's collateral ratio against, logged with the redemption. The CollateralRegistry contract reads it from the branch's PriceFeed just before redeeming. The collateral paid out is priced at the redemption price, which a PriceFeed combining several sources can set above this one. ${priceScaleSentence(coords)}`,
    contract: redemptionContract(coords),
    via: `${streamVia()} · Redemption log · _price · ÷10^${36 - collDecimals(coords)}`,
    inputs: [
      {
        label: `${collSym(coords)} price`,
        value: formatExact(priceUsd),
        kind: "chain",
        pclass: "emitted",
        note: gradeNote(coords, "emitted with the redemption", true),
      },
      ...eventInputs(coords),
    ],
  });

  /** The seized-collateral leg — the whole trove's collateral × the at-block price. */
  const liqSeizedUsdProv = (coords: LiquityForkCoords, vals: { amount: string; priceUsd: number }): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    formula: "collateral × price at block",
    verify: txVerify(coords),
    summary: `Value of the liquidated collateral — the Trove's whole ${collSym(coords)} balance as the contract logged it at the Trove's previous change, times the branch's price at this block. ${cfg.protocolName} liquidates a Trove's whole balance. A share of an earlier liquidation passed to this Trove since that change is missing from the logged balance.`,
    contract: troveManagerContract(coords),
    via: "collateral × lastGoodPrice at block",
    inputs: [
      {
        label: "collateral",
        value: vals.amount,
        kind: "chain",
        note: `the trove's ${collSym(coords)} entering the event`,
      },
      {
        label: "price at block",
        value: formatExact(vals.priceUsd),
        kind: "chain",
        note: "PriceFeed.lastGoodPrice",
      },
      ...eventInputs(coords),
    ],
  });

  /** The cleared-debt leg — the stablecoin at $1. */
  const liqClearedFaceProv = (coords: LiquityForkCoords, vals: { amount: string }): Provenance => ({
    kind: "chain-derived",
    pclass: "emitted",
    formula: "debt at $1 redemption face value",
    verify: txVerify(coords),
    summary: `Value of the cleared debt — the Trove's whole ${cfg.stablecoin} debt as the contract logged it at the Trove's previous change, counted at $1 per ${cfg.stablecoin}. The contract's collateral-ratio check counts each ${cfg.stablecoin} as one dollar, and redemptions hold it to that value. Interest accrued since that change is missing from the logged debt.`,
    contract: troveManagerContract(coords),
    via: `debt at $1 per ${cfg.stablecoin}`,
    inputs: [
      {
        label: "debt cleared",
        value: vals.amount,
        kind: "chain",
        note: `the trove's ${cfg.stablecoin} entering the event`,
      },
      ...eventInputs(coords),
    ],
  });

  /** The premium — seized ÷ cleared − 1 (the collateral ratio on the logged
   *  balances, less 100%). */
  const liqPremiumProv = (
    coords: LiquityForkCoords,
    vals: { seizedUsd: string; clearedUsd: string; mcrPct?: number },
  ): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    formula: "seized ÷ cleared − 1",
    verify: txVerify(coords),
    summary: `Premium over the cleared debt — the Trove's collateral ratio at liquidation less 100%, measured on the balances logged at its previous change. It is the most the liquidation could pass on: the contract pays the liquidator a small part of the collateral, gives the Stability Pool depositors (or, in a redistribution, the branch's other Troves) at most the debt plus the branch's liquidation penalty, and leaves anything above that for the owner to claim.${
      vals.mcrPct != null
        ? ` A Trove can be liquidated only below the branch's minimum collateral ratio of ${vals.mcrPct}%, so this figure tops out near +${Math.round(vals.mcrPct - 100)}%.`
        : ""
    }`,
    contract: troveManagerContract(coords),
    via: "seized ÷ cleared − 1",
    inputs: [
      { label: "seized", value: vals.seizedUsd, kind: "chain", note: "collateral × price at block" },
      { label: "cleared", value: vals.clearedUsd, kind: "chain", note: "debt at $1 face" },
      ...eventInputs(coords),
    ],
  });

  // ── Position card + economics tower: the Trove's latest logged state ───────

  const latestSource = (coords?: LiquityForkCoords) =>
    coords?.blockNumber != null ? { source: { block: coords.blockNumber } } : {};

  const positionCollateralProv = (coords?: LiquityForkCoords): Provenance => ({
    kind: "chain",
    pclass: "emitted",
    summary: `Collateral the Trove holds — the full balance the contract logged at the Trove's latest change. The balance moves only when the Trove changes, apart from any share of a liquidated Trove's collateral, which is added at its next change.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · ${
      coords?.isBatched ? "latest BatchedTroveUpdated log" : "latest TroveUpdated log"
    } · coll · ÷10^${collDecimals(coords)}`,
    ...latestSource(coords),
  });

  // The batched arm claims the rate AS OF the trove's latest event, never
  // "currently": the manager can move the batch between this trove's events
  // (observed — two members of one batch list 3.60% and 0.50%), so only the
  // live lane may speak the current batch rate. An unbatched trove's rate
  // changes only via its own events, so its latest logged rate IS current.
  const positionRateProv = (coords?: LiquityForkCoords): Provenance =>
    coords?.isBatched
      ? {
          kind: "chain",
          pclass: "indexed",
          summary: `Annual interest rate at the Trove's latest change — the rate of its batch, as the batch last logged it at or before that change. The batch manager can change the batch's rate between this Trove's changes; the Trove's page reads the current rate. The contract stores a rate as a fraction with 18 decimal places, shown here as a percentage.`,
          contract: troveManagerContract(coords),
          via: `${streamVia()} · BatchUpdated log (this Trove's batch, latest at or before its last change) · _annualInterestRate · ÷10^16`,
          ...latestSource(coords),
        }
      : {
          kind: "chain",
          pclass: "emitted",
          summary: `Annual interest rate the Trove pays — the rate the contract logged at the Trove's latest change. Only a change to the Trove moves it. The contract stores a rate as a fraction with 18 decimal places, shown here as a percentage.`,
          contract: troveManagerContract(coords),
          via: `${streamVia()} · latest TroveUpdated log · annual_interest_rate · ÷10^16`,
          ...latestSource(coords),
        };

  const positionDebtProv = (coords?: LiquityForkCoords): Provenance => ({
    kind: coords?.isBatched ? "chain-derived" : "chain",
    pclass: coords?.isBatched ? "indexed" : "emitted",
    summary: coords?.isBatched
      ? `${cfg.stablecoin} debt at the Trove's latest change — ${batchDebtSentence("that change")} The batch's debt moves with interest and whenever any Trove in the batch changes, so this figure can be well behind the live debt; the Trove's page reads the live figure.`
      : `${cfg.stablecoin} debt at the Trove's latest change — the full debt the contract logged then. Interest accrues on it from that moment, so while the Trove is open it owes more than this.`,
    contract: troveManagerContract(coords),
    via: coords?.isBatched
      ? `${streamVia()} · latest BatchedTroveUpdated log · _batchDebtShares ÷ BatchUpdated _totalDebtShares × _debt`
      : `${streamVia()} · latest TroveUpdated log · debt · ÷10^18`,
    ...latestSource(coords),
  });

  // ── Closed / liquidated card: the life's highest recorded balances ─────────
  // A terminal Trove reads 0/0 on chain, so its card headlines what it held at
  // its height: max(coll_after) and max(debt_after) over the Trove's event
  // rows, each its own maximum.

  const peakCollateralProv = (coords?: LiquityForkCoords): Provenance => ({
    kind: "chain",
    pclass: "indexed",
    summary: `Highest collateral over the Trove's life — the largest balance the contract logged for it after any of its changes. The highest debt beside it can come from a different change.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · max(coll) over this Trove's TroveUpdated and BatchedTroveUpdated logs · ÷10^${collDecimals(coords)}`,
  });

  const peakDebtProv = (coords?: LiquityForkCoords): Provenance => ({
    kind: "chain",
    pclass: "indexed",
    summary: `Highest ${cfg.stablecoin} debt over the Trove's life — the largest debt the contract logged for it after any of its changes; while it was in a batch, its shares of the batch's debt. The highest collateral beside it can come from a different change.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · max(debt) over this Trove's TroveUpdated and BatchedTroveUpdated logs · ÷10^18`,
  });

  // ── Economics tower: lifetime flow sums ────────────────────────────────────
  // Replayed from the Trove's signed deltas (lib/<fork>/economics.ts
  // replayLifetime): liquidation and redemption rows go to their own flows,
  // every other positive delta to deposited / borrowed and every negative one
  // to withdrawn / repaid — so a redistribution share, an upfront fee and
  // applied interest ride the positive deltas, and the stories say so.

  const flowStory = (flow: LiquityForkLifetimeFlow, c: string): string => {
    switch (flow) {
      case "deposited":
        return `${c} added to the Trove: the opening deposit, every top-up, and any share of a liquidated Trove's collateral passed to it`;
      case "withdrawn":
        return `${c} the owner took out, closing the Trove included`;
      case "borrowed":
        return `${cfg.stablecoin} added to the Trove's debt at its changes: new borrowing, upfront fees, interest added when a change touched the Trove, and any share of a liquidated Trove's debt passed to it`;
      case "repaid":
        return `${cfg.stablecoin} the owner repaid, closing the Trove included`;
      case "liquidated collateral":
        return `${c} taken when the Trove was liquidated`;
      case "liquidated debt":
        return `${cfg.stablecoin} debt cleared when the Trove was liquidated`;
      case "redeemed collateral":
        return `${c} paid out to ${cfg.stablecoin} holders who redeemed against the Trove`;
      case "redeemed debt":
        return `${cfg.stablecoin} debt paid off by redemptions`;
    }
  };

  const DEBT_FLOWS: ReadonlySet<LiquityForkLifetimeFlow> = new Set([
    "borrowed",
    "repaid",
    "liquidated debt",
    "redeemed debt",
  ]);

  const lifetimeFlowProv = (flow: LiquityForkLifetimeFlow, coords?: LiquityForkCoords): Provenance => {
    const debt = DEBT_FLOWS.has(flow);
    return {
      kind: "chain-derived",
      pclass: "indexed",
      summary: `Lifetime ${flow} — ${flowStory(flow, collSym(coords))}, added up over the Trove's changes. Each change counts the balance after it minus the balance before${
        debt ? "; while the Trove was in a batch, its debt is its shares of the batch's debt" : ""
      }. The figure shows only when all the flows add up to the Trove's latest balances.`,
      contract: troveManagerContract(coords),
      via: `${streamVia()} · Σ TroveUpdated deltas (${flow}) · ÷10^${debt ? 18 : collDecimals(coords)}`,
      formula: "Σ (after − before) over this flow's events",
    };
  };

  // ── Event header + detail: the rate AT THIS event (historic, not "current") ──
  // Distinct from positionRateProv, which says the Trove "pays" — a POSITION
  // claim that would be false on a historic row. `origin` is this event's
  // annualInterestRate envelope; the detail stat passes it for the scaling
  // sentence, the header pill (an echo) need not.
  const rateAtEventProv = (coords?: LiquityForkCoords, origin?: OriginEnvelope | null): Provenance => {
    const scaling = scalingOf(origin, "rate");
    return {
      kind: "chain",
      pclass: coords?.isBatched ? "indexed" : "emitted",
      verify: txVerify(coords),
      summary: `Annual interest rate at this event — ${
        coords?.isBatched
          ? "the rate of this Trove's batch, as the batch last logged it at or before this event. The batch manager sets it for every Trove in the batch."
          : "the rate the contract logged for the Trove at this event."
      }${scaling ? "" : " The contract stores a rate as a fraction with 18 decimal places, shown here as a percentage."}`,
      contract: troveManagerContract(coords),
      via: origin
        ? `${streamVia()} · ${originSeg(origin, "")}`
        : coords?.isBatched
          ? `${streamVia()} · BatchUpdated log (this Trove's batch) · annual_interest_rate · ÷10^16`
          : `${streamVia()} · TroveUpdated log · annual_interest_rate · ÷10^16`,
      scaling,
      inputs: eventInputs(coords),
    };
  };

  // ── Event header: the interest-batch manager AT THIS event ─────────────────
  // A param of the Trove's BatchedTroveUpdated at this event — a claim about
  // THIS row, not a lookup of who manages the Trove today.
  const batchManagerProv = (coords: LiquityForkCoords | undefined, address: string): Provenance => ({
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `Batch manager at this event — the address the owner handed control of the Trove's interest rate to, logged with the Trove's change. A Trove in a batch pays the rate its manager sets for the whole batch, plus the manager's annual fee. The manager cannot move the Trove's collateral or debt.`,
    contract: troveManagerContract(coords),
    via: `${streamVia()} · BatchedTroveUpdated log · _interestBatchManager`,
    inputs: [
      { label: "manager", value: address, kind: "chain", pclass: "emitted", note: "batch manager at this event" },
      ...eventInputs(coords),
    ],
  });

  return {
    collDeltaProv,
    debtDeltaProv,
    collAfterProv,
    debtAfterProv,
    collBeforeProv,
    debtBeforeProv,
    atBlockPriceProv,
    upfrontFeeProv,
    accruedInterestProv,
    redemptionFeeKeptProv,
    redemptionActProv,
    emittedRedemptionPriceProv,
    liqSeizedUsdProv,
    liqClearedFaceProv,
    liqPremiumProv,
    positionCollateralProv,
    positionDebtProv,
    positionRateProv,
    peakCollateralProv,
    peakDebtProv,
    rateAtEventProv,
    batchManagerProv,
    lifetimeFlowProv,
  };
}

/** The forensics slice of the vocabulary — what the shared liquidation-
 *  forensics builder needs from a fork's instantiation. */
export type LiquityForkForensicsVocab = Pick<
  ReturnType<typeof makeLiquityForkVocabulary>,
  "atBlockPriceProv" | "liqSeizedUsdProv" | "liqClearedFaceProv" | "liqPremiumProv"
>;
