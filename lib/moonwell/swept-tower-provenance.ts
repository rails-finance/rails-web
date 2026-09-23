// Tower receipts for the INDEX-FREE Moonwell lane, as a factory.
// ----------------------------------------------------------------------------
// The Ethereum tower and the Base one run the same arithmetic (lib/moonwell/
// economics.ts is shared), but they are not making the same claim, and the
// receipt is where that has to be said rather than glossed:
//
//   • The CURRENT balances on a swept explorer are the position read's own
//     figures — the mToken's `balanceOf` × `exchangeRateStored`, and the
//     `borrowBalanceStored` — pinned to the block the position card names.
//     Ethereum's supply figure is the same product with the balance coming
//     from an exact Transfer replay; here it is a single read of the token
//     that owes the balance, which is why these carry the `state` class.
//   • The LIFETIME sums come from a sweep of the chain's logs run for THIS
//     request, from the Comptroller's own first block, not from a captured
//     history. That is what lets these say "every event the wallet's markets
//     ever emitted for it" where the Ethereum wording says "captured".
//   • The market is named by its mToken ADDRESS, because on this deployment
//     the key is the address — the catalog that Ethereum's receipts resolve
//     "mWETH" through does not describe Base.
//
// Reusing Ethereum's receipts here would have named a rails-server index that
// does not exist behind these pages, described an index's reduction that did
// not produce these numbers, and cited the zero address as every market's
// contract. All three read as correct until followed.

import type { Provenance } from "@/components/shared/provenance";
import type { MoonwellTowerVocabulary } from "./economics";

export interface SweptMoonwellIdentity {
  /** The Comptroller's first block — the floor every sweep starts at. */
  deployBlock: number;
  /** The route the position read came through, for the custody line. */
  positionRoute: string;
}

const mtokenContract = (symbol: string, mtoken: string) => ({ name: `mToken (m${symbol})`, address: mtoken });

/** Build the six tower receipts for one swept Moonwell deployment. */
export function makeSweptMoonwellVocabulary(id: SweptMoonwellIdentity): MoonwellTowerVocabulary {
  const sweepVia = `live sweep of the mTokens' own logs from block ${id.deployBlock.toLocaleString("en-US")}`;

  return {
    supplyCurrent: (r): Provenance => ({
      kind: "chain-derived",
      pclass: "state",
      verify: {
        kind: "recompute",
        text: "Re-run the mToken's balanceOf and exchangeRateStored eth_calls and multiply — or call balanceOfUnderlying directly; both reproduce this figure",
      },
      summary: `${r.symbol} the position's supply is worth NOW — the mToken's own \`balanceOf\` × its \`exchangeRateStored\`, both read from the market's contract at the block the position card names. The exchange rate grows as the market accrues interest, so this figure INCLUDES the interest earned since deposit — it is what \`balanceOfUnderlying\` returns. Both legs are chain reads, so the product is chain-derived.`,
      contract: mtokenContract(r.symbol, r.market),
      via: `${id.positionRoute} · mToken balanceOf × exchangeRateStored @ the pinned block`,
      formula: "mTokens × exchange rate",
      inputs: [
        { label: "mTokens", kind: "chain", pclass: "state", note: "mToken balanceOf at the pinned block" },
        {
          label: "exchange rate",
          kind: "chain",
          pclass: "state",
          note: "mToken exchangeRateStored at the pinned block",
        },
      ],
    }),

    supplyPrincipal: (r): Provenance => ({
      kind: "chain-derived",
      pclass: "emitted",
      summary: `${r.symbol} supply PRINCIPAL — Σ(mint − redeem) of the wallet's own Mint and Redeem logs on this market, over every event the market has emitted for it since the Comptroller's first block. No on-chain slot holds deposited principal (the chain stores mTokens); this is the sweep's replay, clamped at zero. Interest earned since deposit is NOT in this figure — the current-value reading (mTokens × exchange rate) carries it.`,
      contract: mtokenContract(r.symbol, r.market),
      via: `${sweepVia} · Σ ±amount across Mint/Redeem logs`,
    }),

    debt: (r): Provenance => ({
      kind: "chain",
      pclass: "state",
      verify: { kind: "recompute", text: "Re-run the mToken.borrowBalanceStored eth_call against any node" },
      summary: `${r.symbol} debt the position owes NOW — the mToken's \`borrowBalanceStored\` read at the block the position card names: the borrower's principal scaled by the market's borrow index, interest accrued to the market's last accrual included. This is the same figure the Comptroller's own liquidity math judges the account by.`,
      contract: mtokenContract(r.symbol, r.market),
      via: `${id.positionRoute} · mToken.borrowBalanceStored @ the pinned block`,
    }),

    lifetimeFlow: (flow, symbol): Provenance => ({
      kind: "chain-derived",
      pclass: "emitted",
      summary: `Lifetime ${flow} (${symbol}) — the sum of every ${symbol} amount this wallet's own mToken events ${flow === "withdrawn" ? "redeemed" : flow === "repaid" ? "repaid" : "had cleared in liquidations"}, over every event the market has emitted for it since the Comptroller's first block. mToken events only — wallet↔wallet mToken transfers move the supply claim without a Mint/Redeem log and are not in this sum (they appear on the timeline as their own events).`,
      contract: { name: "mToken", address: "" },
      via: `${sweepVia} · Σ amount across the wallet's own logs`,
    }),

    debtInterest: (symbol): Provenance => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `Accrued interest inside the ${symbol} debt — the live debt (the mToken's \`borrowBalanceStored\` at the pinned block, interest to the market's last accrual included) minus the net principal replayed from the wallet's own Borrow and RepayBorrow logs since the Comptroller's first block. Exact arithmetic — "owed now minus drawn", not an annualized-rate estimate. Shown only when the sweep read the position's whole history and the subtraction lands inside its own plausibility bounds.`,
      contract: { name: "mToken", address: "" },
      via: `borrowBalanceStored @ the pinned block − (${sweepVia} · Σ borrow − repay − liquidation cover)`,
      formula: "current − net principal",
      inputs: [
        { label: "current", kind: "chain", pclass: "state", note: "borrowBalanceStored at the pinned block" },
        { label: "net principal", kind: "chain-derived", pclass: "emitted", note: "Σ over the swept logs" },
      ],
    }),

    debtPrincipal: (symbol): Provenance => ({
      kind: "chain-derived",
      pclass: "emitted",
      summary: `Borrowed ${symbol} PRINCIPAL — the net of every draw, repayment and liquidation cover the wallet's own mToken events moved, over every event the market has emitted for it since the Comptroller's first block. Principal only: the interest accrued on top is the separate segment above this one.`,
      contract: { name: "mToken", address: "" },
      via: `${sweepVia} · Σ (borrow − repay − liquidation cover)`,
    }),
  };
}
