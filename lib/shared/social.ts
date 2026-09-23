// Rails' own accounts, in one place.
// ----------------------------------------------------------------------------
// Client-safe: string constants, no env reads and no server imports, so a
// client component (the work-in-progress strip) and a server one (the page
// metadata) can both name the account without either pulling in the other's
// module.
//
// The handle is written down once. `TWITTER_HANDLE` in page-metadata.ts is
// derived from it, and the strip's link is too, so moving the account is one
// edit here. The footer, the privacy page and the terms page still spell it in
// their own markup — they are not wrong, they are just older than this module,
// and each is a one-line swap whenever someone is in that file anyway.

/** The X account, without the leading `@`. */
export const RAILS_X_HANDLE = "rails_finance";

/** The X account as it is written in prose and in an aria-label. */
export const RAILS_X_AT = `@${RAILS_X_HANDLE}`;

/** The X account's page. */
export const RAILS_X_URL = `https://x.com/${RAILS_X_HANDLE}`;
