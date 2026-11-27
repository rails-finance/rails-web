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
      "ETH in — the ETH and WETH this address paid for pETH and fpETH on its curve buys, its zap trades from ETH or WETH and its fpETH buys. A zap trade counts the dust the router refunds, so it can read high by that dust.",
    formula: "Σ reserveIn (BcTokensBought) + Σ amountIn (MultiSwap, ETH or WETH in) + Σ BuyFpToken WETH",
  },
  ethOut: {
    summary:
      "ETH out — the ETH and WETH that reached this address from its curve sales, its zap trades to ETH or WETH and its fpETH redemptions. PSM mints and POLAR conversions are valued on their rows and not counted here.",
    formula: "Σ reserveOut (BcTokensSold) + Σ amountOut (MultiSwap, ETH or WETH out) + Σ Redeem WETH",
  },
  curveFees: {
    summary:
      "Curve fees paid — the fees the bonding curve took, in pETH, on this address's trades and on the zap router's trades made for it.",
    formula: "Σ feeAmount (BcTokensBought, BcTokensSold)",
  },
};

export function pethLedgerSumProv(what: LedgerSum, scannedTo: string | null, unchecked = false): Provenance {
  const s = LEDGER_SUM[what];
  const note = unchecked
    ? scannedTo
      ? ` The stored ledger reaches block ${scannedTo}; the chain did not answer, so how far it trails is not known.`
      : " The chain did not answer, so how far the stored ledger trails is not known."
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

type HeadRead = "pethHeld" | "spot" | "floor" | "fpethHeld" | "vpethHeld" | "svpethHeld" | "svpethVpeth";

const HEAD: Record<HeadRead, { method: string; summary: string; contract: Provenance["contract"] }> = {
  pethHeld: {
    method: "balanceOf(address)",
    summary: "pETH held — the pETH this address holds at the head block.",
    contract: curve,
  },
  spot: {
    method: "currentPrice()",
    summary: "Spot — the bonding curve's price for pETH in ETH at the head block.",
    contract: curve,
  },
  floor: {
    method: "floorPrice()",
    summary: "Floor — the bonding curve's floor price in ETH at the head block, which the protocol only raises.",
    contract: curve,
  },
  fpethHeld: {
    method: "balanceOf(address)",
    summary: "fpETH in the wallet — the fpETH this address holds at the head block.",
    contract: splitter,
  },
  vpethHeld: {
    method: "balanceOf(address)",
    summary: "vpETH in the wallet — the vpETH this address holds at the head block. It is not valued.",
    contract: vpeth,
  },
  svpethHeld: {
    method: "balanceOf(address)",
    summary: "svpETH in the wallet — the svpETH shares this address holds at the head block. They are not valued.",
    contract: { name: "Polaris svpETH vault", address: SVPETH.address },
  },
  svpethVpeth: {
    method: "convertToAssets(balanceOf(address))",
    summary: "svpETH as vpETH — the vpETH this address's svpETH shares convert to at the head block. It is not valued.",
    contract: { name: "Polaris svpETH vault", address: SVPETH.address },
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
    formula: h.method,
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
        ? "pETH held at spot — the balance times the bonding curve's price, both at the head block, in ETH."
        : `${token} held at the floor — the balance times the bonding curve's floor price, both at the head block, in ETH.`,
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
    summary: `${m.stable.symbol} CDP #${cdpId}'s collateral — the pETH collateral recorded at its last touch. Reward pETH and PSM shares built up since land at its next touch.`,
    formula: "newColl (the CDP's last CDPUpdated)",
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
    summary: `${m.stable.symbol} deposit #${tokenId}'s pETH — the pETH gains it held unclaimed at its last touch. pETH paid in since is not counted.`,
    formula: "stashed pETH (the deposit's last DepositUpdated)",
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
    summary: `pETH in the ${v.label} — this address's share of the pool's pETH: its LP balance over the LP supply, times the pETH the pool holds, at the head block. LP staked in another contract is not counted.`,
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
      ? " A zap trade's amount in counts the dust the router refunds, so this can read slightly high."
      : "";
  const summary =
    what === "ethIn"
      ? `ETH in on this row — the ETH or WETH this address paid in this transaction.${zap}`
      : what === "ethOut"
        ? `ETH out on this row — the ETH or WETH that reached this address in this transaction.${zap}`
        : "Curve fee on this row — the fee the curve took on this trade, in pETH.";
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

/** The row's price: its trade's reserve over its pETH. */
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

/** A row's valuation at its block, from the price the server reads there
 *  (rails-server routes/polaris-peth.ts, valueAtBlock): a USDp mint at the
 *  USDp feed's ETH price in USDp, a GOLDp mint at XAU/USD over ETH/USD, the
 *  rest at the curve's spot or floor. */
export function pethRowValuationProv(row: PethLedgerRow, leg: "eth" | "spot" | "floor"): Provenance {
  const v = row.valuation;
  const at = leg === "spot" ? "spot" : "floor";
  const curveAsk = ask(leg === "spot" ? "the bonding curve's currentPrice()" : "the bonding curve's floorPrice()");
  if (v?.kind === "psm_mint" && leg === "eth") {
    const usdp = v.market !== "goldp";
    const m = POLARIS_MARKET_CONFIG[usdp ? "usdp" : "goldp"];
    return {
      kind: "chain-derived",
      pclass: "oracle",
      verify: ask(
        usdp
          ? "the USDp price feed's previewReservePriceInDebt()"
          : "the XAU/USD and ETH/USD medianisers' previewExternalPrice()",
      ),
      summary: usdp
        ? "The USDp this PSM mint paid, in ETH at the USDp market's ETH price at its block. A valuation, which ETH out does not count."
        : "The GOLDp this PSM mint paid, in ETH at the gold and ETH prices the protocol's medianisers state at its block. A valuation, which ETH out does not count.",
      contract: usdp
        ? { name: "Polaris USDp PriceFeed", address: m.priceFeed }
        : { name: "Polaris XAU/USD Medianiser", address: POLARIS_CORE.xauUsdMedianiser },
      formula: usdp
        ? "USDp paid ÷ previewReservePriceInDebt() (ETH in USDp)"
        : "GOLDp paid × XAU/USD ÷ ETH/USD (previewExternalPrice())",
      via: `${VIA} · polaris_oracle_at_block`,
      source: { block: row.block_number, txHash: row.tx_hash },
    };
  }
  const what =
    v?.kind === "psm_mint"
      ? `The pETH this PSM mint gave up, at the curve's ${at} at its block.`
      : v?.kind === "polar_conversion"
        ? "The pETH this conversion burned for POLAR, at the curve's floor at its block. A valuation, which ETH out does not count."
        : `The pETH that arrived with no ETH paid, at the curve's ${at} at its block. A valuation.`;
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: curveAsk,
    summary: what,
    contract: curve,
    formula: `pETH × ${leg === "spot" ? "currentPrice()" : "floorPrice()"} ÷ 10¹⁸`,
    via: `${VIA} · polaris_oracle_at_block`,
    source: { block: row.block_number, txHash: row.tx_hash },
  };
}
