// The Liquity V2 forks' adapter onto the shared holder strip
// (components/shared/holder-strip.tsx): what a wallet search on Asymmetry,
// Basedollar or Ebisu states about the wallet, across its Troves and its
// Stability Pool deposits (rails-ops TO-DO-stability-pool-deposits §1b, §3.3).
//
// A pure function of the rows the listing already holds: the wallet's Troves
// (the fork's /troves rows the search matched) and its deposits (the fork's
// /stability-pool?wallet= page). It fetches nothing.
//
// No figure here is priced. The fork listings value nothing (each row's
// collateral is a quantity of its branch's token), so the collateral is a
// quantity per branch, the debt a quantity of the fork's stablecoin, and the
// deposits a separate leg in the same stablecoin: debt owed and a deposit held
// are never summed. A Trove the wallet passed on (formerHold, ui-jobs 715) is
// not its holding and is left out.
//
// A shut-down branch whose pool the admin emptied (Ebisu, ui-jobs 608, 612)
// keeps its Troves' recorded collateral while the pool holds 0: the leg is
// "Recorded collateral", as the Trove card's C6.1 states it, with the
// shutdown and "pool holds 0 <symbol>" under it.

import type { HolderKindCount, HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { HolderKindPage } from "@/components/shared/holder-kinds";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { formatNumber } from "@/lib/utils/format";
import { depositsLine } from "@/lib/liquity/holder-deposits";
import { big, units } from "@/lib/liquity-v2/sp-math";
import { recordedShutdown, shutdownDay, withdrawalDateProv } from "@/lib/shared/liquity-family-shutdown";

/** The Trove fields the strip reads; the three forks' summaries share them. */
export interface ForkStripTrove {
  status: string;
  isZombie?: boolean;
  collateralType: string;
  collateral: number;
  debt: number;
  /** Set where the searched wallet held the Trove and moved it on. */
  formerHold?: unknown;
}

export interface ForkStripOpts {
  /** The explorer slug ("ebisu"), for the wallet link. */
  protocol: string;
  /** The fork's stablecoin ("ebUSD"). */
  stable: string;
  /** The wallet the search names, for the link. */
  wallet?: string;
  /** Each branch's collateral token address, for the icons. */
  collAddress?: (collateralType: string) => string | undefined;
  /** The fork holds more Troves than the one read returned (`read` of them):
   *  the wallet's may be more than the rows, so no totals are stated. */
  trovesPartial?: { read: number };
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const LEG_TIP = {
  collateral: "As of each open Trove's last touch. Redistribution gains since then are left out.",
  collateralShut:
    "What each open Trove records as of its last touch. The branch is shut down and its pool holds 0 of this collateral since the admin withdrew it.",
  debt: "As of each open Trove's last touch. The interest and redistributed debt built up since are left out.",
  deposit: "As of each deposit's last touch. Liquidations since then have not been taken out.",
} as const;

function countsLine(c: { open: number; closed: number; liquidated: number; zombie: number }): string {
  if (c.open === 0 && c.closed === 0 && c.liquidated === 0) return "This wallet holds no open Troves.";
  const head =
    c.open > 0
      ? `This wallet holds ${plural(c.open, "open Trove", "open Troves")}`
      : "This wallet holds no open Troves";
  const zombie = c.zombie > 0 ? `, ${c.zombie.toLocaleString("en-US")} of them below the floor` : "";
  const closed = c.closed > 0 ? ` and has closed ${c.closed.toLocaleString("en-US")}` : "";
  const liq =
    c.liquidated > 0
      ? `; ${c.liquidated.toLocaleString("en-US")} ${c.liquidated === 1 ? "was" : "were"} liquidated`
      : "";
  return `${head}${zombie}${closed}${liq}.`;
}

/** The strip for a fork wallet: its Troves (every status, the whole set) and
 *  its deposits (every status, one page; a wallet holds at most one per
 *  branch). `deposits` absent: the deposit read failed and the strip says
 *  nothing of them. */
export function liquityForkHolderStrip(
  troves: ForkStripTrove[],
  deposits: HolderKindPage<LiquityV2DepositRow<string>> | undefined,
  o: ForkStripOpts,
): HolderStripProps {
  const held = troves.filter((t) => !t.formerHold);
  const open = held.filter((t) => t.status === "open");
  const counts = {
    open: open.length,
    closed: held.filter((t) => t.status === "closed").length,
    liquidated: held.filter((t) => t.status === "liquidated").length,
    zombie: open.filter((t) => t.isZombie).length,
  };
  const depOpen = deposits?.rows.filter((d) => d.status === "open") ?? [];
  const depClosed = (deposits?.rows.length ?? 0) - depOpen.length;
  const kinds: HolderKindCount[] | undefined = deposits
    ? [{ id: "deposit", noun: ["deposit", "deposits"], open: depOpen.length, closed: depClosed }]
    : undefined;

  const legs: HolderLeg[] = [];
  // ── the collateral: a quantity per branch, never a sum across tokens ──────
  const byBranch = new Map<string, number>();
  for (const t of open) {
    if (t.collateral > 0) byBranch.set(t.collateralType, (byBranch.get(t.collateralType) ?? 0) + t.collateral);
  }
  const branches = [...byBranch].sort((a, b) => a[0].localeCompare(b[0]));
  const token = (c: string) => ({ symbol: c, address: o.collAddress?.(c) });
  // The branches whose pool the admin emptied after the shutdown.
  const emptied = branches.flatMap(([c]) => {
    const rec = recordedShutdown(o.protocol, c);
    return rec?.withdrawal ? [{ c, rec, w: rec.withdrawal }] : [];
  });
  const shut = emptied.length > 0;
  const label = shut ? "Recorded collateral" : "Total collateral";
  const tip = shut ? LEG_TIP.collateralShut : LEG_TIP.collateral;
  const syms = emptied.map((e) => e.c).join(", ");
  const one = emptied.length === 1;
  const shutSentence = shut
    ? ` The admin shut the ${syms} ${one ? "branch" : "branches"} down on ${shutdownDay(emptied[0].rec.shutdown.at)} and withdrew ${one ? "its pool's" : "their pools'"} collateral on ${shutdownDay(emptied[0].w.at)}; ${one ? "the pool has" : "the pools have"} held 0 ${syms} since, and the Troves still record this collateral.`
    : "";
  const shutNote = shut
    ? {
        text: `Shut down ${shutdownDay(emptied[0].rec.shutdown.at)} · ${emptied.map((e) => `pool holds 0 ${e.c}`).join(" · ")}`,
        prov: withdrawalDateProv(o.protocol, emptied[0].c, emptied[0].rec) ?? undefined,
      }
    : null;
  if (branches.length === 1) {
    const [c, amount] = branches[0];
    legs.push({
      id: "collateral",
      label,
      value: `${formatNumber(amount)} ${c}`,
      approx: false,
      tip,
      figure: { amount, tokens: [token(c)], usd: null },
      ...(shutNote ? { footnote: shutNote } : {}),
      prov: {
        kind: "chain",
        pclass: "indexed",
        summary: `All the ${c} the wallet's open Troves ${shut ? "record" : "hold"} — the sum of each Trove's collateral, from the index. The wallet holds on this branch only, so the sum is a quantity of one token. Redistribution gains since each Trove's last touch are not in it.${shutSentence}`,
        via: `GET /api/${o.protocol}/troves · Σ collateral over the wallet's open rows`,
      },
    });
  } else if (branches.length > 1) {
    const parts = branches.map(([c, amount]) => ({ text: `${formatNumber(amount)} ${c}`, ...token(c) }));
    const text = parts.map((p) => p.text).join(" · ");
    legs.push({
      id: "collateral",
      label,
      value: text,
      approx: false,
      tip,
      footnote: {
        text: shutNote ? `${text} · ${shutNote.text}` : text,
        parts,
        ...(shutNote?.prov ? { prov: shutNote.prov } : {}),
      },
      prov: {
        kind: "chain",
        pclass: "indexed",
        summary: `The wallet's open Troves' ${shut ? "recorded " : ""}collateral, branch by branch — the sum of each Trove's collateral on its branch, from the index. The branches hold different tokens and the listing prices none, so they carry no total. Redistribution gains since each Trove's last touch are not in it.${shutSentence}`,
        via: `GET /api/${o.protocol}/troves · Σ collateral over the wallet's open rows, per branch`,
      },
    });
  }

  // ── the debt: the fork's stablecoin on every branch, so a quantity ────────
  const debt = open.reduce((sum, t) => sum + t.debt, 0);
  if (debt > 0)
    legs.push({
      id: "debt",
      label: "Total debt",
      value: `${formatNumber(debt)} ${o.stable}`,
      approx: false,
      tip: LEG_TIP.debt,
      figure: { amount: debt, tokens: [{ symbol: o.stable }], usd: null },
      prov: {
        kind: "chain",
        pclass: "indexed",
        verify: {
          kind: "recompute",
          text: "Add the debt of each open Trove the wallet holds — every one of them is on the page with this strip.",
        },
        summary: `All the ${o.stable} the wallet's open Troves owe — the sum of each Trove's debt as of its last touch, from the index. Every branch borrows the same token, so the sum is a quantity of it. The interest and redistributed debt built up since are not in it.`,
        via: `GET /api/${o.protocol}/troves · Σ debt over the wallet's open rows`,
        formula: "Σ debt over the wallet's open Troves",
      },
    });

  // ── the deposits: their own leg, never added to the debt ──────────────────
  const deposited = units(depOpen.reduce((sum, d) => sum + big(d.deposit_raw), BigInt(0)));
  if (deposited > 0)
    legs.push({
      id: "deposit",
      label: depOpen.length === 1 ? "Stability Pool deposit" : "Stability Pool deposits",
      value: `${formatNumber(deposited)} ${o.stable}`,
      approx: true,
      tip: LEG_TIP.deposit,
      figure: { amount: deposited, tokens: [{ symbol: o.stable }], usd: null },
      prov: {
        kind: "chain",
        pclass: "indexed",
        verify: { kind: "recompute", text: "Add the deposit on each open deposit card for this wallet." },
        summary: `Stability Pool deposits — the sum of each open deposit's ${o.stable} at its last touch, from the index. Every branch's pool takes ${o.stable}, so the sum is a quantity of it. Liquidations since each deposit's last touch burn part of it; a deposit's page reads its pool at the latest block.`,
        via: `GET /api/${o.protocol}/stability-pool?wallet=… · Σ deposit over the open rows`,
        formula: "Σ deposit over the wallet's open deposits",
      },
    });

  const troveLine = countsLine(counts);
  // The fork's Troves past one read are unread: the wallet may hold more
  // than these, so the counts stand as read and no totals are stated, as
  // the V2 adapter withholds them past one page.
  if (o.trovesPartial)
    return {
      countsLine: `${troveLine}${depositsLine(depOpen.length, depClosed)}`,
      counts,
      legs: [],
      truncated: true,
      positions: held.length + (deposits?.total ?? 0),
      wallet: o.wallet,
      protocol: o.protocol,
      note: `Totals are stated where one read holds every Trove the protocol has; this read returned the first ${o.trovesPartial.read.toLocaleString("en-US")}.`,
      ...(kinds ? { kinds } : {}),
    };
  return {
    countsLine: `${troveLine}${depositsLine(depOpen.length, depClosed)}`,
    counts,
    legs,
    truncated: false,
    positions: held.length + (deposits?.total ?? 0),
    wallet: o.wallet,
    protocol: o.protocol,
    ...(kinds ? { kinds } : {}),
  };
}
