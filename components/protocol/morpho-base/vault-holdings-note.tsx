"use client";

// The wallet page's one line about MetaMorpho vault SHARES the address holds —
// as opposed to `vaultNote` on the same page (lib/morpho-base/vault-owner-note.ts),
// which states when the address itself IS a catalogued vault. Both read the
// same 505-row census; this one reads it from the other end, the same
// direction the retired find door did.
// ----------------------------------------------------------------------------
// MILES'S CONDITION: a regular wallet page must not get slower. The wallet
// page's SSR (app/(app)/base/morpho/[wallet]/page.tsx) already states
// `vaultNote` from a server-side catalog lookup — zero chain reads, zero cost.
// Whether the SAME address also HOLDS shares of some OTHER catalogued vault is
// a question only the chain answers (`balanceOf` on 505 vaults), and adding
// that read to the server render would put it on every wallet page's TTFB,
// including the overwhelming majority that hold nothing. So this component
// mounts on the client and asks after paint: the ONE place a wallet-page view
// makes a chain read on the viewer's behalf, and it is exactly two Multicall3
// requests (GET .../holder-exposure?summary=1 → loadMorphoBaseHolderSummary,
// which runs the balance sweep alone — see that loader's header). None of it
// touches the server render, so a wallet holding nothing pays a client-side
// fetch and paints nothing extra; the SSR HTML never contains this line.
//
// NOTHING RENDERS while loading, on error, or when nothing is held — no
// skeleton, no "checking" text. A wallet with nothing to say here should not
// look like it is waiting on anything.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MorphoBaseHolderSummaryResponse } from "@/lib/sources/chain/morpho-base-holder-exposure";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";

interface VaultHoldingsNoteProps {
  /** Lowercased address — the wallet page's own subject. Never a catalogued
   *  vault's own address: the page checks that server-side (`vaultNote`) and
   *  renders its own note instead of mounting this one. */
  wallet: string;
}

export function VaultHoldingsNote({ wallet }: VaultHoldingsNoteProps) {
  const [held, setHeld] = useState<MorphoBaseHolderSummaryResponse["held"] | null>(null);
  const [block, setBlock] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chain/morpho-base/holder-exposure?holder=${wallet}&summary=1`, {
          cache: "no-store",
        });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as MorphoBaseHolderSummaryResponse & { error?: string };
        if (cancelled || data.error || data.chainStale) return;
        setHeld(data.held);
        setBlock(data.blockNumber);
      } catch {
        // Silent: this line is a bonus statement, never a state the rest of
        // the page's render depends on.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (!held || held.length === 0 || block == null) return null;

  return (
    <p className="text-[12px] text-rb-500">
      This address holds shares of {held.length} MetaMorpho vault{held.length === 1 ? "" : "s"} at block{" "}
      {block.toLocaleString("en-US")}: {held.map((v) => v.name).join(", ")}.
    </p>
  );
}
