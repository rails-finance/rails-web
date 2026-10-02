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
//     redistributed to other Troves, and any ETH sent to the CollSurplusPool;
//     when the transaction liquidated several Troves, this Trove's share
//     (splitLiquidation), or the totals where the share does not reconcile.
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
  "event CollBalanceUpdated(address indexed _account, uint256 _newBalance)",
  "event LastGoodPriceUpdated(uint256 _lastGoodPrice)",
]);
const PRICE_ABI = parseAbi(["function lastGoodPrice() view returns (uint256)"]);
const SURPLUS_ABI = parseAbi(["function getCollateral(address _account) view returns (uint256)"]);

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
/** TroveManagerOperation.liquidateInRecoveryMode. */
const OP_LIQUIDATE_RECOVERY = 2;
const E18 = BigInt("1000000000000000000");
/** MCR, 110%, and LUSD_GAS_COMPENSATION, 200 LUSD (TroveManager constants). */
const MCR = BigInt("1100000000000000000");
const LUSD_GAS_COMP = BigInt("200") * E18;
/** COLL_GAS_COMPENSATION divisor: 0.5% of the collateral. */
const PERCENT_DIVISOR = BigInt(200);

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
  /** Troves this transaction liquidated. */
  trovesInTx: number;
  /** Whose figures these are when the transaction liquidated several Troves:
   *  "trove" when this Trove's share was worked out and reconciles with the
   *  transaction's totals, "transaction" when it did not and the figures are
   *  the totals. Always "trove" for a single liquidation. */
  share: "trove" | "transaction";
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

/** One Trove's part of a liquidation. */
interface TroveShare {
  borrower: string;
  spDebt: bigint;
  spEth: bigint;
  redistDebt: bigint;
  redistEth: bigint;
  gasEth: bigint;
  capped: boolean;
}

/** Each Trove's share of a batch liquidation, replayed from its TroveLiquidated
 *  log in log order the way TroveManager's batch loop applies it: 0.5% of the
 *  collateral to the liquidator; the Stability Pool offsets each debt in turn
 *  until its LUSD runs out (min(debt, what is left), and the ETH pro rata);
 *  the rest is redistributed. Under Recovery Mode a Trove at or below 100%
 *  is redistributed whole, and a capped one (its owner's CollSurplusPool
 *  balance moved in this transaction) is offset whole, the emitted collateral
 *  being what the Pool received. The Pool's starting depth is not logged; the
 *  replay starts from the LUSD it burned, which offsets the same way. Null
 *  when the replay does not reproduce the transaction's totals to the wei. */
function splitLiquidation(
  troves: Decoded[],
  cappedOwners: Set<string>,
  price: bigint | null,
  totals: { spDebt: bigint; spEth: bigint; collGas: bigint | null },
): TroveShare[] | null {
  let remaining = totals.spDebt;
  const out: TroveShare[] = [];
  for (const t of troves) {
    const borrower = (t.args._borrower as string).toLowerCase();
    const debt = t.args._debt as bigint;
    const coll = t.args._coll as bigint;
    if (debt <= ZERO) return null;
    const recovery = Number(t.args._operation) === OP_LIQUIDATE_RECOVERY;
    if (recovery && cappedOwners.has(borrower)) {
      if (price == null || price <= ZERO || remaining < debt) return null;
      const capped = (debt * MCR) / price;
      const gasEth = capped / PERCENT_DIVISOR;
      if (capped - gasEth !== coll) return null;
      out.push({ borrower, spDebt: debt, spEth: coll, redistDebt: ZERO, redistEth: ZERO, gasEth, capped: true });
      remaining -= debt;
      continue;
    }
    const gasEth = coll / PERCENT_DIVISOR;
    const toLiquidate = coll - gasEth;
    if (recovery) {
      if (price == null || price <= ZERO) return null;
      if ((coll * price) / debt <= E18) {
        out.push({
          borrower,
          spDebt: ZERO,
          spEth: ZERO,
          redistDebt: debt,
          redistEth: toLiquidate,
          gasEth,
          capped: false,
        });
        continue;
      }
    }
    const off = remaining > ZERO ? (debt < remaining ? debt : remaining) : ZERO;
    const spEth = off > ZERO ? (toLiquidate * off) / debt : ZERO;
    out.push({
      borrower,
      spDebt: off,
      spEth,
      redistDebt: debt - off,
      redistEth: toLiquidate - spEth,
      gasEth,
      capped: false,
    });
    remaining -= off;
  }
  const sum = (f: (x: TroveShare) => bigint) => out.reduce((a, x) => a + f(x), ZERO);
  if (sum((x) => x.spDebt) !== totals.spDebt || sum((x) => x.spEth) !== totals.spEth) return null;
  if (totals.collGas != null && sum((x) => x.gasEth) !== totals.collGas) return null;
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
    const recoveryMode = Number(mine.args._operation) === OP_LIQUIDATE_RECOVERY;
    const surplusTotal = sum(etherSent(A.csp), "_amount");
    const whole: LiquityV1LiquidationRead = {
      trovesInTx: liquidated.length,
      share: liquidated.length > 1 ? "transaction" : "trove",
      recoveryMode,
      liquidator,
      liquidatorLusd: units(reservePaid.reduce((s, d) => s + (d.args.value as bigint), ZERO)),
      liquidatorEth: units(liquidator ? sum(etherSent(liquidator), "_amount") : ZERO),
      stabilityPoolDebt: units(spDebt),
      stabilityPoolEth: units(spEth),
      redistributedDebt: units(pos(liqDebt - spDebt)),
      redistributedEth: units(pos(liqColl - spEth)),
      surplusEth: units(surplusTotal),
    };
    liquidation = whole;
    if (liquidated.length > 1) {
      const cappedOwners = new Set(
        logs
          .filter((d) => d.name === "CollBalanceUpdated" && eq(d.address, A.csp))
          .map((d) => (d.args._account as string).toLowerCase()),
      );
      // The price the liquidation acted on: the PriceFeed's store in this
      // transaction, else its value the block before. A later transaction in
      // the block can move the end-of-block price.
      const stored = logs.find(
        (d) => d.name === "LastGoodPriceUpdated" && eq(d.address, LIQUITY_V1_ADDRESSES.PRICE_FEED),
      );
      const txPrice =
        (stored?.args._lastGoodPrice as bigint | undefined) ??
        (await client
          .readContract({
            address: LIQUITY_V1_ADDRESSES.PRICE_FEED as Hex,
            abi: PRICE_ABI,
            functionName: "lastGoodPrice",
            blockNumber: block - BigInt(1),
          })
          .catch(() => null));
      const shares = splitLiquidation(liquidated, cappedOwners, txPrice, {
        spDebt,
        spEth,
        collGas: (totals?.args._collGasCompensation as bigint | undefined) ?? null,
      });
      const own = shares?.find((x) => x.borrower === wallet);
      if (own) {
        // A capped Trove's surplus: its CollSurplusPool balance after the
        // transaction less the balance the block before.
        let surplus: bigint | null = ZERO;
        if (own.capped) {
          const after = logs.find(
            (d) => d.name === "CollBalanceUpdated" && eq(d.address, A.csp) && eq(d.args._account as string, wallet),
          );
          const before = await client
            .readContract({
              address: A.csp as Hex,
              abi: SURPLUS_ABI,
              functionName: "getCollateral",
              args: [wallet as Hex],
              blockNumber: block - BigInt(1),
            })
            .catch(() => null);
          surplus = after && before != null ? pos((after.args._newBalance as bigint) - before) : null;
        }
        if (surplus != null)
          liquidation = {
            ...whole,
            share: "trove",
            liquidatorLusd: units(LUSD_GAS_COMP),
            liquidatorEth: units(own.gasEth),
            stabilityPoolDebt: units(own.spDebt),
            stabilityPoolEth: units(own.spEth),
            redistributedDebt: units(own.redistDebt),
            redistributedEth: units(own.redistEth),
            surplusEth: units(surplus),
          };
      }
    }
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
