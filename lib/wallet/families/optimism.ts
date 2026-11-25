// Aave V3 and Compound V3 on Optimism, for the wallet view (rails-ops decision
// 0071, group 4; SERVER-ONLY by use): no store, read at visit (./visit.ts).
// Each module's answer is its explorer's wallet read, the one
// /optimism/aave-v3/<wallet> and /optimism/compound-v3/<wallet> draw, and
// its card is drawn from that answer with the explorer's figures and receipts.
// Every figure is at the answer's head block.

import { opPosition } from "@/lib/aave-v3-optimism/position";
import { OP_ROUTE, type OpPositionRead } from "@/lib/aave-v3-optimism/types";
import { accountFigures } from "@/lib/compound-v3-optimism/position";
import { opcPositionHref, type OpcWalletRead } from "@/lib/compound-v3-optimism/types";
import { hfLabelV3 } from "@/lib/aave-v3/position-state";
import { OPTIMISM_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { bufferFromHealth } from "@/lib/wallet/summary-row";
import { visitKind, visitOn, type VisitModule } from "./visit";

const outside = (what: string) => new Error(`the ${what} read answered outside its shape`);

export const aaveV3Optimism: VisitModule = {
  id: "aave-v3-optimism",
  name: "Aave V3",
  chain: OPTIMISM_CHAIN_ID,
  chainName: "Optimism",
  family: "aave-v3",
  get on() {
    return visitOn("aave-v3-optimism");
  },
  path: (address) =>
    `/api/at-block/aave-v3-optimism/position?${new URLSearchParams({ wallet: address.toLowerCase() })}`,
  shape(answer, address) {
    const r = answer as OpPositionRead;
    if (!r?.head || !r.account || !Array.isArray(r.reserves)) throw outside("Aave V3 Optimism");
    // The explorer's test for a position: a balance in any reserve.
    if (!r.reserves.some((x) => x.scaledSupply !== "0" || x.scaledDebt !== "0")) return [];
    const p = opPosition(r);
    const hf = p.healthFactor;
    // A balance the oracle did not price leaves the totals.
    const priced = p.unpriced.length === 0;
    const debtRate =
      priced && p.debtUsd > 0
        ? p.borrowed.reduce((s, x) => s + (x.debtUsd ?? 0) * x.borrowApr, 0) / p.debtUsd
        : undefined;
    const wallet = address.toLowerCase();
    return [
      {
        chain: OPTIMISM_CHAIN_ID,
        family: "aave-v3",
        familyName: "Aave V3",
        positionId: `optimism:${wallet}`,
        href: `${OP_ROUTE}/${wallet}`,
        status: "open",
        kind: visitKind(p.debtUsd),
        card: { kind: "aave-v3-optimism", read: r },
        // The total sums collateral, as on every lender row; Supplied's receipt states it.
        collateralUsd: priced ? p.collateralUsd : undefined,
        debtUsd: priced ? p.debtUsd : undefined,
        usdSource: "Aave V3 Optimism oracle",
        usdOwnOracle: true,
        buffer: bufferFromHealth(hf),
        riskFigure: hf == null ? undefined : { value: `${hfLabelV3(hf)} HF`, label: "Health factor" },
        liquidatable: hf != null && hf < 1,
        debtRate,
        headRead: "read",
        readAtBlock: r.head.block,
        readAt: r.head.time,
      },
    ];
  },
};

export const compoundV3Optimism: VisitModule = {
  id: "compound-v3-optimism",
  name: "Compound V3",
  chain: OPTIMISM_CHAIN_ID,
  chainName: "Optimism",
  family: "compound-v3",
  get on() {
    return visitOn("compound-v3-optimism");
  },
  path: (address) =>
    `/api/at-block/compound-v3-optimism/wallet?${new URLSearchParams({ wallet: address.toLowerCase() })}`,
  shape(answer, address) {
    const r = answer as OpcWalletRead;
    if (!r?.head || !Array.isArray(r.comets)) throw outside("Compound V3 Optimism");
    const wallet = address.toLowerCase();
    return r.comets.flatMap((a): WalletPosition[] => {
      const f = accountFigures(a, r.ethUsd);
      if (!f.held) return [];
      const priced = f.unpriced.length === 0;
      // Debt over the collateral at its Liquidation CFs, the Comet's line at 1;
      // none with a collateral unpriced, as on Arbitrum.
      const hf = priced && f.debtValue > 0 && f.liquidationCapacity > 0 ? f.liquidationCapacity / f.debtValue : null;
      // Nothing borrowed is no debt, priced or not.
      const debtUsd = f.borrowed === 0 ? 0 : (f.borrowedUsd ?? undefined);
      return [
        {
          chain: OPTIMISM_CHAIN_ID,
          family: "compound-v3",
          familyName: "Compound V3",
          market: a.label,
          positionId: `optimism:${a.comet.toLowerCase()}:${wallet}`,
          href: opcPositionHref(a.key, wallet),
          status: "open",
          kind: visitKind(f.borrowed),
          // The answer with this Comet alone.
          card: { kind: "compound-v3-optimism", read: { ...r, comets: [a] } },
          // The total sums collateral, as on every lender row; Lent's receipt states it.
          collateralUsd: priced ? (f.collateralUsd ?? undefined) : undefined,
          debtUsd,
          usdSource: "Compound V3 Optimism Comet prices",
          usdOwnOracle: true,
          buffer: bufferFromHealth(hf),
          riskFigure:
            hf != null ? { value: `${hf >= 100 ? ">100" : hf.toFixed(2)} HF`, label: "Health factor" } : undefined,
          liquidatable: a.isLiquidatable,
          headRead: "read",
          readAtBlock: r.head.block,
          readAt: r.head.time,
        },
      ];
    });
  },
};
