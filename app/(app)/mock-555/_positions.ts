// The twelve positions measured for the 555 proposal (block 26,378,811, 9 Nov 2026):
// three per version from across each NFT's id range, three minted that day.
import type { Version } from "./_reads";

export const POSITIONS: { version: Version; id: string; pair: string; note: string }[] = [
  { version: "v3", id: "76033", pair: "LINK/WETH 0.3%", note: "opened 2021, out of range" },
  { version: "v3", id: "285123", pair: "USDC/WETH 0.3%", note: "wide range, in range" },
  { version: "v3", id: "522727", pair: "ID/USDC 0.3%", note: "one-sided, out of range" },
  { version: "v3", id: "1083471", pair: "WETH/USDT 0.3%", note: "out of range, holds only WETH" },
  { version: "v3", id: "1400000", pair: "HLX/USDC 0.3%", note: "opened 9 Nov" },
  { version: "v3", id: "1400010", pair: "WETH/USDT 0.3%", note: "opened 9 Nov" },
  { version: "v4", id: "4175", pair: "ETH/NATA$ 0.3%", note: "full range, no swaps" },
  { version: "v4", id: "50101", pair: "ETH/GALA 0.3%", note: "full range" },
  { version: "v4", id: "225457", pair: "BALLR/WETH, hook", note: "dynamic fee set by a hook" },
  { version: "v4", id: "434213", pair: "ETH/SEND 1%", note: "out of range, fees 73% of value" },
  { version: "v4", id: "504880", pair: "ETH/USDC 0.3%", note: "opened 9 Nov, in range" },
  { version: "v4", id: "504900", pair: "EURC/USDC 0.03%", note: "opened 9 Nov" },
];
