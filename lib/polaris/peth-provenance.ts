// Receipts for the Polaris pETH account page (ui-jobs 865): the ledger's sums
// over the address's stored rows (rails-server mig 537), the head reads in
// the route's one Multicall3, and each row's logs.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import {
  FPETH,
  POLARIS_CORE,
  POLARIS_MARKET_CONFIG,
  POLARIS_VENUES,
  POLARIS_ZAP_ROUTER,
  SVPETH,
  VPETH,
  type PolarisVenueKey,
} from "./asset-catalog";
import type { PethLedgerLine, PethLedgerRow } from "@/lib/sources/api/polaris-peth";
import { pethKindLabel } from "./peth-ledger";

const VIA = "GET /api/polaris/peth/<address>";

/** A counterparty the deployment names, in words. */
const NAMED: Record<string, string> = {
  [SVPETH.address]: `the ${SVPETH.symbol} vault`,
  [POLARIS_ZAP_ROUTER]: "the zap router",
  ...Object.fromEntries(Object.values(POLARIS_VENUES).map((v) => [v.address, `the ${v.label}`])),
};
const curve = { name: "Polaris BondingCurve (pETH)", address: POLARIS_CORE.bondingCurve };
const splitter = { name: "Polaris fpETH token (splitter)", address: FPETH.address };
const vpeth = { name: "Polaris vpETH token", address: VPETH.address };

const ask = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `To check: ask any Sepolia archive node for ${method} at the stamped block.`,
});
const sum: ProvVerify = {
  kind: "recompute",
  text: "To check: add the matching figure on every row of this address's timeline.",
};

const blockOf = (b: string | null | undefined) => (b == null ? undefined : { block: b });

type LedgerSum = "ethIn" | "ethOut" | "curveFees";

const LEDGER_SUM: Record<LedgerSum, { summary: string; formula: string }> = {
  ethIn: {
    summary:
      "ETH in — the ETH and WETH this address paid for pETH and fpETH: reserveIn on its curve buys, amountIn on zap trades from ETH or WETH, and the WETH paid on BuyFpToken. A zap's amountIn counts the dust the router refunds, so a zap trade can overstate it by that dust.",
    formula: "Σ reserveIn (BcTokensBought) + Σ amountIn (MultiSwap, ETH or WETH in) + Σ BuyFpToken WETH",
  },
  ethOut: {
    summary:
      "ETH out — the ETH and WETH that reached this address: reserveOut on its curve sales, amountOut on zap trades to ETH or WETH, and the WETH paid on an fpETH Redeem. A PSM mint and a POLAR conversion are left out: each is valued on its row.",
    formula: "Σ reserveOut (BcTokensSold) + Σ amountOut (MultiSwap, ETH or WETH out) + Σ Redeem WETH",
  },
  curveFees: {
    summary:
      "Curve fees paid — feeAmount on this address's curve trades, and on the zap router's curve trades in the transactions whose MultiSwap names this address. The fee is in pETH.",
    formula: "Σ feeAmount (BcTokensBought, BcTokensSold)",
  },
};

export function pethLedgerSumProv(what: LedgerSum, scannedTo: string | null, unchecked = false): Provenance {
  const s = LEDGER_SUM[what];
  const note = unchecked
    ? ` The stored ledger reaches${scannedTo ? ` block ${scannedTo}` : " a stored block"}; the head was not read, so how far behind it that is was not checked.`
    : "";
  return {
    kind: "chain-derived",
    pclass: "indexed",
    verify: sum,
    summary: s.summary + note,
    contract: curve,
    formula: s.formula,
    via: `${VIA} · the stored ledger${scannedTo ? ` through block ${scannedTo}` : ""}`,
    source: blockOf(scannedTo),
  };
}

type HeadRead = "pethHeld" | "spot" | "floor" | "fpethHeld" | "vpethHeld";

const HEAD: Record<HeadRead, { method: string; summary: string; contract: Provenance["contract"] }> = {
  pethHeld: {
    method: "balanceOf(address)",
    summary: "pETH held — the pETH token's balanceOf(address) at the head block.",
    contract: curve,
  },
  spot: {
    method: "currentPrice()",
    summary: "Spot — the bonding curve's currentPrice() at the head block: pETH's price in ETH.",
    contract: curve,
  },
  floor: {
    method: "floorPrice()",
    summary: "Floor — the bonding curve's floorPrice() at the head block: the price in ETH the protocol only raises.",
    contract: curve,
  },
  fpethHeld: {
    method: "balanceOf(address)",
    summary: "fpETH in the wallet — the fpETH token's balanceOf(address) at the head block.",
    contract: splitter,
  },
  vpethHeld: {
    method: "balanceOf(address)",
    summary: "vpETH in the wallet — the vpETH token's balanceOf(address) at the head block. It is not valued.",
    contract: vpeth,
  },
};

export function pethHeadProv(what: HeadRead, block: string | null): Provenance {
  const h = HEAD[what];
  return {
    kind: "chain",
    pclass: "state",
    verify: ask(h.method),
    summary: h.summary,
    contract: h.contract,
    via: `${VIA} · ${h.method} @ head`,
    source: blockOf(block),
  };
}

/** A holding at the curve's spot or floor, at the head block. */
export function pethValuedProv(what: "pethSpot" | "pethFloor" | "fpethFloor", block: string | null): Provenance {
  const at = what === "pethSpot" ? "currentPrice()" : "floorPrice()";
  const token = what === "fpethFloor" ? "fpETH" : "pETH";
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask(`balanceOf(address) and ${at}`),
    summary:
      what === "pethSpot"
        ? "pETH held at spot — the balance at the head block times the bonding curve's currentPrice(), in ETH."
        : `${token} held at the floor — the balance at the head block times the bonding curve's floorPrice(), in ETH.`,
    contract: curve,
    formula: `balanceOf(address) × ${at} ÷ 10¹⁸`,
    via: `${VIA} · Multicall3 @ head`,
    source: blockOf(block),
  };
}

export function pethCdpPlaceProv(market: "usdp" | "goldp", cdpId: string, block: string, tx: string): Provenance {
  const m = POLARIS_MARKET_CONFIG[market];
  return {
    kind: "chain",
    pclass: "emitted",
    verify: { kind: "recompute", text: "To check: open the transaction and read CDPUpdated's newColl." },
    summary: `CDP ${m.stable.symbol} #${cdpId}'s collateral — newColl on its last CDPUpdated, in pETH. Reward pETH and PSM shares built up since land at its next touch.`,
    contract: { name: `Polaris ${m.stable.symbol} CdpManager`, address: m.cdpManager },
    via: `${VIA} · polaris_cdp_updated`,
    source: { block, txHash: tx },
  };
}

export function pethSpPlaceProv(market: "usdp" | "goldp", tokenId: string, block: string, tx: string): Provenance {
  const m = POLARIS_MARKET_CONFIG[market];
  return {
    kind: "chain",
    pclass: "emitted",
    verify: { kind: "recompute", text: "To check: open the transaction and read DepositUpdated's stashed pETH." },
    summary: `Deposit #${tokenId}'s pETH — the pETH gains the deposit held unclaimed at its last operation. pETH paid in since is left out.`,
    contract: { name: `Polaris ${m.stable.symbol} StabilityPool`, address: m.stabilityPool },
    via: `${VIA} · polaris_sp_deposit_updated`,
    source: { block, txHash: tx },
  };
}

export function pethLoanPlaceProv(loanId: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    verify: { kind: "recompute", text: "To check: add the collateral changes on the loan's page." },
    summary: `Loan #${loanId}'s fpETH collateral — the fpETH it opened with plus every adjustment since.`,
    contract: { name: "Polaris ReserveLoansManager", address: POLARIS_CORE.reserveLoansManager },
    formula: "LoanOpened fpCollateral + Σ LoanAdjusted collChange",
    via: `${VIA} · polaris_loan_opened + polaris_loan_adjusted`,
  };
}

export function pethLpProv(venue: PolarisVenueKey, block: string | null): Provenance {
  const v = POLARIS_VENUES[venue];
  const reserve = venue === "venue_curve_tripool" ? "balances(0)" : "getReserves() reserve0";
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: ask(`balanceOf(address), totalSupply() and ${reserve}`),
    summary: `pETH in the ${v.label} — this address's share of the pool's pETH: its LP balance over the LP supply, times the pETH the pool holds, at the head block. LP staked in another contract is not seen.`,
    contract: { name: v.label, address: v.address },
    formula: `balanceOf(address) × ${reserve} ÷ totalSupply()`,
    via: `${VIA} · Multicall3 @ head`,
    source: blockOf(block),
  };
}

// ── A row ─────────────────────────────────────────────────────────────────

/** A line of a row: the Transfer log it was read from. */
export function pethLineProv(row: PethLedgerRow, line: PethLedgerLine, symbol: string): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    verify: { kind: "recompute", text: "To check: open the transaction and read the transfer." },
    summary: `${pethKindLabel(line.rule)} — ${symbol} ${line.direction === "in" ? "to this address from" : "from this address to"} ${NAMED[line.counterparty] ?? line.counterparty_role ?? line.counterparty}.`,
    via: `${VIA} · polaris_token_transfer${line.log_index != null ? ` log ${line.log_index}` : ""}`,
    source: { block: row.block_number, txHash: row.tx_hash },
  };
}

/** The row's ETH in, ETH out or curve fee, from its trade logs. */
export function pethRowEthProv(row: PethLedgerRow, what: "ethIn" | "ethOut" | "fee"): Provenance {
  const zap =
    row.zap != null && what !== "fee"
      ? " A zap's amountIn includes the dust the router refunds, so this can read slightly high."
      : "";
  const summary =
    what === "ethIn"
      ? `ETH in on this row — the ETH or WETH this address paid in this transaction.${zap}`
      : what === "ethOut"
        ? `ETH out on this row — the ETH or WETH that reached this address in this transaction.${zap}`
        : "Curve fee on this row — feeAmount on the curve trade, in pETH.";
  return {
    kind: "chain",
    pclass: "emitted",
    verify: {
      kind: "recompute",
      text: "To check: open the transaction and read its BcTokensBought, BcTokensSold or MultiSwap.",
    },
    summary,
    contract: curve,
    via: `${VIA} · polaris_curve_trade, polaris_zap_swap, polaris_splitter_op`,
    source: { block: row.block_number, txHash: row.tx_hash },
  };
}

/** The row's own price: its trade's reserve over its pETH. */
export function pethRowPriceProv(row: PethLedgerRow): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    verify: { kind: "recompute", text: "To check: divide the trade's two amounts in the transaction's log." },
    summary: "Price on this row — the ETH per pETH the trade's log states.",
    contract: curve,
    formula: row.event_price_source ?? undefined,
    via: VIA,
    source: { block: row.block_number, txHash: row.tx_hash },
  };
}

/** A row's valuation at its block. */
export function pethRowValuationProv(row: PethLedgerRow, leg: "eth" | "spot" | "floor"): Provenance {
  const v = row.valuation;
  const what =
    v?.kind === "psm_mint"
      ? leg === "eth"
        ? "The stablecoin this PSM mint paid, in ETH at the market's price feed at its block. A valuation, left out of ETH out."
        : `The pETH this PSM mint gave up, at the curve's ${leg === "spot" ? "spot" : "floor"} at its block.`
      : v?.kind === "polar_conversion"
        ? "The pETH this conversion burned for POLAR, at the curve's floor at its block. A valuation, left out of ETH out."
        : `The pETH that arrived with no ETH paid, at the curve's ${leg === "spot" ? "spot" : "floor"} at its block. A valuation.`;
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: ask(leg === "spot" ? "currentPrice()" : "floorPrice()"),
    summary: what,
    contract: curve,
    formula: v?.basis,
    via: `${VIA} · polaris_oracle_at_block`,
    source: { block: row.block_number, txHash: row.tx_hash },
  };
}
