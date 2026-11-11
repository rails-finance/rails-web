// Focus mode (ui-jobs 557) for an Alchemix position: the tokens it names, in
// the shape lib/shared/focus-row-keys.ts reads (any address, and any field
// named for a symbol). A position counts when its debt or its collateral is in
// focus. The collateral is matched by address where the read carries one (the
// underlying, the MYT, a V2 yield token). The synthetic has no address on the
// wire, so it is matched by symbol, as is a Transmuter position's MYT.

import type {
  AlchemixLiveState,
  AlchemixPositionSummary,
  AlchemixTransmuterPositionSummary,
  AlchemixV2PositionSummary,
} from "@/types/api/alchemix";
import { linesForChain, type AlchemixDeployment } from "@/lib/alchemix/lines";

export interface AlchemixFocusSource {
  debtSymbol: string;
  collateral: string[];
  collateralSymbols: string[];
}

const present = (xs: (string | null | undefined)[]): string[] => xs.filter((x): x is string => !!x);

function lineUnderlying(deployment: AlchemixDeployment, lineKey: string): string | null {
  return linesForChain(deployment.chainId).find((l) => l.key === lineKey)?.underlying ?? null;
}

/** An Alchemist position: the synthetic it owes, the MYT it holds and the underlying the MYT is over. */
export function alchemistFocusSource(
  deployment: AlchemixDeployment,
  position: AlchemixPositionSummary,
  live: AlchemixLiveState | null,
): AlchemixFocusSource {
  const collateral = present([
    position.figures.collateral?.underlying?.address,
    live?.collateral.underlying?.address,
    live?.collateral.mytAddress,
  ]);
  return {
    debtSymbol: position.syntheticSymbol,
    collateral,
    // The line's own names stand in where the read carries no address.
    collateralSymbols: collateral.length
      ? []
      : present([position.figures.collateral?.mytSymbol, lineUnderlying(deployment, position.lineKey)]),
  };
}

/** A Transmuter position: the synthetic staked, and the MYT a claim pays out in, over the line's underlying. */
export function transmuterFocusSource(
  deployment: AlchemixDeployment,
  position: AlchemixTransmuterPositionSummary,
): AlchemixFocusSource {
  return {
    debtSymbol: position.syntheticSymbol,
    collateral: [],
    collateralSymbols: present([position.mytSymbol, lineUnderlying(deployment, position.lineKey)]),
  };
}

/** A V2 account: the synthetic it owed, and each yield token it held with its underlying. */
export function alchemixV2FocusSource(position: AlchemixV2PositionSummary): AlchemixFocusSource {
  return {
    debtSymbol: position.syntheticSymbol,
    collateral: position.collateral.flatMap((c) => present([c.yieldToken.address, c.underlying?.address])),
    collateralSymbols: [],
  };
}
