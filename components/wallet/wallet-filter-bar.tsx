"use client";

// The wallet page's filter bar (W8, ui-jobs 738): the listings' toolbar (N1)
// with no search, a Protocol pill and a Kind pill. Choosing a protocol opens
// the page for that protocol alone, which reads it alone; the Kind pill
// narrows the cards already read.

import { useRouter } from "next/navigation";
import { ListToolbar } from "@/components/shared/filter-bar/list-toolbar";
import {
  kindDimension,
  protocolDimension,
  walletHref,
  walletProtocol,
  WALLET_KINDS,
  type WalletKind,
  type WalletPillFilters,
  type WalletProtocolCount,
} from "@/lib/wallet/wallet-filters";

export function WalletFilterBar({
  address,
  protocol,
  held,
  kinds,
  setKinds,
  shown,
}: {
  address: string;
  protocol?: string;
  held: WalletProtocolCount[];
  kinds: WalletKind[];
  setKinds: (k: WalletKind[]) => void;
  /** The positions drawn under the selection. */
  shown: number;
}) {
  const router = useRouter();
  // The kinds on offer: the chosen protocol's where it holds more than one,
  // every kind the held protocols hold otherwise.
  const offered = protocol
    ? (walletProtocol(protocol)?.kinds ?? [])
    : WALLET_KINDS.map((k) => k.value).filter((k) => held.some((h) => walletProtocol(h.slug)?.kinds.includes(k)));
  const dims = [
    protocolDimension<WalletPillFilters>(held),
    ...(offered.length > 1 ? [kindDimension<WalletPillFilters>(offered)] : []),
  ];
  const filters: WalletPillFilters = { q: "", sortBy: "risk", sortOrder: "asc", protocol, kinds };
  return (
    <div data-wallet-filters="" data-anatomy="W8" data-prov-exempt="" className="-mb-6">
      <ListToolbar<WalletPillFilters>
        dimensions={dims}
        filters={filters}
        search={false}
        sortOptions={[]}
        count={{ total: shown, noun: "positions" }}
        onChange={(next) => {
          if (next.protocol !== protocol) {
            router.push(walletHref(address, next.protocol, next.kinds as WalletKind[]), { scroll: false });
            return;
          }
          const k = next.kinds as WalletKind[];
          setKinds(k);
          window.history.replaceState(null, "", walletHref(address, protocol, k));
        }}
      />
    </div>
  );
}
