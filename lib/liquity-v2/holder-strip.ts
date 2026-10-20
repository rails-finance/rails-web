// Liquity V2's adapter onto the shared holder strip — what a wallet search
// states about the wallet above its own trove cards.
//
// A pure function of the two responses the listing already holds: the rows the
// search returned (`/api/troves?ownerAddress=…`) and the ONE oracle read the
// listing side-fetches on mount (`/api/oracle/liquity-v2`, the same read every
// card's USD and collateral ratio come from). It fetches nothing.
//
// V2 IS POLARIS'S MIRROR, and the units say why. Every trove owes BOLD, so the
// wallet's debt is a quantity of one token and is stated exactly. Collateral is
// WETH on one branch, wstETH on another and rETH on a third, so a wallet across
// branches has no collateral figure that isn't a valuation: that headline is
// stated in dollars at the branch feeds, marked ≈, with the per-token amounts
// named beneath. A wallet on one branch gets its collateral exactly.
//
// A ZOMBIE TROVE IS AN OPEN ONE — redeemed below the minimum debt, still on
// chain, still the holder's, just unredeemable until it is topped back up. It is
// counted with the open troves and SAID as one only when the wallet has any.

import type { HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { Provenance } from "@/components/shared/provenance";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import { TROVE_MANAGER } from "@/lib/liquity/event-provenance";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

/** The ≈ on the wallet's collateral, in one sentence. */
const COLL_TIP =
  "An estimate: the troves' latest stated collateral on each branch, valued at that branch's own PriceFeed as of the latest read. It is a valuation at one moment, not an amount of any one token.";

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const tmContract = (collateralType: string) => ({
  name: "TroveManager",
  address: TROVE_MANAGER[collateralType.toLowerCase()],
});

/** Σ latest stated debt over the wallet's open troves — BOLD, one token. */
function holderDebtProv(): Provenance {
  return {
    kind: "chain",
    pclass: "indexed",
    verify: {
      kind: "recompute",
      text: "Add the entire debt of each open trove the wallet holds — every one of them is on the page under this strip.",
    },
    summary:
      "All the BOLD the wallet's open troves owe — the sum of each trove's entire debt (recorded principal plus the interest accrued to its last indexed state), from the index. Exact: every branch borrows the same token, so the sum is a quantity of it. Interest accrued since each trove's last indexed state is not in it.",
    via: "GET /api/troves?ownerAddress=… · Σ entire debt over the open rows",
    formula: "Σ debt over the wallet's open troves",
    inputs: [
      { label: "debt", kind: "chain", pclass: "indexed", note: "each open trove's entire debt, from the index" },
    ],
  };
}

/** Σ (branch collateral × that branch's feed) — the only sum three tokens have. */
function holderCollValueProv(branches: string[]): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    verify: {
      kind: "recompute",
      text: "Re-run each branch's PriceFeed at the stamped block and multiply the wallet's collateral on that branch by its own price.",
    },
    summary: `What the wallet's open troves hold as collateral, in USD — each branch's collateral (${branches.join(", ")}) at that branch's own on-chain PriceFeed, read once when the listing loaded. An estimate for two reasons: the branches hold different tokens and a sum of them exists only at a price, and each price is one oracle read that moves every block. It is a valuation at that moment, never an amount of anything.`,
    via: "GET /api/oracle/liquity-v2 · Σ branch collateral × the branch's own price",
    formula: "Σ collateral × the branch's price",
    inputs: [
      { label: "collateral", kind: "chain", pclass: "indexed", note: "each open trove's collateral, from the index" },
      {
        label: "price",
        kind: "chain-derived",
        pclass: "oracle",
        note: "the branch's own PriceFeed — the token in USD",
      },
    ],
  };
}

const priceFor = (collateralType: string, prices: OraclePricesData): number | null =>
  prices[collateralType.toLowerCase() as keyof OraclePricesData] ?? null;

/** The counts sentence — troves, and the branch spread only where it is a fact. */
function countsLine(counts: { open: number; closed: number; liquidated: number; zombie: number }, branches: number) {
  const spread = counts.open > 1 && branches === counts.open ? ", one on each branch" : "";
  const head =
    counts.open > 0
      ? `This wallet holds ${plural(counts.open, "open trove", "open troves")}${spread}`
      : "This wallet holds no open troves";
  const zombie =
    counts.zombie > 0
      ? `, ${counts.zombie === 1 ? "1 of them below the floor" : `${counts.zombie.toLocaleString("en-US")} of them below the floor`}`
      : "";
  const closed = counts.closed > 0 ? ` and has closed ${counts.closed.toLocaleString("en-US")}` : "";
  const liq =
    counts.liquidated > 0
      ? `; ${counts.liquidated.toLocaleString("en-US")} ${counts.liquidated === 1 ? "was" : "were"} liquidated`
      : "";
  return `${head}${zombie}${closed}${liq}.`;
}

/** Build the strip for a wallet search's page of Liquity V2 rows. */
export function liquityV2HolderStrip(
  rows: TroveSummary[],
  total: number,
  prices: OraclePricesData,
  perPage: number,
): HolderStripProps {
  const open = rows.filter((t) => t.status === "open");
  const counts = {
    open: open.length,
    closed: rows.filter((t) => t.status === "closed").length,
    liquidated: rows.filter((t) => t.status === "liquidated").length,
    zombie: open.filter((t) => t.isZombie).length,
  };

  if (total > perPage) {
    // The rows are a slice of the wallet: neither the per-status counts nor any
    // sum over them is a statement about the wallet. State the count it does
    // hold, and say why the rest is absent.
    return {
      countsLine: `This wallet holds ${plural(total, "trove", "troves")}.`,
      counts: { open: 0, closed: 0, liquidated: 0 },
      legs: [],
      truncated: true,
      note: `Totals are stated for wallets holding up to ${perPage.toLocaleString("en-US")} positions; this one holds ${total.toLocaleString("en-US")}.`,
    };
  }

  const legs: HolderLeg[] = [];

  // ── the collateral: one branch or several, and the grammar follows ────────
  const byBranch = new Map<string, number>();
  for (const t of open) {
    if (t.collateral.amount > 0)
      byBranch.set(t.collateralType, (byBranch.get(t.collateralType) ?? 0) + t.collateral.amount);
  }
  // Largest first, so the footnote reads as the wallet's own shape.
  const branchLegs = [...byBranch].sort(
    (a, b) => b[1] * (priceFor(b[0], prices) ?? 0) - a[1] * (priceFor(a[0], prices) ?? 0),
  );
  if (branchLegs.length === 1) {
    const [collateralType, amount] = branchLegs[0];
    legs.push({
      id: "collateral",
      label: "Total collateral",
      value: `${formatNumber(amount)} ${collateralType}`,
      approx: false,
      prov: {
        kind: "chain",
        pclass: "indexed",
        summary: `All the ${collateralType} the wallet's open troves hold — the sum of each trove's collateral, from the index. The wallet holds on this branch only, so the sum is a quantity of one token and nothing was converted to reach it.`,
        contract: tmContract(collateralType),
        via: "GET /api/troves?ownerAddress=… · Σ collateral over the open rows",
      },
    });
  } else if (branchLegs.length > 1) {
    let usd = 0;
    const parts: string[] = [];
    for (const [collateralType, amount] of branchLegs) {
      const price = priceFor(collateralType, prices);
      if (price == null) continue;
      usd += amount * price;
      parts.push(`${formatNumber(amount)} ${collateralType}`);
    }
    legs.push({
      id: "collateral",
      label: "Total collateral",
      value: formatUsdValue(usd),
      approx: true,
      tip: COLL_TIP,
      prov: holderCollValueProv(branchLegs.map(([c]) => c)),
      footnote: { text: parts.join(" · ") },
    });
  }

  // ── the debt: BOLD on every branch, so a quantity ─────────────────────────
  const debt = open.reduce((sum, t) => sum + t.debt.current, 0);
  if (debt > 0) {
    legs.push({
      id: "debt",
      label: "Total debt",
      value: `${formatNumber(debt)} BOLD`,
      approx: false,
      prov: holderDebtProv(),
    });
  }

  return {
    countsLine: countsLine(counts, byBranch.size),
    counts: { open: counts.open, closed: counts.closed, liquidated: counts.liquidated, zombie: counts.zombie },
    legs,
    truncated: false,
  };
}
