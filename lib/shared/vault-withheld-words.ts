// The sentences a vault holder page says when its rows are withheld, and when
// the history check asked for the logs a second time. One source for the
// pane and the receipt of every family that draws a holder timeline (Aave,
// Yearn V3, MetaMorpho on Base and Ethereum), so the two cannot say different
// things about the same state (ui-jobs 683).

import { VAULT_TIMELINE_HORIZON, type VaultWithheldBasis } from "@/lib/shared/vault-holder-timeline";

const n = (v: number) => v.toLocaleString("en-US");

/** The count as the sentence states it: "at least N" on a floor. */
export const withheldCountWords = (basis: VaultWithheldBasis, count: number): string =>
  `${basis === "floor" ? "at least " : ""}${n(count)}`;

/** What follows "this address has N transfers on this vault": the bound it is
 *  above, or nothing where the count says nothing about a bound. `ceiling` is
 *  the most rows a page draws for the family (tailMaxRows where a stored
 *  history can be built, else VAULT_TIMELINE_HORIZON). */
export const withheldBoundWords = (basis: VaultWithheldBasis, count: number, ceiling: number): string =>
  basis !== "checked"
    ? "."
    : count > ceiling
      ? `, above the ${n(ceiling)} rows a page can draw.`
      : `, above the ${n(VAULT_TIMELINE_HORIZON)} rows a page can draw without a stored history, and none could be kept on this request.`;

/** Why the count can claim what it claims. `from` is where the recount
 *  started: "block 0" or "the vault's creation block". */
export const withheldReasonWords = (basis: VaultWithheldBasis, from: string): string =>
  basis === "unchecked"
    ? `The balance check did not run: the query for this address's transfers failed, so the range was counted in chunks from ${from}, every chunk answering. The count covers the whole range, but no check confirmed it, and no rows are drawn without one.`
    : basis === "floor"
      ? `The count is a floor: the node did not return the whole range at once, so the range was counted in chunks from ${from}, and the count stopped once it passed ${n(VAULT_TIMELINE_HORIZON)}. Because the logs were never handed over whole, the balance check could not be run on this address.`
      : "The count is exact: both queries returned, and the balance check ran and agreed.";

/** The history check's second asking, after a mismatch. `differed` is true
 *  only when a whole second answer came back with another count; a second
 *  asking that failed leaves the first answer standing. */
export const refetchWords = (differed: boolean): string =>
  `The logs were asked for again after a pause, and ${
    differed
      ? "the second answer held a different number of logs from the first, so the node answered one question two ways"
      : "no second answer came back with a different number of logs"
  }.`;

/** The pane's shorter line after "This address has N share transfers on this
 *  vault": the bound and what follows for the rows, without the receipt's
 *  account of the query and the recount. On a floor the count passed
 *  `VAULT_TIMELINE_HORIZON`, so the bound is that. */
export const withheldPaneWords = (basis: VaultWithheldBasis, count: number, ceiling: number): string =>
  basis === "floor"
    ? `, above the ${n(VAULT_TIMELINE_HORIZON)} rows a page can draw. No rows are drawn.`
    : basis === "unchecked"
      ? ". The balance check did not run, so no rows are drawn."
      : `${withheldBoundWords(basis, count, ceiling)} The count is exact.`;
