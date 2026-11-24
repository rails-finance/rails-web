// Liquity V1's adapter onto the shared holder strip: what a wallet search
// states about the wallet across its Troves, its Stability Pool deposit and
// its LQTY stake (rails-ops TO-DO-stability-pool-deposits §1b, §6).
//
// A pure function of the pages a wallet search holds: its Troves, its deposit
// and its stake, one the listing's own rows and the others read under it, each
// every status, one page. It fetches nothing.
//
// One collateral and one debt token, so every leg is a quantity of one token
// and none needs a price. Collateral is ETH, debt LUSD, and the deposit LUSD
// too; the deposit is its own leg and never sums with the debt. Each leg draws
// the card's figure: the debt with its USD line at LUSD's $1 face as the Trove
// card draws it, the collateral and the deposit without one as their cards
// draw them, and the deposit with the ≈ its card wears (liquidations burn it
// between touches). The stake is a separate LQTY leg, exact: a stake moves
// only at its touches.
//
// An address holds at most one deposit in the pool and one stake.

import type { HolderKindCount, HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { HolderKindPage } from "@/components/shared/holder-kinds";
import type { Provenance } from "@/components/shared/provenance";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";
import { formatNumber } from "@/lib/utils/format";
import { holderUsdReceipt } from "@/lib/shared/holder-usd-receipt";
import { COLLATERAL_ADDRESS, COLLATERAL_SYMBOL, DEBT_SYMBOL, LIQUITY_V1_ADDRESSES } from "./asset-catalog";
import { big, units } from "./sp-math";
import { kindsLine } from "@/lib/liquity/holder-deposits";

const TROVE_MANAGER = { name: "Liquity V1 TroveManager", address: LIQUITY_V1_ADDRESSES.TROVE_MANAGER };
const POOL = { name: "Liquity V1 StabilityPool", address: LIQUITY_V1_ADDRESSES.STABILITY_POOL };
const STAKING = { name: "Liquity V1 LQTYStaking", address: LIQUITY_V1_ADDRESSES.LQTY_STAKING };
const TROVES_VIA = "GET /api/liquity-v1/positions?wallet=…";
const DEPOSIT_VIA = "GET /api/liquity-v1/stability-pool?wallet=…";
const STAKE_VIA = "GET /api/liquity-v1/staking?wallet=…";

const LEG_TIP = {
  collateral: "As of each open Trove's last touch. Redistribution gains since then are left out.",
  debt: "As of each open Trove's last touch. Redistributed debt since then is left out.",
  deposit: "As of the deposit's last touch. Liquidations since then have not been taken out.",
  stake: "The LQTY staked; it moves only at the staker's touches.",
} as const;

const DEPOSIT_KIND = { id: "deposit", noun: ["deposit", "deposits"] as [string, string] };
const STAKE_KIND = { id: "stake", noun: ["stake", "stakes"] as [string, string] };

const count = (n: number, one: string, many: string): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The Troves' sentence, V2's shape: "This wallet holds 1 open Trove and has
 *  closed 4; 1 was liquidated." */
function trovesLine(t: { open: number; closed: number; liquidated: number }): string {
  const head =
    t.open > 0 ? `This wallet holds ${count(t.open, "open Trove", "open Troves")}` : "This wallet holds no open Troves";
  const closed = t.closed > 0 ? ` and has closed ${t.closed.toLocaleString("en-US")}` : "";
  const liq =
    t.liquidated > 0
      ? `; ${t.liquidated.toLocaleString("en-US")} ${t.liquidated === 1 ? "was" : "were"} liquidated`
      : "";
  return `${head}${closed}${liq}.`;
}

const sumProv = (summary: string, via: string, contract: Provenance["contract"], formula: string): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  verify: { kind: "recompute", text: "Add the figure on each open card under this strip." },
  summary,
  contract,
  via,
  formula,
});

/** Build the strip for a wallet search's Troves, deposit and stake. A kind
 *  whose read failed is absent and goes unsaid. */
export function liquityV1HolderStrip(
  troves: HolderKindPage<LiquityV1PositionSummary> | undefined,
  deposits: HolderKindPage<LiquityV1DepositRow> | undefined,
  /** The Trove listing's page size: totals stand for a wallet within one page. */
  perPage: number,
  /** The wallet the search names, for the link. */
  wallet?: string,
  stakes?: HolderKindPage<LiquityV1StakeRow>,
): HolderStripProps {
  const troveRows = troves?.rows ?? [];
  const openTroves = troveRows.filter((t) => t.status === "open");
  const openDeposits = deposits?.rows.filter((d) => d.status === "open") ?? [];
  const closedDeposits = (deposits?.rows.length ?? 0) - openDeposits.length;
  const counts = {
    open: openTroves.length,
    closed: troveRows.filter((t) => t.status === "closed").length,
    liquidated: troveRows.filter((t) => t.status === "liquidated").length,
  };
  const openStakes = stakes?.rows.filter((r) => r.status === "open") ?? [];
  const closedStakes = (stakes?.rows.length ?? 0) - openStakes.length;
  const kindList: HolderKindCount[] = [
    ...(deposits ? [{ ...DEPOSIT_KIND, open: openDeposits.length, closed: closedDeposits }] : []),
    ...(stakes ? [{ ...STAKE_KIND, open: openStakes.length, closed: closedStakes }] : []),
  ];
  const kinds: HolderKindCount[] | undefined = kindList.length ? kindList : undefined;
  const positions = (troves?.total ?? 0) + (deposits?.total ?? 0) + (stakes?.total ?? 0);
  // An address holds at most one deposit and one stake, so they fit one page.
  const depositsSaid = kindsLine([
    ...(deposits
      ? [
          {
            one: "Stability Pool deposit",
            many: "Stability Pool deposits",
            open: openDeposits.length,
            closed: closedDeposits,
          },
        ]
      : []),
    ...(stakes ? [{ one: "LQTY stake", many: "LQTY stakes", open: openStakes.length, closed: closedStakes }] : []),
  ]);

  if (troves && troves.total > troves.rows.length) {
    // A page is a slice of the wallet: no count by status and no sum over it
    // is a statement about the wallet.
    return {
      countsLine: `This wallet holds ${count(troves.total, "Trove", "Troves")}.${depositsSaid}`,
      counts: { open: 0, closed: 0, liquidated: 0 },
      legs: [],
      truncated: true,
      positions,
      wallet,
      protocol: "liquity-v1",
      note: `Totals are stated for wallets holding up to ${perPage.toLocaleString("en-US")} Troves; this one holds ${troves.total.toLocaleString("en-US")}.`,
    };
  }

  const legs: HolderLeg[] = [];
  const coll = openTroves.reduce((s, t) => s + t.collateral, 0);
  if (coll > 0) {
    legs.push({
      id: "collateral",
      label: "Total collateral",
      value: `${formatNumber(coll)} ${COLLATERAL_SYMBOL}`,
      approx: false,
      tip: LEG_TIP.collateral,
      figure: { amount: coll, tokens: [{ symbol: COLLATERAL_SYMBOL, address: COLLATERAL_ADDRESS }], usd: null },
      prov: sumProv(
        "All the ETH the wallet's open Troves hold: the sum of each Trove's collateral, from the index. Redistribution gains since each Trove's last touch are not in it.",
        `${TROVES_VIA} · Σ collateral over the open rows`,
        TROVE_MANAGER,
        "Σ collateral over the wallet's open Troves",
      ),
    });
  }

  const debt = openTroves.reduce((s, t) => s + t.debt, 0);
  if (debt > 0) {
    const receipt = holderUsdReceipt({
      what: "The wallet's debt in USD",
      legs: [
        {
          token: DEBT_SYMBOL,
          amount: debt,
          amountNote: "Σ debt of the wallet's open Troves, each as of its last touch",
          price: 1,
          face: true,
          priceNote: "LUSD's $1 face: the protocol redeems 1 LUSD for $1 of ETH",
        },
      ],
      via: TROVES_VIA,
    });
    legs.push({
      id: "debt",
      label: "Total debt",
      value: `${formatNumber(debt)} ${DEBT_SYMBOL}`,
      approx: false,
      tip: LEG_TIP.debt,
      figure: { amount: debt, tokens: [{ symbol: DEBT_SYMBOL }], usd: receipt.usd, usdProv: receipt.prov },
      prov: sumProv(
        "All the LUSD the wallet's open Troves owe: the sum of each Trove's debt, from the index. Liquity V1 charges no interest; redistributed debt since each Trove's last touch is not in it.",
        `${TROVES_VIA} · Σ debt over the open rows`,
        TROVE_MANAGER,
        "Σ debt over the wallet's open Troves",
      ),
    });
  }

  const deposit = units(openDeposits.reduce((s, d) => s + big(d.deposit_raw), BigInt(0)));
  if (deposit > 0) {
    legs.push({
      id: "deposit",
      label: "Stability Pool deposit",
      value: `${formatNumber(deposit)} ${DEBT_SYMBOL}`,
      approx: true,
      tip: LEG_TIP.deposit,
      figure: { amount: deposit, tokens: [{ symbol: DEBT_SYMBOL }], usd: null },
      prov: sumProv(
        "The LUSD the wallet's deposit held at its last touch, from the index. Liquidations since then burn part of it; the deposit's page reads the pool at the latest block.",
        `${DEPOSIT_VIA} · deposit`,
        POOL,
        "deposit at the last touch",
      ),
    });
  }

  const stake = units(openStakes.reduce((s, r) => s + big(r.stake_raw), BigInt(0)));
  if (stake > 0) {
    legs.push({
      id: "stake",
      label: "LQTY stake",
      value: `${formatNumber(stake)} LQTY`,
      approx: false,
      tip: LEG_TIP.stake,
      figure: { amount: stake, tokens: [{ symbol: "LQTY" }], usd: null },
      prov: sumProv(
        "The LQTY the wallet has staked, from the index: the stake its last touch left, which LQTYStaking's stakes(staker) holds until the next.",
        `${STAKE_VIA} · stake`,
        STAKING,
        "stake at the last touch",
      ),
    });
  }

  return {
    // Without the Troves' read the other kinds' sentence opens the band.
    countsLine: troves ? `${trovesLine(counts)}${depositsSaid}` : depositsSaid.replace(/^ It/, "This wallet"),
    counts,
    legs,
    truncated: false,
    positions,
    wallet,
    protocol: "liquity-v1",
    ...(kinds ? { kinds } : {}),
  };
}
