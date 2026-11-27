// The Polaris rows of a position page's address menu (H13.6; ui-jobs 865):
// the holder's pETH account, and on the deposit and loan pages the listing
// searched by the holder, which the address pill linked to before the menu
// took its place.

import { Coins, ListFilter } from "lucide-react";
import type { WalletMenuItem } from "@/components/shared/wallet-menu";
import { polarisPethAccountHref } from "@/lib/polaris/routes";

export function polarisOwnerMenuItems(
  wallet: string | null | undefined,
  listing?: { href: string; title: string; subtitle: string },
): WalletMenuItem[] | undefined {
  if (!wallet) return undefined;
  return [
    {
      key: "peth-account",
      icon: <Coins size={16} />,
      title: "pETH account",
      subtitle: "This wallet's pETH on Polaris",
      href: polarisPethAccountHref(wallet),
    },
    ...(listing ? [{ key: "listing", icon: <ListFilter size={16} />, ...listing }] : []),
  ];
}
