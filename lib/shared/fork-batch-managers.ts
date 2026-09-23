import { isAddress } from "viem";

/**
 * Names for the interest-batch managers seen on the Liquity forks (Ebisu,
 * Asymmetry), for the delegate chip on the fork event headers.
 *
 * Why not `data/batch-managers.json`: that registry is Liquity-V2-mainnet
 * specific — its entries are keyed to V2's ETH/wstETH/rETH branches and carry
 * V2 `asset_contract` addresses. The forks run their own branches with their
 * own managers, so this is a separate, deliberately minimal map: address →
 * display name, nothing else.
 *
 * ── Evidence ────────────────────────────────────────────────────────────────
 * The managers below are Etherscan-VERIFIED contracts whose published source
 * (matching the deployed bytecode) has the contract name `BolderCashProxy`.
 * That is the same verified contract name carried by the three addresses
 * `data/batch-managers.json` already attributes to "Bolder" on V2
 * (`0x25bc01fd…`, `0x50bc019a…`, `0x75bc01bf…`), so the label here is
 * consistent with the registry's existing attribution rather than a new claim.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 * One manager carries no name and renders as its truncated address:
 *
 *   0x322efaedd9e2979bb5613c46f110ffe4fa1281e5 — Ebisu, 31 chip-bearing rows.
 *   An EOA (no contract code, so no verifiable contract name), no ENS primary
 *   name, no protocol documentation or announcement found tying it to an
 *   operator.
 *
 * It stays an address on purpose. A name rendered beside a real position is a
 * claim about the on-chain record; a plausible-sounding guess is strictly worse than
 * the address it replaces, so an unidentified manager keeps its address until
 * evidence of the same grade as the above turns up. Do not fill this in from a
 * vanity prefix, a naming pattern, or a hunch.
 */
const FORK_BATCH_MANAGER_NAMES: Record<string, string> = {
  // Ebisu
  "0x50bc0287b722929b3b8dc8582d50e08ffa0f6009": "Bolder",
  "0x50bc01bd11fe19d6f896518a7fa1ae413d8eab0f": "Bolder",
  // Asymmetry
  "0x50bc02599ae74fde4ee2c769586626977ccccc05": "Bolder",
  "0x25bc01216b2602e80ab527ed73c7821ecb526586": "Bolder",
  "0x75bc029949c56ef36f68c6569e4f983be4697158": "Bolder",
  "0x25bc020c042ea6a5a5b93b847f17ccd003415e95": "Bolder",
  "0x50bc01e46710abaacf5db45f0838b9fe7b9aedef": "Bolder",
};

// Same shape check the V2 registry gets: a malformed key here would silently
// never match, leaving the chip on its address with no sign anything was wrong.
const malformed = Object.keys(FORK_BATCH_MANAGER_NAMES).filter((a) => !isAddress(a, { strict: false }));
if (malformed.length > 0) {
  throw new Error(`fork-batch-managers: malformed address key(s): ${malformed.join(", ")}`);
}

/**
 * The display name for a fork batch manager, or `undefined` when none is
 * known. Callers render the truncated address on `undefined` — the delegate
 * chip's `party.name` seam already degrades that way.
 */
export function getForkBatchManagerName(address: string | null | undefined): string | undefined {
  if (!address) return undefined;
  return FORK_BATCH_MANAGER_NAMES[address.toLowerCase()];
}
