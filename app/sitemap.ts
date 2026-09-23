import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/shared/page-metadata";
import { LAUNCHED_PROTOCOLS, isUnlaunchedPath, launchedChains } from "@/lib/shared/protocols";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { baseVaultHref, baseVaultRosterHref, ethereumVaultHref, ethereumVaultRosterHref } from "@/lib/vaults/routes";

// UNLAUNCHED EXPLORERS ARE NOT HERE. An explorer flagged `unlaunched` on the
// roster serves at its URL and is linked from nowhere, so naming it in the
// sitemap would hand a crawler the one door the site deliberately does not
// open (it also carries `robots: { index: false }`, which is the second half of
// the same statement). Every list below is therefore drawn from
// `LAUNCHED_PROTOCOLS` / `launchedChains()` rather than the whole roster, and
// the two vault legs ask `isUnlaunchedPath` about the roster entry they hang
// off — so an explorer rejoins this file by losing its flag, with no edit here.

/** The Ethereum vault pages — one per vault Aave's own enumerators name, asked
 *  of the chain rather than restated here, so a vault deployed tomorrow is in
 *  the sitemap the day after without an edit. The reading is cached for five
 *  minutes by the loader; a read that does not answer contributes NOTHING
 *  rather than a guess, because a sitemap that names a page which does not
 *  exist is worse than a sitemap that names fewer.
 *
 *  The POSITIONS are not listed and never will be: there are 11,837 of them on
 *  this chain, they change daily, and the listing above them is the page a
 *  crawler should find. */
async function ethereumVaultPages(): Promise<MetadataRoute.Sitemap> {
  // The layer's own explorer is unlaunched: no vault page under it is named
  // here, and the chain read that would enumerate them is not made at all.
  if (isUnlaunchedPath(ethereumVaultRosterHref())) return [];
  try {
    const directory = await loadAaveEthereumVaultDirectory();
    if (directory.chainStale) return [];
    return directory.rows.map((row) => ({
      url: `${SITE_URL}${ethereumVaultHref(row.address)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error("The vault roster did not answer for the sitemap:", error);
    return [];
  }
}

/** The Base vault pages — one per catalogued vault the census found at least
 *  one participant in. The roster is 511 vaults and 269 of them have never had
 *  a single `Transfer`; a market view for one of those is a real page and a
 *  true reading, but there is nothing on it a crawler would want and nothing
 *  linking to it, so the sitemap names the ones with a life.
 *
 *  The universe comes from the CENSUS HEADER that rides out of the listing
 *  proxy, never from a page of rows — the same rule the listing's own facet
 *  keeps. A read that does not answer contributes NOTHING rather than the
 *  baked catalogue, because a sitemap built from a stale roster would name
 *  pages this deployment cannot serve.
 *
 *  The POSITIONS are not listed and never will be: there are about 652,000 of
 *  them on this chain, they change by the minute, and the listing above them is
 *  the page a crawler should find. */
async function baseVaultPages(): Promise<MetadataRoute.Sitemap> {
  // As on Ethereum: the explorer this layer hangs off is unlaunched, so the
  // census read that would name ~240 vault URLs is not made.
  if (isUnlaunchedPath(baseVaultRosterHref())) return [];
  try {
    // Pointed at this deployment's own origin, the way every other server-side
    // caller of the listing proxy is: one code path, server or client.
    const hop = await ssrHop();
    const page = await fetchVaultPositions({ chainId: BASE_CHAIN_ID, limit: 1, overlay: false, ...hop });
    return page.census
      .filter((c) => c.participants > 0)
      .map((c) => ({
        url: `${SITE_URL}${baseVaultHref(c.vault)}`,
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: 0.6,
      }));
  } catch (error) {
    console.error("The Base vault census did not answer for the sitemap:", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [vaultPages, baseVaults] = await Promise.all([ethereumVaultPages(), baseVaultPages()]);
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/about/architecture`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    // One coverage page per chain (the chain's front door — the old top-level
    // chain directories are retired), then every explorer under its chain.
    // Both are derived: an explorer joins the sitemap the day it joins the
    // roster, at whatever path its chain and slug give it, so a route move
    // cannot leave a stale URL here for a crawler to follow into a 404.
    ...launchedChains().map((chain) => ({
      url: `${SITE_URL}/coverage/${chain.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...LAUNCHED_PROTOCOLS.map((entry) => ({
      url: `${SITE_URL}${entry.href}`,
      lastModified: new Date(),
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
    // Each explorer's protocol-level sub-pages (branch roster, market roster,
    // system state, …) — derived the same way, off each sub-page's `href`
    // rather than a hand-joined path, so it moves when the roster entry moves.
    ...LAUNCHED_PROTOCOLS.flatMap((entry) =>
      entry.subPages.map((sub) => ({
        url: `${SITE_URL}${sub.href}`,
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ),
    // Each explorer's /info page — the intro prose, derived off `infoHref` the
    // same way.
    ...LAUNCHED_PROTOCOLS.map((entry) => ({
      url: `${SITE_URL}${entry.infoHref}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    // The two surfaces under each vault roster — the position listing and the
    // layer's about-prose. The rosters themselves are sub-pages and are already
    // above; these hang off them, so they are formed from their hrefs.
    ...[baseVaultRosterHref(), ethereumVaultRosterHref()].flatMap((roster) =>
      isUnlaunchedPath(roster)
        ? []
        : [
            {
              url: `${SITE_URL}${roster}/positions`,
              lastModified: new Date(),
              changeFrequency: "daily" as const,
              priority: 0.7,
            },
            {
              url: `${SITE_URL}${roster}/info`,
              lastModified: new Date(),
              changeFrequency: "monthly" as const,
              priority: 0.5,
            },
          ],
    ),
    // Each catalogued vault's own page on Ethereum, under Aave's vault layer.
    ...vaultPages,
    // …and each Base vault the census has ever seen a holder of, under Morpho.
    // Neither chain enumerates its positions.
    ...baseVaults,
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/blog/when-frontends-fail-what-happens-in-a-crisis`,
      lastModified: new Date("2025-11-25"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/blog/keeping-defi-open-and-accessible`,
      lastModified: new Date("2025-11-17"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/blog/from-kitchen-table-sketches-to-rails-web-app`,
      lastModified: new Date("2025-11-10"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/blog/introducing-rails-finance`,
      lastModified: new Date("2025-11-06"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/blog/rails-solution-defi-trust-problem`,
      lastModified: new Date("2025-11-06"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/blog/bold-survived-stream-finance-chaos`,
      lastModified: new Date("2025-11-06"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/pulse`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
