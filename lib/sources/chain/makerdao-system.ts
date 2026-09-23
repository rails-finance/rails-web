// Live MakerDAO SYSTEM state — the protocol-level companion to
// makerdao-position.ts. Where the position lane answers "where does THIS vault
// stand", this answers what only the whole Vat can: how much DAI exists, what
// mints it, and on what terms.
//
// MakerDAO is NOT the Aave shape, and NOT the Liquity shape. Both molds break on
// contact, and the differences are the point of this view:
//
//   • NO UTILISATION. Aave's market roster turns on "utilisation drives the
//     rate": depositors supply, borrowers draw, the curve prices the gap. Maker
//     has no depositors — DAI is MINTED against collateral. Jug.base is 0 and
//     each ilk's `duty` is set by governance, so nothing about the rate responds
//     to how much is drawn. Worse, `debt ÷ line` is a TAUTOLOGY wherever the
//     DssAutoLine runs: it maintains line = debt + gap, so the ratio just
//     restates the gap (ALLOCATOR-OBEX-A: 612.32M debt, 50M gap, 662.32M line —
//     "92.5% utilised" is arithmetic, not a signal). That is why this file
//     reports a ceiling STATE and a headroom, and never a utilisation.
//
//   • NO RATE QUEUE. Liquity V2 orders redemptions by the rate each borrower
//     chose. Maker has no redemptions at all, and `duty` is one number per ilk
//     that every vault in it pays — no borrower chooses anything, so there is
//     nothing to order.
//
//   • ILKS ARE NOT PEERS. The Liquity forks' branches compete for the same
//     borrower. Maker's ilks do not: ~94% of the debt is minted by modules no
//     user can open a vault in (the PSM, the Allocators), which is the whole
//     reason the explorer's roster is ~1.6k vaults against a $12bn system.
//
// The spine is the Vat's OWN identity, and this file asserts it live:
//
//     Vat.debt == Σ (ilk.Art × ilk.rate) + Vat.vice
//
// exact to the last rad. `residualRad` is that check, computed in BigInt and
// reported rather than swallowed — see UNLISTED_ILKS in the asset catalog for
// why it is non-zero the moment you trust IlkRegistry.list() as a complete
// roster (it isn't: SAI, RWA012-A and RWA013-A hold a wei of art each and are
// delisted from it). A non-zero residual on the page means the read no longer
// accounts for every DAI in existence, which is exactly what a reader deserves
// to know before believing the decomposition beneath it.
//
// One read at one head block, batched by call type (one multicall per contract
// rather than per ilk — 38 ilks × 5 reads sequentially would be 190 round trips
// and Alchemy 429s well before that).
//
// SERVER-ONLY (reads ALCHEMY_URL via lib/sources/chain/rpc).

import { parseAbi, getAddress, stringToHex } from "viem";
import { alchemyClient } from "./rpc";
import {
  MAKER_ADDRESSES,
  UNLISTED_ILKS,
  ilkToCollateralSymbol,
  ilkGroup,
  isUserVaultIlk,
  type MakerIlkGroup,
} from "@/lib/makerdao/asset-catalog";

const REGISTRY = getAddress(MAKER_ADDRESSES.ILK_REGISTRY);
const VAT = getAddress(MAKER_ADDRESSES.VAT);
const SPOTTER = getAddress(MAKER_ADDRESSES.SPOTTER);
const JUG = getAddress(MAKER_ADDRESSES.JUG);
const DOG = getAddress(MAKER_ADDRESSES.DOG);
const VOW = getAddress(MAKER_ADDRESSES.VOW);
const AUTO_LINE = getAddress(MAKER_ADDRESSES.DSS_AUTO_LINE);

const REG_ABI = parseAbi([
  "function list() view returns (bytes32[])",
  "function info(bytes32) view returns (string name, string symbol, uint256 class, uint256 dec, address gem, address pip, address join, address xlip)",
]);
const VAT_ABI = parseAbi([
  "function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)",
  "function debt() view returns (uint256)",
  "function Line() view returns (uint256)",
  "function vice() view returns (uint256)",
  "function live() view returns (uint256)",
  "function dai(address) view returns (uint256)",
  "function sin(address) view returns (uint256)",
]);
const SPOTTER_ABI = parseAbi([
  "function ilks(bytes32) view returns (address pip, uint256 mat)",
  "function par() view returns (uint256)",
]);
const JUG_ABI = parseAbi([
  "function base() view returns (uint256)",
  "function ilks(bytes32) view returns (uint256 duty, uint256 rho)",
]);
const DOG_ABI = parseAbi([
  "function ilks(bytes32) view returns (address clip, uint256 chop, uint256 hole, uint256 dirt)",
]);
const AUTO_LINE_ABI = parseAbi([
  "function ilks(bytes32) view returns (uint256 line, uint256 gap, uint48 ttl, uint48 last, uint48 lastInc)",
]);

const ZERO = BigInt(0);
const RAY = BigInt(10) ** BigInt(27);
const SECONDS_PER_YEAR = 31536000;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** rad (1e45) → DAI. `line`, `dust`, `debt`, `Line`, `vice` are all rad. */
const rad = (x: bigint): number => Number(x) / 1e45;
/** wad (1e18) → human. */
const wad = (x: bigint): number => Number(x) / 1e18;

const bytes32ToStr = (b32: string): string => Buffer.from(b32.slice(2), "hex").toString("utf8").replace(/\0+$/, "");
const strToBytes32 = (s: string): `0x${string}` => stringToHex(s, { size: 32 });

/**
 * How an ilk's debt ceiling behaves — Maker's answer to "can more be drawn",
 * which is a governance posture, not a market state.
 *
 *   auto   — the DssAutoLine maintains `line`, raising it by up to `gap` above
 *            current debt every `ttl` seconds, capped at `maxLine`. `line` is a
 *            moving target, so the real limit is maxLine.
 *   fixed  — `line` is a constant governance set and only a spell changes.
 *   closed — `line` is 0 while debt is still outstanding: the ilk is wound down.
 *            Existing vaults live on and still accrue the fee; nothing new can
 *            be drawn. NOT "100% utilised" and emphatically not "0%".
 *   dormant— no line, no debt. The slot exists; the ilk does nothing.
 */
export type MakerCeilingState = "auto" | "fixed" | "closed" | "dormant";

/** One ilk, as the Vat and its parameter contracts state it at head. */
export interface MakerIlkRow {
  ilk: string;
  collateralSymbol: string;
  /** IlkRegistry.info().class — null when the registry doesn't list the ilk. */
  cls: number | null;
  group: MakerIlkGroup;
  /** True for the ilks a user can hold a vault in — what /makerdao indexes. */
  userVaultType: boolean;

  /** DAI debt = Art × rate (the Vat's §2 multiply). */
  debtDai: number;
  /** Exact Art × rate in rad — what the reconcile actually sums. */
  debtRad: string;
  /** Share of Σ ilk debt, 0..1. Null while the system total is 0. */
  debtShare: number | null;
  /** Normalized debt `Art` (wad) and the fee accumulator `rate` (ray, raw). */
  art: number;
  rate: string;

  ceilingState: MakerCeilingState;
  /** `line` — the ceiling enforceable RIGHT NOW (rad → DAI). */
  lineDai: number;
  /** What can still be drawn at this instant: max(0, line − debt). */
  availableDai: number;
  /** The DssAutoLine's cap, i.e. the ceiling `line` may climb to. Null unless
   *  ceilingState is "auto". */
  maxLineDai: number | null;
  /** How far above current debt the autoline will lift `line`. */
  gapDai: number | null;
  /** Seconds the autoline waits between lifts. */
  ttlSeconds: number | null;

  /** Liquidation ratio `mat` as a multiplier (1.45 = 145%). */
  matRatio: number | null;
  /** Stability fee APR from (Jug.base + duty) compounded. Null if unreadable. */
  stabilityFeeApr: number | null;
  /** The ilk's minimum vault debt (`dust`, rad → DAI). */
  dustDai: number;
  /** Liquidation penalty `chop` (wad → multiplier, 1.13 = 13%). Null when the
   *  ilk has no Dog entry (it cannot be liquidated). */
  chop: number | null;
  /** OSM price = spot × par × mat ÷ RAY², the ilk's own operative price. */
  priceUsd: number | null;
  /** The price feed the Spotter reads for this ilk. */
  pip: string | null;
}

/** Σ debt for one group — the "what mints the DAI" split. */
export interface MakerGroupTotal {
  group: MakerIlkGroup;
  debtDai: number;
  share: number | null;
  ilkCount: number;
}

export interface MakerSystemChainResponse {
  blockNumber: number;

  /** Vat.debt — every DAI in existence, rad → DAI. */
  debtDai: number;
  /** Vat.Line — the global ceiling. */
  lineDai: number;
  /** debt ÷ Line. Unlike a per-ilk "utilisation" this one means something: the
   *  global Line is a fixed governance number, not an autoline artifact. */
  globalFill: number | null;
  /** Vat.vice — DAI issued with no collateral behind it, matched wei-for-wei by
   *  `sin` at the Vow. */
  viceDai: number;
  /** Vat.live — 0 once Emergency Shutdown has been triggered. */
  live: boolean;

  /** Σ (Art × rate) across every ilk read, rad → DAI. */
  ilkDebtTotalDai: number;
  /** The reconcile, exact: Vat.debt − (Σ Art×rate + vice), in rad. "0" when the
   *  read accounts for every DAI in existence. */
  residualRad: string;
  /** The same residual in DAI, for display. */
  residualDai: number;
  /** True when residualRad is exactly "0" — the identity closes to the last rad
   *  and the decomposition below is complete. */
  reconciles: boolean;

  /** The Vow's surplus buffer (Vat.dai(vow)) and its charged sin. */
  vowSurplusDai: number;
  vowSinDai: number;

  ilks: MakerIlkRow[];
  groups: MakerGroupTotal[];
  /** Σ debt of the ilks a user can actually hold a vault in. */
  userVaultDebtDai: number;
  /** That sum as a share of Σ ilk debt — the figure that says what fraction of
   *  Maker the vault explorer covers. */
  userVaultShare: number | null;

  /** True when the read failed and the page must say so rather than show an
   *  empty protocol. */
  chainStale: boolean;
}

function stub(): MakerSystemChainResponse {
  return {
    blockNumber: 0,
    debtDai: 0,
    lineDai: 0,
    globalFill: null,
    viceDai: 0,
    live: true,
    ilkDebtTotalDai: 0,
    residualRad: "0",
    residualDai: 0,
    reconciles: false,
    vowSurplusDai: 0,
    vowSinDai: 0,
    ilks: [],
    groups: [],
    userVaultDebtDai: 0,
    userVaultShare: null,
    chainStale: true,
  };
}

/** Group order on the page — biggest structural story first, dust last. */
const GROUP_ORDER: MakerIlkGroup[] = ["vault", "psm", "allocator", "rwa", "d3m", "delisted"];

/**
 * Read MakerDAO's whole system state live from its own contracts. Returns a
 * `chainStale` stub on RPC failure so the page states that rather than
 * rendering an empty protocol.
 */
export async function loadMakerSystemFromChain(): Promise<MakerSystemChainResponse> {
  try {
    const client = alchemyClient();

    // Phase 1 — the block, the registry's roster, and the system scalars.
    const [blockNumber, listed, scalars] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "list" }),
      client.multicall({
        allowFailure: false,
        contracts: [
          { address: VAT, abi: VAT_ABI, functionName: "debt" },
          { address: VAT, abi: VAT_ABI, functionName: "Line" },
          { address: VAT, abi: VAT_ABI, functionName: "vice" },
          { address: VAT, abi: VAT_ABI, functionName: "live" },
          { address: VAT, abi: VAT_ABI, functionName: "dai", args: [VOW] },
          { address: VAT, abi: VAT_ABI, functionName: "sin", args: [VOW] },
          { address: SPOTTER, abi: SPOTTER_ABI, functionName: "par" },
          { address: JUG, abi: JUG_ABI, functionName: "base" },
        ],
      }),
    ]);
    const [debtRad, lineRad, viceRad, liveRaw, vowDaiRad, vowSinRad, par, jugBase] = scalars;

    // The roster: the registry's list PLUS the ilks it has forgotten. Without
    // the supplement the reconcile below misses by exactly their dust, and a
    // three-wei miss reads the same as a broken read.
    const listedIlks = listed.map(bytes32ToStr);
    const listedSet = new Set(listedIlks);
    const roster: { ilk: string; b32: `0x${string}`; listed: boolean }[] = [
      ...listed.map((b32, i) => ({ ilk: listedIlks[i], b32: b32 as `0x${string}`, listed: true })),
      ...UNLISTED_ILKS.filter((i) => !listedSet.has(i)).map((ilk) => ({
        ilk,
        b32: strToBytes32(ilk),
        listed: false,
      })),
    ];

    // Phase 2 — one multicall PER CONTRACT across the whole roster, not one per
    // ilk: 38 ilks × 6 reads sequentially is 228 round trips and Alchemy 429s
    // long before that. `info` only answers for the ilks the registry lists, so
    // every leg allows failure and every consumer below treats a failed one as
    // "unknown" — never as 0, which would read as a real number.
    const keys = roster.map((r) => r.b32);
    const [vatIlks, infos, spotIlks, jugIlks, dogIlks, autoLines] = await Promise.all([
      client.multicall({
        allowFailure: true,
        contracts: keys.map((b32) => ({ address: VAT, abi: VAT_ABI, functionName: "ilks", args: [b32] }) as const),
      }),
      client.multicall({
        allowFailure: true,
        contracts: keys.map((b32) => ({ address: REGISTRY, abi: REG_ABI, functionName: "info", args: [b32] }) as const),
      }),
      client.multicall({
        allowFailure: true,
        contracts: keys.map(
          (b32) => ({ address: SPOTTER, abi: SPOTTER_ABI, functionName: "ilks", args: [b32] }) as const,
        ),
      }),
      client.multicall({
        allowFailure: true,
        contracts: keys.map((b32) => ({ address: JUG, abi: JUG_ABI, functionName: "ilks", args: [b32] }) as const),
      }),
      client.multicall({
        allowFailure: true,
        contracts: keys.map((b32) => ({ address: DOG, abi: DOG_ABI, functionName: "ilks", args: [b32] }) as const),
      }),
      client.multicall({
        allowFailure: true,
        contracts: keys.map(
          (b32) => ({ address: AUTO_LINE, abi: AUTO_LINE_ABI, functionName: "ilks", args: [b32] }) as const,
        ),
      }),
    ]);

    const ok = <T>(r: { status: string; result?: unknown } | undefined): T | null =>
      r?.status === "success" ? (r.result as T) : null;

    // Phase 3 — build the rows, summing the debt in EXACT rad as we go. The
    // float `debtDai` is for display; `sumRad` is what the identity is checked
    // against, so it never touches a Number.
    let sumRad = ZERO;
    const rows: MakerIlkRow[] = [];

    for (let i = 0; i < roster.length; i++) {
      const { ilk, listed: isListed } = roster[i];
      const vat = ok<readonly [bigint, bigint, bigint, bigint, bigint]>(vatIlks[i]);
      if (!vat) continue; // the Vat is the one read that must answer; no slot, no row
      const [Art, rate, spot, line, dust] = vat;

      const debtRadIlk = Art * rate;
      sumRad += debtRadIlk;

      const info = ok<readonly [string, string, bigint, bigint, string, string, string, string]>(infos[i]);
      const cls = isListed && info ? Number(info[2]) : null;
      const group = ilkGroup(ilk, cls);

      const spotIlk = ok<readonly [string, bigint]>(spotIlks[i]);
      const mat = spotIlk ? spotIlk[1] : ZERO;
      const pip = spotIlk && spotIlk[0] !== ZERO_ADDR ? spotIlk[0].toLowerCase() : null;

      const jugIlk = ok<readonly [bigint, bigint]>(jugIlks[i]);
      const duty = jugIlk ? jugIlk[0] : ZERO;
      // (base + duty) is the ilk's live per-second rate in ray; a duty of 0 means
      // the ilk was never inited in the Jug, not a 0% fee — hence the guard.
      const perSecond = Number(jugBase + duty) / 1e27;
      const stabilityFeeApr = jugIlk && perSecond >= 1 ? Math.pow(perSecond, SECONDS_PER_YEAR) - 1 : null;

      const dogIlk = ok<readonly [string, bigint, bigint, bigint]>(dogIlks[i]);
      const chop = dogIlk && dogIlk[1] > ZERO ? wad(dogIlk[1]) : null;

      const al = ok<readonly [bigint, bigint, number, number, number]>(autoLines[i]);
      const autoOn = al != null && al[0] > ZERO;

      const debtDai = Number(debtRadIlk / RAY) / 1e18;
      const lineDai = rad(line);

      let ceilingState: MakerCeilingState;
      if (autoOn) ceilingState = "auto";
      else if (line > ZERO) ceilingState = "fixed";
      else if (Art > ZERO) ceilingState = "closed";
      else ceilingState = "dormant";

      rows.push({
        ilk,
        collateralSymbol: ilkToCollateralSymbol(ilk),
        cls,
        group,
        userVaultType: isUserVaultIlk(group),
        debtDai,
        debtRad: debtRadIlk.toString(),
        debtShare: null, // filled once the total is known
        art: wad(Art),
        rate: rate.toString(),
        ceilingState,
        lineDai,
        availableDai: Math.max(0, lineDai - debtDai),
        maxLineDai: autoOn ? rad(al[0]) : null,
        gapDai: autoOn ? rad(al[1]) : null,
        ttlSeconds: autoOn ? Number(al[2]) : null,
        matRatio: mat > ZERO ? Number(mat) / 1e27 : null,
        stabilityFeeApr,
        dustDai: rad(dust),
        chop,
        // The OSM price, inverted out of Spotter.poke exactly as the position
        // lane does it: price = spot × par × mat ÷ RAY².
        priceUsd: mat > ZERO ? Number(((spot * par) / RAY) * mat) / 1e27 / 1e27 : null,
        pip,
      });
    }

    // Phase 4 — the reconcile, in rad, before anything is rounded.
    const residualRad = debtRad - (sumRad + viceRad);
    const ilkDebtTotalDai = Number(sumRad / RAY) / 1e18;

    for (const r of rows) r.debtShare = ilkDebtTotalDai > 0 ? r.debtDai / ilkDebtTotalDai : null;
    rows.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.debtDai - a.debtDai);

    const groups: MakerGroupTotal[] = GROUP_ORDER.map((group) => {
      const inGroup = rows.filter((r) => r.group === group);
      const debtDai = inGroup.reduce((s, r) => s + r.debtDai, 0);
      return {
        group,
        debtDai,
        share: ilkDebtTotalDai > 0 ? debtDai / ilkDebtTotalDai : null,
        ilkCount: inGroup.length,
      };
    }).filter((g) => g.ilkCount > 0);

    const userVaultDebtDai = rows.filter((r) => r.userVaultType).reduce((s, r) => s + r.debtDai, 0);
    const lineDaiTotal = rad(lineRad);
    const debtDaiTotal = rad(debtRad);

    return {
      blockNumber,
      debtDai: debtDaiTotal,
      lineDai: lineDaiTotal,
      globalFill: lineDaiTotal > 0 ? debtDaiTotal / lineDaiTotal : null,
      viceDai: rad(viceRad),
      live: liveRaw > ZERO,
      ilkDebtTotalDai,
      residualRad: residualRad.toString(),
      residualDai: Number(residualRad) / 1e45,
      reconciles: residualRad === ZERO,
      vowSurplusDai: rad(vowDaiRad),
      vowSinDai: rad(vowSinRad),
      ilks: rows,
      groups,
      userVaultDebtDai,
      userVaultShare: ilkDebtTotalDai > 0 ? userVaultDebtDai / ilkDebtTotalDai : null,
      chainStale: false,
    };
  } catch (err) {
    // Log before stubbing. The page's whole posture is "no cached fallback —
    // rather than show stale figures, show nothing", so a swallowed failure
    // leaves an operator with a blank page and no cause. The commonest one here
    // is an RPC 429: this is ~9 eth_calls, and a free-tier key burst-throttles.
    console.error("makerdao-system: chain read failed — the page will render its stale notice", err);
    return stub();
  }
}
