// What a MakerDAO vault row's explanation reads beyond the row: the page's
// extras (lib/makerdao/vault-history.tsx), the vault's state after the row,
// and the transaction shapes the generator names (lib/makerdao/event-prose.ts).

import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import type { MakerAuctionRead, MakerIlkAt, MakerTxContext } from "@/lib/makerdao/chain-history-types";
import type {
  MakerDebtSplit,
  MakerEvent,
  MakerLeftoverLink,
  MakerMatStep,
  MakerOwnershipStep,
} from "@/lib/makerdao/vault-history";

/** What the page knows about a row beyond the row's fields. Every sentence that
 *  needs one of these is left out until it lands. */
export interface MakerRowExtras {
  /** The ilk at the row's block: the OSM price, the minimum ratio. */
  ilkAt?: MakerIlkAt | null;
  /** The debt at the row split into DAI drawn and fee. */
  split?: MakerDebtSplit;
  /** The previous row's timestamp. */
  previousAt?: number;
  /** A row that moved collateral an auction handed back. */
  leftover?: MakerLeftoverLink;
  /** A liquidation row's auction. */
  auction?: MakerAuctionRead;
  /** A liquidation row: when the owner took the handed-back collateral out. */
  leftoverTakenAt?: number;
  /** The row's id. */
  eventId?: string;
  /** Every loaded row of the row's transaction, in chain order. */
  txRows?: MakerEvent[];
  /** What the row's transaction did (read for ownership transactions). */
  txContext?: MakerTxContext;
  /** A give row: the owner before and after. */
  ownership?: MakerOwnershipStep;
  /** Every give row's owners. */
  ownershipAll?: Map<string, MakerOwnershipStep>;
  /** The ilk's minimum ratio moved since the previous row. */
  matStep?: MakerMatStep;
  /** Signed by someone other than the owner in force, in a transaction that
   *  handed the vault to the signer: the vault was created for them. */
  createdForSigner?: boolean;
  /** The account that owned the vault at this row (behind its proxy). */
  ownerAt?: string | null;
}

/** Sub-wei magnitudes read as zero. */
export const MAKER_EPS = 1e-9;

export interface MakerResultingState {
  inkAfter: number;
  artAfter: number;
  hasDebtAfter: boolean;
  collateralOnly: boolean;
  closedPosition: boolean;
}

/** The vault after the row. */
export function resultingState(ctx: MakerDAOContext): MakerResultingState {
  const inkAfter = Number(ctx.inkAfter);
  const artAfter = Number(ctx.artAfter);
  const ink = Number.isFinite(inkAfter) ? Math.max(0, inkAfter) : 0;
  const art = Number.isFinite(artAfter) ? Math.max(0, artAfter) : 0;
  const colZero = ink <= MAKER_EPS;
  const debtZero = art <= MAKER_EPS;
  return {
    inkAfter: ink,
    artAfter: art,
    hasDebtAfter: !debtZero,
    collateralOnly: !colZero && debtZero,
    closedPosition: colZero && debtZero,
  };
}

/** A transaction in which a contract the sender called opened the vault in
 *  its name and gave it to the sender (or the sender's proxy): the contract,
 *  the proxy the vault went to and whether the transaction built it. */
export function openedViaContract(
  rows: readonly MakerEvent[] | undefined,
  tx: MakerTxContext | undefined,
): { contract: string; proxy: string | null; built: boolean } | null {
  if (!rows || !tx || !tx.to) return null;
  if (!rows.some((r) => r.context.data.isOpen)) return null;
  const give = rows.find((r) => r.context.data.eventType === "give");
  const g = give?.context.data;
  if (!g || g.giveCaller !== tx.to) return null;
  if (g.giveDstOwner !== tx.from && g.giveDst !== tx.from) return null;
  const proxy = g.giveDst && g.giveDst !== tx.from ? g.giveDst : null;
  const built = proxy != null && (tx.proxiesBuilt ?? []).some((p) => p.proxy === proxy && p.owner === tx.from);
  return { contract: tx.to, proxy, built };
}

/** A deposit and a withdrawal of the same amount inside one transaction: the
 *  other row, when this row is one of such a pair. */
export function inAndOutPartner(row: MakerEvent, rows: readonly MakerEvent[] | undefined): MakerEvent | null {
  if (!rows || row.context.data.eventType !== "frob") return null;
  const dink = Number(row.context.data.dink) || 0;
  if (dink === 0) return null;
  return (
    rows.find(
      (r) =>
        r.id !== row.id &&
        r.context.data.eventType === "frob" &&
        Math.abs((Number(r.context.data.dink) || 0) + dink) < 1e-12,
    ) ?? null
  );
}

/** How far the collateral price at `ilkAt` could fall before the vault after
 *  the row reaches its minimum ratio. Null without the ilk read or the debt. */
export function dropAt(inkAfter: number, debtAfter: number, ilkAt?: MakerIlkAt | null): number | null {
  const price = ilkAt?.priceUsd ?? null;
  const mat = ilkAt?.mat ?? null;
  if (price == null || mat == null || !(price > 0) || !(debtAfter > MAKER_EPS) || !(inkAfter > MAKER_EPS)) return null;
  return 1 - (debtAfter * mat) / inkAfter / price;
}
