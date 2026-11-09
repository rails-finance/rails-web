// The sources the reserve page's deficit copy rests on (anatomy M3.9 and the
// head's (i)): Aave's contract source at pinned commits, line-anchored, and
// Aave's documentation. Each claim the copy makes about how a deficit arises,
// who can cover it, who pays and why it earns no interest cites one of these.
//
//   O  aave-dao/aave-v3-origin @ 8305565a
//   U  aave-dao/aave-umbrella  @ c279bf14
//   D  aave.com/docs, read 9 Nov 2026

import type { LearnMoreLink } from "@/components/shared/learn-more-modal";
import type { Provenance } from "@/components/shared/provenance";

const ORIGIN = "https://github.com/aave-dao/aave-v3-origin/blob/8305565ae342f1773c42cd2e4593f175fe5968a0/src/contracts";
const UMBRELLA =
  "https://github.com/aave-dao/aave-umbrella/blob/c279bf145eb58e013fd24f97b10e4bf6058236a1/src/contracts";

export const DEFICIT_SOURCES = {
  /** DeficitCreated and its NatSpec. */
  O1: { label: "IPool.sol L171-177", url: `${ORIGIN}/interfaces/IPool.sol#L171-L177` },
  /** A liquidation that leaves no collateral burns the borrower's whole debt. */
  O2: {
    label: "LiquidationLogic.sol L522",
    url: `${ORIGIN}/protocol/libraries/logic/LiquidationLogic.sol#L522`,
  },
  /** The unrepaid part is added to the deficit, and DeficitCreated emitted. */
  O3: {
    label: "LiquidationLogic.sol L536-540",
    url: `${ORIGIN}/protocol/libraries/logic/LiquidationLogic.sol#L536-L540`,
  },
  /** DeficitCovered and its NatSpec. */
  O4: { label: "IPool.sol L156-162", url: `${ORIGIN}/interfaces/IPool.sol#L156-L162` },
  /** executeEliminateDeficit: the aToken burn, deficit lowered, DeficitCovered. */
  O5: {
    label: "LiquidationLogic.sol L76-129",
    url: `${ORIGIN}/protocol/libraries/logic/LiquidationLogic.sol#L76-L129`,
  },
  /** eliminateReserveDeficit carries onlyUmbrella. */
  O6: { label: "Pool.sol L822-825", url: `${ORIGIN}/protocol/pool/Pool.sol#L822-L825` },
  /** The onlyUmbrella modifier. */
  O6m: { label: "Pool.sol L75-77", url: `${ORIGIN}/protocol/pool/Pool.sol#L75-L77` },
  /** getReserveDeficit returns the stored deficit. */
  O6g: { label: "Pool.sol L903-905", url: `${ORIGIN}/protocol/pool/Pool.sol#L903-L905` },
  /** The deficit: a uint128 in underlying tokens. */
  O7: {
    label: "DataTypes.sol L54-55",
    url: `${ORIGIN}/protocol/libraries/types/DataTypes.sol#L54-L55`,
  },
  /** Umbrella takes the funds from its caller, then calls the Pool. */
  U1: { label: "Umbrella.sol L160-185", url: `${UMBRELLA}/umbrella/Umbrella.sol#L160-L185` },
  /** The three cover functions, each COVERAGE_MANAGER_ROLE. */
  U2: { label: "Umbrella.sol L66-122", url: `${UMBRELLA}/umbrella/Umbrella.sol#L66-L122` },
  /** The cover events. */
  U2e: {
    label: "IUmbrella.sol L12-35",
    url: `${UMBRELLA}/umbrella/interfaces/IUmbrella.sol#L12-L35`,
  },
  /** slash raises the pending deficit. */
  U3: { label: "Umbrella.sol L128-146", url: `${UMBRELLA}/umbrella/Umbrella.sol#L128-L146` },
  /** Pool docs: getReserveDeficit and eliminateReserveDeficit. */
  D1: { label: "Aave docs: Pool", url: "https://aave.com/docs/aave-v3/smart-contracts/pool" },
  /** Umbrella docs: slashing and deficit protection. */
  D3: { label: "Aave docs: Umbrella", url: "https://aave.com/docs/aave-v3/umbrella" },
} as const;

export type DeficitSourceKey = keyof typeof DEFICIT_SOURCES;

/** The sources as learn-more links. */
export const deficitLinks = (...keys: DeficitSourceKey[]): LearnMoreLink[] =>
  keys.map((k) => ({ label: DEFICIT_SOURCES[k].label, url: DEFICIT_SOURCES[k].url }));

/** The pane's deficit figure: the getter's receipt, with the source behind each sub-bullet under it
 *  (explanation-copy-charter §4: no sources on the face of a pane). */
export function deficitFigureProv(base: Provenance): Provenance {
  const leaf = (k: DeficitSourceKey, note: string) => ({
    label: DEFICIT_SOURCES[k].label,
    kind: "offchain" as const,
    pclass: "offchain" as const,
    note,
    verify: { kind: "link" as const, href: DEFICIT_SOURCES[k].url, text: DEFICIT_SOURCES[k].label },
  });
  return {
    ...base,
    inputs: [
      ...(base.inputs ?? []),
      leaf("O2", "a liquidation that leaves no collateral burns the borrower's whole debt"),
      leaf("O3", "the part not repaid is added to the deficit: DeficitCreated"),
      leaf("O7", "the deficit is a count of underlying tokens: it earns no interest"),
      leaf("O5", "a cover lowers it: DeficitCovered"),
      leaf("O6", "only the Umbrella can cover it: eliminateReserveDeficit, onlyUmbrella"),
      leaf("D1", "Aave's Pool docs on getReserveDeficit and eliminateReserveDeficit"),
      leaf("U1", "Umbrella takes the funds from its caller, then calls the Pool"),
      leaf("U2", "the DAO's deficit offset and the other covers"),
      leaf("U3", "a slash of the reserve's stake token raises the pending deficit"),
      leaf("D3", "Aave's Umbrella docs: the offset first, then slashing"),
    ],
  };
}
