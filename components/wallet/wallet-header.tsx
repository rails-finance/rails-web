"use client";

// The wallet page's heading (W1) under Back's row (H7), drawn by the wallet
// view (wallet-view.tsx).

import type { ReactNode } from "react";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { WalletHeading } from "@/components/shared/wallet-heading";
import { WalletMenu } from "@/components/shared/wallet-menu";
import { PROFILE_CLEARANCE } from "@/lib/shared/ui-grammar";

export function WalletHeader({
  address,
  ensName,
  lines,
  end,
}: {
  address: string;
  ensName: string | null;
  lines?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <header data-anatomy="W1">
      {/* Back's row, as a detail page draws it (H7): the column's first
          line, level with the profile control (H20) at the top right from
          md. With no history Back opens the home page. */}
      <div className={`flex min-h-[38px] items-center ${PROFILE_CLEARANCE}`} data-anatomy="H7" data-back-row="">
        <DetailBackButton fallbackHref="/" />
      </div>
      <WalletHeading
        address={address}
        className="mt-6"
        // The address menu a position page draws (ui-jobs 430): Copy the
        // address and Bookmark it; no View wallet on the wallet view.
        title={<WalletMenu wallet={address} ensName={ensName} heading view={false} />}
        lines={lines}
        end={end}
      />
    </header>
  );
}
