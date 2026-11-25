"use client";

// The wallet page's heading (W1), drawn by the wallet view (wallet-view.tsx):
// the column's first row, as on a position page, with no Back. The
// dashboard is the trail's root, and a narrowed view's parent is in its
// positions menu.

import type { ReactNode } from "react";
import { WalletHeading } from "@/components/shared/wallet-heading";
import { WalletMenu } from "@/components/shared/wallet-menu";
import { PROFILE_CLEARANCE, WALLET_HEADING_NAME } from "@/lib/shared/ui-grammar";

export function WalletHeader({
  address,
  ensName,
  lines,
  end,
  narrowed = false,
}: {
  /** Null for a name that resolves to no address: the heading is the name,
   *  with no address menu. */
  address: string | null;
  ensName: string | null;
  /** The view is narrowed to one protocol: the facehash and the address
   *  menu's Wallet dashboard open the whole view. */
  narrowed?: boolean;
  lines?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <header data-anatomy="W1">
      <WalletHeading
        address={address}
        dashboard={narrowed && address ? `/wallet/${address}` : undefined}
        className={PROFILE_CLEARANCE}
        // The address menu a position page draws (ui-jobs 430): Copy the
        // address and Bookmark it; Wallet dashboard only where one protocol
        // narrows the view.
        title={
          address ? (
            <WalletMenu wallet={address} ensName={ensName} heading view={narrowed} />
          ) : (
            <h1 className={`${WALLET_HEADING_NAME} min-w-0 truncate`}>{ensName}</h1>
          )
        }
        lines={lines}
        end={end}
      />
    </header>
  );
}
