// PWN provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// Every value a PWN card shows traces to a field of the loan's on-chain terms
// (the SimpleLoan LOANTerms struct, captured at LOANCreated and decoded by the
// copy worker) or to a lifecycle event's own field (LOANClaimed's `defaulted`
// flag) — so every Provenance here is `kind:"chain"`. The one exception is the
// FIXED INTEREST (repay − principal): arithmetic over two on-chain terms fields
// that mirrors the protocol's own `repayAmount = principal + interest` identity,
// so it reads as `chain-derived` — still on-chain-faithful, survives the chain-state gate.
//
// PWN is NOT a pool: there is no running-balance replay and no "before/after"
// reconstruction. The interpreted figures a money-market shows (health factor,
// USD, liquidation price) are absent by construction: a PWN loan has none.
//
// Version caveat: only v1.1 terms carry a single fixed `loanRepayAmount`
// (economics fully fixed at creation — nothing accrues). v1.2/v1.3 terms state
// `fixedInterestAmount` directly and can ALSO accrue via `accruingInterestAPR`
// — they have no repay-total field at all. The repay/interest helpers below
// describe the v1.1 shape, which is the only one whose repay total the cards
// currently value (v1.2/v1.3 rows carry no repay figure to trace).
//
// Replays the captured pwn_* events.

import type { Provenance } from "@/components/shared/provenance";
import { simpleLoanFor, PWN_LOAN_TOKEN, PWN_BUNDLER } from "./asset-catalog";

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const PWN_VIA = "captured PWN events (pwn_*)";

/** The v1.1 LOANCreated terms tuple names the credit field `asset`; v1.2/v1.3
 *  name it `credit`. The via names the field as the ABI spells it. */
const creditField = (version?: string | null): string =>
  version === "v12" || version === "v13" ? "terms.credit.amount" : "terms.asset.amount (the credit)";

export interface PwnCoords {
  txHash?: string;
  blockNumber?: number;
  loanId?: string;
  version?: string | null;
}

const atBlock = (coords?: PwnCoords): string => (coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "");

const contractFor = (coords?: PwnCoords) => simpleLoanFor(coords?.version);

function eventInputs(coords: PwnCoords | undefined) {
  const inputs = [];
  if (coords?.loanId)
    inputs.push({
      label: "loan",
      value: `#${coords.loanId}`,
      kind: "chain" as const,
      note: "loan id (the position key)",
    });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain" as const, note: "event block" });
  if (coords?.txHash)
    inputs.push({
      label: "tx",
      value: coords.txHash,
      kind: "chain" as const,
      note: "captured log",
    });
  return inputs;
}

/** The credit PRINCIPAL the lender advanced — the loan terms' credit amount. */
export const creditAdvancedProv = (sym: string, coords: PwnCoords): Provenance => ({
  kind: "chain",
  summary: `Credit advanced (${sym}) — the principal the lender handed the borrower, from the loan's on-chain terms as created${atBlock(coords)}, scaled by the token's decimals. Fixed for the life of the loan.`,
  contract: contractFor(coords),
  via: `${PWN_VIA} · LOANCreated log · ${creditField(coords.version)}`,
  inputs: eventInputs(coords),
});

/** The total the borrower must repay — the v1.1 terms' `loanRepayAmount`
 *  (principal + fixed interest). v1.2/v1.3 terms have no such field. */
export const repayAmountProv = (sym: string, coords: PwnCoords): Provenance => ({
  kind: "chain",
  summary: `Total repayment owed (${sym}) — the single fixed total (principal + fixed interest) the borrower must repay to reclaim the collateral, set in the loan's on-chain terms at creation${atBlock(coords)}, scaled by the token's decimals. A v1.1 loan's economics are fully fixed — nothing accrues.`,
  contract: contractFor(coords),
  via: `${PWN_VIA} · LOANCreated log · terms.loanRepayAmount`,
  inputs: eventInputs(coords),
});

/** The collateral the borrower locked — the terms' `collateral` (asset + amount,
 *  or token id for an NFT). */
export const collateralLockedProv = (sym: string, coords: PwnCoords): Provenance => ({
  kind: "chain",
  summary: `Collateral locked (${sym}) — the asset the borrower locked to back this loan (asset, id and amount), from the loan's on-chain terms as created${atBlock(coords)}. Held by the protocol until the loan is repaid (returned) or defaults (seized by the lender).`,
  contract: contractFor(coords),
  via: `${PWN_VIA} · LOANCreated log · terms.collateral`,
  inputs: eventInputs(coords),
});

/** The collateral SEIZED by the lender on default — the same locked collateral,
 *  transferred out on a defaulted LOANClaimed. */
export const collateralSeizedProv = (sym: string, coords: PwnCoords): Provenance => ({
  kind: "chain",
  summary: `Collateral seized on default (${sym}) — the locked collateral, transferred to the lender when this loan defaulted${atBlock(coords)}. No separate seizure amount exists on chain: it is the terms' collateral, gated by the close event's defaulted flag.`,
  contract: contractFor(coords),
  via: `${PWN_VIA} · LOANClaimed log (defaulted) · terms.collateral`,
  inputs: eventInputs(coords),
});

// ── Position-card / tower provenances (no per-event coords) ──────────────────

/** Position-card collateral line. */
export const positionCollateralProv = (sym: string, version?: string | null): Provenance => ({
  kind: "chain",
  summary: `Collateral locked (${sym}) — the asset backing this loan, from the loan's on-chain terms as created. Locked by the protocol for the life of the loan.`,
  contract: simpleLoanFor(version),
  via: `${PWN_VIA} · LOANCreated log · terms.collateral`,
});

/** Position-card credit principal line. */
export const positionCreditProv = (sym: string, version?: string | null): Provenance => ({
  kind: "chain",
  summary: `Credit advanced (${sym}) — the principal the lender handed the borrower, from the loan's on-chain terms as created. Fixed for the life of the loan.`,
  contract: simpleLoanFor(version),
  via: `${PWN_VIA} · LOANCreated log · ${creditField(version)}`,
});

/** Position-card / tower repay line (principal + fixed interest). */
export const positionRepayProv = (sym: string, version?: string | null): Provenance => ({
  kind: "chain",
  summary: `Total repayment owed (${sym}) — the single fixed total (principal + fixed interest) owed at maturity, set in the loan's on-chain terms at creation. A v1.1 loan's economics are fully fixed — nothing accrues.`,
  contract: simpleLoanFor(version),
  via: `${PWN_VIA} · LOANCreated log · terms.loanRepayAmount`,
});

/** Position-card bundle-contents footnote — what the Token Bundler bundle used
 *  as this loan's collateral wrapped. A direct view read of the bundler's own
 *  tokensInBundle(id), pinned to the loan's creation block: the bundle is
 *  emptied when unwrapped after the loan closes, so the creation-block state is
 *  the loan's truth. */
export const positionBundleContentsProv = (bundleId: string, atBlock?: number | null): Provenance => ({
  kind: "chain",
  summary: `Bundle contents — the assets wrapped inside PWN Bundle #${bundleId}, the protocol's own ERC-1155 the borrower locked as this loan's collateral. Read from the Token Bundler's tokensInBundle view at the loan's creation block${atBlock != null ? ` (${atBlock})` : ""}; the bundle empties when unwrapped after the loan closes, so it is read as of creation.`,
  contract: PWN_BUNDLER,
  via: "GET /api/chain/pwn/bundle · TokenBundler.tokensInBundle(bundleId) · eth_call at the loan's creation block",
  inputs: [
    { label: "bundle", value: `#${bundleId}`, kind: "chain" as const, note: "the collateral's token id" },
    ...(atBlock != null
      ? [{ label: "block", value: String(atBlock), kind: "chain" as const, note: "loan creation block" }]
      : []),
  ],
});

// ── Loan-book view provenances (/pwn/book — aggregates over the whole set) ──
// The book's figures are counts and same-token sums over the captured loan
// set, so each reads as `chain-derived`: arithmetic whose every operand is an
// emitted terms/event field. No `contract` slot — an aggregate spans the
// SimpleLoan deployments (v1.1/v1.2/v1.3); per-loan rows keep the versioned
// helpers above. No USD ever enters: PWN has no protocol oracle, so a sum
// exists only within one token.

/** Loans ever struck — the size of the captured LOANCreated set. */
export const bookLoanCountProv = (): Provenance => ({
  kind: "chain-derived",
  summary:
    "Loans ever struck — a count of the captured LOANCreated set, one per loan id, across every SimpleLoan deployment (v1.1/v1.2/v1.3). A PWN loan exists exactly when its creation event does; the loan id is the roster key.",
  via: `${PWN_VIA} · count over LOANCreated`,
  formula: "count(LOANCreated)",
});

/** The outcome split — open / repaid / defaulted, each a count of loans whose
 *  lifecycle events say so. */
export const bookStatusCountProv = (status: "open" | "repaid" | "defaulted"): Provenance => {
  const summaries: Record<typeof status, string> = {
    open: "Loans standing open — created, with no repayment recorded and no lender claim yet. Status re-derives from the loan's own chain events alone: a loan is open exactly while neither LOANPaidBack nor LOANClaimed has fired for its id.",
    repaid:
      "Loans repaid — the borrower paid the fixed total and reclaimed the collateral: a LOANPaidBack event (or a LOANClaimed with its defaulted flag false, the lender collecting the repayment) closed the loan.",
    defaulted:
      "Loans defaulted — the loan lapsed at its deadline unpaid and the lender claimed the collateral: a LOANClaimed event with its defaulted flag true. On PWN a default is a clock event, not a price event — nothing is liquidated.",
  };
  const vias: Record<typeof status, string> = {
    open: "no LOANPaidBack / LOANClaimed for the loan id",
    repaid: "LOANPaidBack (or clean LOANClaimed)",
    defaulted: "LOANClaimed · defaulted = true",
  };
  return {
    kind: "chain-derived",
    summary: summaries[status],
    via: `${PWN_VIA} · ${vias[status]}`,
    formula: `count(status = ${status})`,
  };
};

/** Same-token principal sum — lifetime advanced, or outstanding on the open
 *  loans. Every operand is a terms' credit amount. */
export const bookPrincipalProv = (sym: string, scope: "advanced" | "outstanding"): Provenance => ({
  kind: "chain-derived",
  summary:
    scope === "advanced"
      ? `Principal ever advanced in ${sym} — the sum of the credit amounts fixed in each loan's on-chain terms, over every loan denominated in ${sym}. Sums stay within one token: PWN has no protocol oracle, so amounts in different tokens are never added together.`
      : `Principal outstanding in ${sym} — the sum of the credit amounts of the ${sym}-denominated loans still standing open. Sums stay within one token: PWN has no protocol oracle, so amounts in different tokens are never added together.`,
  via: `${PWN_VIA} · LOANCreated log · Σ terms credit amount${scope === "outstanding" ? " (open loans)" : ""}`,
  formula: "Σ principal",
  inputs: [{ label: "principal", kind: "chain" as const, note: "each loan's terms credit amount" }],
});

/** Same-token repay sum over the open loans (principal + fixed interest). */
export const bookRepayOwedProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `Repayment owed in ${sym} — the sum of the fixed repay totals (principal + fixed interest) of the ${sym}-denominated loans still open, each set in its loan's on-chain terms at creation. Stated only when every open loan in the token carries a repay total (v1.1 terms do; v1.2/v1.3 terms have no such field).`,
  via: `${PWN_VIA} · LOANCreated log · Σ terms.loanRepayAmount (open loans)`,
  formula: "Σ repay",
  inputs: [{ label: "repay", kind: "chain" as const, note: "each loan's terms loanRepayAmount" }],
});

/** Count of loans secured by one collateral asset — the whole line, or one
 *  outcome column of it. */
export const bookCollateralLineProv = (sym: string, status?: "open" | "repaid" | "defaulted"): Provenance => {
  const outcomes: Record<NonNullable<typeof status>, string> = {
    open: "still standing open (no repayment recorded and no lender claim yet)",
    repaid: "repaid — the borrower paid the fixed total and reclaimed this collateral",
    defaulted: "defaulted — the loan lapsed at its deadline and the lender claimed this collateral",
  };
  return {
    kind: "chain-derived",
    summary:
      status == null
        ? `Loans secured by ${sym} — a count of the loans whose on-chain terms name this asset as the collateral. The asset's identity is the terms' own collateral address; its name resolves from the chain (symbol()/name()), or from the protocol's own Token Bundler for a bundle.`
        : `Loans secured by ${sym} and ${outcomes[status]} — a count over the loans whose on-chain terms name this asset as the collateral, with status re-derived from each loan's own lifecycle events (LOANPaidBack / LOANClaimed with its defaulted flag).`,
    via: `${PWN_VIA} · LOANCreated log · terms.collateral (grouped by asset${status ? `, status = ${status}` : ""})`,
    formula: status == null ? "count(collateral = asset)" : `count(collateral = asset ∧ status = ${status})`,
  };
};

/** Count of loans denominated in one credit token. */
export const bookCreditCountProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  summary: `Loans denominated in ${sym} — a count of the loans whose on-chain terms name this token as the credit: the principal was advanced, and the repayment is owed, in ${sym}.`,
  via: `${PWN_VIA} · LOANCreated log · terms credit asset (grouped by token)`,
  formula: "count(credit = token)",
});

/** An open loan's deadline — the terms' expiration, or creation + duration. */
export const bookDueProv = (kind: "expiration" | "duration" | null): Provenance =>
  kind === "duration"
    ? {
        kind: "chain-derived",
        summary:
          "Due — the moment this loan lapses: its creation time plus the duration fixed in its on-chain terms. Past it an unpaid loan is claimable by the lender as defaulted.",
        via: `${PWN_VIA} · LOANCreated · created + terms.duration`,
        formula: "created + duration",
      }
    : {
        kind: "chain",
        summary:
          "Due — the expiration moment fixed in this loan's on-chain terms at creation. Past it an unpaid loan is claimable by the lender as defaulted.",
        via: `${PWN_VIA} · LOANCreated log · terms.expiration`,
      };

/** The clock comparison behind a "past due" marker. */
export const bookPastDueProv = (): Provenance => ({
  kind: "chain-derived",
  summary:
    "Past due — the loan's deadline is behind the clock and no repayment or claim is recorded. This is PWN's own default condition: a default is a clock event, and what follows is the lender's claim on the collateral, not a liquidation.",
  via: "terms deadline vs. the current time",
  formula: "now > deadline",
  inputs: [
    { label: "deadline", kind: "chain" as const, note: "the terms' expiration (or created + duration)" },
    { label: "now", kind: "derived" as const, note: "the clock when the page rendered — the comparison's other side" },
  ],
});

/** Term-length distribution: deadline − creation, per loan. */
export const bookTermLengthProv = (): Provenance => ({
  kind: "chain-derived",
  summary:
    "Term length — each loan's deadline minus its creation time, both from its own chain record. The spread (shortest / median / longest) is over every loan whose terms state both.",
  via: `${PWN_VIA} · LOANCreated · deadline − created`,
  formula: "deadline − created",
  inputs: [
    { label: "deadline", kind: "chain" as const, note: "the terms' expiration (or created + duration)" },
    { label: "created", kind: "chain" as const, note: "the LOANCreated block's timestamp" },
  ],
});

/** Fixed-interest share distribution: (repay − principal) ÷ principal. */
export const bookInterestShareProv = (): Provenance => ({
  kind: "chain-derived",
  summary:
    "Fixed interest over principal — what each loan's terms charge above the credit advanced, as a share of it: (repay − principal) ÷ principal, every operand an on-chain terms field. Agreed pairwise at creation and never accruing on a v1.1 loan; the spread is over every loan whose terms carry a fixed repay total.",
  via: "(terms.loanRepayAmount − terms credit amount) ÷ terms credit amount",
  formula: "(repay − principal) ÷ principal",
  inputs: [
    { label: "repay", kind: "chain" as const, note: "the terms' loanRepayAmount" },
    { label: "principal", kind: "chain" as const, note: "the terms' credit amount" },
  ],
});

/** Tower fixed-interest line (repay − principal). */
export const positionInterestProv = (sym: string, version?: string | null): Provenance => ({
  kind: "chain-derived",
  summary: `Fixed interest (${sym}) — what the borrower owes above principal: the fixed repay total minus the credit advanced, along PWN's own repayAmount = principal + fixed interest definition (both operands on-chain terms fields). Agreed upfront and never accruing — exact for a v1.1 fixed loan.`,
  contract: simpleLoanFor(version),
  via: `terms.loanRepayAmount − ${creditField(version)}`,
  formula: "repay − principal",
  inputs: [
    { label: "repay", kind: "chain" as const, note: "the terms' loanRepayAmount" },
    { label: "principal", kind: "chain" as const, note: "the terms' credit amount" },
  ],
});
