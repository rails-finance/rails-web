// Morpho Blue on Optimism and on Arc, for the wallet view (rails-ops decision
// 0071, group 4; SERVER-ONLY by use): no store, read at visit (./visit.ts),
// one module per deployment from one builder. The answer is the explorer's
// wallet read, the one /optimism/morpho/<wallet> and /arc/morpho/<wallet>
// draw: every market the wallet holds a position in, at one head block.
// Each module is on while its explorer is launched (morpho-optimism,
// morpho-arc; a cold Arc wallet read is about 160 chain calls). Dollars are at a Chainlink
// feed, or Aave's oracle on Optimism, for the loan asset (decision 0046):
// shown on the card and summed in the totals with the source named on the receipt.

import { morphoAtBlockWalletPositions } from "@/lib/morpho-at-block/position";
import {
  MORPHO_ARC,
  MORPHO_OPTIMISM,
  type MorphoAtBlockDeployment,
  type MorphoAtBlockWalletRead,
} from "@/lib/morpho-at-block/types";
import { pairName } from "@/lib/morpho-at-block/words";
import type { WalletPosition } from "@/lib/wallet/types";
import { visitKind, visitOn, type VisitModule } from "./visit";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ZERO = BigInt(0);

/** The feed that priced the loan asset, for the receipts' source line. */
function usdSourceOf(dep: MorphoAtBlockDeployment, source: "chainlink" | "aave-oracle" | undefined) {
  return source === "aave-oracle"
    ? `${dep.aaveOracle?.name ?? "Aave's oracle"} for the loan asset`
    : `Chainlink USD feed on ${dep.chain} for the loan asset`;
}

/** `on`: fixed, for a test; unset, `visitOn` at each call. */
export function morphoAtBlockModule(dep: MorphoAtBlockDeployment, on?: boolean): VisitModule {
  return {
    id: dep.session,
    name: "Morpho Blue",
    chain: dep.chainId,
    chainName: dep.chain,
    family: "morpho",
    get on() {
      return on ?? visitOn(dep.session);
    },
    path: (address) => `/api/at-block/${dep.api}/wallet?${new URLSearchParams({ owner: address.toLowerCase() })}`,
    shape(answer, address) {
      const r = answer as MorphoAtBlockWalletRead;
      if (!r?.head || !Array.isArray(r.positions) || !r.tokens)
        throw new Error(`the Morpho Blue ${dep.chain} read answered outside its shape`);
      const wallet = address.toLowerCase();
      return morphoAtBlockWalletPositions(r).flatMap((f): WalletPosition[] => {
        if (f.suppliedRaw === ZERO && f.debtRaw === ZERO && f.collateralRaw === ZERO) return [];
        const m = r.positions.find((x) => x.id === f.id);
        if (!m) return [];
        const ltv = f.ltv;
        return [
          {
            chain: dep.chainId,
            family: "morpho",
            familyName: "Morpho Blue",
            market: pairName(f),
            positionId: `${dep.key}:${f.id}`,
            href: `${dep.route}/${wallet}/${f.id}`,
            status: "open",
            kind: visitKind(f.debt),
            // The answer with this market alone.
            card: { kind: "morpho-at-block", dep: dep.key, read: { ...r, positions: [m] } },
            collateralUsd: f.collateral > 0 ? (f.collateralUsd ?? undefined) : (f.suppliedUsd ?? undefined),
            debtUsd: f.debt > 0 ? (f.debtUsd ?? undefined) : 0,
            usdSource: usdSourceOf(dep, f.usd?.feed.source),
            usdOwnOracle: false,
            buffer: ltv != null && f.lltv > 0 ? 1 - ltv / f.lltv : undefined,
            riskFigure: ltv != null ? { value: `${pct(ltv)} LTV`, label: `LLTV ${pct(f.lltv)}` } : undefined,
            liquidatable: ltv != null ? ltv > f.lltv : undefined,
            dustUsd: f.debt > 0 ? (f.collateralUsd ?? undefined) : undefined,
            headRead: "read",
            readAtBlock: r.head.block,
            readAt: r.head.time,
          },
        ];
      });
    },
  };
}

export const morphoOptimism = morphoAtBlockModule(MORPHO_OPTIMISM);
export const morphoArc = morphoAtBlockModule(MORPHO_ARC);
