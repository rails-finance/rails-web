// The Alchemist's `protocolFee` by block, per line (rails-ops
// reference/official-docs/alchemix.md, "Docs and chain disagree", 1; ui-jobs
// 646). The fee is charged in vault shares on every redemption, on top of the
// shares the Transmuter gets, and on a repay's earmarked part. A surface that
// prices one event takes the step in force at that event's block; a surface
// that states the fee now takes the last step.
//
// A step holds from its `fromBlock` to the next step.
//
// The reads behind each step:
//   • Ethereum, both lines: 25 on 2026-09-25 and 2026-09-27 (decisions/0032);
//     25 on eth-alusd at block 26,405,306 on 2026-11-13.
//   • Base: 10 on 2026-09-25 and 2026-09-27, and at block 52,992,079; then
//     ProtocolFeeUpdated(0) at block 53,552,996 (5 Nov 2026 16:15:39 UTC, tx
//     0x018e252984d2d8a7a8cb75c63ab8c718063b1b0c83f95bdbb8ba3a4f4e742fee), the
//     one such log in 52,992,080 to 53,638,118; 0 at blocks 53,638,119,
//     54,284,159 and 56,868,319 (all read 2026-11-13).
//
// No imports: the unit tests load it as is.

export interface ProtocolFeeStep {
  fromBlock: number;
  /** Basis points. */
  bps: number;
  /** What the step rests on, for the receipt. */
  read: string;
}

/** The block of the Base Alchemist's ProtocolFeeUpdated(0), and its date. */
export const BASE_FEE_CHANGE_BLOCK = 53_552_996;
export const BASE_FEE_CHANGE_DATE = "5 Nov 2026";
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
    read: "protocolFee() 10, read on 25 and 27 Sep 2026 and at block 52,992,079 on 13 Nov 2026; the Alchemist set it to 0 at block 53,552,996",
  },
  {
    fromBlock: BASE_FEE_CHANGE_BLOCK,
    bps: 0,
    read: `ProtocolFeeUpdated(0) at block ${BASE_FEE_CHANGE_BLOCK.toLocaleString("en-US")} (${BASE_FEE_CHANGE_DATE}), and protocolFee() 0 at blocks 53,638,119, 54,284,159 and ${BASE_FEE_HEAD_READ.toLocaleString("en-US")} on 13 Nov 2026`,
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

/** The fee as the modals state it, true of every line. */
export const PROTOCOL_FEE_WORDS = `0.25% on Ethereum, and 0% on Base, where it was 0.1% until block ${BASE_FEE_CHANGE_BLOCK.toLocaleString("en-US")} on ${BASE_FEE_CHANGE_DATE}`;
