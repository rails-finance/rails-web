// The /vaults overview's questions (E6.4; rails-ops ui-jobs 782), at the
// foot of the page: a disclosure row per question, closed on arrival. What a
// vault is and how Rails covers vaults moved here from the overview's intro.
// The wallet answer names no wallet-page lookup: the wallet page lists no
// vault shares yet (ui-jobs 783).

import Link from "next/link";
import type { ReactNode } from "react";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { COMPARE_HREF } from "@/lib/vaults/compare";
import { FRONTS_HREF, PRODUCTS_HREF } from "@/lib/vaults/routes";

function Question({ id, q, children }: { id: string; q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-rb-200 dark:border-rb-700" data-vault-faq-item={id}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-semibold text-foreground hover:text-blue-600 dark:hover:text-[var(--text-link)] [&::-webkit-details-marker]:hidden">
        <span className="inline-block w-3 text-rb-500 transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {q}
      </summary>
      <div className="space-y-3 pb-4 pl-5 text-sm leading-relaxed text-foreground">{children}</div>
    </details>
  );
}

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className={INLINE_LINK} prefetch={false}>
    {children}
  </Link>
);

export function VaultFaq() {
  return (
    <section className="mt-10 max-w-3xl" aria-labelledby="vault-faq" data-anatomy="E6.4" data-vault-faq="">
      <h2 id="vault-faq" className="mb-2 text-base font-semibold text-foreground">
        Questions about vaults
      </h2>
      <Question id="what" q="What is a vault?">
        <p>
          A vault is a contract that takes deposits of one token and issues shares for them. Its steward or its code
          puts the token to work, lending it or depositing it in other protocols, and each share redeems for more of the
          token as that work earns. A holder can redeem as much as the vault can pay out at the time.
        </p>
      </Question>
      <Question id="coverage" q="How does Rails cover vaults?">
        <p>The list below names what Rails shows of each vault, all read from the chain.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The roster lists every vault of a family on a chain, with each vault&rsquo;s total assets and share price,
            read at one block.
          </li>
          <li>The vault page shows the vault&rsquo;s size, yield, withdrawals and losses.</li>
          <li>
            Holders lists every address holding a share, from a census of the vault&rsquo;s transfers, for the families
            Rails takes a census of.
          </li>
          <li>The steward is who can change the vault, and the page lists what they have changed.</li>
          <li>Where the assets are names the markets, strategies or pools the token sits in.</li>
          <li>Every figure carries a receipt: the contract it was read from and the block.</li>
        </ul>
        <p>
          Each family&rsquo;s roster is read at a block of its chain, so each family card at the top of this page states
          its count at that block and how old the read is.
        </p>
      </Question>
      <Question id="fronts" q="I opened a vault through Coinbase, Kraken or another app. Can I see it on Rails?">
        <p>
          <A href={FRONTS_HREF}>Vault fronts</A> lists the apps that publish which vault sits behind a product, each
          cited to the app&rsquo;s page. A row names the chain, the vault, where the position sits, and whether Rails
          reads that vault.
        </p>
        <p>
          Where the position sits in your wallet and Rails reads the vault, open the vault from its row. Where its
          Holders figure is a link, it opens the addresses that held the vault at the last census, yours among them if
          you held a share then. Where the position sits at the app&rsquo;s pooled address, that address holds the
          shares for the app&rsquo;s customers together.
        </p>
      </Question>
      <Question id="compare" q="How do I compare vaults?">
        <p>
          <A href={COMPARE_HREF}>Compare vaults</A> puts two to four vaults side by side. Search for each by name,
          symbol or address, from any family or chain, and the page shows where they differ, then each vault&rsquo;s
          full record.
        </p>
        <p>
          <A href={PRODUCTS_HREF}>Vault products</A> compares the families: how each redeems a deposit, who can change
          its vaults, what waits and what it charges.
        </p>
      </Question>
    </section>
  );
}
