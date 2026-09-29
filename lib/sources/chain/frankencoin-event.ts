// One Frankencoin position event read from its transaction receipt — where the
// ZCHF and the collateral went, which the indexed events do not say — plus the
// few position and hub values in force at that block.
//
// THE WINDOW. A receipt can carry several positions' updates (a roll repays one
// position and mints on another; a bot can bid on two challenges at once). The
// contracts emit an event's token movements BEFORE the event that closes it, so
// the logs that belong to this event are the ones after the previous closing
// log and up to this event's own log:
//
//   • a MintingUpdate row: from the previous MintingUpdate (any position) to
//     this position's MintingUpdate. PositionV2._mint → mintWithReserve emits
//     the borrower's and the reserve's mints and the Profit, then the
//     MintingUpdate; repay burns, then emits.
//   • a challenge row: from the previous hub challenge event to this one.
//     MintingHubV2.bid returns the challenger's collateral, pays the position's
//     collateral to the bidder (the position's MintingUpdate), takes the bid,
//     pays the reward, covers a shortfall or pays out an excess, burns the
//     repayment, then emits ChallengeSucceeded (or, in phase 1, pays the
//     challenger and hands its collateral to the buyer, then ChallengeAverted).
//
// With `log` (the event's log index) every figure is this event's alone. Without
// it the whole receipt is read and a transaction that also updates another
// position returns `shared`, and the callers state none of the figures.
//
//   • mint: the ZCHF minted to the borrower (what the wallet received), the
//     ZCHF minted to the reserve (the Equity contract), and the Profit the
//     position reported, which is the up-front interest; the reserve share is
//     the reserve mint less that interest. And the annual rate, expiry and start
//     read from the position at that block, which set the interest.
//   • repayment: the ZCHF burned from the payer and the ZCHF the reserve sent
//     back to it (the position's assigned reserve share), plus any ZCHF burned
//     from the reserve directly.
//   • challenge averted: who bought the challenger's collateral, for how much
//     ZCHF, and the minting cooldown the position set.
//   • challenge succeeded: the bidder, the reward, the challenger's collateral
//     returned, the debt burned, a shortfall the reserve covered (Loss) or an
//     excess paid to the owner, and the reserve share the burn released.
//   • creation handover: whether the new owner is a contract.
//   • forced sale (MintingHubV2.buyExpiredCollateral → PositionV2.forceSale):
//     the buyer, the collateral sold and the price per unit (the ForcedSale
//     log), the cost the hub charged (price × amount, as the hub computes it),
//     and which of forceSale's branches ran, read from its ZCHF transfers —
//     full repayment (the reserve sends the buyer the assigned reserve share,
//     the debt is burned from the buyer, the rest goes to the owner), partial
//     repayment (the proceeds go to the position and repay what they can), a
//     shortfall (the reserve's coverLoss pays the rest, Loss), or no debt (the
//     whole price goes to the owner). The terms that set the price — declared
//     price, expiration, challenge period — and the debt and reserve
//     percentage are read one block earlier, in one multicall.
//
// A mined receipt never changes, so the route caches the answer hard.
//
// SERVER-ONLY.

import { parseAbi, decodeEventLog, keccak256, toBytes, getAddress, type Hex, type Log } from "viem";
import { alchemyClient } from "./rpc";
import { FRANKENCOIN_ADDRESSES } from "@/lib/frankencoin/asset-catalog";

const ZCHF_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Profit(address indexed reportingMinter, uint256 amount)",
  "event Loss(address indexed reportingMinter, uint256 amount)",
]);
const ERC20_TRANSFER = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
const HUB_EVENTS = parseAbi(["event PostPonedReturn(address collateral, address indexed beneficiary, uint256 amount)"]);
const POSITION_READS = parseAbi([
  "function annualInterestPPM() view returns (uint32)",
  "function expiration() view returns (uint256)",
  "function start() view returns (uint256)",
  "function cooldown() view returns (uint256)",
  "function owner() view returns (address)",
  "function collateral() view returns (address)",
  "function challengeData() view returns (uint256 liqPrice, uint40 phase)",
]);
const POSITION_V2_TERMS = parseAbi([
  "function price() view returns (uint256)",
  "function expiration() view returns (uint40)",
  "function challengePeriod() view returns (uint40)",
  "function minted() view returns (uint256)",
  "function reserveContribution() view returns (uint24)",
  "function owner() view returns (address)",
  "function collateral() view returns (address)",
]);
const HUB_V2_READS = parseAbi([
  "function challenges(uint256) view returns (address challenger, uint40 start, address position, uint256 size)",
  "function roller() view returns (address)",
]);

const topic = (sig: string) => keccak256(toBytes(sig)).toLowerCase();

/** MintingUpdate on V2 (collateral, price, minted) and V1 (… , limit). */
const MINTING_UPDATE_TOPICS = new Set([
  topic("MintingUpdate(uint256,uint256,uint256)"),
  topic("MintingUpdate(uint256,uint256,uint256,uint256)"),
]);
/** The hub events that close a challenge step or a forced sale (V1 and V2). */
const HUB_CLOSING_TOPICS = new Set([
  topic("ChallengeStarted(address,address,uint256,uint256)"),
  topic("ChallengeAverted(address,uint256,uint256)"),
  topic("ChallengeSucceeded(address,uint256,uint256,uint256,uint256)"),
  topic("ForcedSale(address,uint256,uint256)"),
]);

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** A phase-1 purchase of the challenger's collateral. */
export interface FrankencoinAvertRead {
  kind: "averted";
  /** Who received the challenger's collateral: the buyer. */
  buyer: string | null;
  buyerIsContract: boolean | null;
  /** The challenger, when the ZCHF went to one account. */
  challenger: string | null;
  /** ZCHF the buyer paid the challenger. "0" when the challenger withdrew its
   *  own challenge (the hub charges nothing then). */
  paid: string;
  /** Collateral bought, raw units of the collateral token. */
  boughtRaw: string;
  /** The position's owner at that block. */
  owner: string | null;
  /** The position's minting cooldown after the block (unix seconds). */
  cooldownUntil: number | null;
  /** The declared price in force (raw, 1e(36 − collateral decimals)). */
  liqPriceRaw: string | null;
  /** The challenge's start, from the hub one block earlier. */
  challengeStart: number | null;
  /** The position's phase length (seconds). */
  phase: number | null;
}

/** A phase-2 sale of the position's collateral. */
export interface FrankencoinSaleRead {
  kind: "succeeded";
  /** Who received the position's collateral. */
  bidder: string | null;
  bidderIsContract: boolean | null;
  /** Position collateral sent to the bidder, raw. */
  soldRaw: string;
  /** ZCHF the bidder paid the hub. */
  bid: string;
  challenger: string | null;
  /** ZCHF the hub paid the challenger. */
  reward: string;
  /** The challenger's posted collateral sent back (or booked for later), raw. */
  challengerReturnedRaw: string;
  challengerReturnPostponed: boolean;
  /** ZCHF burned against the position's debt. */
  debtCleared: string;
  /** Loss the hub reported: the debt the bid (less the reward) left uncovered. */
  shortfall: string;
  /** Of that, ZCHF the reserve sent, and ZCHF newly minted when it ran short. */
  shortfallFromReserve: string;
  shortfallMinted: string;
  /** The position's reserve share released by the burn (the Profit it reported). */
  reserveReleased: string | null;
  /** ZCHF paid out to the owner from an excess. */
  owner: string | null;
  ownerReceived: string;
  /** ZCHF of an excess kept by the reserve. */
  excessToReserve: string;
  liqPriceRaw: string | null;
  challengeStart: number | null;
  phase: number | null;
}

/** An expired position's collateral bought through the V2 hub. */
export interface FrankencoinForcedSaleRead {
  kind: "forced";
  /** Who bought: the recipient of the position's collateral, or (nothing
   *  sold) the account the hub charged. */
  buyer: string | null;
  buyerIsContract: boolean | null;
  /** The position's owner one block earlier. */
  owner: string | null;
  /** Collateral sold, raw units (the ForcedSale log's amount). */
  soldRaw: string;
  /** Price per unit, raw (1e(36 − collateral decimals)), from the ForcedSale log. */
  priceRaw: string;
  /** What the hub charged: price × amount ÷ 1e18, as MintingHubV2 computes it. */
  cost: string;
  /** Which branch of PositionV2.forceSale ran. */
  branch: "full" | "partial" | "shortfall" | "noDebt";
  /** Debt burned. */
  debtCleared: string;
  /** Full repayment: the assigned reserve share the reserve sent the buyer. */
  reserveToBuyer: string;
  /** ZCHF the buyer sent the owner. */
  ownerReceived: string;
  /** Partial repayment: ZCHF the buyer sent the position. */
  toPosition: string;
  /** Partial repayment (collateral left): the reserve share the reserve
   *  released toward the repayment. */
  reserveFreed: string;
  /** Shortfall: the Loss the position reported, the ZCHF the reserve sent,
   *  the ZCHF minted when the reserve ran short, and the reserve share the
   *  burn released (Profit). */
  loss: string;
  lossFromReserve: string;
  lossMinted: string;
  reserveReleased: string | null;
  /** Read one block earlier. */
  liqPriceRaw: string | null;
  expiration: number | null;
  challengePeriod: number | null;
  mintedBefore: string | null;
  reservePPM: number | null;
}

export interface FrankencoinEventRead {
  txHash: string;
  blockNumber: number;
  blockTimestamp: number | null;
  sender: string;
  /** Another position's update rides the same transaction and the event's own
   *  logs could not be told apart (no log index). Every ZCHF figure is then
   *  withheld (empty strings). */
  shared: boolean;
  /** Other positions this transaction updated, with whether it left each one
   *  empty (no collateral, no debt). */
  otherPositions: { position: string; emptied: boolean }[];
  /** The transaction was sent to the V2 hub's roller. */
  viaRoller: boolean;
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
  /** A mint's terms at that block: the annual rate (ppm), the expiry and the
   *  start the interest runs from. */
  rate: { annualInterestPPM: number; expiration: number; start: number } | null;
  challenge: FrankencoinAvertRead | FrankencoinSaleRead | null;
  forced: FrankencoinForcedSaleRead | null;
  /** A creation handover: whether the new owner holds contract code now. */
  newOwnerIsContract: boolean | null;
}

export interface FrankencoinEventReadOptions {
  /** The row's kind, which decides what else is read. */
  kind?: string;
  /** The event's own log index: isolates its logs from other positions'. */
  logIndex?: number;
  /** An ownership row's new owner. */
  newOwner?: string;
}

const eq = (a: string | undefined | null, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

/** Exact raw → decimal string, 18 decimals, trailing zeros trimmed. */
function units(raw: bigint): string {
  const div = BigInt("1000000000000000000");
  const whole = (raw / div).toString();
  const frac = (raw % div).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

type Decoded = { name: string; args: Record<string, unknown>; logIndex: number };

function decodeZchf(logs: Log[]): Decoded[] {
  const out: Decoded[] = [];
  for (const l of logs) {
    if (!eq(l.address, FRANKENCOIN_ADDRESSES.ZCHF)) continue;
    try {
      const d = decodeEventLog({ abi: ZCHF_ABI, data: l.data, topics: l.topics });
      out.push({ name: d.eventName, args: d.args as Record<string, unknown>, logIndex: Number(l.logIndex) });
    } catch {
      // Not one of ours.
    }
  }
  return out;
}

type Move = { from: string; to: string; value: bigint; logIndex: number };

function transfersOf(logs: Log[], token: string): Move[] {
  const out: Move[] = [];
  for (const l of logs) {
    if (!eq(l.address, token)) continue;
    try {
      const d = decodeEventLog({ abi: ERC20_TRANSFER, data: l.data, topics: l.topics });
      const a = d.args as { from: string; to: string; value: bigint };
      out.push({ from: a.from.toLowerCase(), to: a.to.toLowerCase(), value: a.value, logIndex: Number(l.logIndex) });
    } catch {
      // Not a Transfer.
    }
  }
  return out;
}

const sumOf = (moves: Move[]) => moves.reduce((s, t) => s + t.value, ZERO);

async function isContract(address: string | null): Promise<boolean | null> {
  if (!address) return null;
  try {
    const code = await alchemyClient().getCode({ address: getAddress(address) });
    if (!code || code === "0x") return false;
    // An EIP-7702 delegation designator marks a wallet, not a contract.
    return !code.toLowerCase().startsWith("0xef0100");
  } catch {
    return null;
  }
}

/** One view call at a block (latest when `block` is null); null on failure. */
async function readAt<T>(
  address: string,
  abi: typeof POSITION_READS | typeof HUB_V2_READS,
  fn: string,
  block: bigint | null,
  args: unknown[] = [],
): Promise<T | null> {
  try {
    return (await alchemyClient().readContract({
      address: getAddress(address),
      abi,
      functionName: fn,
      args,
      ...(block != null ? { blockNumber: block } : {}),
    } as never)) as T;
  } catch {
    return null;
  }
}

let rollerCache: Promise<string | null> | null = null;
function v2Roller(): Promise<string | null> {
  if (!rollerCache) {
    rollerCache = readAt<string>(FRANKENCOIN_ADDRESSES.HUB_V2, HUB_V2_READS, "roller", null).then((r) =>
      r ? r.toLowerCase() : null,
    );
  }
  return rollerCache;
}

export async function readFrankencoinEvent(
  txHash: string,
  position: string,
  opts: FrankencoinEventReadOptions = {},
): Promise<FrankencoinEventRead> {
  const client = alchemyClient();
  const hash = txHash as Hex;
  const receipt = await client.getTransactionReceipt({ hash });
  const reserve = FRANKENCOIN_ADDRESSES.EQUITY.toLowerCase();
  const hubV2 = FRANKENCOIN_ADDRESSES.HUB_V2.toLowerCase();
  const block = receipt.blockNumber;
  const kind = opts.kind ?? "";
  const own = opts.logIndex;

  const logIdx = (l: Log) => Number(l.logIndex);
  const isMintingUpdate = (l: Log) => MINTING_UPDATE_TOPICS.has((l.topics[0] ?? "").toLowerCase());
  const isHubClosing = (l: Log) =>
    (eq(l.address, FRANKENCOIN_ADDRESSES.HUB_V2) || eq(l.address, FRANKENCOIN_ADDRESSES.HUB_V1)) &&
    HUB_CLOSING_TOPICS.has((l.topics[0] ?? "").toLowerCase());
  const isChallengeKind = kind === "challenge_averted" || kind === "challenge_succeeded";
  const isForcedSale = kind === "forced_sale";
  // A hub row's ZCHF is read by its own reader, not as a mint or a repayment.
  const isHubKind = isChallengeKind || isForcedSale;

  // The other positions this transaction updated, and whether each ended empty.
  const others = new Map<string, boolean>();
  for (const l of receipt.logs) {
    if (!isMintingUpdate(l) || eq(l.address, position)) continue;
    const words = (l.data.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt(`0x${w}`));
    others.set(l.address.toLowerCase(), words.length >= 3 && words[0] === ZERO && words[2] === ZERO);
  }

  // The window of logs that belong to this event.
  let windowLogs: Log[] = receipt.logs;
  if (own != null && Number.isFinite(own)) {
    const closing = isHubKind ? isHubClosing : isMintingUpdate;
    const prev = receipt.logs.filter((l) => logIdx(l) < own && closing(l)).map(logIdx);
    const lo = prev.length > 0 ? Math.max(...prev) : -1;
    windowLogs = receipt.logs.filter((l) => logIdx(l) > lo && logIdx(l) <= own);
  }
  const shared = own == null && others.size > 0;

  const logs = decodeZchf(windowLogs);
  const transfers = logs
    .filter((d) => d.name === "Transfer")
    .map((d) => ({
      from: (d.args.from as string).toLowerCase(),
      to: (d.args.to as string).toLowerCase(),
      value: d.args.value as bigint,
      logIndex: d.logIndex,
    }));
  const sum = (pred: (t: Move) => boolean) => sumOf(transfers.filter(pred));

  const mintsOut = transfers.filter((t) => t.from === ZERO_ADDR && t.to !== ZERO_ADDR && t.to !== reserve);
  const mintedOut = sumOf(mintsOut);
  // One recipient, followed one hop where it forwarded the whole amount on.
  let mintedOutTo: string | null = null;
  if (mintsOut.length === 1) {
    const r = mintsOut[0];
    // The onward hop can come after this event's window (a clone helper
    // passes the ZCHF on once the position is set up), so look in the whole
    // receipt, after the mint.
    const onward = transfersOf(receipt.logs, FRANKENCOIN_ADDRESSES.ZCHF).find(
      (t) => t.logIndex > r.logIndex && t.from === r.to && t.value === r.value && t.to !== ZERO_ADDR,
    );
    mintedOutTo = onward ? onward.to : r.to;
  }

  const burns = transfers.filter((t) => t.to === ZERO_ADDR && t.from !== ZERO_ADDR && t.from !== reserve);
  const payers = [...new Set(burns.map((t) => t.from))];
  const burner = payers.length === 1 ? payers[0] : null;
  // A full repayment collects the ZCHF into the position first and burns it
  // there; the payer is then the one account that sent the position ZCHF.
  let payer = burner;
  if (burner != null && eq(burner, position)) {
    const senders = [
      ...new Set(
        transfers.filter((t) => eq(t.to, position) && t.from !== ZERO_ADDR && t.from !== reserve).map((t) => t.from),
      ),
    ];
    payer = senders.length === 1 ? senders[0] : null;
  }

  const profits = logs.filter((d) => d.name === "Profit" && eq(d.args.reportingMinter as string, position));

  const blank = shared;
  const fig = (n: bigint) => (blank ? "" : units(n));

  const blockP = client
    .getBlock({ blockNumber: block })
    .then((b) => Number(b.timestamp))
    .catch(() => null);

  // A mint's terms at that block.
  const minted = !blank && mintedOut > ZERO && !isHubKind;
  const rateP = minted
    ? Promise.all([
        readAt<number>(position, POSITION_READS, "annualInterestPPM", block),
        readAt<bigint>(position, POSITION_READS, "expiration", block),
        readAt<bigint>(position, POSITION_READS, "start", block),
      ]).then(([ppm, exp, start]) =>
        ppm != null && exp != null && start != null
          ? { annualInterestPPM: Number(ppm), expiration: Number(exp), start: Number(start) }
          : null,
      )
    : Promise.resolve(null);

  const challengeP =
    isChallengeKind && own != null ? readChallenge(receipt.logs, windowLogs, transfers, position, block, kind) : null;
  const forcedP = isForcedSale && own != null ? readForcedSale(receipt.logs, position, block) : null;

  const ownerP = kind === "ownership_transferred" && opts.newOwner ? isContract(opts.newOwner) : Promise.resolve(null);

  const rollerP = others.size > 0 ? v2Roller() : Promise.resolve(null);

  const [blockTimestamp, rate, challenge, forced, newOwnerIsContract, roller] = await Promise.all([
    blockP,
    rateP,
    challengeP ?? Promise.resolve(null),
    forcedP ?? Promise.resolve(null),
    ownerP,
    rollerP,
  ]);

  return {
    txHash: hash.toLowerCase(),
    blockNumber: Number(block),
    blockTimestamp,
    sender: receipt.from.toLowerCase(),
    shared,
    otherPositions: [...others].map(([p, emptied]) => ({ position: p, emptied })),
    viaRoller: roller != null && receipt.to != null && eq(receipt.to, roller),
    mintedOut: fig(isHubKind ? ZERO : mintedOut),
    mintedOutTo: blank || isHubKind ? null : mintedOutTo,
    mintedToReserve: fig(isHubKind ? ZERO : sum((t) => t.from === ZERO_ADDR && t.to === reserve)),
    interest:
      blank || isHubKind || profits.length === 0
        ? null
        : units(profits.reduce((s, d) => s + (d.args.amount as bigint), ZERO)),
    burnedFromPayer: fig(isHubKind ? ZERO : sumOf(burns)),
    payer: blank || isHubKind ? null : payer,
    reserveReturned: fig(
      isHubKind ? ZERO : sum((t) => t.from === reserve && t.to !== ZERO_ADDR && (burner == null || t.to === burner)),
    ),
    burnedFromReserve: fig(isHubKind ? ZERO : sum((t) => t.from === reserve && t.to === ZERO_ADDR)),
    rate,
    challenge,
    forced,
    newOwnerIsContract,
  };

  // Hoisted below the return for reading order; a function declaration.
  async function readChallenge(
    all: Log[],
    win: Log[],
    zchf: Move[],
    pos: string,
    blk: bigint,
    k: string,
  ): Promise<FrankencoinAvertRead | FrankencoinSaleRead | null> {
    const hubLog = all.find((l) => logIdx(l) === own);
    if (!hubLog || !eq(hubLog.address, FRANKENCOIN_ADDRESSES.HUB_V2)) return null;
    const words = (hubLog.data.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt(`0x${w}`));
    const number = words[0];
    if (number == null) return null;
    const before = blk - BigInt(1);
    const [collToken, chall, cdata, owner] = await Promise.all([
      readAt<string>(pos, POSITION_READS, "collateral", blk),
      readAt<readonly [string, number, string, bigint]>(hubV2, HUB_V2_READS, "challenges", before, [number]),
      readAt<readonly [bigint, number]>(pos, POSITION_READS, "challengeData", before),
      readAt<string>(pos, POSITION_READS, "owner", blk),
    ]);
    const challengeStart = chall && Number(chall[1]) > 0 ? Number(chall[1]) : null;
    const hubChallenger = chall && !eq(chall[0], ZERO_ADDR) ? chall[0].toLowerCase() : null;
    const liqPriceRaw = cdata ? cdata[0].toString() : null;
    const phase = cdata ? Number(cdata[1]) : null;
    const coll = collToken ? transfersOf(win, collToken) : [];

    if (k === "challenge_averted") {
      const toBuyer = coll.filter((t) => t.from === hubV2);
      const buyer = toBuyer.length === 1 ? toBuyer[0].to : null;
      const paidMoves = buyer
        ? zchf.filter((t) => t.from === buyer && (hubChallenger == null || t.to === hubChallenger))
        : [];
      const recipients = [...new Set(paidMoves.map((t) => t.to))];
      const [cooldown, buyerIsContract] = await Promise.all([
        readAt<bigint>(pos, POSITION_READS, "cooldown", blk),
        isContract(buyer),
      ]);
      return {
        kind: "averted",
        buyer,
        buyerIsContract,
        challenger: hubChallenger ?? (recipients.length === 1 ? recipients[0] : null),
        paid: units(sumOf(paidMoves)),
        boughtRaw: sumOf(toBuyer).toString(),
        owner: owner ? owner.toLowerCase() : null,
        cooldownUntil: cooldown != null ? Number(cooldown) : null,
        liqPriceRaw,
        challengeStart,
        phase,
      };
    }

    // Phase-2 sale.
    const toBidder = coll.filter((t) => eq(t.from, pos));
    const bidder = toBidder.length === 1 ? toBidder[0].to : null;
    // The challenger's collateral comes back from the hub before the sale.
    const returned = coll.filter((t) => t.from === hubV2 && (hubChallenger == null || t.to === hubChallenger));
    let postponed = ZERO;
    for (const l of win) {
      if (!eq(l.address, FRANKENCOIN_ADDRESSES.HUB_V2)) continue;
      try {
        const d = decodeEventLog({ abi: HUB_EVENTS, data: l.data, topics: l.topics });
        const a = d.args as { beneficiary: string; amount: bigint };
        if (hubChallenger == null || eq(a.beneficiary, hubChallenger)) postponed += a.amount;
      } catch {
        // Not a postponed return.
      }
    }
    const challenger = hubChallenger ?? (returned.length === 1 ? returned[0].to : null);
    const intoHub = zchf.filter((t) => t.to === hubV2 && t.from !== ZERO_ADDR && t.from !== reserve);
    const fromHub = zchf.filter((t) => t.from === hubV2);
    const reward = fromHub.filter((t) => challenger != null && t.to === challenger);
    const burned = fromHub.filter((t) => t.to === ZERO_ADDR);
    const toReserve = fromHub.filter((t) => t.to === reserve);
    const ownerOut = fromHub.filter(
      (t) => t.to !== ZERO_ADDR && t.to !== reserve && (challenger == null || t.to !== challenger),
    );
    const lossLogs = logs.filter((d) => d.name === "Loss" && eq(d.args.reportingMinter as string, hubV2));
    const lastBurn = burned.length > 0 ? Math.max(...burned.map((t) => t.logIndex)) : null;
    const release =
      lastBurn != null
        ? logs.find((d) => d.name === "Profit" && d.logIndex > lastBurn && eq(d.args.reportingMinter as string, hubV2))
        : undefined;
    const bidderIsContract = await isContract(bidder);
    return {
      kind: "succeeded",
      bidder,
      bidderIsContract,
      soldRaw: sumOf(toBidder).toString(),
      bid: units(sumOf(bidder ? intoHub.filter((t) => t.from === bidder) : intoHub)),
      challenger,
      reward: units(sumOf(reward)),
      challengerReturnedRaw: (sumOf(returned) + postponed).toString(),
      challengerReturnPostponed: postponed > ZERO,
      debtCleared: units(sumOf(burned)),
      shortfall: units(lossLogs.reduce((s, d) => s + (d.args.amount as bigint), ZERO)),
      shortfallFromReserve: units(sum((t) => t.from === reserve && t.to === hubV2)),
      shortfallMinted: units(sum((t) => t.from === ZERO_ADDR && t.to === hubV2)),
      reserveReleased: release ? units(release.args.amount as bigint) : null,
      owner: owner ? owner.toLowerCase() : null,
      ownerReceived: units(sumOf(ownerOut)),
      excessToReserve: units(sumOf(toReserve)),
      liqPriceRaw,
      challengeStart,
      phase,
    };
  }

  // An expired position's collateral bought through the hub. The ForcedSale
  // log closes the call; before it, PositionV2.forceSale sends the collateral,
  // moves the ZCHF and emits the position's MintingUpdate.
  async function readForcedSale(all: Log[], pos: string, blk: bigint): Promise<FrankencoinForcedSaleRead | null> {
    const hubLog = all.find((l) => logIdx(l) === own);
    if (!hubLog || !eq(hubLog.address, FRANKENCOIN_ADDRESSES.HUB_V2)) return null;
    // ForcedSale(address pos, uint256 amount, uint256 priceE36MinusDecimals), none indexed.
    const words = (hubLog.data.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt(`0x${w}`));
    if (words.length < 3) return null;
    const amount = words[1];
    const priceRaw = words[2];
    const terms = await alchemyClient()
      .multicall({
        contracts: (
          ["price", "expiration", "challengePeriod", "minted", "reserveContribution", "owner", "collateral"] as const
        ).map((functionName) => ({ address: getAddress(pos), abi: POSITION_V2_TERMS, functionName })),
        blockNumber: blk - BigInt(1),
        allowFailure: true,
      })
      .catch(() => null);
    const at = <T>(i: number): T | null => (terms && terms[i]?.status === "success" ? (terms[i].result as T) : null);
    const liq = at<bigint>(0);
    const expiration = at<number>(1);
    const period = at<number>(2);
    const mintedBefore = at<bigint>(3);
    const ppm = at<number>(4);
    const ownerAddr = at<string>(5)?.toLowerCase() ?? null;
    const collToken = at<string>(6);

    // The call's own logs: from the position's collateral transfer to the
    // ForcedSale log; with nothing sold, the ZCHF and position logs that sit
    // right before it.
    const earlier = all.filter((l) => logIdx(l) < (own as number)).sort((a, b) => logIdx(a) - logIdx(b));
    const collOut = collToken ? transfersOf(earlier, collToken).filter((t) => eq(t.from, pos)) : [];
    let lo: number;
    if (collOut.length > 0) lo = collOut[collOut.length - 1].logIndex - 1;
    else {
      let i = earlier.length - 1;
      while (i >= 0 && (eq(earlier[i].address, FRANKENCOIN_ADDRESSES.ZCHF) || eq(earlier[i].address, pos))) i--;
      lo = i >= 0 ? logIdx(earlier[i]) : -1;
    }
    const win = all.filter((l) => logIdx(l) > lo && logIdx(l) <= (own as number));
    const coll = collToken ? transfersOf(win, collToken).filter((t) => eq(t.from, pos)) : [];
    const zl = decodeZchf(win);
    const moves = transfersOf(win, FRANKENCOIN_ADDRESSES.ZCHF);
    const p = pos.toLowerCase();
    let buyer = coll.length === 1 ? coll[0].to : null;
    if (buyer == null) {
      const paidOwner = ownerAddr ? moves.filter((t) => t.to === ownerAddr && t.from !== reserve) : [];
      buyer = paidOwner.length === 1 ? paidOwner[0].from : receipt.from.toLowerCase();
    }
    const b = buyer;
    const total = (pred: (t: Move) => boolean) => sumOf(moves.filter(pred));
    const reserveToBuyer = total((t) => t.from === reserve && t.to === b);
    const burnBuyer = total((t) => t.from === b && t.to === ZERO_ADDR);
    const ownerReceived = ownerAddr ? total((t) => t.from === b && t.to === ownerAddr) : ZERO;
    const toPosition = total((t) => t.from === b && t.to === p);
    const reserveToPos = total((t) => t.from === reserve && t.to === p);
    const mintToPos = total((t) => t.from === ZERO_ADDR && t.to === p);
    const burnPos = total((t) => t.from === p && t.to === ZERO_ADDR);
    const loss = zl
      .filter((d) => d.name === "Loss" && eq(d.args.reportingMinter as string, p))
      .reduce((s, d) => s + (d.args.amount as bigint), ZERO);
    const lastBurn = moves.filter((t) => t.from === p && t.to === ZERO_ADDR).map((t) => t.logIndex);
    const release =
      lastBurn.length > 0
        ? zl.find(
            (d) => d.name === "Profit" && d.logIndex > Math.max(...lastBurn) && eq(d.args.reportingMinter as string, p),
          )
        : undefined;
    const branch: FrankencoinForcedSaleRead["branch"] =
      loss > ZERO
        ? "shortfall"
        : toPosition > ZERO || burnPos > ZERO
          ? "partial"
          : burnBuyer > ZERO
            ? "full"
            : "noDebt";
    const buyerIsContract = await isContract(buyer);
    return {
      kind: "forced",
      buyer,
      buyerIsContract,
      owner: ownerAddr,
      soldRaw: amount.toString(),
      priceRaw: priceRaw.toString(),
      cost: units((priceRaw * amount) / BigInt("1000000000000000000")),
      branch,
      debtCleared: units(branch === "full" ? burnBuyer : burnPos),
      reserveToBuyer: units(reserveToBuyer),
      ownerReceived: units(ownerReceived),
      toPosition: units(toPosition),
      reserveFreed: units(branch === "partial" ? reserveToPos : ZERO),
      loss: units(loss),
      lossFromReserve: units(branch === "shortfall" ? reserveToPos : ZERO),
      lossMinted: units(mintToPos),
      reserveReleased: release ? units(release.args.amount as bigint) : null,
      liqPriceRaw: liq != null ? liq.toString() : null,
      expiration: expiration != null ? Number(expiration) : null,
      challengePeriod: period != null ? Number(period) : null,
      mintedBefore: mintedBefore != null ? units(mintedBefore) : null,
      reservePPM: ppm != null ? Number(ppm) : null,
    };
  }
}
