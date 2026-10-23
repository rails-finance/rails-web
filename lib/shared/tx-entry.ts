// The contract a row's transaction entered (rails-server services/tx-entry.ts):
// the envelope `to`, and where `to` is the position's account or an account
// kind (a Safe, a DSProxy or DPM account, the ERC-4337 EntryPoint, an EIP-7702
// self-call), the first contract that account called and the account it went
// through. The timeline's side bar names the owner of `contract ?? to`
// (components/shared/section-sidebar.tsx, anatomy P3.1.1). Pure: the unit
// tests import it.

export interface TxEntry {
  /** The transaction's `to`, lowercase. */
  to: string;
  /** The first contract the account called, where the rule applied and the
   *  call decoded. */
  contract?: string;
  /** The account that call went through. */
  account?: string;
  /** The transaction's sender, where the store holds it. */
  from?: string;
}

/** A served row's entry fields, or undefined where the server has not read the
 *  transaction yet (or predates the fields). */
export function txEntryOf(r: {
  tx_to?: string | null;
  entry_contract?: string | null;
  entry_account?: string | null;
  tx_from?: string | null;
}): TxEntry | undefined {
  if (!r.tx_to) return undefined;
  return {
    to: r.tx_to.toLowerCase(),
    ...(r.entry_contract ? { contract: r.entry_contract.toLowerCase() } : {}),
    ...(r.entry_account ? { account: r.entry_account.toLowerCase() } : {}),
    ...(r.tx_from ? { from: r.tx_from.toLowerCase() } : {}),
  };
}

/** `{ entry }` for a spread into a row, or nothing. */
export function withEntry(r: Parameters<typeof txEntryOf>[0]): { entry?: TxEntry } {
  const entry = txEntryOf(r);
  return entry ? { entry } : {};
}

/** The address whose owner the bar names. */
export function entryAddress(e: TxEntry | undefined): string | undefined {
  return e ? (e.contract ?? e.to) : undefined;
}

/** The transaction was not the person's: its sender is neither the position
 *  nor one of the account's owners, and it did not come in through the
 *  position's own account (a Safe's `execTransaction` checks its owners'
 *  signatures, a user operation the account's own validation, whoever relayed
 *  it). False where the sender is unknown, and on a contract account whose
 *  owners are not read yet. */
export function notTheirs(
  e: TxEntry | undefined,
  wallet: string,
  owners: { list: readonly string[] | null; isContract: boolean },
): boolean {
  if (!e?.from) return false;
  const w = wallet.toLowerCase();
  if (e.from === w || e.account === w) return false;
  if (owners.list) return !owners.list.includes(e.from);
  return !owners.isContract;
}
