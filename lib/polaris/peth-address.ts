// The pETH account page's address, read off its URL (ui-jobs 865).
// SERVER-ONLY: an ENS name resolves and redirects to the lower-cased address,
// and a mixed-case address redirects, as the wallet page does; anything else
// is the route's 404.

import { notFound, redirect } from "next/navigation";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { isWalletEnsName, WALLET_ADDRESS } from "@/lib/wallet/wallet-filters";
import { polarisPethAccountHref } from "@/lib/polaris/routes";

export const PETH_ACCOUNT_DESCRIPTION =
  "A Rails replay of this address's Polaris pETH on Sepolia: the ETH it paid and received, the curve fees, the pETH it holds and where it sits. Test tokens on Sepolia.";

/** The lower-cased address the URL names; `rest` rides any redirect. */
export async function pethAddressOf(raw: string, rest = ""): Promise<string> {
  const typed = decodeURIComponent(raw).trim();
  if (isWalletEnsName(typed)) {
    const resolved = await resolveEnsAddress(typed.toLowerCase());
    if (!resolved || !WALLET_ADDRESS.test(resolved)) notFound();
    redirect(`${polarisPethAccountHref(resolved)}${rest}`);
  }
  if (!WALLET_ADDRESS.test(typed)) notFound();
  const address = typed.toLowerCase();
  if (address !== raw) redirect(`${polarisPethAccountHref(address)}${rest}`);
  return address;
}

/** The address the URL names, for metadata: no resolve, no redirect. */
export function pethAddressForMetadata(raw: string): string | null {
  const typed = decodeURIComponent(raw).trim();
  return WALLET_ADDRESS.test(typed) ? typed.toLowerCase() : null;
}
