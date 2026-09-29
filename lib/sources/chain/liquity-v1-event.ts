// One Liquity V1 Trove event read from its transaction receipt — the figures
// the captured TroveUpdated stream does not carry. The stream gives the Trove's
// debt and collateral either side of the event; the receipt says where the
// LUSD and ETH went:
//
//   • the borrowing fee (BorrowerOperations' LUSDBorrowingFeePaid for this
//     borrower), the LUSD minted to the borrower, and the 200 LUSD reserve
//     minted to the GasPool, on an open or a draw;
//   • the LUSD burned from the borrower and the reserve burned from the GasPool
//     on a close (the owner repays the debt less the reserve);
//   • on a liquidation, what the Stability Pool burned and received, what the
//     liquidator was paid (the reserve and 0.5% of the ETH), what was
//     redistributed to other Troves, and any ETH sent to the CollSurplusPool.
//
// Plus the protocol's ETH price at the end of the event's block
// (PriceFeed.lastGoodPrice, the figure the redemption rows already carry), so
// the opened card can state the collateral ratio either side of the event.
// A past block never changes, so the route caches the answer hard.
//
// SERVER-ONLY.

import { parseAbi, decodeEventLog, type Hex, type Log } from "viem";
import { alchemyClient } from "./rpc";
import { LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";

const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event LUSDBorrowingFeePaid(address indexed _borrower, uint256 _LUSDFee)",
  "event EtherSent(address _to, uint256 _amount)",
  "event TroveLiquidated(address indexed _borrower, uint256 _debt, uint256 _coll, uint8 _operation)",
  "event Liquidation(uint256 _liquidatedDebt, uint256 _liquidatedColl, uint256 _collGasCompensation, uint256 _LUSDGasCompensation)",
]);
const PRICE_ABI = parseAbi(["function lastGoodPrice() view returns (uint256)"]);

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
/** TroveManagerOperation.liquidateInRecoveryMode. */
const OP_LIQUIDATE_RECOVERY = 2;

const A = {
  lusd: LIQUITY_V1_ADDRESSES.LUSD,
  bo: LIQUITY_V1_ADDRESSES.BORROWER_OPERATIONS,
  tm: LIQUITY_V1_ADDRESSES.TROVE_MANAGER,
  ap: LIQUITY_V1_ADDRESSES.ACTIVE_POOL,
  gas: LIQUITY_V1_ADDRESSES.GAS_POOL,
  sp: LIQUITY_V1_ADDRESSES.STABILITY_POOL,
  csp: LIQUITY_V1_ADDRESSES.COLL_SURPLUS_POOL,
};

export interface LiquityV1LiquidationRead {
  /** Troves this transaction liquidated. Above 1, every figure below is the
   *  whole transaction's, not this Trove's alone. */
  trovesInTx: number;
  /** This Trove was liquidated under Recovery Mode's rules. */
  recoveryMode: boolean;
  liquidator: string | null;
  /** The 200 LUSD reserve paid to the liquidator. */
  liquidatorLusd: string;
  /** 0.5% of the liquidated ETH, paid to the liquidator. */
  liquidatorEth: string;
  /** LUSD the Stability Pool burned to cancel the debt. */
  stabilityPoolDebt: string;
  /** ETH the Stability Pool received. */
  stabilityPoolEth: string;
  /** Debt and ETH shared out to the other open Troves (the Stability Pool
   *  could not cover them). */
  redistributedDebt: string;
  redistributedEth: string;
  /** ETH sent to the CollSurplusPool — a Recovery Mode liquidation capped at
   *  110% of the debt leaves the rest there for the owner. */
  surplusEth: string;
}

export interface LiquityV1EventRead {
  txHash: string;
  blockNumber: number;
  /** PriceFeed.lastGoodPrice at the end of the event's block (USD per ETH). */
  priceUsd: number | null;
  /** The transaction's sender — who paid its gas and, on a liquidation, who
   *  called it. */
  sender: string;
  /** LUSDBorrowingFeePaid for this borrower; null when the event is absent
   *  (no draw in this transaction). */
  borrowingFee: string | null;
  /** LUSD minted to the borrower. */
  lusdMintedToOwner: string;
  /** LUSD burned from the borrower (a repayment or a close). */
  lusdBurnedFromOwner: string;
  /** LUSD minted to / burned from the GasPool: the 200 LUSD reserve. */
  reserveMinted: string;
  reserveBurned: string;
  /** ETH the ActivePool sent to the borrower. */
  ethToOwner: string;
  liquidation: LiquityV1LiquidationRead | null;
}

const eq = (a: string | undefined | null, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

/** Exact raw → decimal string, 18 decimals, trailing zeros trimmed. */
function units(raw: bigint): string {
  const div = BigInt("1000000000000000000");
  const whole = (raw / div).toString();
  const frac = (raw % div).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

type Decoded = { address: string; name: string; args: Record<string, unknown> };

function decode(logs: Log[]): Decoded[] {
  const out: Decoded[] = [];
  for (const l of logs) {
    try {
      const d = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics });
      out.push({ address: l.address, name: d.eventName, args: d.args as Record<string, unknown> });
    } catch {
      // Not one of ours.
    }
  }
  return out;
}

export async function readLiquityV1Event(txHash: string, wallet: string): Promise<LiquityV1EventRead> {
  const client = alchemyClient();
  const hash = txHash as Hex;
  const [receipt, tx] = await Promise.all([client.getTransactionReceipt({ hash }), client.getTransaction({ hash })]);
  const block = receipt.blockNumber;
  const priceRaw = await client
    .readContract({
      address: LIQUITY_V1_ADDRESSES.PRICE_FEED as Hex,
      abi: PRICE_ABI,
      functionName: "lastGoodPrice",
      blockNumber: block,
    })
    .catch(() => null);

  const logs = decode(receipt.logs);
  const sum = (pred: (d: Decoded) => boolean, field: string) =>
    logs.filter(pred).reduce((s, d) => s + (d.args[field] as bigint), ZERO);

  const lusdTransfer = (from: string, to: string) => (d: Decoded) =>
    d.name === "Transfer" && eq(d.address, A.lusd) && eq(d.args.from as string, from) && eq(d.args.to as string, to);
  const etherSent = (to: string) => (d: Decoded) =>
    d.name === "EtherSent" && eq(d.address, A.ap) && eq(d.args._to as string, to);

  const fees = logs.filter(
    (d) => d.name === "LUSDBorrowingFeePaid" && eq(d.address, A.bo) && eq(d.args._borrower as string, wallet),
  );

  // ── Liquidation ────────────────────────────────────────────────────────
  const liquidated = logs.filter((d) => d.name === "TroveLiquidated" && eq(d.address, A.tm));
  const mine = liquidated.find((d) => eq(d.args._borrower as string, wallet));
  let liquidation: LiquityV1LiquidationRead | null = null;
  if (mine) {
    const totals = logs.find((d) => d.name === "Liquidation" && eq(d.address, A.tm));
    // The liquidator is whoever the GasPool paid the reserve to.
    const reservePaid = logs.filter(
      (d) =>
        d.name === "Transfer" &&
        eq(d.address, A.lusd) &&
        eq(d.args.from as string, A.gas) &&
        !eq(d.args.to as string, ZERO_ADDR),
    );
    const liquidator = reservePaid.length > 0 ? (reservePaid[0].args.to as string).toLowerCase() : null;
    const spDebt = sum(lusdTransfer(A.sp, ZERO_ADDR), "value");
    const spEth = sum(etherSent(A.sp), "_amount");
    const liqDebt = (totals?.args._liquidatedDebt as bigint | undefined) ?? ZERO;
    const liqColl = (totals?.args._liquidatedColl as bigint | undefined) ?? ZERO;
    const pos = (n: bigint) => (n > ZERO ? n : ZERO);
    liquidation = {
      trovesInTx: liquidated.length,
      recoveryMode: Number(mine.args._operation) === OP_LIQUIDATE_RECOVERY,
      liquidator,
      liquidatorLusd: units(reservePaid.reduce((s, d) => s + (d.args.value as bigint), ZERO)),
      liquidatorEth: units(liquidator ? sum(etherSent(liquidator), "_amount") : ZERO),
      stabilityPoolDebt: units(spDebt),
      stabilityPoolEth: units(spEth),
      redistributedDebt: units(pos(liqDebt - spDebt)),
      redistributedEth: units(pos(liqColl - spEth)),
      surplusEth: units(sum(etherSent(A.csp), "_amount")),
    };
  }

  return {
    txHash: hash.toLowerCase(),
    blockNumber: Number(block),
    priceUsd: priceRaw != null ? Number(units(priceRaw)) : null,
    sender: tx.from.toLowerCase(),
    borrowingFee: fees.length > 0 ? units(fees.reduce((s, d) => s + (d.args._LUSDFee as bigint), ZERO)) : null,
    lusdMintedToOwner: units(sum(lusdTransfer(ZERO_ADDR, wallet), "value")),
    lusdBurnedFromOwner: units(sum(lusdTransfer(wallet, ZERO_ADDR), "value")),
    reserveMinted: units(sum(lusdTransfer(ZERO_ADDR, A.gas), "value")),
    reserveBurned: units(sum(lusdTransfer(A.gas, ZERO_ADDR), "value")),
    ethToOwner: units(sum(etherSent(wallet), "_amount")),
    liquidation,
  };
}
