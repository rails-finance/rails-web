// The receipts of the Euler V2 pages (the figures are lib/euler/position.ts, the
// words lib/euler/words.ts): each figure traces to the contract reads behind it,
// with the blocks they were read at. The surface names no function or block
// (decision 0059 point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { EulerPosition, EulerWalletRow } from "@/lib/euler/position";
import type { BlockRef, EulerPositionRead, EulerWalletRead } from "@/lib/euler/types";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: BlockRef) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });

export interface EulerReceiptContext {
  p: EulerPosition;
  r: EulerPositionRead;
}

const chain = (label: string, value: string): ProvInput => ({ label, value, kind: "chain", pclass: "state" });
const derived = (label: string, value: string): ProvInput => ({ label, value, kind: "derived" });
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const headVia = (r: { head: BlockRef }) => via(`block ${n(r.head.block)}`);
const bothVia = (r: EulerPositionRead) => via(`blocks ${n(r.then.block)} and ${n(r.head.block)}`);
const vaultC = (c: EulerReceiptContext) => ({ name: `Euler vault ${c.r.vault.symbol}`, address: c.r.vault.address });
const oracleC = (c: EulerReceiptContext) => ({ name: "Euler oracle router", address: c.r.vault.oracle ?? undefined });
const evcC = (r: { evc: string }) => ({ name: "Ethereum Vault Connector", address: r.evc });
const unitName = (c: EulerReceiptContext) =>
  c.p.unit.kind === "usd"
    ? "US dollars"
    : c.p.unit.kind === "token"
      ? c.p.unit.symbol
      : `the unit ${c.r.vault.unit.address}`;

/** The receipts the price of the vault's asset adds to a valued figure. */
function priceInputs(c: EulerReceiptContext): ProvInput[] {
  const v = c.r.vault;
  if (v.assetPrice === null || c.p.price === null) return [];
  return [
    chain(
      `oracle ${v.oracle} · getQuote(10^${v.asset.decimals}, ${v.asset.symbol}, unit ${v.unit.address})`,
      v.assetPrice,
    ),
    derived(`${v.asset.symbol} in ${unitName(c)}`, fig(c.p.price ?? 0)),
  ];
}

export type CardKey =
  | "supplied"
  | "earned"
  | "collateralFor"
  | "borrowed"
  | "collateralValue"
  | "health"
  | "interest"
  | "price";

export function cardProv(key: CardKey, c: EulerReceiptContext): Provenance {
  const { p, r } = c;
  const v = r.vault;
  const head = { block: r.head.block };
  const A = v.asset.symbol;
  switch (key) {
    case "supplied":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Supplied — the ${A} this account's ${v.symbol} shares redeem for at ${at(r.head)}: ${fig(p.supplied)} ${A}${p.suppliedValue !== null ? `, worth ${fig(p.suppliedValue)} in ${unitName(c)} at the vault oracle's price` : ""}.`,
        contract: vaultC(c),
        via: headVia(r),
        formula:
          p.suppliedValue !== null
            ? "convertToAssets(balanceOf(account)); × the oracle's price of one asset"
            : "convertToAssets(balanceOf(account))",
        inputs: [
          chain(`balanceOf(${r.account})`, v.shares),
          chain("convertToAssets(shares)", v.assets),
          ...priceInputs(c),
        ],
      };
    case "earned":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary:
          p.earned === null
            ? `Earned in 30 days — the vault had no share price at ${at(r.then)}, so no figure is stated.`
            : `Earned in 30 days — the shares held now times the share price's change from ${at(r.then)} to ${at(r.head)}: ${fig(p.earned)} ${A}, ${fig((p.window.supplyRateYear ?? 0) * 100)}% a year over ${p.window.days.toFixed(2)} days.`,
        contract: vaultC(c),
        via: bothVia(r),
        formula:
          "shares × (sharePrice_now − sharePrice_then) ÷ 10^decimals; yearly: (sharePrice_now ÷ sharePrice_then − 1) × 365 ÷ days",
        inputs: [
          chain(`balanceOf(${r.account}) @ ${n(r.head.block)}`, v.shares),
          chain(`balanceOf(${r.account}) @ ${n(r.then.block)}`, r.past?.shares ?? "–"),
          chain(`convertToAssets(10^${v.decimals}) @ ${n(r.head.block)}`, v.sharePrice),
          chain(`convertToAssets(10^${v.decimals}) @ ${n(r.then.block)}`, r.past?.sharePrice ?? "–"),
          derived("days between the blocks", p.window.days.toFixed(4)),
        ],
      };
    case "collateralFor":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Collateral — the account's enabled collaterals and controllers in the connector at ${at(r.head)}, and each controller's liquidation LTV for this vault${p.collateralFor.length ? `: collateral for ${p.collateralFor.map((x) => x.vaultSymbol).join(", ")}` : ": not collateral for any loan"}.`,
        contract: evcC(r),
        via: headVia(r),
        inputs: [
          chain(`getCollaterals(${r.account})`, r.collaterals.join(", ") || "none"),
          chain(`getControllers(${r.account})`, r.controllers.join(", ") || "none"),
        ],
      };
    case "borrowed":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Borrowed — what this account owes the ${v.symbol} vault at ${at(r.head)}: ${fig(p.borrowed)} ${A}${p.borrowedValue !== null ? `, worth ${fig(p.borrowedValue)} in ${unitName(c)} at the vault oracle's price` : ""}.`,
        contract: vaultC(c),
        via: headVia(r),
        formula: p.borrowedValue !== null ? "debtOf(account); × the oracle's price of one asset" : "debtOf(account)",
        inputs: [chain(`debtOf(${r.account})`, v.debt), ...priceInputs(c)],
      };
    case "collateralValue":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Collateral — each collateral vault's shares on this account priced by this vault's oracle at ${at(r.head)}, added up: ${p.collateralValue === null ? "not priced" : `${fig(p.collateralValue)} in ${unitName(c)}`}.`,
        contract: oracleC(c),
        via: headVia(r),
        formula: "Σ getQuote(shares, collateral vault, unit)",
        inputs: (r.borrow?.collaterals ?? []).map((x) =>
          chain(`getQuote(${x.shares}, ${x.vaultSymbol} ${x.vault}, unit)`, x.value ?? "no answer"),
        ),
      };
    case "health":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Health — the collateral's value at liquidation LTVs over the debt's value, as the ${v.symbol} vault states them at ${at(r.head)}: ${p.health === null ? "–" : p.health.toFixed(4)}.`,
        contract: vaultC(c),
        via: headVia(r),
        formula: "collateralValue ÷ liabilityValue, from accountLiquidity(account, liquidation = true)",
        inputs: [
          chain(
            "accountLiquidity(account, true) · collateralValue",
            r.borrow?.liquidation?.collateralValue ?? "no answer",
          ),
          chain(
            "accountLiquidity(account, true) · liabilityValue",
            r.borrow?.liquidation?.liabilityValue ?? "no answer",
          ),
        ],
      };
    case "interest":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary:
          p.interest === null
            ? `Interest in 30 days — the vault had no interest index at ${at(r.then)}, so no figure is stated.`
            : `Interest in 30 days — the debt owed now less that debt deflated by the interest index's growth from ${at(r.then)} to ${at(r.head)}: ${fig(p.interest)} ${A}, ${fig((p.window.borrowRateYear ?? 0) * 100)}% a year over ${p.window.days.toFixed(2)} days.`,
        contract: vaultC(c),
        via: bothVia(r),
        formula: "debt × (1 − index_then ÷ index_now); yearly: (index_now ÷ index_then − 1) × 365 ÷ days",
        inputs: [
          chain(`debtOf(${r.account}) @ ${n(r.head.block)}`, v.debt),
          chain(`debtOf(${r.account}) @ ${n(r.then.block)}`, r.past?.debt ?? "–"),
          chain(`interestAccumulator() @ ${n(r.head.block)}`, v.interestAccumulator),
          chain(`interestAccumulator() @ ${n(r.then.block)}`, r.past?.interestAccumulator ?? "–"),
        ],
      };
    case "price":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Oracle price — one ${A} in ${unitName(c)} from the ${v.symbol} vault's oracle router at ${at(r.head)}${p.price === null ? ": the router gave no price" : `: ${fig(p.price)}`}.`,
        contract: oracleC(c),
        via: headVia(r),
        inputs: [chain("unitOfAccount()", v.unit.address), chain("oracle()", v.oracle ?? "none"), ...priceInputs(c)],
      };
  }
}

/** A collateral row on a loan's card. */
export function collateralProv(i: number, part: "amount" | "value" | "ltv", c: EulerReceiptContext): Provenance {
  const x = c.r.borrow!.collaterals[i];
  const head = { block: c.r.head.block };
  if (part === "amount")
    return {
      kind: "derived",
      pclass: "state",
      source: head,
      summary: `${x.vaultSymbol} — the ${x.asset.symbol} this account's shares redeem for at ${at(c.r.head)}: ${fig(c.p.collaterals[i].amount)}.`,
      contract: { name: `Euler vault ${x.vaultSymbol}`, address: x.vault },
      via: headVia(c.r),
      formula: "convertToAssets(balanceOf(account))",
      inputs: [chain(`balanceOf(${c.r.account})`, x.shares), chain("convertToAssets(shares)", x.assets)],
    };
  if (part === "value")
    return {
      kind: "chain",
      pclass: "state",
      source: head,
      summary: `${x.vaultSymbol} value — the shares priced by the ${c.r.vault.symbol} vault's oracle router at ${at(c.r.head)}, in ${unitName(c)}.`,
      contract: oracleC(c),
      via: headVia(c.r),
      inputs: [chain(`getQuote(${x.shares}, ${x.vault}, ${c.r.vault.unit.address})`, x.value ?? "no answer")],
    };
  return {
    kind: "chain",
    pclass: "state",
    source: head,
    summary: `${x.vaultSymbol} liquidation LTV — the share of this collateral's value the ${c.r.vault.symbol} vault counts before a loan can be liquidated, at ${at(c.r.head)}.`,
    contract: vaultC(c),
    via: headVia(c.r),
    inputs: [
      chain(`LTVLiquidation(${x.vault})`, String(x.ltvLiquidation)),
      chain(`LTVBorrow(${x.vault})`, String(x.ltvBorrow)),
    ],
  };
}

export type VaultLineKey = "supplied" | "borrowed" | "utilisation" | "shareGrowth" | "borrowRate" | "price";
export function vaultProv(key: VaultLineKey, c: EulerReceiptContext): Provenance {
  const { p, r } = c;
  const v = r.vault;
  const head = { block: r.head.block };
  switch (key) {
    case "supplied":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Supplied — everything the ${v.symbol} vault's shares redeem for at ${at(r.head)}: ${fig(p.totalSupplied)} ${v.asset.symbol}.`,
        contract: vaultC(c),
        via: headVia(r),
        inputs: [chain("totalAssets()", v.totalAssets)],
      };
    case "borrowed":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Borrowed — what the ${v.symbol} vault's borrowers owe at ${at(r.head)}: ${fig(p.totalBorrowed)} ${v.asset.symbol}.`,
        contract: vaultC(c),
        via: headVia(r),
        inputs: [chain("totalBorrows()", v.totalBorrows)],
      };
    case "utilisation":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Utilisation — borrowed over supplied at ${at(r.head)}.`,
        contract: vaultC(c),
        via: headVia(r),
        formula: "totalBorrows ÷ totalAssets",
        inputs: [chain("totalBorrows()", v.totalBorrows), chain("totalAssets()", v.totalAssets)],
      };
    case "shareGrowth":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Share price — the asset one whole share redeems for, at ${at(r.then)} and ${at(r.head)}.`,
        contract: vaultC(c),
        via: bothVia(r),
        formula: "sharePrice_now ÷ sharePrice_then − 1",
        inputs: [
          chain(`convertToAssets(10^${v.decimals}) @ ${n(r.head.block)}`, v.sharePrice),
          chain(`convertToAssets(10^${v.decimals}) @ ${n(r.then.block)}`, r.past?.sharePrice ?? "–"),
        ],
      };
    case "borrowRate":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Borrow rate — the vault's per-second rate at ${at(r.head)} times a year's seconds, and the interest index's growth from ${at(r.then)} annualised simply.`,
        contract: vaultC(c),
        via: bothVia(r),
        formula: "interestRate × 31,536,000 ÷ 10^27; (index_now ÷ index_then − 1) × 365 ÷ days",
        inputs: [
          chain("interestRate()", v.interestRate),
          chain(`interestAccumulator() @ ${n(r.head.block)}`, v.interestAccumulator),
          chain(`interestAccumulator() @ ${n(r.then.block)}`, r.past?.interestAccumulator ?? "–"),
        ],
      };
    case "price":
      return cardProv("price", c);
  }
}

/** The contracts a read stamp's receipt names. */
export function readContracts(c: EulerReceiptContext): { name: string; address: string; reads: string }[] {
  const out = [
    { name: "Ethereum Vault Connector", address: c.r.evc, reads: "the account's controllers, collaterals and owner" },
    { name: "Euler vault factory", address: c.r.factory, reads: "that the vault is one it deployed" },
    {
      name: `Euler vault ${c.r.vault.symbol}`,
      address: c.r.vault.address,
      reads:
        "the account's shares and debt, the share price, the interest index and rate, totals, unit of account and oracle",
    },
  ];
  if (c.r.vault.oracle)
    out.push({
      name: "Euler oracle router",
      address: c.r.vault.oracle,
      reads: "the asset's and the collaterals' prices in the unit of account",
    });
  for (const x of c.r.borrow?.collaterals ?? [])
    out.push({
      name: `Euler vault ${x.vaultSymbol}`,
      address: x.vault,
      reads: "the account's shares and what they redeem for",
    });
  return out;
}

/** A wallet row's amount. */
export function walletRowProv(row: EulerWalletRow, w: EulerWalletRead): Provenance {
  return {
    kind: row.kind === "loan" ? "chain" : "derived",
    pclass: "state",
    source: { block: w.head.block },
    summary:
      row.kind === "loan"
        ? `${row.vaultSymbol} — what account ${row.index} owes the vault at ${at(w.head)}: ${fig(row.amount)} ${row.asset.symbol}.`
        : `${row.vaultSymbol} — the ${row.asset.symbol} account ${row.index}'s shares redeem for at ${at(w.head)}: ${fig(row.amount)}.`,
    contract: { name: `Euler vault ${row.vaultSymbol}`, address: row.vault },
    via: headVia(w),
    formula: row.kind === "loan" ? "debtOf(account)" : "convertToAssets(balanceOf(account))",
    inputs: [
      chain(row.kind === "loan" ? `debtOf(${row.account})` : `convertToAssets(balanceOf(${row.account}))`, row.raw),
    ],
  };
}

/** How the wallet's accounts were found. */
export function walletFindProv(w: EulerWalletRead): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    source: { block: w.head.block },
    summary: `Accounts — found at ${at(w.head)} from the connector's controllers and collaterals for each of the wallet's 256 accounts, and the wallet's balance in each of the factory's ${n(w.vaultCount)} vaults on account 0, in ${n(w.findCalls)} calls.`,
    contract: evcC(w),
    via: headVia(w),
    inputs: [
      chain("getControllers(account i), getCollaterals(account i)", "i = 0 … 255; account i = wallet XOR i"),
      chain(`getProxyListLength() · ${w.factory}`, String(w.vaultCount)),
      chain("balanceOf(wallet) on each vault", `${w.vaultCount} calls`),
    ],
  };
}
