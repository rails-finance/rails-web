// Alchemix V2 position economics: the lifetime flows the tower draws.
// ----------------------------------------------------------------------------
// Pure, over ONE V2 account's own rows. Nothing here reads a V3 figure, and no
// V3 page calls it, so a V2 amount cannot reach a V3 total (rails-ops
// reference/alchemix-v2-frozen-record.md).
//
//   • The DEBT side, in the synthetic: minted over the account's life, and
//     against it what was burned, and the debt a repayment or a liquidation
//     cancelled (the log's `credit`). Before block 14,755,727 those two logs
//     carried no credit, so a side with a pre-break row states neither total:
//     a sum over part of them would read as the whole. What is left owing at
//     close is the frozen read. The gap between the flows and it is the
//     harvested yield, which paid the debt down every block with no log.
//   • The COLLATERAL side: what the account held at close, in the underlying,
//     one line per underlying token. Deposits are logged in yield tokens and
//     withdrawals in shares, two units that do not subtract, so no deposited or
//     withdrawn total is drawn.
//
// No USD anywhere: the collateral was swept on the day these figures stop, and
// a price at any other block would state a value no read supports.

import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { isAlchemixV2Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { v2FrozenDebtProv, v2SummedProv, v2UnderlyingProv, type AlchemixV2Coords } from "@/lib/alchemix/v2-provenance";
import type { AlchemixV2PositionSummary } from "@/types/api/alchemix";

const SYNTHETIC_DECIMALS = 18;

function sumField(
  events: BaseActivityEvent[],
  type: string,
  field: string,
): { raw: bigint; count: number; complete: boolean } {
  let raw = BigInt(0);
  let count = 0;
  let complete = true;
  for (const e of events) {
    if (!isAlchemixV2Event(e) || e.context.data.eventType !== type) continue;
    const v = e.context.data.raw[field];
    count += 1;
    if (v == null) {
      complete = false;
      continue;
    }
    raw += BigInt(v.split(".")[0] || "0");
  }
  return { raw, count, complete };
}

const scaled = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;

export function computeAlchemixV2Economics(
  p: AlchemixV2PositionSummary,
  events: BaseActivityEvent[],
  coords: AlchemixV2Coords,
): ChainTruthTowerData {
  const sym = p.syntheticSymbol;
  const minted = sumField(events, "mint", "amount");
  const burned = sumField(events, "burn", "amount");
  const repaid = sumField(events, "repay", "credit");
  const liquidated = sumField(events, "liquidate", "credit");

  const exited: TowerLine[] = [];
  if (burned.raw > BigInt(0)) {
    exited.push({
      key: "burned",
      symbol: sym,
      amount: scaled(burned.raw, SYNTHETIC_DECIMALS),
      usd: null,
      prov: v2SummedProv("Burned", sym, burned.count, coords),
      flowLabel: "Burned",
    });
  }
  if (repaid.complete && repaid.raw > BigInt(0)) {
    exited.push({
      key: "repaid",
      symbol: sym,
      amount: scaled(repaid.raw, SYNTHETIC_DECIMALS),
      usd: null,
      prov: v2SummedProv("Repaid", sym, repaid.count, coords),
      flowLabel: "Repaid",
    });
  }
  const liquidatedLines: TowerLine[] =
    liquidated.complete && liquidated.raw > BigInt(0)
      ? [
          {
            key: "liquidated",
            symbol: sym,
            amount: scaled(liquidated.raw, SYNTHETIC_DECIMALS),
            usd: null,
            prov: v2SummedProv("Liquidated", sym, liquidated.count, coords),
          },
        ]
      : [];

  const debt = p.frozenDebt;
  const owed =
    debt && debt.sign === "debt"
      ? [
          {
            key: "owed-at-close",
            symbol: sym,
            amount: debt.formatted,
            usd: null,
            prov: v2FrozenDebtProv(sym, debt.raw, debt.asOfBlock, coords),
          },
        ]
      : [];

  // The collateral at close, one line per underlying. Two yield tokens over one
  // underlying are the same token and sum.
  const byUnderlying = new Map<string, { symbol: string; raw: bigint; decimals: number; first: TowerLine["prov"] }>();
  for (const c of p.collateral) {
    const u = c.underlying;
    if (!u || c.readStale) continue;
    const prev = byUnderlying.get(u.address);
    const prov = v2UnderlyingProv(
      u.symbol,
      u.raw,
      u.decimals,
      c.yieldToken.symbol,
      c.yieldToken.decimals,
      u.perShareRaw,
      p.frozenAtBlock,
      coords,
    );
    byUnderlying.set(u.address, {
      symbol: u.symbol,
      decimals: u.decimals,
      raw: (prev?.raw ?? BigInt(0)) + BigInt(u.raw),
      first: prev?.first ?? prov,
    });
  }
  const held: TowerLine[] = [...byUnderlying.entries()]
    .filter(([, v]) => v.raw > BigInt(0))
    .map(([address, v]) => ({
      key: `held-${address}`,
      symbol: v.symbol,
      address,
      amount: scaled(v.raw, v.decimals),
      usd: null,
      prov: v.first,
    }));
  const oneUnit = new Set(held.map((l) => l.symbol)).size === 1;

  return {
    valued: false,
    collateral: {
      current: held,
      exited: [],
      liquidated: [],
      lifetimeInflow: oneUnit ? held.reduce((a, l) => a + l.amount, 0) : 0,
    },
    debt: {
      current: owed,
      exited,
      liquidated: liquidatedLines,
      lifetimeInflow: scaled(minted.raw, SYNTHETIC_DECIMALS),
    },
    collateralUnit: oneUnit ? held[0]?.symbol : undefined,
    debtUnit: sym,
    collateralTitle: "Held at close",
    debtTitle: "Owed at close",
    debtInflowLabel: "Minted",
  };
}

/** Whether a debt-side total was withheld because a pre-break log carries no
 *  credit. The view states it in a sentence. */
export function v2CreditTotalsWithheld(events: BaseActivityEvent[]): boolean {
  return !sumField(events, "repay", "credit").complete || !sumField(events, "liquidate", "credit").complete;
}
