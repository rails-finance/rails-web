"use client";

// B2.1, the line under a bookmark's name (rails-ops ui-jobs 492): each
// protocol the wallet has positions in, as its glyph with its open and closed
// counts, from lib/wallet/wallet-summary.ts. Each protocol a pill (Miles's
// design, 6 Nov 2026; ui-jobs 528): its glyph, the open count in the
// foreground, a hairline, the closed count muted; no words, the tooltip and a
// screen reader carry "1 open · 2 closed". Read when the row first comes
// into view, from the browser's kept summary while it is under its max age.
// A protocol holding one position links to that position's page; otherwise
// its glyph opens the wallet view.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { walletHref } from "@/components/shared/front-door-search";
import { CHAINS } from "@/lib/shared/chains";
import {
  keptWalletSummary,
  readWalletSummary,
  type WalletSummary,
  type WalletSummaryProtocol,
} from "@/lib/wallet/wallet-summary";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";

type State = { kind: "waiting" } | { kind: "failed" } | { kind: "read"; summary: WalletSummary };

/** Open ones first, then the most positions, then by name. */
function byHolding(a: WalletSummaryProtocol, b: WalletSummaryProtocol): number {
  if (a.open > 0 !== b.open > 0) return a.open > 0 ? -1 : 1;
  const n = b.open + b.closed - (a.open + a.closed);
  return n !== 0 ? n : a.name.localeCompare(b.name, "en-US");
}

const chainOf = (slug: WalletSummaryProtocol["chain"]) => Object.values(CHAINS).find((c) => c.slug === slug);

const PILL =
  "inline-flex h-7 items-center gap-2 rounded-md bg-rb-100 px-2 text-rb-500 tabular-nums transition-colors hover:bg-rb-200 focus-ring dark:bg-rb-800 dark:hover:bg-rb-700";

function Holding({ p, address }: { p: WalletSummaryProtocol; address: string }) {
  const chain = chainOf(p.chain);
  const counts = [p.open > 0 ? `${p.open} open` : null, p.closed > 0 ? `${p.closed} closed` : null]
    .filter(Boolean)
    .join(" · ");
  const label = `${p.name}${chain ? ` on ${chain.name}` : ""}: ${counts}`;
  return (
    <Link
      href={p.href ?? walletHref(address)}
      prefetch={false}
      className={PILL}
      title={label}
      data-bookmark-holding={`${p.chain}/${p.family}`}
      data-open={p.open}
      data-closed={p.closed}
    >
      <ProtocolIcon id={p.protocolId} className="h-4 w-4 shrink-0 [&:is(img)]:grayscale" />
      {chain && chain.slug !== "ethereum" && <ChainGlyph id={chain.id} className="h-3 w-3 shrink-0" />}
      <span className="inline-flex items-center gap-2" aria-hidden="true">
        {p.open > 0 && <span className="font-semibold text-foreground">{p.open}</span>}
        {p.open > 0 && p.closed > 0 && <span className="h-4 w-px bg-rb-300 dark:bg-rb-600" />}
        {p.closed > 0 && <span>{p.closed}</span>}
      </span>
      <span className="sr-only">{label}</span>
    </Link>
  );
}

export function BookmarkSummary({ address }: { address: string }) {
  const key = address.toLowerCase();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: "waiting" });

  const read = useCallback(() => {
    setState({ kind: "waiting" });
    readWalletSummary(key).then(
      (summary) => setState({ kind: "read", summary }),
      () => setState({ kind: "failed" }),
    );
  }, [key]);

  useEffect(() => {
    const kept = keptWalletSummary(key);
    if (kept) {
      setState({ kind: "read", summary: kept });
      return;
    }
    const el = ref.current;
    if (!el) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen.disconnect();
        read();
      }
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [key, read]);

  const protocols = state.kind === "read" ? Object.values(state.summary.protocols).sort(byHolding) : [];
  return (
    <div
      ref={ref}
      className="flex min-h-4 flex-wrap items-center gap-2 text-xs"
      data-anatomy="B2.1"
      data-bookmark-summary={state.kind === "read" ? (protocols.length > 0 ? "read" : "none") : state.kind}
    >
      {state.kind === "waiting" && (
        <span className="h-2.5 w-24 animate-pulse rounded-sm bg-rb-200 dark:bg-rb-800" aria-hidden="true" />
      )}
      {state.kind === "failed" && (
        <span className="text-rb-500">
          Positions couldn&apos;t be read.{" "}
          <button
            type="button"
            onClick={read}
            className={`cursor-pointer rounded-sm transition-colors focus-ring ${INPLACE_TEXT}`}
          >
            Retry
          </button>
        </span>
      )}
      {state.kind === "read" && protocols.length === 0 && <span className="text-rb-500">No positions found</span>}
      {protocols.map((p) => (
        <Holding key={`${p.chain}/${p.family}`} p={p} address={key} />
      ))}
    </div>
  );
}
