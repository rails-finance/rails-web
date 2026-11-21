"use client";

// A wallet search's other position kinds — under a listing searched by wallet,
// the wallet's positions of each kind the listing does not list (its Stability
// Pool deposit under its Troves; rails-ops TO-DO-stability-pool-deposits §1b).
//
// Each kind reads its own listing route for the wallet: every status, newest
// first, one page. The section shows the first HOLDER_KIND_SHOWN cards and
// links "See all N" to that kind's listing with the same `?q`. The same read
// feeds the holder strip above the rows, so the band counts the wallet across
// kinds from the rows a page holds and fetches nothing of its own.
//
// A family declares its kinds once (`lib/<family>/holder-kinds.tsx`); each of
// its listings passes the kinds it does not list.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ListingRowLink } from "@/components/shared/chain-truth-listing";
import { parseListingSearch, resolveEnsViaApi } from "@/lib/shared/listing-search";
import { FOOT_LINK } from "@/lib/shared/ui-grammar";

/** Cards a section shows before its "See all" link. */
const HOLDER_KIND_SHOWN = 10;

/** One page of a kind's rows for the wallet. */
export interface HolderKindPage<R> {
  rows: R[];
  total: number;
  /** Of `total`, the positions the wallet passed on to another (Liquity V2's
   *  formerHold, ui-jobs 705), which the strip leaves out of its count. */
  passedOn?: number;
}

/** One position kind of a family, as a wallet search reads and draws it. */
export interface HolderKind<R> {
  /** Stable machine name ("trove", "deposit"): the read's key and the
   *  section's `data-holder-kind`. */
  id: string;
  /** The section's heading, the kind's listing noun ("Stability Pool deposits"). */
  heading: string;
  /** The kind's listing, which "See all" opens with the same `?q`. */
  listingPath: string;
  /** Every status, newest first, one page of the kind's listing. */
  read: (wallet: string, signal: AbortSignal) => Promise<HolderKindPage<R>>;
  renderCard: (row: R) => ReactNode;
  hrefFor: (row: R) => string;
  keyFor: (row: R) => string;
}

/** A kind with its row type left behind, for a list of kinds of mixed rows. */
export type AnyHolderKind = HolderKind<never>;
export const holderKind = <R,>(k: HolderKind<R>): AnyHolderKind => k as unknown as AnyHolderKind;

/** What the reads have answered, by kind id; absent while in flight. */
export type HolderKindReads = Record<string, HolderKindPage<unknown> | "failed" | undefined>;

/** Read each kind for the wallet the search names (an address, or an ENS name
 *  resolved first). Empty for a query that names no wallet. */
export function useHolderKinds(kinds: AnyHolderKind[], q: string): { wallet: string | null; reads: HolderKindReads } {
  const search = parseListingSearch(q, false);
  const named = search.kind === "address" ? search.address : search.kind === "ens" ? search.name : null;
  const ids = kinds.map((k) => k.id).join(",");
  const [state, setState] = useState<{ named: string | null; wallet: string | null; reads: HolderKindReads }>({
    named: null,
    wallet: null,
    reads: {},
  });

  useEffect(() => {
    if (!named) return;
    const ctrl = new AbortController();
    (async () => {
      const wallet = named.startsWith("0x")
        ? named
        : ((await resolveEnsViaApi(named, undefined, ctrl.signal))?.toLowerCase() ?? null);
      if (ctrl.signal.aborted) return;
      if (!wallet) {
        setState({ named, wallet: null, reads: {} });
        return;
      }
      setState({ named, wallet, reads: {} });
      for (const k of kinds) {
        k.read(wallet, ctrl.signal).then(
          (page) => !ctrl.signal.aborted && setState((s) => ({ ...s, reads: { ...s.reads, [k.id]: page } })),
          () => !ctrl.signal.aborted && setState((s) => ({ ...s, reads: { ...s.reads, [k.id]: "failed" } })),
        );
      }
    })();
    return () => ctrl.abort();
    // `kinds` is a module constant per listing; its ids stand for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [named, ids]);

  // A state left from an earlier search is not this one's.
  return named && state.named === named ? { wallet: state.wallet, reads: state.reads } : { wallet: null, reads: {} };
}

/** The sections under the rows: one per kind the wallet holds any of. */
export function HolderKinds({ kinds, reads, q }: { kinds: AnyHolderKind[]; reads: HolderKindReads; q: string }) {
  const shown = kinds.flatMap((k) => {
    const page = reads[k.id];
    return page && page !== "failed" && page.total > 0 ? [{ k, page: page as HolderKindPage<never> }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <div className="mt-10 flex flex-col gap-10">
      {shown.map(({ k, page }) => (
        <section key={k.id} data-holder-kind={k.id} data-anatomy="N7.3">
          <h2 className="mb-3 text-lg font-semibold">
            {k.heading}
            <span className="ml-2 font-normal text-rb-500 tabular-nums">{page.total.toLocaleString("en-US")}</span>
          </h2>
          <div className="flex flex-col gap-3">
            {page.rows.slice(0, HOLDER_KIND_SHOWN).map((row) => (
              <div key={k.keyFor(row)}>
                <ListingRowLink href={k.hrefFor(row)}>{k.renderCard(row)}</ListingRowLink>
              </div>
            ))}
          </div>
          {page.total > HOLDER_KIND_SHOWN && (
            <Link
              href={`${k.listingPath}?q=${encodeURIComponent(q.trim())}`}
              className={`mt-3 inline-block text-sm ${FOOT_LINK}`}
              data-holder-kind-all=""
            >
              See all {page.total.toLocaleString("en-US")}
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}
