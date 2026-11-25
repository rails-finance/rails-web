// Fluid on Base, for the wallet view (rails-ops decision 0073; SERVER-ONLY by
// use): no store, read at visit (./visit.ts) behind its presence check. The
// answer is the explorer's wallet read, the one /base/fluid/<wallet> draws:
// each position NFT holding collateral or debt, at one head block. A position
// is a vault, as Fluid's kinds are on this page (lib/wallet/wallet-filters.ts).
// The read states no dollars and no risk figure; the position's page has them.

import { legUnit } from "@/lib/fluid-base/position";
import { FRONT_DOOR } from "@/lib/fluid-base/words";
import type { FluidBasePositionsRead } from "@/lib/fluid-base/types";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForSession } from "@/lib/shared/protocols";
import type { WalletPosition } from "@/lib/wallet/types";
import { FLUID_BASE_PRESENCE } from "@/lib/wallet/presence-checks";
import { explorerLaunched, type VisitModule } from "./visit";

export const fluidBase: VisitModule = {
  id: "fluid-base",
  name: "Fluid",
  chain: BASE_CHAIN_ID,
  chainName: "Base",
  family: "fluid",
  get on() {
    return explorerLaunched("fluid-base");
  },
  presence: FLUID_BASE_PRESENCE,
  path: (address) => `/api/at-block/fluid-base/positions?${new URLSearchParams({ owner: address.toLowerCase() })}`,
  note: (answer) => ((answer as FluidBasePositionsRead).truncated ? FRONT_DOOR.truncatedOnWallet : null),
  shape(answer) {
    const r = answer as FluidBasePositionsRead;
    if (!r?.head || !Array.isArray(r.positions)) throw new Error("the Fluid Base read answered outside its shape");
    const home = protocolForSession("fluid-base")?.href ?? "/base/fluid";
    return r.positions.flatMap((p): WalletPosition[] => {
      if (p.supply === "0" && p.borrow === "0") return [];
      return [
        {
          chain: BASE_CHAIN_ID,
          family: "fluid",
          familyName: "Fluid",
          market: `${legUnit(p.supplyLeg)} / ${legUnit(p.borrowLeg)}`,
          positionId: `fluid-base:${p.id}`,
          href: `${home}/position/${p.id}`,
          status: "open",
          kind: "vaults",
          // The answer with this position alone.
          card: { kind: "fluid-base", read: { ...r, positions: [p] } },
          headRead: "read",
          readAtBlock: r.head.block,
          readAt: r.head.time,
        },
      ];
    });
  },
};
