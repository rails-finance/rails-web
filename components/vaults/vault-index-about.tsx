// The /vaults About page's body (rails-ops ui-jobs 776): one row per family
// the index reads, its chains linking that family's vaults info page
// (vaultIndexInfoHref). The families are the index's listed rosters
// (VAULT_INDEX_LISTED): IPOR Fusion joins at its launch; a chain whose info
// page is unlaunched is named without a link.

import Link from "next/link";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import {
  chainName,
  VAULT_INDEX_PROTOCOL_LABEL,
  VAULT_INDEX_PROTOCOLS,
  VAULT_INDEX_LISTED,
  vaultIndexInfoHref,
} from "@/lib/vaults/index-rosters";

export function VaultIndexAbout() {
  // The rosters the index lists, so a family joins when it joins the index.
  const listed = VAULT_INDEX_LISTED();
  const families = VAULT_INDEX_PROTOCOLS.map((p) => ({
    protocol: p,
    chains: listed
      .filter((r) => r.protocol === p)
      .map((r) => ({ chainId: r.chainId, href: vaultIndexInfoHref(p, r.chainId) })),
  })).filter((f) => f.chains.length > 0);
  return (
    <div className="mt-6 max-w-3xl text-sm" data-vault-index-about="">
      <p className="text-rb-500">How Rails reads each family&rsquo;s vaults, on its info page:</p>
      <ul className="mt-3 divide-y divide-rb-200 dark:divide-rb-800">
        {families.map((f) => (
          <li key={f.protocol} className="flex flex-wrap items-baseline gap-x-4 py-2" data-about-family={f.protocol}>
            <span className="w-28 shrink-0 font-medium text-foreground">{VAULT_INDEX_PROTOCOL_LABEL[f.protocol]}</span>
            <span className="flex flex-wrap gap-x-3">
              {f.chains.map((c) =>
                c.href ? (
                  <Link
                    key={c.chainId}
                    href={c.href}
                    prefetch={false}
                    className={INLINE_LINK}
                    data-about-link={`${f.protocol}:${c.chainId}`}
                  >
                    {chainName(c.chainId)}
                  </Link>
                ) : (
                  <span key={c.chainId} className="text-rb-500" data-about-unlinked={`${f.protocol}:${c.chainId}`}>
                    {chainName(c.chainId)}
                  </span>
                ),
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
