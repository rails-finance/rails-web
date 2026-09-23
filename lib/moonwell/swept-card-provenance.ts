// The POSITION CARD's receipts for an INDEX-FREE Moonwell deployment, as a
// factory — the card-side sibling of swept-tower-provenance.ts.
// ----------------------------------------------------------------------------
// The shared Moonwell position card renders Ethereum's and Base's accounts
// through one grammar, and its figures come from two different custodies:
//
//   • On Ethereum the supplies are the index's exact mToken replay × the
//     exchange rate, the principal is the index's Σ(mint − redeem), the debt
//     is the emitted accountBorrows upgraded to the page's live read, and the
//     peaks are the index's maxima over its captured history.
//   • On a swept deployment every CURRENT figure is a live read of the
//     market's own contract at the block the card names, and every HISTORIC
//     one (the principal, the peaks, the interest split's net principal) is
//     a replay of the chain's own logs swept for this request from the
//     Comptroller's first block.
//
// Reusing Ethereum's receipts here would have named a rails-server index that
// does not exist behind these pages and cited the zero address as every
// market's contract; both read as correct until followed.

import type { Provenance } from "@/components/shared/provenance";
import type { SessionProtocol } from "@/lib/shared/sessions";
import type { MoonwellDeploymentIdentity, MoonwellMarketIdentity } from "./deployment-context";
import { avgBorrowRateProv, borrowRateProv } from "./event-provenance";
import { moonwellLiveDebtProv } from "./position-provenance";

export interface SweptMoonwellIdentityArgs {
  session: SessionProtocol;
  /** This deployment's Comptroller, as the receipts name it. */
  comptroller: { name: string; address: string };
  /** The route the page's live position read came through. */
  positionRoute: string;
  /** The WETH Router that proxies native-ETH flows here. */
  router: string;
  /** The Comptroller's first block — the floor every sweep starts at. */
  deployBlock: number;
}

const mtokenContract = (m: MoonwellMarketIdentity) => ({
  name: `mToken (${m.mSymbol})`,
  address: m.mtoken ?? "",
});

/** A deployment whose market key IS the mToken address — Base, where nothing
 *  shorter is unique (two markets both answer `symbol()` = "mUSDC") — with the
 *  card receipts of a swept lane. */
export function makeSweptMoonwellIdentity(id: SweptMoonwellIdentityArgs): MoonwellDeploymentIdentity {
  const sweepVia = `live sweep of the mTokens' own logs from block ${id.deployBlock.toLocaleString("en-US")}`;
  const lane = { comptroller: id.comptroller, positionRoute: id.positionRoute };
  return {
    session: id.session,
    comptroller: id.comptroller,
    positionRoute: id.positionRoute,
    router: id.router,
    market: (key, symbol) => ({ mSymbol: `m${symbol ?? "?"}`, mtoken: key }),
    card: {
      supply: (r, m): Provenance =>
        r.current != null
          ? {
              kind: "chain-derived",
              pclass: "state",
              verify: {
                kind: "recompute",
                text: "Re-run the mToken's balanceOf and exchangeRateStored eth_calls and multiply — or call balanceOfUnderlying directly; both reproduce this figure",
              },
              summary: `${r.symbol} the position's supply is worth NOW — the mToken's own \`balanceOf\` × its \`exchangeRateStored\`, both read live for this page from the market's contract at the block the card names. The exchange rate grows as the market accrues interest, so this figure INCLUDES the interest earned since deposit — it is what \`balanceOfUnderlying\` returns.`,
              contract: mtokenContract(m),
              via: `GET ${id.positionRoute} · mToken balanceOf × exchangeRateStored at the card's block`,
              formula: "mTokens × exchange rate",
              inputs: [
                { label: "mTokens", kind: "chain", pclass: "state", note: "balanceOf at the card's block" },
                {
                  label: "exchange rate",
                  kind: "chain",
                  pclass: "state",
                  note: "exchangeRateStored at the card's block",
                },
              ],
            }
          : {
              kind: "chain-derived",
              pclass: "state",
              summary: `${r.symbol} supply PRINCIPAL — Σ(mint − redeem) over every Mint/Redeem log the wallet's markets ever emitted for it, replayed by a live sweep from the Comptroller's first block, clamped at zero. No on-chain slot holds deposited principal (the chain stores mTokens); interest earned since deposit is NOT in this figure.`,
              contract: mtokenContract(m),
              via: `${sweepVia} · Σ ±amount across Mint/Redeem logs`,
            },
      debt: (r, m): Provenance => moonwellLiveDebtProv(r.symbol, m.mSymbol, m.mtoken, lane),
      usd: (what): Provenance => ({
        kind: "chain-derived",
        pclass: "oracle",
        summary: `${what} valued in USD from the Comptroller's own on-chain oracle — the balance read at the card's block multiplied by the same price the Comptroller reads for its liquidity and liquidation math (\`getUnderlyingPrice\`), not an off-chain market feed.`,
        contract: id.comptroller,
        via: `GET ${id.positionRoute} · chain balance × Comptroller oracle getUnderlyingPrice`,
        formula: "balance × oracle price",
        inputs: [
          { label: "balance", kind: "chain", pclass: "state", note: "read at the card's block" },
          { label: "oracle price", kind: "chain", pclass: "oracle", note: "oracle getUnderlyingPrice" },
        ],
      }),
      // `live` is Ethereum's emitted-vs-live debt switch; a swept lane's debt
      // is always the live read, so the receipt reads the same either way.
      interest: (side): Provenance => ({
        kind: "chain-derived",
        pclass: "state",
        summary:
          side === "supply"
            ? "Accrued supply interest included in the collateral value above — per market, the current value (mToken balance × the exchange rate, both read at the card's block, = balanceOfUnderlying) minus the net principal the live sweep replayed from the position's own Mint/Redeem events, valued at the Comptroller's own on-chain oracle price. Interest grew the claim, so it is part of the headline figure, not a separate holding."
            : "Accrued borrow interest included in the debt above — per market, the live debt (borrowBalanceStored read at the card's block) minus the net principal the live sweep replayed from the position's own Borrow/RepayBorrow events, valued at the Comptroller's own on-chain oracle price. Interest grew the debt, so it is part of the headline figure, not an amount repaid.",
        contract: id.comptroller,
        via:
          side === "supply"
            ? `(mTokens × exchange rate − Σ net event principal) × oracle getUnderlyingPrice, per market · ${sweepVia}`
            : `(borrowBalanceStored − Σ net event principal) × oracle getUnderlyingPrice, per market · ${sweepVia}`,
        formula: "(current − net principal) × oracle price",
        inputs: [
          {
            label: "current",
            kind: "chain",
            pclass: "state",
            note: side === "supply" ? "mTokens × exchangeRateStored (interest included)" : "borrowBalanceStored",
          },
          {
            label: "net principal",
            kind: "chain-derived",
            pclass: "state",
            note: "Σ signed event amounts, live sweep",
          },
          { label: "oracle price", kind: "chain", pclass: "oracle", note: "oracle getUnderlyingPrice" },
        ],
      }),
      // The rate receipts name no deployment: the mToken's own per-timestamp
      // rate, annualized, wherever the market is deployed.
      borrowRate: borrowRateProv,
      avgBorrowRate: avgBorrowRateProv,
      peakSupply: (symbol): Provenance => ({
        kind: "chain-derived",
        pclass: "state",
        summary: `The highest ${symbol} supply PRINCIPAL this wallet ever recorded on this market — the maximum of the running Σ(mint − redeem) the live sweep replays from the wallet's own Mint/Redeem logs, from the Comptroller's first block to the head, at the moment it stood. Interest lives in the exchange rate outside this lane, so the claim's value at its height sat above this figure; mTokens that arrived by transfer never entered it.`,
        contract: id.comptroller,
        via: `${sweepVia} · max(supply principal after) across Mint/Redeem logs`,
      }),
      peakDebt: (symbol): Provenance => ({
        kind: "chain",
        pclass: "emitted",
        summary: `The highest ${symbol} debt this wallet ever recorded on this market — the maximum of the emitted \`accountBorrows\` (the contract's own debt-after, carried verbatim on every Borrow and RepayBorrow log) across every such log the live sweep read, from the Comptroller's first block to the head. Interest is included to each event's own moment; debt accrues between events unrecorded, so the true peak between two events can sit slightly above the largest emitted figure.`,
        contract: id.comptroller,
        via: `${sweepVia} · max(accountBorrows) across Borrow/RepayBorrow logs`,
      }),
    },
  };
}

export interface ListedMoonwellIdentityArgs extends SweptMoonwellIdentityArgs {
  /** The listing route the rows came through. */
  positionsRoute: string;
}

/** The LISTING's identity on a swept deployment: the same market keying as
 *  the position page, but every figure on a listing row was read by Rails'
 *  Base sweep (workers/base-lending-copy) at the block the row names —
 *  balances and debt from each mToken, USD from the Comptroller's own oracle,
 *  the exchange rate from the market — not live for the page, and not an
 *  index. No replay stands behind a row, so there is no principal and no
 *  peak; the card says so instead of showing a dash. */
export function makeListedMoonwellIdentity(id: ListedMoonwellIdentityArgs): MoonwellDeploymentIdentity {
  const swept = makeSweptMoonwellIdentity(id);
  const custody = `read by Rails' Base sweep at the block the row names, served by GET ${id.positionsRoute}`;
  const notRecorded = (what: string): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    summary: `${what} is not recorded on this lane. A listing row is a chain read at one block with no replay of the wallet's history behind it, so its highest recorded amounts are unknown here; the position page sweeps the wallet's whole history and states them.`,
    contract: id.comptroller,
    via: custody,
  });
  return {
    ...swept,
    card: {
      ...swept.card,
      supply: (r, m): Provenance => ({
        kind: "chain-derived",
        pclass: "state",
        verify: {
          kind: "recompute",
          text: "Re-run the mToken's balanceOf and exchangeRateStored eth_calls at the row's block and multiply — or call balanceOfUnderlying there; both reproduce this figure",
        },
        summary: `${r.symbol} the position's supply is worth at the block the row names — the mToken's own \`balanceOf\` × its \`exchangeRateStored\`, both read from the market's contract at that block by Rails' Base sweep. The exchange rate grows as the market accrues interest, so this figure INCLUDES the interest earned since deposit — it is what \`balanceOfUnderlying\` returned there.`,
        contract: mtokenContract(m),
        via: `${custody} · mToken balanceOf × exchangeRateStored at the row's block`,
        formula: "mTokens × exchange rate",
        inputs: [
          { label: "mTokens", kind: "chain", pclass: "state", note: "balanceOf at the row's block" },
          { label: "exchange rate", kind: "chain", pclass: "state", note: "exchangeRateStored at the row's block" },
        ],
      }),
      debt: (r, m): Provenance => ({
        kind: "chain",
        pclass: "state",
        verify: {
          kind: "recompute",
          text: "Call the mToken's borrowBalanceStored(wallet) at the row's block; it answers this figure",
        },
        summary: `${r.symbol} the wallet owes on this market at the block the row names — the mToken's own \`borrowBalanceStored\`, read from the market's contract at that block by Rails' Base sweep. Interest accrued to the market's last accrual before that block is included; interest since it is not.`,
        contract: mtokenContract(m),
        via: `${custody} · mToken borrowBalanceStored at the row's block`,
      }),
      usd: (what): Provenance => ({
        kind: "chain-derived",
        pclass: "oracle",
        summary: `${what} valued in USD from the Comptroller's own on-chain oracle at the block the row names — the balance read there multiplied by the price the Comptroller reads for its liquidity and liquidation math (\`getUnderlyingPrice\`), read by the same sweep at the same block; not an off-chain market feed.`,
        contract: id.comptroller,
        via: `${custody} · chain balance × Comptroller oracle getUnderlyingPrice at the row's block`,
        formula: "balance × oracle price",
        inputs: [
          { label: "balance", kind: "chain", pclass: "state", note: "read at the row's block" },
          {
            label: "oracle price",
            kind: "chain",
            pclass: "oracle",
            note: "oracle getUnderlyingPrice at the row's block",
          },
        ],
      }),
      peakSupply: (symbol) => notRecorded(`The highest ${symbol} supply this wallet ever recorded`),
      peakDebt: (symbol) => notRecorded(`The highest ${symbol} debt this wallet ever recorded`),
    },
  };
}
