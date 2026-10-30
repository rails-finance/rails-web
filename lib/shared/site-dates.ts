/** Dates the sitemap's `lastmod` carries.
 *
 *  `DEPLOYED_AT` is the commit date of the deployed build, inlined by
 *  `next.config.ts` as `RAILS_DEPLOYED_AT` (`git log -1 --format=%cI`, or the
 *  build's start time where git is not available). An app page's markup and
 *  explanation change only when a build ships, so this is the date a crawler
 *  is told; the figures on the page move between deploys, which the
 *  sitemap's `changeFrequency` says. */
export const DEPLOYED_AT = new Date(process.env.RAILS_DEPLOYED_AT ?? "2026-10-30T00:00:00Z");

/** The day the Privacy Policy and Terms of Service wording last changed. Both
 *  pages print it and the sitemap names it; bump it by hand whenever either
 *  text is revised. */
export const LEGAL_LAST_UPDATED = { iso: "2026-09-28", label: "September 28, 2026" } as const;
