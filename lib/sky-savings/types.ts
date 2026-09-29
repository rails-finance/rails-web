// The /api/sky-savings wire shapes (rails-server-onboarding
// api/src/routes/skySavings.ts). Every amount is `{ raw, formatted }` with raw
// an integer string at 18 decimals; chi and ssr are rays.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

export interface SkyAmount {
  raw: string;
  formatted: number;
}

/** The sealed block every figure is stated at. */
export interface SkyAsOf {
  block: number;
  timestamp: number | null;
  /** chi at the sealed block, ray (the contract's convertToAssets there). */
  chi: string | null;
  ssr: string;
  /** The ssr annualised, as a decimal string ("0.036000"). */
  ssrAnnual: string;
  /** The stored chi and rho at the block. Not on the wire: the page reads them
   *  from the contract (lib/sources/chain/sky-savings-drip.ts). */
  drip?: SkyDrip | null;
}

/** sUSDS `chi()` (ray) and `rho()` (unix seconds of the last drip). */
export interface SkyDrip {
  chi: string;
  rho: number;
}

/** The latest verifier run. A surface states no figure unless `ok` is true. */
export interface SkyGate {
  ok: boolean;
  ranAt: string;
  block: number;
  timestamp: number;
  totalSupply: string;
  supplyReplayed: string;
  supplyFromTransfers: string;
  supplyFromDepositsLessWithdrawals: string;
  negativeBalances: number;
  holdersChecked: number;
  openHoldersChecked: number | null;
  balanceMismatches: number;
  valueMismatches: number;
  chiDerived: string;
  chiChain: string;
  depositChiDisagree: number;
  withdrawChiDisagree: number;
}

export interface SkyCoverage {
  firstBlock: number;
  capturedThroughBlock: number | null;
  sealedThroughBlock: number;
  psmFeesCapturedThroughBlock: number | null;
  holdersEver: number;
  holdersOpen: number;
  supplyReplayed: SkyAmount | null;
}

/** What every answer carries beside its data. */
export interface SkyEnvelope {
  asOf: SkyAsOf;
  gate: SkyGate | null;
  coverage: SkyCoverage;
}

export interface SkyPosition {
  holder: string;
  status: "open" | "closed";
  shares: SkyAmount;
  value: SkyAmount | null;
  usdsIn: SkyAmount;
  usdsOut: SkyAmount;
  netContributed: SkyAmount;
  earned: SkyAmount | null;
  activity: {
    firstBlock: number;
    lastBlock: number;
    /** Block times of the first and last event (absent on an api that
     *  predates them). */
    firstTimestamp?: number | null;
    lastTimestamp?: number | null;
    events: number;
    deposits: number;
    withdrawals: number;
    received: number;
    sent: number;
  };
  plumbing: { label: string; kind: string } | null;
  accountUrl: string;
}

export interface SkyExcluded {
  address: string;
  label: string;
  kind: string;
  shares: SkyAmount;
}

export interface SkyPositionsPage extends SkyEnvelope {
  data: SkyPosition[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  excluded: SkyExcluded[];
}

export interface SkyRateChange {
  blockNumber: number;
  timestamp: number;
  txHash: string;
  ssr: string;
  annualRate: string;
  previousAnnualRate: string;
}

export interface SkyTimeline extends SkyEnvelope {
  events: BaseActivityEvent[];
  marketNotes: (SkyRateChange & { type: "rate_change" })[];
  total: number;
}

/** One UTC day of a holder's flows: USDS moved per kind that day, and the
 *  shares and chi after the day's last event. */
export interface SkyFlowDay {
  day: number;
  events: number;
  deposited: string;
  received: string;
  withdrawn: string;
  sent: string;
  sharesAfter: string;
  chi: string;
  lastBlock: number;
}

export interface SkyRates extends SkyEnvelope {
  ssr: SkyRateChange[];
  chiDaily: { day: number; date: string; lastDripBlock: number; chiAtDayEnd: string }[];
  psm: {
    rule: string;
    wrapper: string;
    psm: string;
    deployedBlock: number;
    feeChanges: number;
    series: {
      fromBlock: number;
      fromTimestamp: number | null;
      txHash: string | null;
      tin: string;
      tout: string;
      /** "1.000000", or "halted". */
      usdcPerUsds: string;
    }[];
  };
}

/** Why a page states no figure: the gate has not passed, or never ran. */
export function gateRefusal(env: Pick<SkyEnvelope, "gate">): "failed" | "missing" | null {
  if (!env.gate) return "missing";
  return env.gate.ok === true ? null : "failed";
}
