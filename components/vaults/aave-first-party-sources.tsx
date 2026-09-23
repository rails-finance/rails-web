"use client";

// "Aave's own pages" — the venue's own citations, under the vault reading.
// ----------------------------------------------------------------------------
// The Base directory answers "I don't know my address" with a grid of provider
// tiles, one per app the Base chain record identifies as holding shares of a
// catalogued vault. This section's first answer to the same question is
// different in kind, because the venue publishes the vaults itself: the block
// below cites AAVE'S OWN DOCUMENTATION for the three families, and says plainly
// what a citation is and is not.
//
// THE TWO SENTENCES THIS BLOCK EXISTS TO CARRY (rails-ops plan §7, §4B):
//
//  1. A holder in this section is the holder's own wallet address, and the
//     section names no app on any row. On Base that sentence would be false —
//     the catalogued vaults there are held by wallet contracts an app deployed,
//     which is what earns those apps a tile. Here there is nothing of the sort
//     in the record, so the sentence is worth saying out loud.
//  2. Rails states a reading for any address; Aave's own surfaces can only be
//     pointed at one by hand, because they carry no per-address route. That is a
//     FACT ABOUT LINKABILITY, measured from Aave's own front-end source: the app
//     has a read-only "watch wallet" mode, but the watched address lives in
//     `localStorage` and no query parameter or route carries it. It is said as a
//     fact and never as a comparison claim — no "better", no "unlike".
//
// NOT A TILE, AND NOT A PROVIDER. This block draws no tile and names no app:
// `lib/shared/vault-providers.ts` gets no entry for Aave, because the tile rule's
// first prong asks the chain record to identify the app behind a holder and
// nothing on Ethereum does that for a connect-your-own-wallet front. The
// verifier asserts the absence rather than trusting the copy.

import { Prov } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { AAVE_FIRST_PARTY_FETCHED_ON, AAVE_FIRST_PARTY_SOURCES } from "@/lib/aave-vaults/first-party-sources";
import { aaveFirstPartySourcesProv } from "@/lib/aave-vaults/vault-provenance";

export function AaveFirstPartySources() {
  const fetchedOn = formatDate(AAVE_FIRST_PARTY_FETCHED_ON);
  return (
    <section className="mb-8" data-skel-section="first-party-sources" data-first-party-sources>
      <h2 className="text-sm font-semibold text-foreground">
        <Prov info={aaveFirstPartySourcesProv(AAVE_FIRST_PARTY_SOURCES.length, fetchedOn)}>Aave&rsquo;s own pages</Prov>
      </h2>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        The venue publishes these vaults itself, so what stands here is Aave&rsquo;s own documentation for the three
        families — cited, not summarised, and each page fetched on {fetchedOn}. It is a citation and not an attribution:
        a holder in this section is the holder&rsquo;s own wallet address, and the section names no app on any row.
      </p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        Rails states a reading for any address, and the address rides in the URL. Aave&rsquo;s own surfaces can only be
        pointed at one by hand: the app carries a read-only watch mode that keeps the watched address in the
        browser&rsquo;s own storage, and the surfaces below have no per-address route.
      </p>
      <ul className="mt-3 max-w-3xl space-y-2 text-[12px] text-rb-500">
        {AAVE_FIRST_PARTY_SOURCES.map((source) => (
          <li key={source.url} data-first-party-source={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="link-external font-semibold">
              {source.label}
            </a>{" "}
            · {source.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
