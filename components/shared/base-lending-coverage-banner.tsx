"use client";

// How complete a Base lending listing is — stated, not assumed.
//
// A Base lending listing's account set comes from a history backfill on the
// Base box that may still be running, and each account's balances come from a
// chain sweep that reads a budget per tick; until both have finished, a
// listing that looked whole would be claiming a census it does not yet have.
// So the coverage row is fetched on mount (independently of the first page
// fetch, so the statement never depends on that having succeeded) and
// rendered on the explorer's /info page in one of three states: complete, backfill still
// walking (with the block it has reached), or accounts still unread (with the
// count). One copy, shared by every Base lender with a listing.

import { useEffect, useState } from "react";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";

/** `undefined` while loading, `null` when the row could not be read. */
/**
 * How complete a Base lending lane is.
 *
 * `initial` seeds the value from a server render, for a page that read the
 * coverage row before it replied. Seeded, the hook makes no request at all —
 * the figure is already on the page. Omitted (every listing), it behaves as it
 * always has: `undefined` until the read lands, then the row or `null`.
 *
 * The three states are distinct on purpose and the callers read them: undefined
 * is "not known yet", null is "we asked and could not tell".
 */
export function useBaseLendingCoverage(
  route: string,
  initial?: BaseLendingCoverage | null,
): BaseLendingCoverage | null | undefined {
  const [coverage, setCoverage] = useState<BaseLendingCoverage | null | undefined>(initial);
  const seeded = initial !== undefined;
  useEffect(() => {
    if (seeded) return;
    let alive = true;
    fetch(route, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setCoverage((j?.coverage as BaseLendingCoverage | null) ?? null))
      .catch(() => alive && setCoverage(null));
    return () => {
      alive = false;
    };
  }, [route, seeded]);
  return coverage;
}

/** Self-fetching variant for the /info pages, which have no listing hook call
 *  to borrow `c` from — the same banner, fed by its own read of `route`. */
export function BaseLendingCoverageNote({
  route,
  ...banner
}: { route: string } & Omit<Parameters<typeof BaseLendingCoverageBanner>[0], "c">) {
  const c = useBaseLendingCoverage(route);
  return <BaseLendingCoverageBanner c={c} {...banner} />;
}

export function BaseLendingCoverageBanner({
  c,
  unreadListed = true,
  subject = "this Pool",
  subjectPossessive = "the Pool\u2019s",
  noun = "account",
}: {
  c: BaseLendingCoverage | null | undefined;
  /** Whether an account the chain sweep has not read yet appears in the list
   *  (the Aave lenders list it with its history and no current position) or
   *  is held back until read (the Comet lane, whose status needs the read). */
  unreadListed?: boolean;
  /** The contract whose history the backfill walks, as the sentence names it
   *  — "this Pool" for the Aave lenders (the default), "the singleton" for
   *  Morpho Blue, where a Pool would be the wrong noun. */
  subject?: string;
  subjectPossessive?: string;
  /** What a row is — an account (a wallet) or, on a per-market lane, a position. */
  noun?: string;
}) {
  if (c === undefined) return null;
  if (c === null) {
    return (
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        Rails could not read how complete the {noun}s listing is right now, so treat it as partial.
      </p>
    );
  }
  const unread = Math.max(0, c.accountsTotal - c.accountsRead);
  const pctHistory =
    c.backfillNextBlock != null && c.backfillTo != null
      ? Math.min(100, Math.max(0, ((c.backfillNextBlock - c.deployBlock) / (c.backfillTo - c.deployBlock)) * 100))
      : null;
  const nouns = `${noun}s`;
  const Nouns = nouns.charAt(0).toUpperCase() + nouns.slice(1);
  if (c.historyComplete && unread === 0) {
    return (
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        Every {noun} that ever touched {subject} is listed — {c.accountsTotal.toLocaleString("en-US")} of them, from{" "}
        {subjectPossessive} first block — and each one&rsquo;s balances were read from the chain at the block its row
        names.
      </p>
    );
  }
  return (
    <div className="mt-3 max-w-3xl rounded-xl bg-raised p-4 text-[13px] leading-relaxed">
      <p className="font-medium text-foreground">The {noun}s listing is still being assembled.</p>
      <p className="mt-1 text-rb-500">
        {!c.historyComplete && (
          <>
            Rails is reading {subjectPossessive} history from its first block and has reached block{" "}
            {(c.backfillNextBlock ?? c.deployBlock).toLocaleString("en-US")}
            {pctHistory != null
              ? ` (${pctHistory.toFixed(0)}% of the way to where the live index takes over)`
              : ""}. {Nouns} whose only activity lies between that block and the live index&rsquo;s start are not listed
            yet.{" "}
          </>
        )}
        {unread > 0 && (
          <>
            {unread.toLocaleString("en-US")} of the {c.accountsTotal.toLocaleString("en-US")} {nouns} found so far have
            not had their balances read from the chain yet;{" "}
            {unreadListed
              ? "they are listed with their history but no current position."
              : "they are not listed until they have been."}
          </>
        )}
      </p>
    </div>
  );
}
