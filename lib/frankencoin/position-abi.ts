// Frankencoin Position ABIs — the chain overlay's read surface.
// ----------------------------------------------------------------------------
// Every borrower owns a Position clone; the views below are the position's own
// getters at head. V1 and V2 drift: V1 carries `limitForClones`, V2 carries
// `riskPremiumPPM` (its interest is Leadrate + premium) and per-position
// minting headroom views. The overlay probes `riskPremiumPPM` with
// allowFailure to tell the versions apart without a roster.
//
// Verified against real positions in the Phase-0 probes (both versions, open /
// closed / denied): every COMMON read below succeeds on both; V2 expiration /
// cooldown are uint40 on chain — decoding as uint256 is safe (left-padded word).

import { parseAbi } from "viem";

export const POSITION_COMMON_ABI = parseAbi([
  "function owner() view returns (address)",
  "function collateral() view returns (address)",
  "function minted() view returns (uint256)",
  "function price() view returns (uint256)",
  "function expiration() view returns (uint256)",
  "function start() view returns (uint256)",
  "function cooldown() view returns (uint256)",
  "function challengedAmount() view returns (uint256)",
  "function challengePeriod() view returns (uint64)",
  "function isClosed() view returns (bool)",
  "function original() view returns (address)",
  "function minimumCollateral() view returns (uint256)",
  "function annualInterestPPM() view returns (uint32)",
  "function reserveContribution() view returns (uint32)",
]);

/** V2-only — the fixed premium the position adds on top of the system Leadrate
 *  (annualInterestPPM = leadrate + this). Its failure marks a V1 position. */
export const POSITION_V2_ABI = parseAbi(["function riskPremiumPPM() view returns (uint24)"]);
