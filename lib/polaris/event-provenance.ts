// Polaris provenance vocabulary — the timeline and index-lane receipts.
// ----------------------------------------------------------------------------
// The per-CDP ledger is `CDPUpdated` on the market's cdpManager, and the
// grading follows the step classes exactly:
//
//   • the twelve CDPUpdated fields, the Liquidation / LiquidationGasComp legs,
//     the NFT Transfer parties and the PrimaryRateSet figure — `emitted`: a
//     field in the log itself, with the tx-logs link as its proof.
//   • the before-values (a LAG over the same CDP's rows) and the per-event
//     net change (after − before) — `indexed`: a Rails reduction over emitted
//     rows, with the replay identity written out as the compute. The identity
//     is exact on every transition the scoping doc replayed (761/761), and
//     the chain verifier re-asserts it.
//   • the index-lane card figures (the last row's `_newColl`/`_newDebt`) —
//     `state`: each equals the cdpManager's stored `getCDP(id).coll/.debt`
//     at that block, which is what the verifier asserts.
//   • lifetime sums and peaks — `indexed`.
//
// UNITS ARE NATIVE: pETH collateral, the market's stablecoin as debt, 18dp.
// USD lives only in live-provenance.ts, where the protocol's own feed is read.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { POLARIS_CHAIN_ID, POLARIS_CORE, POLARIS_MARKET_CONFIG, type PolarisMarket } from "./asset-catalog";
import type { PolarisContext } from "@/lib/shared/types/event-shape";

// Custody, not origin — the via line's leading segment only.
const POLARIS_VIA = "captured cdpManager + cdpNft events (polaris_*)";

export interface PolarisCoords {
  txHash?: string;
  blockNumber?: number;
  market: PolarisMarket;
  cdpId: string;
}

const managerContract = (coords: PolarisCoords) => ({
  name: `Polaris ${POLARIS_MARKET_CONFIG[coords.market].stable.symbol} CDPManager`,
  address: POLARIS_MARKET_CONFIG[coords.market].cdpManager,
});

const nftContract = (coords: PolarisCoords) => ({
  name: `Polaris ${POLARIS_MARKET_CONFIG[coords.market].stable.symbol} CDP NFT`,
  address: POLARIS_MARKET_CONFIG[coords.market].cdpNft,
});

const stableOf = (market: PolarisMarket): string => POLARIS_MARKET_CONFIG[market].stable.symbol;

const atBlock = (coords: PolarisCoords): string =>
  coords.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Sepolia Etherscan tx-logs link for an emitted field — zero-RPC, link only. */
const txVerify = (coords: PolarisCoords): ProvVerify | undefined =>
  coords.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(POLARIS_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs (Sepolia Etherscan)",
      }
    : undefined;

function eventInputs(coords: PolarisCoords, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  inputs.push({
    label: "cdp",
    value: `${coords.market}:${coords.cdpId}`,
    kind: "chain",
    note: "the (market, cdpId) grain — CDPUpdated._id",
  });
  if (coords.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords.txHash) inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return inputs;
}

// ── the CDPUpdated fields (emitted) ──────────────────────────────────────────

export type PolarisLedgerField =
  | "newColl"
  | "newDebt"
  | "collChange"
  | "debtChange"
  | "mintRedeemCollGain"
  | "mintRedeemDebtGain"
  | "accruedInterest"
  | "stableGain"
  | "stablesMintedToEnsureZeroDebt"
  | "bcTokenGain";

const LOG_FIELD: Record<PolarisLedgerField, string> = {
  newColl: "_newColl",
  newDebt: "_newDebt",
  collChange: "_collChange",
  debtChange: "_debtChange",
  mintRedeemCollGain: "_mintRedeemCollGain",
  mintRedeemDebtGain: "_mintRedeemDebtGain",
  accruedInterest: "_accruedInterest",
  stableGain: "_stableGain",
  stablesMintedToEnsureZeroDebt: "_stablesMintedToEnsureZeroDebt",
  bcTokenGain: "_bcTokenGain",
};

function ledgerSummary(field: PolarisLedgerField, stable: string): string {
  switch (field) {
    case "newColl":
      return `pETH the CDP holds AFTER this touch — the CDPUpdated log's own \`_newColl\` field, the resulting collateral the cdpManager wrote. It equals the manager's stored getCDP(id).coll at that block, and every leg that produced it (the holder's change, the PSM share, reward pETH) is on the same log.`;
    case "newDebt":
      return `${stable} the CDP owes AFTER this touch — the CDPUpdated log's own \`_newDebt\` field, the resulting debt the cdpManager wrote. It equals the manager's stored getCDP(id).debt at that block: recorded debt with this touch's interest charged in and its gains credited.`;
    case "collChange":
      return `pETH the holder moved in this touch — the CDPUpdated log's own \`_collChange\` field: positive for a deposit, negative for a withdrawal. The one collateral leg the holder chose; the others on the same log are the protocol's.`;
    case "debtChange":
      return `${stable} the holder borrowed or repaid in this touch — the CDPUpdated log's own \`_debtChange\` field: positive for a borrow, negative for a repayment. The one debt leg the holder chose.`;
    case "mintRedeemCollGain":
      return `pETH credited or debited by the market's PSM activity — the CDPUpdated log's own \`_mintRedeemCollGain\` field. When the PSM mints or redeems, every CDP takes a pro-rata share of the collateral that moved, settled onto the CDP at its next touch.`;
    case "mintRedeemDebtGain":
      return `${stable} of debt added or removed by the market's PSM activity — the CDPUpdated log's own \`_mintRedeemDebtGain\` field: the CDP's pro-rata share of the debt the PSM's mints and redemptions moved, settled at this touch.`;
    case "accruedInterest":
      return `Interest charged into the debt at this touch — the CDPUpdated log's own \`_accruedInterest\` field: simple accrual at the market's rate since the previous touch, written into the debt here. Realised, not pending.`;
    case "stableGain":
      return `${stable} credited against the debt at this touch — the CDPUpdated log's own \`_stableGain\` field: the CDP's share of the market revenue the stability pool distributes, applied as a debt reduction.`;
    case "stablesMintedToEnsureZeroDebt":
      return `${stable} minted to settle a residual — the CDPUpdated log's own \`_stablesMintedToEnsureZeroDebt\` field: on a close whose gains exceed the remaining debt, the manager mints the difference so the debt lands exactly on zero.`;
    case "bcTokenGain":
      return `Reward pETH added to the collateral at this touch — the CDPUpdated log's own \`_bcTokenGain\` field: the CDP's share of bonding-curve token rewards, settled into the collateral here.`;
  }
}

/** One of the ten value fields of this row's own CDPUpdated log. */
export const ledgerFieldProv = (field: PolarisLedgerField, coords: PolarisCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: ledgerSummary(field, stableOf(coords.market)).replace(" — ", `${atBlock(coords)} — `),
  contract: managerContract(coords),
  via: `${POLARIS_VIA} · CDPUpdated · ${fieldSeg(LOG_FIELD[field], raw)}`,
  inputs: eventInputs(coords),
});

// ── the reduction (indexed) ──────────────────────────────────────────────────

/** A before-value — the PREVIOUS CDPUpdated's `_newColl`/`_newDebt` at the
 *  same CDP: a lag over the ledger, 0 on the open. */
export const beforeProv = (what: "coll" | "debt", coords: PolarisCoords, raw?: string | null): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  verify: { kind: "rollup", text: "Rolls up to the previous CDPUpdated's own emitted resulting figure" },
  summary: `${what === "coll" ? "pETH held" : `${stableOf(coords.market)} owed`} BEFORE this touch — the previous CDPUpdated's own \`${what === "coll" ? "_newColl" : "_newDebt"}\` at this CDP, carried forward by the index as a lag over the ledger (0 on the open). Anchored to a figure the cdpManager itself emitted.`,
  contract: managerContract(coords),
  via: `${POLARIS_VIA} · lag(${what === "coll" ? "_newColl" : "_newDebt"}) at this CDP${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords, [
    { label: `previous ${what}`, kind: "chain", pclass: "emitted", note: "the prior CDPUpdated's resulting figure" },
  ]),
});

/** The net change this touch made on one side — after minus before, which
 *  the replay identity decomposes into the log's own legs. */
export const netChangeProv = (what: "coll" | "debt", coords: PolarisCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  verify: { kind: "rollup", text: "Rolls up to the two emitted resulting figures and the legs between them" },
  summary:
    what === "coll"
      ? `The pETH change this touch made — this CDPUpdated's \`_newColl\` minus the previous one's. The identity the index asserts on every row: newColl = prevColl + _collChange + _mintRedeemCollGain + _bcTokenGain, exact on every transition the ledger has ever emitted.`
      : `The ${stableOf(coords.market)} debt change this touch made — this CDPUpdated's \`_newDebt\` minus the previous one's. The identity the index asserts on every row: newDebt = prevDebt + _debtChange + _accruedInterest + _mintRedeemDebtGain − _stableGain + _stablesMintedToEnsureZeroDebt, exact on every transition.`,
  contract: managerContract(coords),
  via: `${what === "coll" ? "_newColl" : "_newDebt"} − previous (two emitted resulting figures)`,
  formula:
    what === "coll"
      ? "after − before = _collChange + _mintRedeemCollGain + _bcTokenGain"
      : "after − before = _debtChange + _accruedInterest + _mintRedeemDebtGain − _stableGain + _stablesMintedToEnsureZeroDebt",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "emitted", note: "this CDPUpdated's resulting figure" },
    { label: "before", kind: "chain", pclass: "emitted", note: "the previous CDPUpdated's resulting figure" },
  ]),
});

// ── the liquidation legs (emitted) ───────────────────────────────────────────

export type PolarisLiquidationField =
  | "collLiquidated"
  | "debtLiquidated"
  | "debtRedistributed"
  | "collRedistributed"
  | "collSurplus"
  | "flatComp"
  | "collateralComp";

const LIQ_FIELD: Record<PolarisLiquidationField, { log: string; field: string }> = {
  collLiquidated: { log: "Liquidation", field: "_collLiquidated" },
  debtLiquidated: { log: "Liquidation", field: "_debtLiquidated" },
  debtRedistributed: { log: "Liquidation", field: "_debtRedistributed" },
  collRedistributed: { log: "Liquidation", field: "_collRedistributed" },
  collSurplus: { log: "Liquidation", field: "_collSurplus" },
  flatComp: { log: "LiquidationGasComp", field: "_flatComp" },
  collateralComp: { log: "LiquidationGasComp", field: "_collateralComp" },
};

function liquidationSummary(field: PolarisLiquidationField, stable: string): string {
  switch (field) {
    case "collLiquidated":
      return "The ENTIRE pETH seized from the CDP — the Liquidation log's own `_collLiquidated` field. It is the whole collateral the manager took, not the pool's share of it: the owner's surplus and the liquidator's collateral compensation are both carved out of this figure, so the pool receives `_collLiquidated` minus `_collSurplus` minus `_collateralComp`.";
    case "debtLiquidated":
      return `${stable} the stability pool absorbed — the Liquidation log's own \`_debtLiquidated\` field: the debt the pool's deposits repaid on the CDP's behalf.`;
    case "debtRedistributed":
      return `${stable} spread across the other CDPs — the Liquidation log's own \`_debtRedistributed\` field: debt the pool could not absorb, redistributed pro rata across the market's other CDPs. Zero means the pool absorbed all of it.`;
    case "collRedistributed":
      return "pETH spread across the other CDPs — the Liquidation log's own `_collRedistributed` field: the collateral that went with the redistributed debt.";
    case "collSurplus":
      return "pETH left for the owner to claim — the Liquidation log's own `_collSurplus` field: collateral beyond what the debt needed, set aside in the surplus pool.";
    case "flatComp":
      return "pETH gas compensation paid to the liquidator — the LiquidationGasComp log's own `_flatComp` field: the fixed amount the CDP escrowed at open.";
    case "collateralComp":
      return "pETH collateral compensation paid to the liquidator — the LiquidationGasComp log's own `_collateralComp` field: the share of the collateral the liquidator keeps.";
  }
}

export const liquidationFieldProv = (
  field: PolarisLiquidationField,
  coords: PolarisCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: liquidationSummary(field, stableOf(coords.market)).replace(" — ", `${atBlock(coords)} — `),
  contract: managerContract(coords),
  via: `${POLARIS_VIA} · ${LIQ_FIELD[field].log} · ${fieldSeg(LIQ_FIELD[field].field, raw)}`,
  inputs: eventInputs(coords),
});

/** Who liquidated — Liquidation._liquidator (indexed on the log). */
export const liquidatorProv = (coords: PolarisCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The liquidator — the Liquidation log's own \`_liquidator\` topic${atBlock(coords)}: the address that called the liquidation, paid in the gas compensation the CDP escrowed at open.`,
  contract: managerContract(coords),
  via: `${POLARIS_VIA} · Liquidation · _liquidator`,
  inputs: eventInputs(coords),
});

// ── the liquidation forensics (chain-derived) ────────────────────────────────
//
// The valued two-leg breakdown of a liquidation. Every figure here is stated
// IN THE MARKET'S OWN UNIT (USDp, or GOLDp on the gold market) — never in
// dollars: the seized pETH is valued at the market's own price feed read at
// the event's block (the oracle-at-block lane), and the cleared debt is taken
// at the face the protocol's own ICR math uses. The shared forensics card
// calls the leg fields `usd` for Aave's sake; on Polaris the number in them
// is a value in the debt unit, and these receipts say so.

/** Which leg of the liquidation a value receipt is for. */
export type PolarisLiqLeg = "pool collateral" | "redistributed collateral" | "cleared debt";

/** The pool's own collateral leg — the seized total less what the log says
 *  went elsewhere. Derived from three emitted fields of the same log, so a
 *  reader can add them back up in the tx's own event logs. */
export const liqPoolLegProv = (
  coords: PolarisCoords,
  vals: { seized: string; surplus: string; comp: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  formula: "_collLiquidated − _collSurplus − _collateralComp",
  verify: txVerify(coords),
  summary: `The pETH the stability pool actually received${atBlock(coords)} — the Liquidation log's \`_collLiquidated\` (the ENTIRE collateral seized) less the \`_collSurplus\` set aside for the owner to claim and the \`_collateralComp\` the liquidator kept. All three are fields of this transaction's own logs, so the subtraction can be checked in the tx event logs without trusting any reduction of ours. This leg, not the whole seized figure, is what the protocol's liquidation penalty applies to.`,
  contract: managerContract(coords),
  via: `${POLARIS_VIA} · Liquidation._collLiquidated − Liquidation._collSurplus − LiquidationGasComp._collateralComp`,
  inputs: eventInputs(coords, [
    { label: "seized", value: vals.seized, kind: "chain", pclass: "emitted", note: "Liquidation._collLiquidated" },
    { label: "surplus", value: vals.surplus, kind: "chain", pclass: "emitted", note: "Liquidation._collSurplus" },
    {
      label: "collateral compensation",
      value: vals.comp,
      kind: "chain",
      pclass: "emitted",
      note: "LiquidationGasComp._collateralComp",
    },
  ]),
});

/** One leg of the liquidation, valued in the market's own unit: the collateral
 *  at the feed's price at this block, the debt at the face the protocol's own
 *  ICR math uses. */
export const liqLegValueProv = (
  leg: PolarisLiqLeg,
  coords: PolarisCoords,
  vals: { amount: string; priceInDebt?: string },
): Provenance => {
  const stable = stableOf(coords.market);
  const collateral = leg !== "cleared debt";
  return {
    kind: "chain-derived",
    pclass: collateral ? "oracle" : "emitted",
    formula: collateral ? `${leg} × previewPrice() at block` : `debt at the protocol's own ICR face`,
    verify: txVerify(coords),
    summary: collateral
      ? `What the ${leg} was worth in ${stable} when the CDP was liquidated${atBlock(coords)} — the leg times the market's own price feed \`previewPrice()\` read at this event's block by the oracle-at-block lane. Both factors are chain values pinned to this block, and the figure is in ${stable}, not dollars: the market prices pETH in its own stablecoin and nothing here converts it further.`
      : `What the cleared debt counts as${atBlock(coords)} — the Liquidation log's own \`_debtLiquidated\` at face. The ICR math that judged this liquidation (collateral × price ÷ debt) counts each ${stable} as one unit of debt, so the leg is the emitted figure itself and no market price for ${stable} is asserted.`,
    contract: collateral ? priceFeedContract(coords.market) : managerContract(coords),
    via: collateral
      ? `${leg} × polaris_oracle_at_block · previewPrice()${atBlock(coords)}`
      : `${POLARIS_VIA} · Liquidation._debtLiquidated · face`,
    inputs: eventInputs(coords, [
      { label: leg, value: vals.amount, kind: "chain", note: collateral ? "pETH" : stable },
      ...(collateral && vals.priceInDebt != null
        ? [
            {
              label: "price at block",
              value: vals.priceInDebt,
              kind: "chain" as const,
              pclass: "oracle" as const,
              note: `pETH in ${stable} — previewPrice() at this block`,
            },
          ]
        : []),
    ]),
  };
};

/** The premium — the valued leg over the debt it cleared, minus one. Stated
 *  against the deployment constant it should reproduce. */
export const liqPremiumProv = (
  coords: PolarisCoords,
  vals: { legValue: string; clearedValue: string; constant: string; fn: string },
): Provenance => {
  const stable = stableOf(coords.market);
  return {
    kind: "chain-derived",
    pclass: "oracle",
    formula: "leg value ÷ cleared debt − 1",
    verify: txVerify(coords),
    summary: `The premium realised on this liquidation — the collateral leg valued in ${stable} at this block's feed price, over the ${stable} debt it cleared, minus one. It is derived from the two legs and never from the constant beside it, so the pair reads as a check: the cdpManager's own \`${vals.fn}\` is ${vals.constant}, and a liquidation the protocol sized correctly lands on it.`,
    contract: managerContract(coords),
    via: `leg value ÷ _debtLiquidated − 1 · both legs at this block's own figures`,
    inputs: eventInputs(coords, [
      { label: "leg value", value: vals.legValue, kind: "chain", note: `collateral × price at block, in ${stable}` },
      { label: "cleared", value: vals.clearedValue, kind: "chain", note: `debt at face, in ${stable}` },
    ]),
  };
};

/** The CDP's collateral ratio at the moment it fired — the WHOLE seized
 *  collateral valued at the same price over the whole debt cleared. A
 *  different fact from the premium, which is measured on one leg. */
export const liqIcrAtFireProv = (
  coords: PolarisCoords,
  vals: { seized: string; priceInDebt: string; cleared: string; mcrPct: string },
): Provenance => {
  const stable = stableOf(coords.market);
  return {
    kind: "chain-derived",
    pclass: "oracle",
    formula: "_collLiquidated × previewPrice() ÷ _debtLiquidated",
    verify: txVerify(coords),
    summary: `The CDP's collateral ratio at the moment the liquidation fired — the ENTIRE collateral seized, valued at the market's own feed price at this block, over the entire ${stable} debt cleared. This is the quantity the market's minimum applies to; the premium above is measured on the pool's leg alone, which is smaller by the owner's surplus and the liquidator's compensation. The market's normal-mode minimum is ${vals.mcrPct}; a defensive-mode minimum in force at a past block is not indexed, so the comparison names the normal-mode figure.`,
    contract: managerContract(coords),
    via: `Liquidation._collLiquidated × polaris_oracle_at_block.previewPrice() ÷ Liquidation._debtLiquidated`,
    inputs: eventInputs(coords, [
      { label: "seized", value: vals.seized, kind: "chain", pclass: "emitted", note: "Liquidation._collLiquidated" },
      {
        label: "price at block",
        value: vals.priceInDebt,
        kind: "chain",
        pclass: "oracle",
        note: `pETH in ${stable} — previewPrice() at this block`,
      },
      { label: "cleared", value: vals.cleared, kind: "chain", pclass: "emitted", note: "Liquidation._debtLiquidated" },
    ]),
  };
};

// ── the collateral ratio at the event (chain-derived, oracle) ────────────────

/** The CDP's collateral ratio at a touch — the row's own resulting figures at
 *  the feed's end-of-block price (lib/polaris/cr-at-event.ts). Two emitted
 *  legs and one oracle leg, the same price leaf `liqIcrAtFireProv` names. */
export const crAtEventProv = (
  coords: PolarisCoords,
  vals: { newColl: string; priceInDebt: string; newDebt: string; mcrPct: string },
): Provenance => {
  const stable = stableOf(coords.market);
  return {
    kind: "chain-derived",
    pclass: "oracle",
    formula: "_newColl × previewPrice() ÷ _newDebt",
    verify: txVerify(coords),
    summary: `Collateral ratio at this event — the CDP's resulting collateral, valued at the market's own feed price as this block closed, over its resulting debt. The touch has just written the pending interest and PSM share in, so the two figures are the CDP's own at that moment; the price is the feed's end-of-block value, which can differ slightly from the one this transaction saw. The market's normal-mode minimum is ${vals.mcrPct}; a defensive-mode minimum in force at a past block is not indexed.`,
    contract: managerContract(coords),
    via: `CDPUpdated._newColl × polaris_oracle_at_block.previewPrice() ÷ CDPUpdated._newDebt${atBlock(coords)}`,
    inputs: eventInputs(coords, [
      { label: "newColl", value: vals.newColl, kind: "chain", pclass: "emitted", note: "CDPUpdated._newColl" },
      {
        label: "price at block",
        value: vals.priceInDebt,
        kind: "chain",
        pclass: "oracle",
        note: `pETH in ${stable} — previewPrice() at this block`,
      },
      { label: "newDebt", value: vals.newDebt, kind: "chain", pclass: "emitted", note: "CDPUpdated._newDebt" },
    ]),
  };
};

/** The same ratio on the CDP's figures BEFORE this touch, at this block's
 *  price — the lag columns valued as this event valued them. */
export const crBeforeAtEventProv = (
  coords: PolarisCoords,
  vals: { collBefore: string; priceInDebt: string; debtBefore: string },
): Provenance => {
  const stable = stableOf(coords.market);
  return {
    kind: "chain-derived",
    pclass: "oracle",
    formula: "collBefore × previewPrice() ÷ debtBefore",
    verify: txVerify(coords),
    summary: `Collateral ratio before this touch — the same ratio on the CDP's figures before this touch, at this block's price: the position as it stood, valued as this event valued it. Not a reading from the chain: nothing recorded the ratio between the previous touch and this one.`,
    contract: managerContract(coords),
    via: `lag(_newColl) × polaris_oracle_at_block.previewPrice() ÷ lag(_newDebt)${atBlock(coords)}`,
    inputs: eventInputs(coords, [
      {
        label: "collBefore",
        value: vals.collBefore,
        kind: "chain",
        pclass: "emitted",
        note: "the previous CDPUpdated's _newColl",
      },
      {
        label: "price at block",
        value: vals.priceInDebt,
        kind: "chain",
        pclass: "oracle",
        note: `pETH in ${stable} — previewPrice() at this block`,
      },
      {
        label: "debtBefore",
        value: vals.debtBefore,
        kind: "chain",
        pclass: "emitted",
        note: "the previous CDPUpdated's _newDebt",
      },
    ]),
  };
};

/** The change in the ratio across this touch, in percentage points — the two
 *  ratios above, both at this block's price, after minus before. */
export const crChangeAtEventProv = (coords: PolarisCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "ratio after − ratio before",
  verify: txVerify(coords),
  summary: `Change in the collateral ratio at this touch — the ratio on the resulting figures minus the ratio on the figures before, both at this block's own price, in percentage points. The price is held fixed, so the change is what the touch itself did to the ratio.`,
  contract: managerContract(coords),
  via: `(_newColl ÷ _newDebt − lag(_newColl) ÷ lag(_newDebt)) × previewPrice()${atBlock(coords)}`,
  inputs: eventInputs(coords, [
    { label: "ratio after", kind: "chain", pclass: "oracle", note: "the resulting figures at this block's price" },
    { label: "ratio before", kind: "chain", pclass: "oracle", note: "the lag columns at this block's price" },
  ]),
});

/** The deployment's own liquidation penalty — the constant the premium beside
 *  it should reproduce. A constant of the deployment, not a per-event read:
 *  the receipt names the function to re-run. */
export const liqPenaltyConstantProv = (
  coords: PolarisCoords,
  which: "sp" | "redistribution",
  vals: { fn: string; value: string; raw: string; readAtBlock: number },
): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run ${vals.fn} on the cdpManager — it returns ${vals.raw} (1e18 = 100%).`,
  },
  summary: `The market's own liquidation penalty for ${which === "sp" ? "a stability-pool absorb" : "a redistribution"} — the cdpManager's \`${vals.fn}\`, ${vals.value}. A constant of the deployment rather than a per-event figure: it read ${vals.raw} on BOTH markets' managers at block ${vals.readAtBlock}, and the premium beside it is derived from the event's own legs, never from this number.`,
  contract: managerContract(coords),
  via: `${vals.fn} ÷ 1e18 (read at block ${vals.readAtBlock}, identical on both markets)`,
  inputs: eventInputs(coords),
});

// ── custody (emitted) ────────────────────────────────────────────────────────

/** The CDP NFT changed hands — Transfer(from, to, tokenId) on the cdpNft. */
export const transferProv = (coords: PolarisCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The CDP changed hands — the cdpNft's own ERC-721 Transfer log${atBlock(coords)}. The CDP is an NFT, so its owner is a mutable fact the index carries from these logs; nothing about the collateral or the debt moved. The mint (from the zero address) is the open and the burn is the close, so neither is a row of its own.`,
  contract: nftContract(coords),
  via: `${POLARIS_VIA} · Transfer(from, to, tokenId)`,
  inputs: eventInputs(coords),
});

// ── the rate in force (emitted, market-level) ────────────────────────────────

/** The market's primary rate in force at this touch — its last
 *  PrimaryRateSet at or before the row. */
export const rateInForceProv = (coords: PolarisCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: {
    kind: "recompute",
    text: "Find the cdpManager's last PrimaryRateSet log at or before this block — its newPrimaryRate (1e18 = 100%/yr) is this figure.",
  },
  summary: `The market's primary rate in force at this touch — the cdpManager's last PrimaryRateSet log at or before this row, newPrimaryRate ÷ 1e18 per year. Algorithmic: the market sets it (the event fires on the PSM's mints and redemptions, never inside a CDP touch), so it is a fact of the market at that moment, not a rate the holder chose. The secondary, utilisation-driven rate is added on top and is not on this log.`,
  contract: managerContract(coords),
  via: `${POLARIS_VIA} · last PrimaryRateSet ≤ block · ${fieldSeg("newPrimaryRate", raw)} ÷ 1e18`,
  inputs: eventInputs(coords),
});

// ── the index lane's card figures ────────────────────────────────────────────

/** A listing-card figure — the last CDPUpdated's resulting `_newColl`/`_newDebt`. */
export const latestStateProv = (what: "coll" | "debt", market: PolarisMarket): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run the cdpManager's getCDP(id) eth_call at the last touch's block — its .${what} equals the last CDPUpdated's resulting figure exactly.`,
  },
  summary:
    what === "coll"
      ? "pETH the CDP holds as of its last touch — the last CDPUpdated's own `_newColl`, which equals the cdpManager's stored getCDP(id).coll at that block. Pending legs since (reward pETH, a PSM share) are not in it; the live overlay adds them."
      : `${stableOf(market)} the CDP owes as of its last touch — the last CDPUpdated's own \`_newDebt\`, which equals the cdpManager's stored getCDP(id).debt at that block. Interest since that touch is not in it; the live overlay adds it.`,
  contract: { name: `Polaris ${stableOf(market)} CDPManager`, address: POLARIS_MARKET_CONFIG[market].cdpManager },
  via: `${POLARIS_VIA} · last CDPUpdated ${what === "coll" ? "_newColl" : "_newDebt"} (= getCDP(id).${what})`,
});

/** A terminal card's headline — the highest resulting figure the CDP ever
 *  emitted on one side. */
export const peakProv = (what: "coll" | "debt", market: PolarisMarket): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  verify: { kind: "rollup", text: "Rolls up to the CDPUpdated rows the maximum was taken over" },
  summary:
    what === "coll"
      ? "The most pETH the CDP ever held at once — the maximum over its own CDPUpdated `_newColl` figures across its whole life. A closed or liquidated CDP's latest figures are zero, so the headline states the ledger's height instead."
      : `The most ${stableOf(market)} the CDP ever owed at once — the maximum over its own CDPUpdated \`_newDebt\` figures across its whole life. A closed or liquidated CDP's latest figures are zero, so the headline states the ledger's height instead.`,
  contract: { name: `Polaris ${stableOf(market)} CDPManager`, address: POLARIS_MARKET_CONFIG[market].cdpManager },
  via: `${POLARIS_VIA} · max(${what === "coll" ? "_newColl" : "_newDebt"}) over all CDPUpdated`,
});

export type PolarisLifetimeLeg =
  | "deposited"
  | "withdrawn"
  | "collateral liquidated"
  | "pETH from PSM mints"
  | "pETH to PSM redemptions"
  | "reward pETH"
  | "borrowed"
  | "repaid"
  | "debt liquidated"
  | "interest charged"
  | "stability gains"
  | "debt from PSM mints"
  | "debt cleared by PSM redemptions"
  | "minted to settle";

const LEG_VIA: Record<PolarisLifetimeLeg, string> = {
  deposited: "Σ max(_collChange, 0)",
  withdrawn: "Σ max(−_collChange, 0) on open/adjust/close rows",
  "collateral liquidated": "Σ −_collChange on liquidate rows",
  "pETH from PSM mints": "Σ max(_mintRedeemCollGain, 0)",
  "pETH to PSM redemptions": "Σ max(−_mintRedeemCollGain, 0)",
  "reward pETH": "Σ _bcTokenGain",
  borrowed: "Σ max(_debtChange, 0)",
  repaid: "Σ max(−_debtChange, 0) on open/adjust/close rows",
  "debt liquidated": "Σ −_debtChange on liquidate rows",
  "interest charged": "Σ _accruedInterest",
  "stability gains": "Σ _stableGain",
  "debt from PSM mints": "Σ max(_mintRedeemDebtGain, 0)",
  "debt cleared by PSM redemptions": "Σ max(−_mintRedeemDebtGain, 0)",
  "minted to settle": "Σ _stablesMintedToEnsureZeroDebt",
};

// A reader who opens one PSM leg's own receipt has no reason to know it is
// one half of a figure stated elsewhere on the page — so each of the four
// PSM legs' summaries points at the outcome strip beside the tower, which
// values every one of these same rows at the feed each settled at (never
// this leg's own raw amount) and states the CDP's net equity effect.
const PSM_OUTCOME_POINTER =
  "This leg feeds the PSM-outcome figure beside the tower, which values every priced PSM-share row at the feed it settled at and states the CDP's net equity effect there.";

// Two legs need a summary that does NOT read as if this CDP was redeemed by
// an event of its own: it is the CDP's pro-rata share of the MARKET's PSM
// redemptions, settled onto it at its own touches — never a redemption this
// CDP experienced directly.
const LEG_SUMMARY_OVERRIDE: Partial<Record<PolarisLifetimeLeg, (unit: string) => string>> = {
  "pETH from PSM mints": (unit) =>
    `Lifetime pETH from the market's PSM mints (${unit}) — the sum of this CDP's pro-rata share of every PSM mint, settled onto it at each of its own touches (\`_mintRedeemCollGain\` > 0). Each term is a field the cdpManager itself emitted; the sum is the index's, and the replay identity ties every side's sums back to the last resulting figure exactly. ${PSM_OUTCOME_POINTER}`,
  "pETH to PSM redemptions": (unit) =>
    `Lifetime pETH to the market's PSM redemptions (${unit}) — this CDP was never redeemed by an event of its own; the sum is its pro-rata share of the market's PSM redemptions, settled onto it at each of its own touches (\`_mintRedeemCollGain\` < 0). Each term is a field the cdpManager itself emitted; the sum is the index's, and the replay identity ties every side's sums back to the last resulting figure exactly. ${PSM_OUTCOME_POINTER}`,
  "debt from PSM mints": (unit) =>
    `Lifetime debt from the market's PSM mints (${unit}) — the sum of this CDP's pro-rata share of the debt every PSM mint added, settled onto it at each of its own touches (\`_mintRedeemDebtGain\` > 0). Each term is a field the cdpManager itself emitted; the sum is the index's, and the replay identity ties every side's sums back to the last resulting figure exactly. ${PSM_OUTCOME_POINTER}`,
  "debt cleared by PSM redemptions": (unit) =>
    `Lifetime debt cleared by the market's PSM redemptions (${unit}) — this CDP was never redeemed by an event of its own; the sum is its pro-rata share of the debt the market's PSM redemptions cleared, settled onto it at each of its own touches (\`_mintRedeemDebtGain\` < 0). Each term is a field the cdpManager itself emitted; the sum is the index's, and the replay identity ties every side's sums back to the last resulting figure exactly. ${PSM_OUTCOME_POINTER}`,
};

/** A lifetime sum of one ledger leg over the CDP's whole history. */
export const lifetimeLegProv = (leg: PolarisLifetimeLeg, unit: string, market: PolarisMarket): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  verify: { kind: "rollup", text: "Rolls up to the CDPUpdated rows summed" },
  summary:
    LEG_SUMMARY_OVERRIDE[leg]?.(unit) ??
    `Lifetime ${leg} (${unit}) — the sum of the CDPUpdated leg that carries it, over every touch from the open. Each term is a field the cdpManager itself emitted; the sum is the index's, and the replay identity ties every side's sums back to the last resulting figure exactly.`,
  contract: { name: `Polaris ${stableOf(market)} CDPManager`, address: POLARIS_MARKET_CONFIG[market].cdpManager },
  via: `${POLARIS_VIA} · ${LEG_VIA[leg]} · open → last touch`,
});

// ── the oracle-at-block lane (state) ─────────────────────────────────────────

const priceFeedContract = (market: PolarisMarket) => ({
  name: `Polaris ${stableOf(market)} price feed`,
  address: POLARIS_MARKET_CONFIG[market].priceFeed,
});

const dp4 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** pETH priced in the market's stablecoin at this event's own block — the
 *  market's price feed `previewPrice()`, captured by the oracle-at-block lane
 *  (`polaris_oracle_at_block`) and joined onto the row by its block number.
 *  This is the feed at the END of the block, not necessarily the price the
 *  row's own transaction saw: it equals the price a PSM mint in that block
 *  used, except on a block where another user's bonding-curve write landed
 *  at a LATER transaction index than the touch (proven on blocks 11,642,416 /
 *  11,642,274 / 11,642,132) — the PSM's own mint logs reproduce this figure
 *  exactly on every other block (the lane's own verifier, check 1). */
export const atBlockPriceProv = (
  coords: PolarisCoords,
  priceAtBlock: NonNullable<PolarisContext["priceAtBlock"]>,
  market: PolarisMarket,
): Provenance => {
  const stable = stableOf(market);
  const identity =
    priceAtBlock.curve != null && priceAtBlock.ethInDebt != null
      ? ` Identity: previewPrice = currentPrice × previewReservePriceInDebt ÷ 1e18 — the bonding curve's pETH-in-ETH rate (${dp4(priceAtBlock.curve)}) times ETH priced in ${stable} (${dp4(priceAtBlock.ethInDebt)}).`
      : "";
  return {
    kind: "chain",
    pclass: "oracle",
    verify: {
      kind: "recompute",
      text:
        coords.blockNumber != null
          ? `Re-run previewPrice() on the ${stable} price feed at block ${coords.blockNumber} against an archive node.`
          : `Re-run previewPrice() on the ${stable} price feed.`,
    },
    summary: `pETH priced in ${stable} at the end of this event's block — the ${stable} price feed's own \`previewPrice()\`, read at that block by the oracle-at-block lane. It is the feed value the block closed with, not necessarily the value the row's own transaction saw: a bonding-curve trade later in the same block, or inside the row's own transaction, moves the feed after the read. On the PSM's own mint and redemption logs, which state the price they used, the two agree exactly on about nine blocks in ten; where they differ the gap is typically around a hundredth of a percent and at most 1.7% on the blocks measured.${identity}`,
    contract: priceFeedContract(market),
    via: `polaris_oracle_at_block · ${fieldSeg("previewPrice()", priceAtBlock.raw)}${atBlock(coords)}`,
    inputs: eventInputs(coords, [
      { label: "bonding curve", value: POLARIS_CORE.bondingCurve, kind: "chain", note: "currentPrice() — pETH in ETH" },
    ]),
  };
};
