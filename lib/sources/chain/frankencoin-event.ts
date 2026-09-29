// One Frankencoin position event read from its transaction receipt — where the
// ZCHF went, which the MintingUpdate ledger does not say. The ledger gives the
// position's gross debt either side of the event; the ZCHF token's own logs in
// the receipt say:
//
//   • on a mint: the ZCHF minted to the borrower (what the wallet received),
//     the ZCHF minted to the reserve (the Equity contract), and the Profit the
//     position reported, which is the up-front interest. The reserve share is
//     the reserve mint less that interest.
//   • on a repayment: the ZCHF burned from the payer and the ZCHF the reserve
//     sent back to it (the position's assigned reserve share,
//     Frankencoin.burnFromWithReserve), plus any ZCHF burned from the reserve
//     directly.
//
// A transaction that also updates another position (a roll from one position
// into another) mixes both positions' transfers, so it returns `shared` and the
// callers state none of the figures.
//
// A mined receipt never changes, so the route caches the answer hard.
//
// SERVER-ONLY.

import { parseAbi, decodeEventLog, keccak256, toBytes, type Hex, type Log } from "viem";
import { alchemyClient } from "./rpc";
import { FRANKENCOIN_ADDRESSES } from "@/lib/frankencoin/asset-catalog";

const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Profit(address indexed reportingMinter, uint256 amount)",
]);

/** MintingUpdate on V2 (collateral, price, minted) and V1 (… , limit). */
const MINTING_UPDATE_TOPICS = new Set(
  ["MintingUpdate(uint256,uint256,uint256)", "MintingUpdate(uint256,uint256,uint256,uint256)"].map((s) =>
    keccak256(toBytes(s)).toLowerCase(),
  ),
);

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export interface FrankencoinEventRead {
  txHash: string;
  blockNumber: number;
  sender: string;
  /** Another position's MintingUpdate rides the same transaction, so the
   *  transfers below are not this position's alone. Every figure is then
   *  withheld (empty strings). */
  shared: boolean;
  /** ZCHF minted to anyone but the reserve — what the borrower side received. */
  mintedOut: string;
  /** Where that ZCHF ended the transaction: the recipient, or the account it
   *  forwarded the whole amount to in the same transaction. */
  mintedOutTo: string | null;
  /** ZCHF minted to the reserve: the reserve share plus the interest. */
  mintedToReserve: string;
  /** The Profit the position reported: the up-front interest. */
  interest: string | null;
  /** ZCHF burned from the payer. */
  burnedFromPayer: string;
  /** Who it was burned from. */
  payer: string | null;
  /** ZCHF the reserve sent back to the payer: the assigned reserve share. */
  reserveReturned: string;
  /** ZCHF burned from the reserve directly. */
  burnedFromReserve: string;
}

const eq = (a: string | undefined | null, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

/** Exact raw → decimal string, 18 decimals, trailing zeros trimmed. */
function units(raw: bigint): string {
  const div = BigInt("1000000000000000000");
  const whole = (raw / div).toString();
  const frac = (raw % div).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

type Decoded = { name: string; args: Record<string, unknown> };

function decodeZchf(logs: Log[]): Decoded[] {
  const out: Decoded[] = [];
  for (const l of logs) {
    if (!eq(l.address, FRANKENCOIN_ADDRESSES.ZCHF)) continue;
    try {
      const d = decodeEventLog({ abi: ABI, data: l.data, topics: l.topics });
      out.push({ name: d.eventName, args: d.args as Record<string, unknown> });
    } catch {
      // Not one of ours.
    }
  }
  return out;
}

export async function readFrankencoinEvent(txHash: string, position: string): Promise<FrankencoinEventRead> {
  const client = alchemyClient();
  const hash = txHash as Hex;
  const receipt = await client.getTransactionReceipt({ hash });
  const reserve = FRANKENCOIN_ADDRESSES.EQUITY;

  const shared = receipt.logs.some(
    (l) => MINTING_UPDATE_TOPICS.has((l.topics[0] ?? "").toLowerCase()) && !eq(l.address, position),
  );

  const logs = decodeZchf(receipt.logs);
  const transfers = logs
    .filter((d) => d.name === "Transfer")
    .map((d) => ({
      from: (d.args.from as string).toLowerCase(),
      to: (d.args.to as string).toLowerCase(),
      value: d.args.value as bigint,
    }));
  const sum = (pred: (t: { from: string; to: string; value: bigint }) => boolean) =>
    transfers.filter(pred).reduce((s, t) => s + t.value, ZERO);

  const mintsOut = transfers.filter((t) => t.from === ZERO_ADDR && t.to !== ZERO_ADDR && !eq(t.to, reserve));
  const mintedOut = mintsOut.reduce((s, t) => s + t.value, ZERO);
  // One recipient, followed one hop where it forwarded the whole amount on.
  let mintedOutTo: string | null = null;
  if (mintsOut.length === 1) {
    const r = mintsOut[0];
    const onward = transfers.find((t) => t.from === r.to && t.value === r.value && t.to !== ZERO_ADDR);
    mintedOutTo = onward ? onward.to : r.to;
  }

  const burns = transfers.filter((t) => t.to === ZERO_ADDR && t.from !== ZERO_ADDR && !eq(t.from, reserve));
  const payers = [...new Set(burns.map((t) => t.from))];
  const burner = payers.length === 1 ? payers[0] : null;
  // A full repayment collects the ZCHF into the position first and burns it
  // there; the payer is then the one account that sent the position ZCHF.
  let payer = burner;
  if (burner != null && eq(burner, position)) {
    const senders = [
      ...new Set(
        transfers.filter((t) => eq(t.to, position) && t.from !== ZERO_ADDR && !eq(t.from, reserve)).map((t) => t.from),
      ),
    ];
    payer = senders.length === 1 ? senders[0] : null;
  }

  const profits = logs.filter((d) => d.name === "Profit" && eq(d.args.reportingMinter as string, position));

  const blank = shared;
  const fig = (n: bigint) => (blank ? "" : units(n));
  return {
    txHash: hash.toLowerCase(),
    blockNumber: Number(receipt.blockNumber),
    sender: receipt.from.toLowerCase(),
    shared,
    mintedOut: fig(mintedOut),
    mintedOutTo: blank ? null : mintedOutTo,
    mintedToReserve: fig(sum((t) => t.from === ZERO_ADDR && eq(t.to, reserve))),
    interest:
      blank || profits.length === 0 ? null : units(profits.reduce((s, d) => s + (d.args.amount as bigint), ZERO)),
    burnedFromPayer: fig(burns.reduce((s, t) => s + t.value, ZERO)),
    payer: blank ? null : payer,
    reserveReturned: fig(sum((t) => eq(t.from, reserve) && t.to !== ZERO_ADDR && (burner == null || t.to === burner))),
    burnedFromReserve: fig(sum((t) => eq(t.from, reserve) && t.to === ZERO_ADDR)),
  };
}
