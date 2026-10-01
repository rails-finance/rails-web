// Event types as plural nouns, for the timeline's filter pills ("Hiding
// liquidations", "Only supplies, borrows"). The Types menu keeps its verb
// labels (`actionLabel`); a pill reads inside a sentence, where a verb does
// not parse. Each name is the shortest plural noun for its menu item, one or
// two words (a hyphenated pair counts as one); the pill's tooltip carries the
// menu's label beside every name that differs from it.
//
// Keyed by the action key, never by the label's text. A key can mean one
// thing on one roster and another elsewhere ("mint" is a supply on Moonwell,
// a position NFT on Fluid, a debt mint on Alchemix), so each roster that
// differs has its own table, tried before the common one — the same order
// `actionLabel` uses. Terms the lexicon names win ("Liquidated" is
// "liquidations", rails-ops standards/lexicon.md). A key with no entry reads
// as the lowercased label, and a dev-only console warning names it.

/** Keys that mean the same on every roster that emits them. */
const COMMON: Record<string, string> = {
  supply: "supplies",
  withdraw: "withdrawals",
  borrow: "borrows",
  repay: "repayments",
  deposit: "deposits",
  withdrawal: "withdrawals",
  swap: "swaps",
  liquidation: "liquidations",
  liquidate: "liquidations",
  liquidated: "liquidations",
  transfer_in: "transfers in",
  transfer_out: "transfers out",
  "transfer-in": "transfers in",
  "transfer-out": "transfers out",
  seize_out: "collateral seizures",
  seize_in: "seizure receipts",
  seize_burn: "seize shares",
  // Liquity family.
  openTrove: "openings",
  openTroveAndJoinBatch: "openings",
  closeTrove: "closures",
  adjustTrove: "adjustments",
  adjustTrove_noChange: "no-change adjustments",
  adjustTroveInterestRate: "rate changes",
  setBatchManagerAnnualInterestRate: "rate changes",
  applyPendingDebt: "debt applications",
  redeemCollateral: "redemptions",
  redemption: "redemptions",
  adjustZombieTrove: "redemptions",
  adjustUnredeemableZombieTrove: "redemptions",
  claimCollateral: "collateral claims",
  setInterestBatchManager: "delegations",
  removeFromBatch: "delegate exits",
  transferTrove: "ownership transfers",
  // Collateral legs.
  supply_collateral: "collateral additions",
  add_collateral: "collateral additions",
  withdraw_collateral: "collateral withdrawals",
  remove_collateral: "collateral removals",
  collateral_toggle: "collateral toggles",
  collateral: "collateral toggles",
  supply_with_collateral: "collateral supplies",
  // Aave and Spark.
  bad_debt_written_off: "write-offs",
  liquidation_fee: "liquidation fees",
  emode: "e-mode changes",
  // Maker keys are the row labels (`getEventActionKey`).
  grab: "liquidations",
  "Open Vault": "vault openings",
  "Adjust Vault": "vault adjustments",
  Deposit: "deposits",
  Withdraw: "withdrawals",
  "Deposit & Generate": "deposit-generations",
  "Deposit & Repay": "deposit-repayments",
  "Withdraw & Generate": "withdraw-generations",
  "Repay & Withdraw": "repay-withdrawals",
  "Move to Another Vault": "moves out",
  "Move from Another Vault": "moves in",
  "Ownership Transferred": "ownership transfers",
  "Auction Started": "auction starts",
  "Auction Sale": "auction sales",
  "Auction Settled": "auction settlements",
};

/** Rosters whose key means something other than the common table says. */
const BY_PROTOCOL: Record<string, Record<string, string>> = {
  // Moonwell and Compound V2: mint and redeem are the supply side.
  moonwell: { mint: "supplies", redeem: "withdrawals" },
  "compound-v2": { mint: "supplies", redeem: "withdrawals" },
  // Comet has no borrow or repay call; each chip names both.
  compound: {
    supply: "supplies",
    withdraw: "withdrawals",
    absorb_debt: "debt liquidations",
    absorb_collateral: "collateral liquidations",
    transfer_collateral_in: "collateral inflows",
    transfer_collateral_out: "collateral outflows",
  },
  dolomite: {
    repay_deposit: "repay-deposits",
    withdraw_borrow: "withdraw-borrows",
    sent_borrow: "sent borrows",
    received_repay: "received repayments",
    trade_taker: "trade spends",
    trade_maker: "trade receipts",
    liquidation_payout: "liquidation payouts",
    vaporize: "vaporizations",
    call: "protocol calls",
  },
  maple: {
    request: "withdrawal requests",
    request_decrease: "request reductions",
    request_cancel: "request cancellations",
    request_fill: "withdrawal fills",
  },
  fluid: {
    deposit_borrow: "deposit-borrows",
    withdraw_payback: "withdraw-repayments",
    deposit_payback: "deposit-repayments",
    withdraw_borrow: "withdraw-borrows",
    payback: "repayments",
    absorbed: "absorptions",
    mint: "position mints",
    transfer: "ownership transfers",
  },
  pwn: {
    created: "creations",
    minted: "mints",
    paid_back: "repayments",
    claimed: "claims",
    extended: "extensions",
    burned: "burns",
  },
  ebisu: {
    adjustTroveInterestRate: "rate adjustments",
    applyPendingDebt: "debt applications",
    openTroveAndJoinBatch: "batch openings",
    setInterestBatchManager: "batch-manager changes",
    removeFromBatch: "batch exits",
  },
  fx: {
    openPosition: "openings",
    adjustPosition: "adjustments",
    closePosition: "closures",
    liquidatePosition: "liquidations",
    mintPosition: "position mints",
    transferOwnership: "ownership transfers",
    tickRebalance: "rebalances",
  },
  frankencoin: {
    open: "openings",
    clone: "clones",
    mint: "mints",
    adjust_price: "price adjustments",
    adjust: "adjustments",
    close: "closures",
    auction_settlement: "auction settlements",
    denied: "denials",
    challenge_started: "challenges started",
    challenge_averted: "challenges averted",
    challenge_succeeded: "successful challenges",
    forced_sale: "forced sales",
    ownership_transferred: "ownership transfers",
  },
  polaris: {
    open: "openings",
    adjust: "adjustments",
    close: "closures",
    transfer: "ownership transfers",
  },
  "aave-vaults": {
    received: "transfers in",
    sent: "transfers out",
    "transfer-self": "self-transfers",
    cooldown: "cooldown starts",
  },
  "sky-savings": {
    received: "transfers in",
    sent: "transfers out",
    self: "self-transfers",
  },
  "alchemix-v3": {
    deposit: "collateral deposits",
    withdraw: "collateral withdrawals",
    mint: "debt mints",
    burn: "debt burns",
    force_repay: "forced repayments",
    self_liquidated: "collateral closures",
    repayment_fee: "repayment fees",
    transfer: "position transfers",
    redemption: "line-wide redemptions",
    batch_liquidated: "batch liquidations",
    fee_shortfall: "fee shortfalls",
    transmuter_position_created: "stakes",
    transmuter_position_claimed: "claims",
    transmuter_position_poked: "pokes",
  },
};
BY_PROTOCOL.asymmetry = BY_PROTOCOL.ebisu;
BY_PROTOCOL.basedollar = BY_PROTOCOL.ebisu;
BY_PROTOCOL["alchemix-v2"] = BY_PROTOCOL["alchemix-v3"];

const warned = new Set<string>();

/** Maker's debt legs carry the token in the key ("Generate DAI"). */
function makerDebtLeg(key: string): string | null {
  const m = /^(Generate|Repay) (\S+)$/.exec(key);
  return m ? `${m[2]} ${m[1] === "Generate" ? "generations" : "repayments"}` : null;
}

/** The plural noun phrase for an action key, or the lowercased label where
 *  none is written (a dev-only console warning names the key). */
export function actionNoun(key: string, protocolKey: string | undefined, label: string): string {
  const named = (protocolKey ? BY_PROTOCOL[protocolKey]?.[key] : undefined) ?? COMMON[key];
  if (named) return named;
  if (protocolKey === "makerdao-vaults") {
    const leg = makerDebtLeg(key);
    if (leg) return leg;
  }
  if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") {
    const id = `${protocolKey ?? ""}:${key}`;
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`[filter pills] no plural noun for action key "${key}" (${protocolKey ?? "no protocol"})`);
    }
  }
  return label.replace(/\b([A-Z])([a-z]+)\b/g, (_, a: string, b: string) => a.toLowerCase() + b);
}
