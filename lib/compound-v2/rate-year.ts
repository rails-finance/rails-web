// The year a Compound V2 rate is printed over (rails-ops ui-jobs 630).
// ----------------------------------------------------------------------------
// A cToken accrues its per-block rate once a block, and Ethereum makes a block
// every 12 seconds. Compound's docs annualise a per-block rate on
// `blocksPerYear = 5 * 60 * 24 * 365` ("12 seconds per block",
// https://docs.compound.xyz/v2/), 2,628,000 blocks.
//
// Each rate model also answers `blocksPerYear()`: 2,102,400 on 19 of the 20
// markets' models and 2,628,000 on cETH's (read 13 Nov 2026). The model uses
// it to turn the curve's yearly terms into per-block ones; it does not count
// the blocks a year holds, so no printed rate is annualised on it.
//
// Pure, no imports: the chain loaders, the client adapters and the unit test
// read it.

/** Blocks in a year of 12-second blocks, as Compound's docs count them
 *  (https://docs.compound.xyz/v2/, "Calculating the APY Using Rate Per Block"). */
export const COMPOUND_V2_BLOCKS_PER_YEAR = 2_628_000;

/** Where the year comes from, in the receipts' words. */
export const COMPOUND_V2_YEAR_SOURCE = "12-second blocks, as Compound's docs count a year";

/** Compound's docs page that sets the year. */
export const COMPOUND_V2_YEAR_DOCS = "https://docs.compound.xyz/v2/";

/** A per-block rate (a 1e18 mantissa) as a simple annual fraction: the rate
 *  times 2,628,000 blocks. 91,459,164,853 a block is 0.2404 a year. */
export function compoundV2AnnualRate(perBlock: bigint | number | string): number {
  return (Number(perBlock) / 1e18) * COMPOUND_V2_BLOCKS_PER_YEAR;
}
