"use client";

// The line under the wallet row (H13.2; rails-ops decisions/0050 point 10,
// decisions/0051 step 3): what else Rails holds for the address, linking to
// the wallet view. Read after mount from /api/chain/wallet/<address>/summary,
// so the page's render does not wait on it; nothing is drawn while it loads,
// when it fails, or when there is nothing else. The page's own position is
// left out when a row's page is this one; otherwise the line counts every
// position "across Rails".

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CARD_INSET_START } from "@/lib/shared/ui-grammar";
import { rowIsPage, walletLineText, type WalletCounts } from "@/lib/wallet/summary-counts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// One read per address per page load; the route keeps its answer 60 s.
const reads = new Map<string, Promise<WalletCounts | null>>();

function readCounts(address: string): Promise<WalletCounts | null> {
  let read = reads.get(address);
  if (!read) {
    read = fetch(`/api/chain/wallet/${address}/summary`)
      .then((r) => (r.ok ? (r.json() as Promise<WalletCounts>) : null))
      .catch(() => null);
    reads.set(address, read);
    void read.then((c) => {
      if (!c) reads.delete(address);
    });
  }
  return read;
}

export function WalletElsewhereLine({ wallet }: { wallet: string }) {
  const pathname = usePathname();
  const address = wallet.toLowerCase();
  const [line, setLine] = useState<{ text: string; matched: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    setLine(null);
    if (!ADDRESS.test(address)) return;
    readCounts(address).then((c) => {
      if (!live || !c || c.error) return;
      const search = window.location.search;
      const rest = c.positions.filter((p) => !rowIsPage(p.href, pathname, search));
      const matched = rest.length < c.positions.length;
      const text = walletLineText(rest, matched);
      setLine(text ? { text, matched } : null);
    });
    return () => {
      live = false;
    };
  }, [address, pathname]);
  if (!line) return null;
  return (
    <p
      className={`mt-1 text-xs text-rb-500 ${CARD_INSET_START}`}
      data-anatomy="H13.2"
      data-wallet-elsewhere={line.matched ? "others" : "all"}
    >
      <Link
        href={`/wallet/${address}`}
        prefetch={false}
        className="rounded-sm underline-offset-2 transition-colors hover:text-foreground hover:underline focus-ring"
      >
        {line.text}
      </Link>
    </p>
  );
}
