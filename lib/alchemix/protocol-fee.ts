// The Alchemist's `protocolFee` by block, per line (rails-ops
// reference/official-docs/alchemix.md, "Docs and chain disagree", 1; ui-jobs
// 646). The fee is charged in vault shares on every redemption, on top of the
// shares the Transmuter gets, and on a repay's earmarked part. A surface that
// prices one event takes the step in force at that event's block; a surface
// that states the fee now takes the last step.
//
// A step holds from its `fromBlock` to the next step. `bps: null` is a range
// whose fee was not read: there the page states no fee and says so.
//
// The reads behind each step:
//   • Ethereum, both lines: 25 on 2026-09-25 and 2026-09-27 (decisions/0032);
//     25 on eth-alusd at block 26,405,306 on 2026-11-13.
//   • Base: 10 on 2026-09-25 and 2026-09-27, and at block 52,992,079; 0 at
//     blocks 53,638,119, 54,284,159 and 56,868,319 (all read 2026-11-13). The
//     docs' ProtocolFeeUpdated log was not read (the logs node refused the
//     range), so the change lies somewhere in 52,992,080 to 53,638,118.
//
// No imports: the unit tests load it as is.

export interface ProtocolFeeStep {
  fromBlock: number;
  /** Basis points; null where the fee in this range was not read. */
  bps: number | null;
  /** What the step rests on, for the receipt. */
  read: string;
}

export const BASE_FEE_LAST_TEN = 52_992_079;
export const BASE_FEE_FIRST_ZERO = 53_638_119;
export const BASE_FEE_HEAD_READ = 56_868_319;

const ETHEREUM: ProtocolFeeStep[] = [
  {
    fromBlock: 0,
    bps: 25,
    read: "protocolFee() 25, read on 25 and 27 Sep 2026 and at block 26,405,306 on 13 Nov 2026",
  },
];

const BASE: ProtocolFeeStep[] = [
  {
    fromBlock: 0,
    bps: 10,
    read: `protocolFee() 10, read on 25 and 27 Sep 2026 and at block ${BASE_FEE_LAST_TEN.toLocaleString("en-US")} on 13 Nov 2026`,
  },
  {
    fromBlock: BASE_FEE_LAST_TEN + 1,
    bps: null,
    read: `The market's redemption fee after block ${BASE_FEE_LAST_TEN.toLocaleString("en-US")} is unread: the Alchemist's protocolFee() read 10 bps there and 0 at block ${BASE_FEE_FIRST_ZERO.toLocaleString("en-US")} (13 Nov 2026), so no fee is stated here.`,
  },
  {
    fromBlock: BASE_FEE_FIRST_ZERO,
    bps: 0,
    read: `protocolFee() 0, read at blocks ${BASE_FEE_FIRST_ZERO.toLocaleString("en-US")}, 54,284,159 and ${BASE_FEE_HEAD_READ.toLocaleString("en-US")} on 13 Nov 2026; it was 10 at block ${BASE_FEE_LAST_TEN.toLocaleString("en-US")}`,
  },
];

const SCHEDULES: Record<string, ProtocolFeeStep[]> = {
  "1:eth-alusd": ETHEREUM,
  "1:eth-aleth": ETHEREUM,
  "8453:base-alusdb": BASE,
};

/** The step in force at `block`, or null for a line this table does not hold. */
export function protocolFeeAt(chainId: number, key: string, block: number): ProtocolFeeStep | null {
  const steps = SCHEDULES[`${chainId}:${key}`];
  if (!steps) return null;
  let out = steps[0];
  for (const s of steps) if (s.fromBlock <= block) out = s;
  return out;
}

/** The fee now: the last step. */
export function protocolFeeNow(chainId: number, key: string): ProtocolFeeStep | null {
  const steps = SCHEDULES[`${chainId}:${key}`];
  return steps ? steps[steps.length - 1] : null;
}

/** The sentence a surface states where the step's fee is unread, else null. */
export function unreadFee(step: ProtocolFeeStep | null): string | null {
  return step && step.bps == null ? step.read : null;
}

/** The fee as the modals state it, true of every line. */
export const PROTOCOL_FEE_WORDS = `0.25% on Ethereum, and 0% on Base, where it was 0.1% until a block between ${(BASE_FEE_LAST_TEN + 1).toLocaleString("en-US")} and ${BASE_FEE_FIRST_ZERO.toLocaleString("en-US")}`;
