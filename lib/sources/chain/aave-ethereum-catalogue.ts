// WHO Aave's vaults are on Ethereum, at one block — the roster read, on its own.
// SERVER-ONLY.
// ----------------------------------------------------------------------------
// `StataTokenFactory.getStataTokens()` and `Umbrella.getStkTokens()` each answer
// their whole family in one `eth_call`, and sGHO is a single address Aave's own
// address book names. Together they are the catalogue, and it is complete at
// whatever block the calls are pinned to rather than as of a census that has
// since drifted (lib/aave-vaults/vault-catalog.ts explains why that matters).
//
// This module exists because the roster is now asked at THREE different blocks
// by three different questions: the directory's head, a holder sweep's head, and
// a TRANSACTION RECEIPT'S OWN BLOCK — the tx lane has to know who the vaults
// were when the transaction ran, not who they are now. A vault deployed after
// that transaction is not a party to it.
//
// The two Phase 1/2 loaders (aave-ethereum-vault-directory.ts and
// aave-ethereum-vault.ts) keep their own copy of the call: there the roster read
// is the first request of a longer plan whose shape their verifiers assert, and
// re-pointing them at this helper would change nothing a reader can see while
// putting two green verifiers at risk for tidiness. New callers use this.
//
// AN ENUMERATOR THAT DID NOT ANSWER IS NOT A SHORT ROSTER — it is no roster, and
// this returns null so a caller states nothing rather than quietly missing a
// family.
//
// ⚠️ EXCEPT WHERE THE FAMILY DID NOT EXIST YET, WHICH IS A DIFFERENT ANSWER. At
// a HISTORIC block — a transaction receipt's own block, the only block the tx
// lane may ask about — an enumerator can revert simply because nobody had
// deployed it yet: `Umbrella.getStkTokens()` reverts at block 21,374,804 because
// Umbrella did not exist then, and sGHO's address held no code either. "No stake
// tokens existed" and "the node did not answer" are different statements, and
// reading the second for the first would make every pre-Umbrella transaction
// unreadable.
//
// The two are told apart BY A READ, never by a guess: on a failed enumerator
// this asks `eth_getCode` at that same block. NO CODE means the contract was not
// there and the family was empty — a reading, recorded in `absent` so a page can
// say so. CODE PRESENT and the call still failed means the READ failed, and the
// whole catalogue comes back null. `atArbitraryBlock` extends the same test to
// sGHO, which has no enumerator to fail and would otherwise be counted at a
// block it did not exist at.

import { parseAbi, type PublicClient } from "viem";
import { AAVE_STATA_FACTORY, AAVE_UMBRELLA, AAVE_ETHEREUM_BOOK_VAULTS } from "@/lib/aave-vaults/vault-catalog";
import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";

const ENUMERATOR_ABI = parseAbi([
  "function getStataTokens() view returns (address[])",
  "function getStkTokens() view returns (address[])",
]);

/** The one address the address book names outright; the other two families are
 *  answered by their own contracts. */
export const AAVE_SGHO_ADDRESS = AAVE_ETHEREUM_BOOK_VAULTS.find((v) => v.family === "sgho")!.address;

export interface AaveEthereumCatalogue {
  /** Lowercased address → the family whose enumerator answered it. */
  byAddress: Map<string, AaveVaultFamily>;
  /** In roster order: sGHO, then the stata family, then the stake tokens. */
  addresses: string[];
  stataCount: number;
  stakeCount: number;
  /** The block the calls were answered at. */
  blockNumber: number;
  /** The families whose own contract held NO CODE at this block — they did not
   *  exist then, which is a reading and not a gap. Always empty at the head. */
  absent: string[];
}

/** The three contracts a roster read depends on, with the words a page uses for
 *  each — so an absence can be stated in the family's own name. */
const SOURCES = {
  stata: { address: AAVE_STATA_FACTORY, label: "the static aTokens", contract: "the stata factory" },
  stake: { address: AAVE_UMBRELLA, label: "the Umbrella stake tokens", contract: "Umbrella" },
  sgho: { address: AAVE_SGHO_ADDRESS, label: "savings GHO", contract: "sGHO" },
} as const;

/**
 * The whole catalogue at one block, in ONE Multicall3 request — plus, ONLY where
 * something did not answer, an `eth_getCode` to tell "it was not deployed yet"
 * from "the read failed".
 *
 * Returns null when a contract that HAS code did not answer: that is an absence
 * a caller must state rather than paper over with a shorter list.
 *
 * `atArbitraryBlock` is for a caller reading at a block it did not choose — the
 * transaction lane, at a receipt's own block. It adds one code read for sGHO,
 * which has no enumerator to fail and would otherwise be counted at a block it
 * did not exist at. A caller reading at the head passes nothing: every one of
 * these contracts exists now, and a call that fails there is a failure.
 */
export async function readAaveEthereumCatalogue(
  client: PublicClient,
  blockNumber: bigint,
  options: { atArbitraryBlock?: boolean } = {},
): Promise<AaveEthereumCatalogue | null> {
  const roster = (await client.multicall({
    contracts: [
      { address: SOURCES.stata.address as `0x${string}`, abi: ENUMERATOR_ABI, functionName: "getStataTokens" },
      { address: SOURCES.stake.address as `0x${string}`, abi: ENUMERATOR_ABI, functionName: "getStkTokens" },
    ],
    batchSize: 0,
    allowFailure: true,
    blockNumber,
  })) as { status: string; result?: unknown }[];
  const answered = (i: number) =>
    roster[i]?.status === "success" ? (roster[i].result as readonly string[]).map((a) => a.toLowerCase()) : null;
  let stata = answered(0);
  let stake = answered(1);

  // The code probe, made only for what needs one: a failed enumerator, and —
  // when the block was not this reader's to choose — sGHO.
  const absent: string[] = [];
  let sghoExists = true;
  const probes: (keyof typeof SOURCES)[] = [];
  if (!stata) probes.push("stata");
  if (!stake) probes.push("stake");
  if (options.atArbitraryBlock) probes.push("sgho");
  if (probes.length > 0) {
    const codes = await Promise.all(
      probes.map((key) => client.getCode({ address: SOURCES[key].address as `0x${string}`, blockNumber })),
    );
    for (let i = 0; i < probes.length; i++) {
      const key = probes[i];
      const deployed = Boolean(codes[i] && codes[i] !== "0x");
      if (key === "sgho") {
        sghoExists = deployed;
        if (!deployed) absent.push(SOURCES.sgho.label);
        continue;
      }
      if (deployed) {
        console.error(
          `Aave Ethereum catalogue: ${SOURCES[key].contract} has code at block ${blockNumber} and did not answer`,
        );
        return null;
      }
      absent.push(SOURCES[key].label);
      if (key === "stata") stata = [];
      else stake = [];
    }
  }
  if (!stata || !stake) return null;

  const addresses = [...(sghoExists ? [AAVE_SGHO_ADDRESS] : []), ...stata, ...stake];
  const byAddress = new Map<string, AaveVaultFamily>([
    ...(sghoExists ? ([[AAVE_SGHO_ADDRESS, "sgho"]] as [string, AaveVaultFamily][]) : []),
    ...stata.map((a) => [a, "stata"] as [string, AaveVaultFamily]),
    ...stake.map((a) => [a, "umbrella-stake"] as [string, AaveVaultFamily]),
  ]);
  return {
    byAddress,
    addresses,
    stataCount: stata.length,
    stakeCount: stake.length,
    blockNumber: Number(blockNumber),
    absent,
  };
}
