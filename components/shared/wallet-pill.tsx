"use client";

// Shared wallet identity pill — facehash + ENS-or-shortaddr label + copy
// button. Rides `leadingIdentity` on position cards (Aave V4's listing and
// detail cards, the V3/Spark detail cards) so the address presentation is one
// component across surfaces. The `vault` prop is Morpho Base's own slot on
// the same pill: a catalogued MetaMorpho vault names itself instead of
// resolving ENS, and links to its own exposure page instead of a
// wallet-filtered listing.

import { useState } from "react";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { Facehash } from "@/components/shared/facehash";
import { Icon } from "@/components/icons/icon";
import { BookmarkToggle } from "@/components/shared/bookmark-toggle";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import type { BookmarkScope, SessionProtocol } from "@/lib/shared/sessions";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletPill({
  wallet,
  ensName,
  filterProtocol,
  bookmarkProtocol,
  bookmarkListing,
  vault,
}: {
  wallet: string;
  ensName: string | null;
  /** When set, the address label becomes a clickable link to that protocol's
   *  wallet-filtered listing (the URL is derived from one place via
   *  `listingHrefForWallet`, so a new explorer can't ship a dead pill). Rendered
   *  as a <button> (not <a>) with router.push so it works even when the listing
   *  card wraps the whole row in a Next <Link> — a nested anchor would be invalid
   *  HTML. Both the listing card and the detail card pass it. */
  filterProtocol?: SessionProtocol;
  /** When set, a bookmark toggle renders after the copy button. The bookmark
   *  keys off the WALLET (not the position), so the address pill is its one
   *  home — listing and detail cards both pass it; the card's top-right meta
   *  cluster never carries it. A chain's vault SECTION scope is accepted here
   *  too: a vault position card bookmarks into `vaults` / `vaults-base`, which
   *  is a namespace rather than a roster entry (rails-ops decision 0017). */
  bookmarkProtocol?: BookmarkScope;
  /** WHICH of that scope's listings this pill sits on — the sub-page segment,
   *  recorded on the bookmark so it reopens where it was taken (§42 item 1).
   *  Omitted on an explorer's own listing. */
  bookmarkListing?: string;
  /** Set when this address is a catalogued MetaMorpho vault (Morpho Base
   *  only): its name at census (a label, not an identity claim — see
   *  lib/morpho-base/vault-catalog.ts) and its own exposure page. This wins
   *  over `ensName` and over `filterProtocol`'s link: the address is a pool,
   *  not a person, so the label names the vault and the click goes to the
   *  vault's own page rather than a wallet-filtered listing. The hex stays
   *  reachable — the tooltip states it, and the copy button still copies it. */
  vault?: { name: string; href: string } | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const href = vault ? vault.href : filterProtocol ? listingHrefForWallet(filterProtocol, wallet) : null;
  // A name is the primary label for an EOA wherever one exists. Nearly every
  // call site passes `ensName={null}` — only Aave V4's listing carries a
  // backend-supplied name — so the pill resolves its own rather than leaving
  // every other explorer showing hex. A passed name still wins: it arrives
  // with the server render, so preferring it avoids a hydration-time swap.
  //
  // Lookups are batched per tick and cached for the session, so a listing of
  // ~20 pills costs one round trip. Reverse resolution goes through the
  // mainnet Universal Resolver, which round-trips the name back to the address
  // — a rendered name is chain-verified to belong to that address, which is
  // why this is safe in a way a guessed label would not be. A vault's address
  // skips the lookup entirely: the catalog already names it, and a contract
  // resolving an unrelated ENS name would only confuse the two.
  const resolved = useEnsName(ensName || vault ? null : wallet);
  const name = vault ? vault.name : (ensName ?? resolved);
  const label = name ?? shortAddr(wallet);
  // Mono is for HEX — it exists so an address can be scanned character by
  // character, and every `shortAddr` is exactly 11 of them, which is what makes
  // a column of addresses read as a column. A name is a word: setting it in the
  // same face gives a 21-character `…-bot.eth` roughly twice the width of its
  // neighbours and visibly breaks that column. So a name drops to the UI face
  // (matching `ExternalActorChip`, which never set a name in mono) and is capped
  // near the hex width, keeping the right edge stable however long the name is.
  // The alternative — suppressing sparse names for uniformity — would hide a
  // chain-verified fact because it is rare, and would make the same wallet
  // render differently depending on who else is on the page.
  const labelClass = name ? "inline-block max-w-[15ch] truncate align-bottom text-rb-500" : "font-mono text-rb-500";
  const copy = () => {
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <Facehash address={wallet} size={16} />
      <span className="inline-flex items-center gap-1 text-xs text-rb-500">
        {href ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              startNavigationProgress(href);
              router.push(href);
            }}
            aria-label={vault ? `Open vault ${label}` : `Filter positions by wallet ${label}`}
            // A name is a convenience layer OVER the address, never a
            // replacement: the hex stays one hover away here, on the copy
            // button's clipboard payload, and in the receipt. The name joins it
            // in the tooltip because the label above may be truncated, and a
            // clipped name with no way to read it in full would be worse than
            // the hex it replaced.
            title={vault ? `${vault.name} — a MetaMorpho vault · ${wallet}` : name ? `${name} · ${wallet}` : undefined}
            // Structural hook for the identity itself, so a check can find the
            // label and ask whether it resolved without keying on the typeface
            // — `verify-ens-pills.mjs` selected on `.font-mono` and therefore
            // stopped counting the named pills the moment names left mono.
            data-wallet-label={vault ? "vault" : name ? "name" : "address"}
            // The vault's own href, restated as data so a check can read where
            // this pill points without navigating — the click itself (via
            // router.push above) is what a viewer actually triggers.
            data-vault-href={vault ? vault.href : undefined}
            className={`${labelClass} hover:text-blue-500 transition-colors cursor-pointer`}
          >
            {label}
          </button>
        ) : (
          <span
            className={labelClass}
            data-wallet-label={name ? "name" : "address"}
            title={name ? `${name} · ${wallet}` : undefined}
          >
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            // Stop the parent link/click handler from firing when the copy
            // button is the actual target — this lets the pill live inside a
            // listing-card <Link> without navigating on every copy.
            e.preventDefault();
            e.stopPropagation();
            copy();
          }}
          aria-label={copied ? "Copied address" : "Copy address"}
          title={copied ? "Copied!" : "Copy"}
          className="text-rb-500 hover:text-foreground cursor-pointer"
        >
          <Icon name={copied ? "check" : "copy"} size={12} />
        </button>
        {bookmarkProtocol && (
          <BookmarkToggle
            wallet={wallet}
            ensName={name}
            protocol={bookmarkProtocol}
            listing={bookmarkListing}
            size={12}
          />
        )}
      </span>
    </span>
  );
}
