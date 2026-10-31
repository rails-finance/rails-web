// Home hero live example — the wire form of its event history.
// ----------------------------------------------------------------------------
// The frame needs ~150 events twice over (the economics' projection and the
// Lifetime flows replay), and shipped as objects they were 254 KB of the home
// page's RSC payload, nearly all of it key names, "$undefined" markers and the
// Trove's id and collateral repeated on every row. The wire form is positional
// rows: packLiveExample runs on the server, unpackLiveExample on the client,
// and the round trip returns the same HeroTowerEvent and LiquityFlowEvent
// values (scripts/test/live-example-wire.test.mjs). Isomorphic: no server-only
// imports.

import type { LiquityFlowEvent } from "@/lib/shared/liquity-flows";
import type { HeroTowerEvent, LiveExampleData } from "./live-example";

const PROTOCOL = "liquity-v2-troves" as const;
const KINDS: LiquityFlowEvent["kind"][] = ["owner", "redemption", "liquidation", "other"];
const RATE_BY: NonNullable<LiquityFlowEvent["rateBy"]>[] = ["owner", "delegate"];

type Row = readonly unknown[];

/** `LiveExampleData` with the two event histories as positional rows. */
export type WireLiveExample = Omit<LiveExampleData, "towerEvents" | "flowEvents"> & {
  /** The Trove's id, collateral and debt asset, which every row repeats. */
  constants: { troveId: string; collateralType: string; assetType: string };
  tower: Row[];
  flow: Row[];
};

/** Undefined becomes null on the wire, and back. */
const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const und = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
const bit = (b: boolean) => (b ? 1 : 0);

function packTower(e: HeroTowerEvent): Row {
  const c = e.context.data;
  const after = c.stateAfter;
  const before = c.stateBefore;
  const op = c.troveOperation;
  const tail = e.id.startsWith(e.txHash);
  return [
    e.txHash,
    tail ? e.id.slice(e.txHash.length) : e.id,
    bit(tail),
    e.blockNumber,
    e.timestamp,
    e.gas ? [e.gas.gasCostEth, e.gas.gasCostUsd] : null,
    c.operation,
    c.collateralPrice,
    bit(c.isInBatch),
    bit(c.isZombieTrove),
    [after.coll, after.debt, after.annualInterestRate, nul(after.raw?.debt), nul(after.raw?.annualInterestRate)],
    before ? [before.debt, before.annualInterestRate, nul(before.raw?.debt)] : null,
    op
      ? [
          op.collChangeFromOperation,
          op.debtChangeFromOperation,
          nul(op.debtIncreaseFromUpfrontFee),
          nul(op.collIncreaseFromRedist),
          nul(op.debtIncreaseFromRedist),
        ]
      : null,
    c.redemption ? [c.redemption.redemptionFee] : null,
    c.liquidation ? [c.liquidation.collSurplus] : null,
    c.batchUpdate ? [c.batchUpdate.annualManagementFee, nul(c.batchUpdate.interestBatchManager)] : null,
  ];
}

function unpackTower(r: Row, k: WireLiveExample["constants"]): HeroTowerEvent {
  const [
    tx,
    idPart,
    tail,
    block,
    ts,
    gas,
    operation,
    price,
    inBatch,
    zombie,
    after,
    before,
    op,
    redemption,
    liq,
    batch,
  ] = r as [
    string,
    string,
    number,
    number,
    number,
    [number, number] | null,
    string,
    number,
    number,
    number,
    [number, number, number, string | null, string | null],
    [number, number, string | null] | null,
    [number, number, number | null, number | null, number | null] | null,
    [string] | null,
    [number] | null,
    [number, string | null] | null,
  ];
  return {
    id: tail ? tx + idPart : idPart,
    txHash: tx,
    blockNumber: block,
    timestamp: ts,
    gas: gas ? { gasCostEth: gas[0], gasCostUsd: gas[1] } : undefined,
    context: {
      protocol: PROTOCOL,
      data: {
        operation,
        troveId: k.troveId,
        collateralType: k.collateralType,
        collateralPrice: price,
        assetType: k.assetType,
        isInBatch: inBatch === 1,
        isZombieTrove: zombie === 1,
        stateAfter: {
          coll: after[0],
          debt: after[1],
          annualInterestRate: after[2],
          raw: { debt: und(after[3]), annualInterestRate: und(after[4]) },
        },
        stateBefore: before
          ? { debt: before[0], annualInterestRate: before[1], raw: { debt: und(before[2]) } }
          : undefined,
        troveOperation: op
          ? {
              collChangeFromOperation: op[0],
              debtChangeFromOperation: op[1],
              debtIncreaseFromUpfrontFee: und(op[2]),
              collIncreaseFromRedist: und(op[3]),
              debtIncreaseFromRedist: und(op[4]),
            }
          : undefined,
        redemption: redemption ? { redemptionFee: redemption[0] } : undefined,
        liquidation: liq ? { collSurplus: liq[0] } : undefined,
        batchUpdate: batch ? { annualManagementFee: batch[0], interestBatchManager: und(batch[1]) } : undefined,
      },
    },
  };
}

/** A flow row names its event by position in the tower rows, which already
 *  carry its id, transaction, block and time. */
function packFlow(f: LiquityFlowEvent, towerIndexById: Map<string, number>): Row {
  const at = towerIndexById.get(f.id);
  if (at === undefined) throw new Error(`live-example wire: flow event ${f.id} has no tower row`);
  return [
    at,
    KINDS.indexOf(f.kind),
    f.collAfter,
    f.debtAfter,
    nul(f.collBefore),
    nul(f.debtBefore),
    f.collOp,
    f.debtOp,
    f.upfrontFee,
    f.collFromRedist,
    f.debtFromRedist,
    f.surplus,
    nul(f.reserve),
    f.price,
    f.redemptionPrice === undefined ? null : [f.redemptionPrice],
    f.rate,
    f.fee,
    f.rateBy === undefined ? -1 : RATE_BY.indexOf(f.rateBy),
  ];
}

function unpackFlow(r: Row, tower: HeroTowerEvent[]): LiquityFlowEvent {
  const [at, kind, collAfter, debtAfter, collBefore, debtBefore, collOp, debtOp, upfrontFee, collRedist, debtRedist] =
    r as [
      number,
      number,
      number,
      number,
      number | null,
      number | null,
      number | null,
      number | null,
      number,
      number,
      number,
    ];
  const [surplus, reserve, price, redemptionPrice, rate, fee, rateBy] = r.slice(11) as [
    number,
    number | null,
    number | null,
    [number | null] | null,
    number,
    number,
    number,
  ];
  const t = tower[at];
  return {
    id: t.id,
    ts: t.timestamp,
    block: t.blockNumber,
    tx: t.txHash,
    kind: KINDS[kind],
    collAfter,
    debtAfter,
    ...(collBefore !== null ? { collBefore } : {}),
    ...(debtBefore !== null ? { debtBefore } : {}),
    collOp,
    debtOp,
    upfrontFee,
    collFromRedist: collRedist,
    debtFromRedist: debtRedist,
    surplus,
    ...(reserve !== null ? { reserve } : {}),
    price,
    ...(redemptionPrice ? { redemptionPrice: redemptionPrice[0] } : {}),
    rate,
    fee,
    ...(rateBy >= 0 ? { rateBy: RATE_BY[rateBy] } : {}),
  };
}

/** Server side: the history as rows. Every event of the Trove shares its id,
 *  collateral and debt asset, so those ship once. */
export function packLiveExample(data: LiveExampleData): WireLiveExample {
  const { towerEvents, flowEvents, ...rest } = data;
  const first = towerEvents[0]?.context.data;
  const constants = {
    troveId: first?.troveId ?? "",
    collateralType: first?.collateralType ?? "",
    assetType: first?.assetType ?? "",
  };
  for (const e of towerEvents) {
    const c = e.context.data;
    if (
      c.troveId !== constants.troveId ||
      c.collateralType !== constants.collateralType ||
      c.assetType !== constants.assetType
    )
      throw new Error(`live-example wire: event ${e.id} is not on the Trove the rows share`);
  }
  const towerIndexById = new Map(towerEvents.map((e, i) => [e.id, i]));
  return {
    ...rest,
    constants,
    tower: towerEvents.map(packTower),
    flow: flowEvents.map((f) => packFlow(f, towerIndexById)),
  };
}

/** Client side: the objects the frame's components read. */
export function unpackLiveExample(wire: WireLiveExample): LiveExampleData {
  const { constants, tower, flow, ...rest } = wire;
  const towerEvents = tower.map((r) => unpackTower(r, constants));
  return { ...rest, towerEvents, flowEvents: flow.map((r) => unpackFlow(r, towerEvents)) };
}
