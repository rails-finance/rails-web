// The POSITION CARD's receipts for a LISTED Morpho row — a chain read at one
// block, served by a listing route, with no replay behind it.
// ----------------------------------------------------------------------------
// The shared Morpho card carries three custodies now, and the receipts differ
// in what they can cite:
//
//   • Ethereum's index: the collateral and principal are replays of captured
//     morpho_* events; the debt with interest is the borrow shares through the
//     live market totals (lib/morpho/event-provenance.ts).
//   • The Base position page: the same replay, swept live from the singleton's
//     own logs for the request (MorphoCoords.source = "sweep").
//   • The Base LISTING (this file): every figure on a row was read by Rails
//     from the singleton's `position` and `market` slots at the block the row
//     names, after the account's most recent event, and valued at the
//     market's own oracle read at that same block — not live for the page,
//     and not an index. There is no history behind a row, so no principal and
//     no peak: the receipt says so where the Ethereum card shows a figure.
//     No health receipt either: a listing exists to find a position, and risk
//     is read live on the position page (rails-ops decision 0018).
//
// Reusing Ethereum's receipts here would have named captured events that do
// not exist behind these rows; the swept ones would have claimed a log sweep
// the listing never ran.

import type { Provenance } from "@/components/shared/provenance";
import { BASE_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { MORPHO_ADDRESSES } from "./asset-catalog";

export interface ListedMorphoReceiptsArgs {
  chainId: ChainId;
  /** The listing route the rows came through. */
  positionsRoute: string;
  /** Replaces the default custody line ("read by Rails at the block the row
   *  names, after the account's most recent event; the position page reads it
   *  live · served by GET <route>") when the figures did not come through a
   *  listing row — the position page's live head read of the singleton names
   *  its own route and block instead. */
  custody?: string;
}

export interface ListedMorphoReceipts {
  collateral: (sym: string, block: number) => Provenance;
  debt: (
    sym: string,
    sharesHuman: string,
    totalBorrowAssets: string,
    totalBorrowShares: string,
    block: number,
  ) => Provenance;
  collateralValue: (collSym: string, loanSym: string, block: number) => Provenance;
  notRecorded: (what: string) => Provenance;
}

export function makeListedMorphoReceipts(id: ListedMorphoReceiptsArgs): ListedMorphoReceipts {
  const contract = {
    name: id.chainId === BASE_CHAIN_ID ? "Morpho Blue (Base)" : "Morpho Blue",
    address: MORPHO_ADDRESSES.MORPHO_BLUE,
  };
  const custody =
    id.custody ??
    `read by Rails at the block the row names, after the account's most recent event; the position page reads it live · served by GET ${id.positionsRoute}`;
  const slotVerify = (block: number) => ({
    kind: "recompute" as const,
    text: `Re-run the Morpho.position eth_call at block ${block} against an archive node; the slot answers this figure`,
  });
  return {
    collateral: (sym, block) => ({
      kind: "chain",
      pclass: "state",
      verify: slotVerify(block),
      summary: `Collateral (${sym}) the position holds at block ${block} — the singleton's own \`position(id, user).collateral\` slot, read at that block by Rails, after the account's most recent event; the position page reads it live. Exact: collateral does not accrue, so the slot is the whole answer.`,
      contract,
      via: `${custody} · position(id, user).collateral at the row's block`,
    }),
    debt: (sym, sharesHuman, totalBorrowAssets, totalBorrowShares, block) => ({
      kind: "chain",
      pclass: "state",
      verify: {
        kind: "recompute",
        text: `Re-run Morpho.position and Morpho.market at block ${block} and convert the borrow shares with toAssetsUp; the figure reproduces`,
      },
      summary: `Debt (${sym}) the position owes at block ${block}, interest included — the position's borrow-shares slot converted to assets through the market's own totals, both read at that block by Rails, after the account's most recent event, rounded up as the contract rounds against a borrower (toAssetsUp). Interest the market had settled by that block is in it; interest accrued since is not; the position page reads it live.`,
      contract,
      via: `${custody} · borrowShares → assets (toAssetsUp) over market(id) totals at the row's block`,
      formula: "shares × (totalBorrowAssets + 1) ÷ (totalBorrowShares + 1e6), rounded up",
      inputs: [
        {
          label: "borrowShares",
          value: sharesHuman,
          kind: "chain",
          pclass: "state",
          note: "position(id, user).borrowShares at the row's block",
        },
        {
          label: "totalBorrowAssets",
          value: totalBorrowAssets,
          kind: "chain",
          pclass: "state",
          note: "market(id) at the row's block",
        },
        {
          label: "totalBorrowShares",
          value: totalBorrowShares,
          kind: "chain",
          pclass: "state",
          note: "market(id) at the row's block",
        },
      ],
    }),
    collateralValue: (collSym, loanSym, block) => ({
      kind: "chain-derived",
      pclass: "oracle",
      summary: `The collateral (${collSym}) valued in ${loanSym} at block ${block} — the slot's collateral multiplied by the market's OWN oracle price (IOracle.price(), fixed in the market's immutable params), the oracle asked at that block by the same read that took the slot. This is the figure Morpho's own solvency test prices the collateral at; no USD is asserted anywhere.`,
      contract,
      via: `${custody} · collateral × oracle price ÷ 1e36 at the row's block`,
      formula: "collateral × price ÷ 1e36",
      inputs: [
        { label: "collateral", kind: "chain", pclass: "state", note: "position slot at the row's block" },
        {
          label: "price",
          kind: "chain",
          pclass: "oracle",
          note: "the market's oracle at the row's block, 1e36-scaled",
        },
      ],
    }),
    notRecorded: (what) => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `${what} is not recorded here — a listing row is a read of the position's slots at one block with no history behind it, so its highest recorded amounts and its principal are unknown on this row; the wallet page reads the whole history from the singleton's own logs and states them.`,
      contract,
      via: custody,
    }),
  };
}
