// Liquity V2's adapter onto the shared holder strip — what a wallet search
// states about the wallet above its own trove cards.
//
// A pure function of the two responses the listing already holds: the rows the
// search returned (`/api/troves?ownerAddress=…`) and the ONE oracle read the
// listing side-fetches on mount (`/api/oracle/liquity-v2`, the same read every
// card's USD and collateral ratio come from). It fetches nothing.
//
// V2 IS POLARIS'S MIRROR, and the units say why. Every trove owes BOLD, so the
// wallet's debt is a quantity of one token. Collateral is WETH on one branch,
// wstETH on another and rETH on a third, so a wallet across branches has no
// collateral figure that isn't a valuation: that headline is stated in dollars
// at the branch feeds, with the per-token amounts named beneath. A wallet on one
// branch gets its collateral in that token.
//
// THE CARD'S FIGURE, AND THE CARD'S MARKS (ui-jobs 737). Each leg draws the
// position card's figure: compact, the token's icon, the USD line. The rows are
// each trove's figures as of its last touch, as the cards below are, so the
// legs wear no ≈ where the cards wear none; the tip and the receipt say what
// built up since. `positions` lets the listing's band draw from two troves and
// its totals from two open ones (components/shared/holder-strip.tsx); the
// share card reads the same model whole.
//
// A ZOMBIE TROVE IS AN OPEN ONE — redeemed below the minimum debt, still on
// chain, still the holder's, just unredeemable until it is topped back up. It is
// counted with the open troves and SAID as one only when the wallet has any.

import type { HolderKindCount, HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { HolderKindPage } from "@/components/shared/holder-kinds";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import type { Provenance } from "@/components/shared/provenance";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import { TROVE_MANAGER } from "@/lib/liquity/event-provenance";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { holderUsdReceipt } from "@/lib/shared/holder-usd-receipt";
import { liquityV2PriceNote } from "@/lib/liquity-v2/price-notes";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { big, units } from "./sp-math";
import { depositsLine } from "@/lib/liquity/holder-deposits";

const collToken = (collateralType: string) => ({
  symbol: collateralType,
  address: LIQUITY_V2_BRANCHES[collateralType.toLowerCase()]?.collateralAddr,
});

/** What each leg leaves out, in a sentence or two. */
const LEG_TIP = {
  collateral: "As of each open Trove's last touch. Redistribution gains since then are left out.",
  collateralValued:
    "The open Troves' collateral as of each one's last touch, each branch's amount at that branch's price, summed. Redistribution gains since then are left out.",
  debt: "As of each open Trove's last touch. The interest and redistributed debt built up since are left out.",
} as const;

const DEPOSIT_TIP = "As of each deposit's last touch. Liquidations since then have not been taken out.";

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
      text: "Add the entire debt of each open Trove the wallet holds — every one of them is on the page under this strip.",
    },
    summary:
      "All the BOLD the wallet's open Troves owe — the sum of each Trove's entire debt (recorded principal plus the interest accrued to its last touch), from the index. Every branch borrows the same token, so the sum is a quantity of it. The interest and redistributed debt built up since each Trove's last touch are not in it.",
    via: "GET /api/troves?ownerAddress=… · Σ entire debt over the open rows",
    formula: "Σ debt over the wallet's open Troves",
    inputs: [
      { label: "debt", kind: "chain", pclass: "indexed", note: "each open Trove's entire debt, from the index" },
    ],
  };
}

const ORACLE_VIA = "GET /api/oracle/liquity-v2";
const collAmountNote = (ct: string) =>
  `Σ collateral of the wallet's open Troves on the ${ct} branch, each as of its last touch`;

const priceFor = (collateralType: string, prices: OraclePricesData): number | null =>
  prices[collateralType.toLowerCase() as keyof OraclePricesData] ?? null;

/** The counts sentence — troves, and the branch spread only where it is a fact. */
function countsLine(counts: { open: number; closed: number; liquidated: number; zombie: number }, branches: number) {
  const spread = counts.open > 1 && branches === counts.open ? ", one on each branch" : "";
  const head =
    counts.open > 0
      ? `This wallet holds ${plural(counts.open, "open Trove", "open Troves")}${spread}`
      : "This wallet holds no open Troves";
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
  /** The answer's count of Troves the wallet passed on, all pages. */
  passedOn = 0,
  /** The wallet the search names (an address or an ENS name), for the link. */
  wallet?: string,
  /** The wallet's Stability Pool deposits, every status, one page (§1b). */
  deposits?: HolderKindPage<LiquityV2DepositRow>,
): HolderStripProps {
  // A Trove the wallet passed on (formerHold, ui-jobs 705) is not its
  // holding: left out of the counts, the sums and the count it holds. Whether
  // the page is the whole answer is read on the answer's total, moved ones in.
  const truncated = total > perPage;
  const held = total - passedOn;
  rows = rows.filter((t) => !t.formerHold);
  const open = rows.filter((t) => t.status === "open");
  const counts = {
    open: open.length,
    closed: rows.filter((t) => t.status === "closed").length,
    liquidated: rows.filter((t) => t.status === "liquidated").length,
    zombie: open.filter((t) => t.isZombie).length,
  };

  const depOpen = deposits?.rows.filter((d) => d.status === "open") ?? [];
  const depClosed = (deposits?.rows.length ?? 0) - depOpen.length;
  const kinds: HolderKindCount[] | undefined = deposits
    ? [{ id: "deposit", noun: ["deposit", "deposits"], open: depOpen.length, closed: depClosed }]
    : undefined;
  const positions = held + (deposits?.total ?? 0);

  // A wallet holds at most one deposit on each branch, so they fit one page.
  if (truncated) {
    // The rows are a slice of the wallet: neither the per-status counts nor any
    // sum over them is a statement about the wallet. State the count it does
    // hold, and say why the rest is absent.
    return {
      countsLine: `This wallet holds ${plural(held, "Trove", "Troves")}.${depositsLine(depOpen.length, depClosed)}`,
      counts: { open: 0, closed: 0, liquidated: 0 },
      legs: [],
      truncated: true,
      positions,
      wallet,
      protocol: "liquity-v2",
      note: `Totals are stated for wallets holding up to ${perPage.toLocaleString("en-US")} positions; this one holds ${held.toLocaleString("en-US")}.`,
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
    const price = priceFor(collateralType, prices);
    const receipt =
      price != null
        ? holderUsdReceipt({
            what: "The wallet's collateral in USD",
            legs: [
              {
                token: collateralType,
                amount,
                amountNote: collAmountNote(collateralType),
                price,
                priceNote: liquityV2PriceNote(collateralType),
              },
            ],
            via: ORACLE_VIA,
          })
        : null;
    legs.push({
      id: "collateral",
      label: "Total collateral",
      value: `${formatNumber(amount)} ${collateralType}`,
      approx: false,
      tip: LEG_TIP.collateral,
      figure: {
        amount,
        tokens: [collToken(collateralType)],
        usd: receipt?.usd ?? null,
        usdProv: receipt?.prov,
      },
      prov: {
        kind: "chain",
        pclass: "indexed",
        summary: `All the ${collateralType} the wallet's open Troves hold — the sum of each Trove's collateral, from the index. The wallet holds on this branch only, so the sum is a quantity of one token and nothing was converted to reach it. Redistribution gains since each Trove's last touch are not in it.`,
        contract: tmContract(collateralType),
        via: "GET /api/troves?ownerAddress=… · Σ collateral over the open rows",
      },
    });
  } else if (branchLegs.length > 1) {
    const parts: { text: string; symbol: string; address?: string }[] = [];
    const usdLegs = [];
    for (const [collateralType, amount] of branchLegs) {
      const price = priceFor(collateralType, prices);
      if (price == null) continue;
      parts.push({ text: `${formatNumber(amount)} ${collateralType}`, ...collToken(collateralType) });
      usdLegs.push({
        token: collateralType,
        amount,
        amountNote: collAmountNote(collateralType),
        price,
        priceNote: liquityV2PriceNote(collateralType),
      });
    }
    // A sum across tokens stands only where every token is priced: a total
    // of the priced ones alone would read as the whole.
    if (usdLegs.length === branchLegs.length) {
      const receipt = holderUsdReceipt({
        what: "The wallet's collateral in USD, across branches",
        legs: usdLegs,
        via: ORACLE_VIA,
        caveat: "The branches hold different tokens, so their sum exists only at a price.",
      });
      legs.push({
        id: "collateral",
        label: "Total collateral",
        value: formatUsdValue(receipt.usd),
        approx: false,
        tip: LEG_TIP.collateralValued,
        prov: receipt.prov,
        footnote: { text: parts.map((p) => p.text).join(" · "), parts },
        // The icons of the branches the total counts.
        figure: { tokens: usdLegs.map((l) => collToken(l.token)), usd: receipt.usd },
      });
    } else {
      // A branch unpriced: each branch's quantity stands, with no total.
      legs.push({
        id: "collateral",
        label: "Total collateral",
        value: branchLegs.map(([c, amount]) => `${formatNumber(amount)} ${c}`).join(" · "),
        approx: false,
        tip: LEG_TIP.collateral,
        prov: {
          kind: "chain",
          pclass: "indexed",
          summary:
            "The wallet's open Troves' collateral, branch by branch — the sum of each Trove's collateral on its branch, from the index. A branch's price is missing, so the branches carry no total in dollars. Redistribution gains since each Trove's last touch are not in it.",
          via: "GET /api/troves?ownerAddress=… · Σ collateral over the open rows, per branch",
        },
      });
    }
  }

  // ── the debt: BOLD on every branch, so a quantity ─────────────────────────
  const debt = open.reduce((sum, t) => sum + t.debt.current, 0);
  if (debt > 0) {
    const debtReceipt = holderUsdReceipt({
      what: "The wallet's debt in USD",
      legs: [
        {
          token: "BOLD",
          amount: debt,
          amountNote: "Σ entire debt of the wallet's open Troves, each as of its last touch",
          price: 1,
          face: true,
          priceNote: "BOLD's $1 face: the protocol redeems 1 BOLD for $1 of collateral",
        },
      ],
      via: "GET /api/troves?ownerAddress=…",
    });
    legs.push({
      id: "debt",
      label: "Total debt",
      value: `${formatNumber(debt)} BOLD`,
      approx: false,
      tip: LEG_TIP.debt,
      prov: holderDebtProv(),
      // At its $1 face, as the card's debt line reads it. The icon resolves
      // BOLD by its symbol.
      figure: {
        amount: debt,
        tokens: [{ symbol: "BOLD" }],
        usd: debtReceipt.usd,
        usdProv: debtReceipt.prov,
      },
    });
  }

  // ── the deposits: BOLD on every branch, so a quantity, and its own leg ──
  const deposited = units(depOpen.reduce((sum, d) => sum + big(d.deposit_raw), BigInt(0)));
  if (deposited > 0) {
    legs.push({
      id: "deposit",
      label: depOpen.length === 1 ? "Stability Pool deposit" : "Stability Pool deposits",
      value: `${formatNumber(deposited)} BOLD`,
      approx: true,
      tip: DEPOSIT_TIP,
      figure: { amount: deposited, tokens: [{ symbol: "BOLD" }], usd: null },
      prov: {
        kind: "chain",
        pclass: "indexed",
        verify: { kind: "recompute", text: "Add the deposit on each open deposit card for this wallet." },
        summary:
          "Stability Pool deposits — the sum of each open deposit's BOLD at its last touch, from the index. Every branch's pool takes BOLD, so the sum is a quantity of it. Liquidations since each deposit's last touch burn part of it; a deposit's page reads its pool at the latest block.",
        via: "GET /api/liquity-v2/stability-pool?wallet=… · Σ deposit over the open rows",
        formula: "Σ deposit over the wallet's open deposits",
      },
    });
  }

  return {
    countsLine: `${countsLine(counts, byBranch.size)}${depositsLine(depOpen.length, depClosed)}`,
    counts: { open: counts.open, closed: counts.closed, liquidated: counts.liquidated, zombie: counts.zombie },
    legs,
    truncated: false,
    positions,
    wallet,
    protocol: "liquity-v2",
    ...(kinds ? { kinds } : {}),
  };
}
