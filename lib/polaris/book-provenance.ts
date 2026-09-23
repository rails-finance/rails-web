// Provenance vocabulary for the Polaris market board's INDEX lane — the
// counts and sums the markets view states from the replayed book. Kept out of
// the view file so the view carries only prose in the plain-words register;
// receipts keep their own epistemics (a sum is stated as a sum here).

import type { Provenance } from "@/components/shared/provenance";
import { POLARIS_MARKET_CONFIG, type PolarisMarket } from "./asset-catalog";

const BOOK_VIA = "live index · the same rows the listing pages";

/** A count over the whole indexed book of one market. */
export const bookCountProv = (what: string, market: PolarisMarket, how: string): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `${what} — counted over the full indexed roster of the ${POLARIS_MARKET_CONFIG[market].stable.symbol} market's CDPs (every CDPUpdated the cdpManager ever emitted, reduced to each CDP's current state), stated as the index holds it. ${how}`,
  contract: { name: "Rails index · polaris positions" },
  via: BOOK_VIA,
});

/** The open book's collateral or debt — Σ over open CDPs' last resulting figures. */
export const openBookProv = (what: "coll" | "debt", market: PolarisMarket): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary:
    what === "coll"
      ? "pETH held by the open CDPs as the ledger last wrote it — the sum of every open CDP's last CDPUpdated `_newColl`. The chain's own getTotalColl beside it includes the pending legs the next touches will write in, so the two differ by exactly those."
      : `${POLARIS_MARKET_CONFIG[market].stable.symbol} owed by the open CDPs as the ledger last wrote it — the sum of every open CDP's last CDPUpdated \`_newDebt\`. The chain's getTotalDebt beside it is the manager's own accounting of the same book.`,
  contract: { name: "Rails index · polaris positions" },
  via: `${BOOK_VIA} · Σ last ${what === "coll" ? "_newColl" : "_newDebt"} over status=open`,
});
