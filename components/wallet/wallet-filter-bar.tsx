"use client";

// The wallet page's filter bar (W8, ui-jobs 738): the listings' toolbar (N1)
// with no search, a Protocol pill, a Status pill and a Kind pill, each drawn
// where it offers more than one option. Choosing a protocol opens the page for
// that protocol alone, which reads it alone (the page dims while it reads,
// `navigate`); Status and Kind narrow the cards already read.

import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import {
  kindDimension,
  protocolDimension,
  statusDimension,
  walletHref,
  type WalletKind,
  type WalletPillFilters,
  type WalletProtocolCount,
  type WalletStatus,
} from "@/lib/wallet/wallet-filters";

export function WalletFilterBar({
  address,
  protocol,
  held,
  statuses,
  offered,
  kinds,
  setKinds,
  status,
  setStatus,
  shown,
  countFor,
  navigate,
}: {
  address: string;
  protocol?: string;
  held: WalletProtocolCount[];
  /** The statuses the positions read take: the Status pill's options. */
  statuses: WalletStatus[];
  /** The kinds the positions read take: the Kind pill's options. */
  offered: WalletKind[];
  kinds: WalletKind[];
  setKinds: (k: WalletKind[]) => void;
  status?: WalletStatus;
  setStatus: (s: WalletStatus | undefined) => void;
  /** The positions drawn under the selection. */
  shown: number;
  /** The positions a staged Status and Kind would draw, from the cards read. */
  countFor: (kinds: WalletKind[], status: WalletStatus | undefined) => number;
  /** Opens another URL of the page, under a transition. */
  navigate: (href: string) => void;
}) {
  // A pill with one option chooses nothing and is left out, whatever the URL
  // chose (Miles, 21 Nov 2026); with none left, the bar is.
  const dims = [
    ...(held.length > 1 ? [protocolDimension<WalletPillFilters>(held)] : []),
    ...(statuses.length > 1 ? [statusDimension<WalletPillFilters>()] : []),
    ...(offered.length > 1 ? [kindDimension<WalletPillFilters>(offered)] : []),
  ];
  if (dims.length === 0) return null;
  const filters: WalletPillFilters = { q: "", sortBy: "risk", sortOrder: "asc", protocol, kinds, status };
  return (
    <div data-wallet-filters="" data-anatomy="W8" data-prov-exempt="" className="-mb-6">
      <ListToolbar<WalletPillFilters>
        dimensions={dims}
        filters={filters}
        search={false}
        sortOptions={[]}
        count={{ total: shown, noun: "positions" }}
        // "Show 2 positions" for a staged Status or Kind (ui-jobs 801). A
        // staged protocol is another read, so the button reads "Apply".
        countFor={(draft) =>
          draft.protocol === protocol
            ? countFor(draft.kinds as WalletKind[], draft.status as WalletStatus | undefined)
            : Promise.reject(new Error("unread"))
        }
        onChange={(next) => {
          const k = next.kinds as WalletKind[];
          const s = next.status as WalletStatus | undefined;
          if (next.protocol !== protocol) {
            navigate(walletHref(address, next.protocol, k, s));
            return;
          }
          setKinds(k);
          setStatus(s);
          window.history.replaceState(null, "", walletHref(address, protocol, k, s));
        }}
      />
    </div>
  );
}
