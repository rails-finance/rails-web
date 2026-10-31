"use client";

// The line a slot the index fills draws when rails-server did not answer
// (rails-ops ui-jobs 461): the listing's rows, a position's history, the
// wallet's positions, the home page's stats, the vault index's rows. One
// component, so every slot words the outage the same way.
//
// Two forms. Where the chain filled the slot's figures, the line says so and
// offers nothing to press. Where nothing is shown, it offers Retry: the
// caller's own refetch where the slot has one, else a refresh of the server
// render. A read that answers with no rows keeps the slot's empty state; this
// line is only for a read that did not answer.

import { useRouter } from "next/navigation";

const RETRY =
  "text-foreground underline underline-offset-2 hover:text-rb-700 dark:hover:text-rb-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm";

export function IndexNotice({
  chainFilled = false,
  onRetry,
  className = "text-sm text-rb-500",
}: {
  /** The slot's figures were read from the chain: no Retry. */
  chainFilled?: boolean;
  /** The slot's own refetch; defaults to refreshing the server render. */
  onRetry?: () => void;
  className?: string;
}) {
  const router = useRouter();
  return (
    <p className={className} data-index-down={chainFilled ? "chain" : "empty"} data-anatomy="H17">
      {chainFilled ? (
        "The index did not answer; the figures below are read from the chain."
      ) : (
        <>
          The index did not answer.{" "}
          <button type="button" onClick={onRetry ?? (() => router.refresh())} className={RETRY}>
            Retry
          </button>
        </>
      )}
    </p>
  );
}
