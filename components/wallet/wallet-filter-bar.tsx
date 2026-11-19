"use client";

// The wallet page's filter bar (W8, ui-jobs 738): the listings' toolbar (N1)
// with no search, a Protocol pill, a Status pill and a Kind pill. Choosing a
// protocol opens the page for that protocol alone, which reads it alone (the
// page dims while it reads, `navigate`); Status and Kind narrow the cards
// already read.

import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import {
  kindDimension,
  protocolDimension,
  statusDimension,
  walletHref,
  walletProtocol,
  WALLET_KINDS,
  type WalletKind,
  type WalletPillFilters,
  type WalletProtocolCount,
  type WalletStatus,
} from "@/lib/wallet/wallet-filters";

export function WalletFilterBar({
  address,
  protocol,
  held,
  kinds,
  setKinds,
  status,
  setStatus,
  shown,
  navigate,
}: {
  address: string;
  protocol?: string;
  held: WalletProtocolCount[];
  kinds: WalletKind[];
  setKinds: (k: WalletKind[]) => void;
  status?: WalletStatus;
  setStatus: (s: WalletStatus | undefined) => void;
  /** The positions drawn under the selection. */
  shown: number;
  /** Opens another URL of the page, under a transition. */
  navigate: (href: string) => void;
}) {
  // The kinds on offer: the chosen protocol's where it holds more than one,
  // every kind the held protocols hold otherwise.
  const offered = protocol
    ? (walletProtocol(protocol)?.kinds ?? [])
    : WALLET_KINDS.map((k) => k.value).filter((k) => held.some((h) => walletProtocol(h.slug)?.kinds.includes(k)));
  const dims = [
    protocolDimension<WalletPillFilters>(held),
    statusDimension<WalletPillFilters>(),
    ...(offered.length > 1 ? [kindDimension<WalletPillFilters>(offered)] : []),
  ];
  const filters: WalletPillFilters = { q: "", sortBy: "risk", sortOrder: "asc", protocol, kinds, status };
  return (
    <div data-wallet-filters="" data-anatomy="W8" data-prov-exempt="" className="-mb-6">
      <ListToolbar<WalletPillFilters>
        dimensions={dims}
        filters={filters}
        search={false}
        sortOptions={[]}
        count={{ total: shown, noun: "positions" }}
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
