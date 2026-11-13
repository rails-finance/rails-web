// Receipts for the reserve page's indexed reads (anatomy M3.4, M3.7, M3.8,
// M3.9; ui-jobs 541): a day-close rate and utilisation from rails-server's
// reserve-history, a holder's amount from reserve-holders, and the deficit's
// write-offs from reserve-deficit. Each names the
// route, its source and the rule the figure follows, so a reader can rebuild
// it: the history's `source`, `dayClose` and `identity` are the route's own
// sentences, quoted.

import { APY_FORMULA } from "@/lib/aave-family/apy";
import { powerOfTen, type Provenance } from "@/components/shared/provenance";
import type {
  DeficitCover,
  DeficitCovers,
  HistoryPoint,
  ReserveDeficit,
  ReserveHistory,
  ReserveHolders,
  WriteOff,
} from "@/lib/api/fetch-aave-reserve-reads";
import { DEFICIT_SOURCES, type DeficitSourceKey } from "@/lib/aave-family/deficit-sources";

const HISTORY_ROUTE = "GET /api/aave-family/reserve-history";
const HOLDERS_ROUTE = "GET /api/aave-family/reserve-holders";
const block = (n: number) => n.toLocaleString("en-US");

/** The reserve factor the point's utilisation divides by, and where it came from. */
function rfNote(p: HistoryPoint, h: ReserveHistory): string {
  const rf = p.rf;
  if (!rf || rf.bps == null) return "not held at this log";
  const at = `${(rf.bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  if ("before" in rf && rf.basis === "snapshots")
    return `${at}, the configuration words at blocks ${block(rf.before)} and ${block(rf.after)} agreeing`;
  return `${at}, from ${h.reserveFactor.source}`;
}

/** A day's closing supply or borrow rate. */
export function historyRateProv(
  side: "supply" | "borrow",
  symbol: string,
  p: HistoryPoint,
  h: ReserveHistory,
  /** "apy" where the family states the rate compounded (SparkLend). */
  form: "apr" | "apy" = "apr",
): Provenance {
  const field = side === "supply" ? "liquidityRate" : "variableBorrowRate";
  if (form === "apy")
    return {
      kind: "chain-derived",
      pclass: "emitted",
      source: { block: p.log.block, txHash: p.log.txHash },
      summary: `${symbol} ${side} APY at the ${p.date} close — ReserveDataUpdated's ${field} from ${h.source}, a rate a year in rays (${powerOfTen(27)} = 100%), compounded every second over a 365-day year. ${h.dayClose} That day closes at block ${block(p.closeBlock)}; the log in force is at block ${block(p.log.block)}.`,
      via: `${HISTORY_ROUTE} · ReserveDataUpdated.${field} ÷ ${powerOfTen(27)}, compounded`,
      formula: APY_FORMULA,
      inputs: [
        {
          label: field,
          value: p[field],
          kind: "chain",
          pclass: "emitted",
          note: `ray, ${powerOfTen(27)} = 100% a year`,
        },
        { label: "seconds a year", value: "31,536,000", kind: "chain-derived", definition: true, note: "365 days" },
      ],
    };
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: p.log.block, txHash: p.log.txHash },
    summary: `${symbol} ${side} rate at the ${p.date} close — ReserveDataUpdated's ${field} from ${h.source}. ${h.dayClose} That day closes at block ${block(p.closeBlock)}; the log in force is at block ${block(p.log.block)}.`,
    via: `${HISTORY_ROUTE} · ReserveDataUpdated.${field}`,
    scaling: {
      raw: p[field],
      from: "log",
      places: 25,
      why: `the Pool states a rate in rays, ${powerOfTen(27)} standing for 100% a year`,
      unit: "%",
    },
  };
}

/** A day's utilisation from the rate identity. */
export function historyUtilisationProv(symbol: string, p: HistoryPoint, h: ReserveHistory): Provenance {
  return {
    kind: "chain-derived",
    pclass: "emitted",
    source: { block: p.log.block, txHash: p.log.txHash },
    summary: `${symbol} utilisation at the ${p.date} close — from the rates of the log in force at block ${block(p.log.block)} and the reserve factor. ${h.identity}`,
    via: `${HISTORY_ROUTE} · liquidityRate ÷ (variableBorrowRate × (1 − reserve factor))`,
    formula: "liquidityRate ÷ (variableBorrowRate × (1 − reserve factor))",
    inputs: [
      { label: "liquidityRate", value: p.liquidityRate, kind: "chain", pclass: "emitted", note: "ReserveDataUpdated" },
      {
        label: "variableBorrowRate",
        value: p.variableBorrowRate,
        kind: "chain",
        pclass: "emitted",
        note: "ReserveDataUpdated",
      },
      { label: "reserve factor", kind: "chain", pclass: "state", note: rfNote(p, h) },
    ],
  };
}

/** One holder's amount in the reserve. */
export function holderAmountProv(
  side: "supplied" | "borrowed",
  symbol: string,
  decimals: number,
  wallet: string,
  amount: string,
  h: ReserveHolders,
): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `${symbol} ${side} by ${wallet.slice(0, 6)}…${wallet.slice(-4)} — read from ${h.source}, ${h.units}. The view was last refreshed at ${h.refreshedAt ?? "an unknown time"}.`,
    via: `${HOLDERS_ROUTE} · ${h.source}`,
    formula: `amount ÷ ${powerOfTen(decimals)}`,
    inputs: [{ label: "amount", value: amount, kind: "derived", pclass: "indexed", note: "the token's smallest unit" }],
  };
}

/** A holder's share of the reserve's side (M3.7, M3.8): the ranked amount over
 *  the side's total from the page's head read. The two are read at different
 *  times, so a share is as of the ranking's refresh. */
export function holderShareProv(o: {
  symbol: string;
  side: "supplied" | "borrowed";
  wallet: string;
  amount: number;
  total: number;
  /** The total's name, as the receipt states it: "the aToken's totalSupply()". */
  totalWhat: string;
}): Provenance {
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return {
    kind: "derived",
    summary: `${o.wallet.slice(0, 6)}…${o.wallet.slice(-4)}'s ${o.symbol} ${o.side}, over every ${o.symbol} ${o.side} on the reserve (${o.totalWhat}). The amount is from the ranking's last refresh and the total from the page's read, so the share is as close as the two reads are in time.`,
    formula: `amount ÷ total ${o.side}`,
    inputs: [
      { label: "amount", value: `${n(o.amount)} ${o.symbol}`, kind: "derived", pclass: "indexed" },
      { label: `total ${o.side}`, value: `${n(o.total)} ${o.symbol}`, kind: "chain", note: o.totalWhat },
    ],
  };
}

const CONFIG_ROUTE = "GET /api/aave-family/reserve-config-log";

/** One configuration change: its block and transaction, which the change
 *  log's surface leaves to this receipt (decision 0059 point 1). */
export function configChangeProv(
  row: { kind: string; block: number; txHash: string; logIndex: number },
  words: string,
  configurator: string,
  explorer: { block: string; tx: string; name: string },
): Provenance {
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: row.block, txHash: row.txHash },
    summary: `${words}. The PoolConfigurator's ${row.kind} event at block ${block(row.block)}, log ${row.logIndex} of transaction ${row.txHash}.`,
    contract: { name: "PoolConfigurator", address: configurator },
    via: `${CONFIG_ROUTE} · the configurator's events for this reserve`,
    verify: { kind: "etherscan", href: explorer.tx, text: `The transaction on ${explorer.name}` },
    inputs: [
      {
        label: "block",
        value: block(row.block),
        kind: "chain",
        pclass: "emitted",
        verify: { kind: "etherscan", href: explorer.block, text: `Block ${block(row.block)} on ${explorer.name}` },
      },
    ],
  };
}

const DEFICIT_ROUTE = "GET /api/aave/reserve-deficit";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Where a reader checks a log: the transaction on the chain's explorer. */
export interface TxExplorer {
  tx: (hash: string) => string;
  name: string;
}

/** A source leaf: one line of Aave's code or docs, linked. */
const sourceLeaf = (k: DeficitSourceKey, note: string) => ({
  label: DEFICIT_SOURCES[k].label,
  kind: "offchain" as const,
  pclass: "offchain" as const,
  note,
  verify: { kind: "link" as const, href: DEFICIT_SOURCES[k].url, text: DEFICIT_SOURCES[k].label },
});

/** A raw amount's scaling, where the token's decimals are known. */
const scaled = (raw: string, decimals: number | null, field: string) =>
  decimals == null
    ? undefined
    : {
        raw,
        places: decimals,
        why: `${field} is in the token's smallest unit, ${powerOfTen(decimals)} to one token`,
      };

/** One write-off: its DeficitCreated, and the LiquidationCall it pairs with. */
export function writeOffProv(row: WriteOff, symbol: string, d: ReserveDeficit, ex: TxExplorer): Provenance {
  const liq = row.liquidation;
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: row.block, txHash: row.txHash },
    summary: `${symbol} written off for ${short(row.user)} — the Pool's DeficitCreated at block ${block(row.block)}, log ${row.logIndex} of transaction ${row.txHash}, emitted by the Pool ${row.pool}. ${
      liq
        ? `It pairs with the LiquidationCall for the same borrower in that transaction, log ${liq.logIndex}, by liquidator ${liq.liquidator}; the transaction was sent by ${liq.txFrom}.`
        : "No LiquidationCall for the same borrower is held in that transaction."
    }`,
    contract: { name: "Pool", address: row.pool },
    via: `${DEFICIT_ROUTE} · DeficitCreated.amountCreated · ${d.source}`,
    verify: { kind: "etherscan", href: ex.tx(row.txHash), text: `The transaction on ${ex.name}` },
    scaling: scaled(row.writtenOff.raw, row.writtenOff.decimals, "amountCreated"),
    inputs: [
      { label: "block", value: block(row.block), kind: "chain", pclass: "emitted" },
      {
        label: "DeficitCreated log",
        value: String(row.logIndex),
        kind: "chain",
        pclass: "emitted",
        note: "index within the transaction",
      },
      ...(liq
        ? [
            {
              label: "LiquidationCall log",
              value: String(liq.logIndex),
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: "index within the transaction",
            },
          ]
        : []),
    ],
  };
}

/** A paired liquidation's collateral seized, or the debt the liquidator repaid. */
export function liquidationLegProv(leg: "seized" | "repaid", row: WriteOff, ex: TxExplorer): Provenance | null {
  const liq = row.liquidation;
  if (!liq) return null;
  const t = leg === "seized" ? liq.collateral : liq.debtAsset;
  const raw = leg === "seized" ? liq.collateralSeized : liq.debtRepaid;
  const field = leg === "seized" ? "liquidatedCollateralAmount" : "debtToCover";
  const sym = t.symbol ?? short(t.address);
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: row.block, txHash: row.txHash },
    summary:
      leg === "seized"
        ? `${sym} seized from ${short(row.user)} — LiquidationCall's ${field} at block ${block(row.block)}, log ${liq.logIndex} of transaction ${row.txHash}: the collateral liquidator ${liq.liquidator} took.`
        : `${sym} repaid by the liquidator — LiquidationCall's ${field} at block ${block(row.block)}, log ${liq.logIndex} of transaction ${row.txHash}: the debt liquidator ${liq.liquidator} paid for ${short(row.user)}.`,
    contract: { name: "Pool", address: row.pool },
    via: `${DEFICIT_ROUTE} · LiquidationCall.${field}`,
    verify: { kind: "etherscan", href: ex.tx(row.txHash), text: `The transaction on ${ex.name}` },
    scaling: scaled(raw, t.decimals, field),
  };
}

/** Σ written off over a set of write-offs: the route's total, or the rows under the top ten. */
export function writtenOffSumProv(
  symbol: string,
  d: ReserveDeficit,
  part: { raw: string; count: number; label: "all" | "smaller" },
): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary:
      part.label === "all"
        ? `${symbol} written off — the sum of the ${part.count.toLocaleString("en-US")} DeficitCreated logs the Pool ${d.pool} has emitted for ${symbol} from block ${block(d.wholeFrom)}, read from ${d.source}.`
        : `${symbol} in the smaller write-offs — the sum of the ${part.count.toLocaleString("en-US")} DeficitCreated logs below the ten largest, read from ${d.source}.`,
    contract: { name: "Pool", address: d.pool },
    via: `${DEFICIT_ROUTE} · Σ DeficitCreated.amountCreated`,
    formula: "Σ amountCreated",
    inputs: [
      {
        label: "amountCreated, summed",
        value: part.raw,
        kind: "chain",
        pclass: "emitted",
        note: `${part.count.toLocaleString("en-US")} DeficitCreated logs, in the token's smallest unit`,
      },
    ],
  };
}

/** Covered: written off less outstanding, derived until the cover events are indexed. */
export function deficitCoveredProv(
  symbol: string,
  d: ReserveDeficit,
  outstanding: { raw: string | null; block: number | null },
  coveredRaw: string | null,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    source: outstanding.block != null ? { block: outstanding.block } : undefined,
    summary: `${symbol} covered, derived — Σ written off less the outstanding deficit. The deficit earns no interest: it is a count of underlying tokens (DataTypes.sol L54-55), raised only by a write-off (LiquidationLogic.sol L536-540) and lowered only by a cover (LiquidationLogic.sol L76-129). So the deficit now equals Σ created less Σ covered, and Σ covered is Σ created less the deficit now. Rails derives it this way until it indexes the Pool's DeficitCovered logs.`,
    contract: { name: "Pool", address: d.pool },
    via: `${DEFICIT_ROUTE} Σ amountCreated − Pool.getReserveDeficit(asset)${outstanding.block != null ? ` @ ${block(outstanding.block)}` : " @ head"}`,
    formula: "Σ written off − outstanding",
    inputs: [
      ...(coveredRaw != null
        ? [{ label: "covered, raw", value: coveredRaw, kind: "chain-derived" as const, pclass: "indexed" as const }]
        : []),
      {
        label: "Σ written off",
        value: d.totals.writtenOff,
        kind: "derived",
        pclass: "indexed",
        note: "Σ DeficitCreated.amountCreated, raw",
      },
      {
        label: "outstanding",
        value: outstanding.raw ?? undefined,
        kind: "chain",
        pclass: "state",
        note: `Pool.getReserveDeficit(asset)${outstanding.block != null ? ` at block ${block(outstanding.block)}` : ""}, raw`,
      },
      sourceLeaf("O7", "the deficit: a uint128 in underlying tokens"),
      sourceLeaf("O3", "the write-off: deficit += outstandingDebt"),
      sourceLeaf("O5", "the cover: deficit -= balanceWriteOff"),
    ],
  };
}

type HeldCovers = Extract<DeficitCovers, { status: "held" }>;

/** How each Umbrella cover event was paid, in plain words, and the sources that say so. */
export const PAID_BY: Record<
  DeficitCover["umbrella"] extends infer U ? (U extends { event: infer E } ? E & string : never) : never,
  { words: string; sources: DeficitSourceKey[]; tail: string | null }
> = {
  DeficitOffsetCovered: {
    words: "The Aave DAO, within the deficit offset",
    sources: ["U2", "D3"],
    tail: "within the deficit offset",
  },
  // Stakers' slashed funds pay a pending deficit whoever moves them, so the payer's name does not replace these words.
  PendingDeficitCovered: {
    words: "Umbrella stakers, from a slash of their stake",
    sources: ["U3", "U2", "D3"],
    tail: null,
  },
  ReserveDeficitCovered: {
    words: "Aave's coverage manager, with no Umbrella stake set up",
    sources: ["U2", "U1"],
    tail: "with no Umbrella stake set up",
  },
};

/** The Aave addresses a cover's payer is named by on the face, Ethereum only, from Aave's address book. */
export const KNOWN_PAYERS: Record<string, { name: string; source: DeficitSourceKey }> = {
  "0x5300a1a15135ea4dc7ad5a167152c01efc9b192a": { name: "Aave governance's executor", source: "A1" },
  "0x6c1dc85f2ae71c3dacd6e44bb57deef61b540a5a": { name: "Aave's deficit offset clinic steward", source: "A2" },
};

const knownPayer = (row: DeficitCover, chainId: number) =>
  chainId === 1 && row.paidBy ? (KNOWN_PAYERS[row.paidBy.toLowerCase()] ?? null) : null;

/** "Paid by" in words: the payer where it is a known Aave address and the event allows it, else the event's words. */
export function paidByWords(row: DeficitCover, chainId: number): string | null {
  if (!row.umbrella) return null;
  const e = PAID_BY[row.umbrella.event];
  const who = knownPayer(row, chainId);
  return who && e.tail ? `${who.name}, ${e.tail}` : e.words;
}

/** Who holds Umbrella's coverage manager role on Ethereum: every RoleGranted and RoleRevoked for
 *  COVERAGE_MANAGER_ROLE the Umbrella has emitted (none revoked), and hasRole true for each at `atBlock`.
 *  The role is granted by governance and seldom changes, so it is read once and kept here with its block. */
export const COVERAGE_MANAGERS = {
  umbrella: "0xd400fc38ed4732893174325693a63c30ee3881a8",
  role: "0x7022b05f273dfb770d16ebe344b0b38e1ef7bac12120a5cebc324be6acf18fe1",
  atBlock: 26_379_534,
  holders: [
    {
      address: "0x5300A1a15135EA4dc7aD5a167152C01EFc9b192A",
      name: "Aave governance's level 1 executor",
      granted: { block: 22_481_753, txHash: "0xea2e42074f0175aea982f1743e39ea6c59f919a5cf96585bc3ccbe8b4b14a820" },
      source: "A1" as DeficitSourceKey,
    },
    {
      address: "0x6c1DC85f2aE71C3DAcd6E44Bb57DEeF61b540a5A",
      name: "Aave's deficit offset clinic steward",
      granted: { block: 22_638_170, txHash: "0xaa900e1ac9ece8a1a0db38c111ccfe5b5fb735a838278995a7e6534a8fc32a63" },
      source: "A2" as DeficitSourceKey,
    },
  ],
};

/** The coverage manager role's holders, as receipt lines, where the cover went through Ethereum's Umbrella. */
function coverageManagerInputs(umbrella: string | null): NonNullable<Provenance["inputs"]> {
  const m = COVERAGE_MANAGERS;
  if (umbrella?.toLowerCase() !== m.umbrella) return [];
  return [
    ...m.holders.map((h) => ({
      label: "coverage manager",
      value: h.address,
      kind: "chain" as const,
      pclass: "state" as const,
      note: `${h.name}: granted COVERAGE_MANAGER_ROLE (${m.role}) at block ${block(h.granted.block)}, tx ${h.granted.txHash}; Umbrella.hasRole true at block ${block(m.atBlock)}`,
    })),
    sourceLeaf("U4", "the role: plain AccessControl, holders read from RoleGranted and RoleRevoked"),
    sourceLeaf("U5", "the super admin holds it from initialisation"),
    ...m.holders.map((h) => sourceLeaf(h.source, `Aave's address book names ${h.address}`)),
  ];
}

/** One cover: its DeficitCovered and the Umbrella event beside it. */
export function coverProv(
  row: DeficitCover,
  symbol: string,
  d: ReserveDeficit,
  c: HeldCovers,
  ex: TxExplorer,
): Provenance {
  const u = row.umbrella;
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: row.block, txHash: row.txHash },
    summary: `${symbol} covered — the Pool's DeficitCovered at block ${block(row.block)}, log ${row.logIndex} of transaction ${row.txHash}, emitted by the Pool ${d.pool}; its caller is ${row.caller}${c.umbrella && row.caller === c.umbrella ? " (Aave's Umbrella)" : ""}, and the transaction was sent by ${row.txFrom}. ${
      u
        ? `Umbrella's ${u.event}, log ${u.logIndex} of the same transaction, says how it was paid: ${PAID_BY[u.event].words.toLowerCase()}.${
            u.event === "ReserveDeficitCovered" && c.umbrella?.toLowerCase() === COVERAGE_MANAGERS.umbrella
              ? ` At block ${block(COVERAGE_MANAGERS.atBlock)} the coverage manager role is held by ${COVERAGE_MANAGERS.holders.map((h) => `${h.name} (${h.address})`).join(" and ")}.`
              : ""
          }`
        : "No Umbrella cover event is paired with it in that transaction."
    }${
      row.paidBy
        ? ` The ${symbol} aTokens that paid it went to the caller from ${row.paidBy}${knownPayer(row, d.chainId) ? `, ${knownPayer(row, d.chainId)!.name} in Aave's address book` : ""}.`
        : ""
    }`,
    contract: { name: "Pool", address: d.pool },
    via: `${DEFICIT_ROUTE} · DeficitCovered.amountCovered · ${c.source}`,
    verify: { kind: "etherscan", href: ex.tx(row.txHash), text: `The transaction on ${ex.name}` },
    scaling: scaled(row.amount.raw, row.amount.decimals, "amountCovered"),
    inputs: [
      { label: "block", value: block(row.block), kind: "chain", pclass: "emitted" },
      {
        label: "DeficitCovered log",
        value: String(row.logIndex),
        kind: "chain",
        pclass: "emitted",
        note: "index within the transaction",
      },
      ...(u
        ? [
            {
              label: `${u.event} log`,
              value: String(u.logIndex),
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: `emitted by the Umbrella ${c.umbrella}`,
            },
            ...PAID_BY[u.event].sources.map((k) => sourceLeaf(k, "who pays, in Aave's source")),
            ...(u.event === "ReserveDeficitCovered" ? coverageManagerInputs(c.umbrella) : []),
          ]
        : []),
      ...(row.paidBy
        ? [
            {
              label: "paid by",
              value: row.paidBy,
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: `the aToken BalanceTransfer to ${row.caller} in transaction ${row.txHash}${knownPayer(row, d.chainId) ? `: ${knownPayer(row, d.chainId)!.name}` : ""}`,
            },
            sourceLeaf("U1", "Umbrella pulls the aTokens from its caller"),
            ...(knownPayer(row, d.chainId)
              ? [sourceLeaf(knownPayer(row, d.chainId)!.source, `Aave's address book names ${row.paidBy}`)]
              : []),
          ]
        : []),
      sourceLeaf("O5", "the cover: deficit -= balanceWriteOff"),
      sourceLeaf("O6", "only the Umbrella can cover"),
    ],
  };
}

/** Write-offs from liquidations Aave governance carried out, by transaction (Ethereum). Read on chain at
 *  block 26,379,674: Governance.getProposal(478) is Executed and lists Ethereum payloads 431 and 432;
 *  PayloadsController.getPayloadById gives each its one action and its execution in this transaction. */
export const GOVERNANCE_LIQUIDATIONS: Record<
  string,
  {
    proposal: number;
    readAt: number;
    governance: string;
    payloadsController: string;
    payloads: { id: number; target: string; user: string }[];
    executor: string;
    sources: DeficitSourceKey[];
  }
> = {
  "0xe2391ea418e16d70196ca3d77dfc836cca1096eebf65e423d52ad867b416478f": {
    proposal: 478,
    readAt: 26_379_674,
    governance: "0x9AEE0B04504CeF83A65AC3f0e838D0593BCb2BC7",
    payloadsController: "0xdAbad81aF85554E9ae636395611C58F7eC1aAEc5",
    payloads: [
      {
        id: 431,
        target: "0x0cD3138eFF780D1e6e6c2e3CD72405246861053c",
        user: "0x1f4c1c2e610f089d6914c4448e6f21cb0db3adef",
      },
      {
        id: 432,
        target: "0x43EE256b82AC62A6B6b94Ae56dADF2c21cBCA12e",
        user: "0x8d11aeac74267dd5c56d371bf4ae1afa174c2d49",
      },
    ],
    executor: "0x5300A1a15135EA4dc7aD5a167152C01EFc9b192A",
    sources: ["P1", "P2", "P3", "P4", "A1"],
  },
};

const GOVERNANCE_SOURCE_NOTES: Partial<Record<DeficitSourceKey, string>> = {
  P1: "the proposal: liquidate the rsETH attacker's positions on Ethereum Core and Arbitrum",
  P2: "the two Ethereum Core positions it liquidates",
  P3: "the deficit offset raised first; Umbrella's admin role to the Recovery Guardian after",
  P4: "the proposal on Aave's governance site",
  A1: "Aave governance's level 1 executor, the liquidator",
};

/** The receipt for the line naming a governance proposal behind a reserve's write-offs. */
export function governanceLiquidationProv(
  symbol: string,
  d: ReserveDeficit,
  txHash: string,
  ex: TxExplorer,
): Provenance | null {
  const g = GOVERNANCE_LIQUIDATIONS[txHash.toLowerCase()];
  if (!g || d.chainId !== 1) return null;
  const rows = d.rows.filter((w) => w.txHash.toLowerCase() === txHash.toLowerCase());
  return {
    kind: "chain",
    pclass: "state",
    source: { block: rows[0]?.block ?? g.readAt, txHash },
    summary: `${symbol} written off in transaction ${txHash}: Aave governance's proposal ${g.proposal} executed Ethereum payloads ${g.payloads.map((p) => p.id).join(" and ")} there, each liquidating one position through Aave governance's level 1 executor ${g.executor}. Before the liquidations the payload raised Umbrella's deficit offset for WETH by the positions' WETH debt, and after them it granted Umbrella's admin role to the Recovery Guardian multisig named in the proposal. Governance.getProposal(${g.proposal}) and PayloadsController.getPayloadById read at block ${block(g.readAt)}.`,
    contract: { name: "Governance", address: g.governance },
    via: `Governance.getProposal(${g.proposal}).payloads · PayloadsController.getPayloadById @ ${block(g.readAt)}`,
    verify: { kind: "etherscan", href: ex.tx(txHash), text: `The transaction on ${ex.name}` },
    inputs: [
      ...g.payloads.map((p) => ({
        label: `payload ${p.id}`,
        value: p.target,
        kind: "chain" as const,
        pclass: "state" as const,
        note: `liquidates ${p.user}; executed in this transaction`,
        contract: { name: "PayloadsController", address: g.payloadsController },
      })),
      ...rows.map((w) => ({
        label: "write-off",
        value: w.writtenOff.raw,
        kind: "chain" as const,
        pclass: "emitted" as const,
        note: `DeficitCreated for ${w.user}, log ${w.logIndex} of the transaction`,
      })),
      ...g.sources.map((k) => sourceLeaf(k, GOVERNANCE_SOURCE_NOTES[k] ?? "Aave's source")),
    ],
  };
}

/** Σ covered: the sum of the Pool's DeficitCovered logs for the asset. */
export function coveredSumProv(symbol: string, d: ReserveDeficit, c: HeldCovers): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `${symbol} covered — the sum of the ${c.totals.count.toLocaleString("en-US")} DeficitCovered logs the Pool ${d.pool} has emitted for ${symbol} from block ${block(c.wholeFrom)} to block ${block(c.toBlock)}, read from ${c.source}.`,
    contract: { name: "Pool", address: d.pool },
    via: `${DEFICIT_ROUTE} · Σ DeficitCovered.amountCovered`,
    formula: "Σ amountCovered",
    inputs: [
      {
        label: "amountCovered, summed",
        value: c.totals.covered,
        kind: "chain",
        pclass: "emitted",
        note: `${c.totals.count.toLocaleString("en-US")} DeficitCovered logs, in the token's smallest unit`,
      },
      sourceLeaf("O4", "DeficitCovered"),
    ],
  };
}

/** The record's check: Σ written off − Σ covered against the Pool's getter. */
export function deficitIdentityProv(
  symbol: string,
  d: ReserveDeficit,
  identity: NonNullable<ReserveDeficit["identity"]>,
  outstanding: { raw: string | null; block: number | null },
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "indexed",
    source: outstanding.block != null ? { block: outstanding.block } : undefined,
    summary: `${symbol} outstanding by the record — Σ written off less Σ covered, through block ${block(identity.atBlock)}. A reserve's deficit is raised only by a write-off and lowered only by a cover, and earns no interest, so when Rails holds every one of both logs this equals Pool.getReserveDeficit.`,
    contract: { name: "Pool", address: d.pool },
    via: `${DEFICIT_ROUTE} identity · Σ amountCreated − Σ amountCovered`,
    formula: "Σ written off − Σ covered = getReserveDeficit",
    inputs: [
      {
        label: "Σ written off",
        value: identity.writtenOff,
        kind: "derived",
        pclass: "indexed",
        note: "Σ DeficitCreated.amountCreated, raw",
      },
      {
        label: "Σ covered",
        value: identity.covered,
        kind: "derived",
        pclass: "indexed",
        note: "Σ DeficitCovered.amountCovered, raw",
      },
      {
        label: "by the record",
        value: identity.outstanding,
        kind: "derived",
        pclass: "indexed",
        note: `raw, through block ${block(identity.atBlock)}`,
      },
      {
        label: "outstanding",
        value: outstanding.raw ?? undefined,
        kind: "chain",
        pclass: "state",
        note: `Pool.getReserveDeficit(asset)${outstanding.block != null ? ` at block ${block(outstanding.block)}` : ""}, raw`,
      },
      sourceLeaf("O7", "the deficit: a uint128 in underlying tokens"),
      sourceLeaf("O3", "the write-off: deficit += outstandingDebt"),
      sourceLeaf("O5", "the cover: deficit -= balanceWriteOff"),
    ],
  };
}

/** The outstanding deficit after one step of the chart: the running sum of write-offs less covers. */
export function deficitStepProv(
  symbol: string,
  d: ReserveDeficit,
  step: { block: number; txHash: string; raw: string; runningRaw: string; kind: "write-off" | "cover" },
  ex: TxExplorer,
): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    source: { block: step.block, txHash: step.txHash },
    summary: `${symbol} outstanding after block ${block(step.block)} — every DeficitCreated for ${symbol} on the Pool ${d.pool} to that block, less every DeficitCovered; this step is a ${step.kind === "write-off" ? "write-off (DeficitCreated)" : "cover (DeficitCovered)"} in transaction ${step.txHash}.`,
    contract: { name: "Pool", address: d.pool },
    via: `${DEFICIT_ROUTE} · running Σ amountCreated − Σ amountCovered`,
    verify: { kind: "etherscan", href: ex.tx(step.txHash), text: `The step's transaction on ${ex.name}` },
    formula: "Σ written off − Σ covered, to the block",
    inputs: [
      {
        label: step.kind === "write-off" ? "amountCreated" : "amountCovered",
        value: step.raw,
        kind: "chain",
        pclass: "emitted",
        note: "this step, raw",
      },
      { label: "outstanding after", value: step.runningRaw, kind: "derived", pclass: "indexed", note: "raw" },
    ],
  };
}
