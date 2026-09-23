// One builder for the two title surfaces, so the format decisions and the
// per-route canonical live in exactly one place.
//
//   • Position pages, like listings, use a plain string the root template wraps
//     ("Rails | Moonwell on Base Position 0x719e…919d"). They were bare for a
//     while — the argument was that a tab strip of many open positions reads
//     faster when the first characters differ per protocol — but a bare title
//     is also what a pasted link, a bookmark, a search result and a chat
//     preview show, and there "Moonwell on Base Position 0x…" reads as a link
//     into Moonwell's own app rather than Rails' replay of it. Miles decided
//     (2026-09-02, on the share-card benchmark) that naming Rails wins over
//     the tab-strip nicety; the favicon still marks the tab.
//   • Listing pages use the same plain string ("Rails | Explore Morpho Blue
//     Positions") — branding earns its place on the entry points and shared
//     links.
//
// Both also emit a per-route `canonical` (relative → resolved against the root
// `metadataBase`). The root layout's single hardcoded canonical was removed: a
// root canonical is inherited verbatim by every route, so search engines collapse
// them all to the homepage and no per-page title would ever surface.

import type { Metadata } from "next";
import {
  PROTOCOLS,
  protocolForSession,
  POSITION_NOUN,
  positionNounPlural,
  type ProtocolEntry,
  explorerName,
} from "@/lib/shared/protocols";
import { CHAINS, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { RAILS_X_AT } from "@/lib/shared/social";
import type { SessionProtocol } from "@/lib/shared/sessions";

// Canonical base URL. NEXT_PUBLIC_SITE_URL wins (set per Vercel project);
// else the current Vercel deployment's own URL; else the production default.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  "https://rails.finance";

/** `twitter:creator` / `twitter:site`, off the one place the account is
 *  written down (lib/shared/social.ts). */
export const TWITTER_HANDLE = RAILS_X_AT;

// ── Share cards ──────────────────────────────────────────────────────────────
// A pasted link previews with a card, and the card should name the explorer the
// link is into — a shared Maple position is a Maple link, not a generic Rails
// one. Every listing and position page therefore resolves its explorer from the
// roster and points `og:image` at that explorer's own card,
// `public/og/explore-<id>.png`, rendered by `scripts/generate-og.mjs` from the
// same roster (`id` = the icon basename). Non-explorer routes (/pulse, the
// market views' parents) fall back to the site card.
//
// These blocks are set explicitly on every page rather than inherited: Next
// REPLACES, not merges, a parent's `openGraph`/`twitter` when a page defines
// its own — so a page-level `openGraph.title` alone would drop the root's image.
//
// A position route that carries its own `opengraph-image.tsx` (Phase 1: the
// Liquity V2 trove, Aave V3 and Moonwell Base benchmark routes; more follow
// the same shape) renders a LIVE card off the same server loader the page
// itself awaits — the position's own numbers, not a generic protocol card.
// `positionMetadata`'s `image: "dynamic"` opt tells this module to omit the
// `images` array below so Next's file-convention image is the only one
// advertised (a page-level `openGraph.images` would otherwise sit beside it,
// and an explicit `twitter.images` would still win the Twitter card even
// though file-convention wins for `og:image`). Every other position route,
// and every listing, keeps pointing at its explorer's static card — that
// static PNG is also what a route with a dynamic card falls back to when the
// render fails or the id/wallet has no recorded position (see
// `lib/share/position-image.ts`).

export const HOME_SHARE_IMAGE = "/og/home.png";

/** The share card for an explorer, by roster `id`. Must agree with `cardOut`
 *  in scripts/generate-og.mjs; `npm run check:og` proves every roster card exists. */
export function protocolShareImage(id: string): string {
  return `/og/explore-${id}.png`;
}

/** The explorer a route lives under, by longest `href` prefix — so
 *  `/ethereum/aave-v4/hubs` is Aave V4's and `/base/morpho/0x…/0x…` is Morpho
 *  Blue Base's, not Morpho Blue's (`/ethereum/morpho`). */
function protocolForPath(path: string): ProtocolEntry | undefined {
  let best: ProtocolEntry | undefined;
  for (const p of PROTOCOLS) {
    if (path !== p.href && !path.startsWith(`${p.href}/`)) continue;
    if (!best || p.href.length > best.href.length) best = p;
  }
  return best;
}

/** `robots` for a route inside an UNLAUNCHED explorer, and nothing at all for
 *  every other route (so the root layout's index/follow still governs them).
 *
 *  It sits here rather than on ~90 route files because every title surface in
 *  the app comes through the six builders below and each one already resolves
 *  its explorer: the page that states a route's canonical is the page that
 *  states whether the route is indexable, off the same roster entry. A route
 *  under a flagged explorer therefore cannot be missed, and a new route under
 *  one inherits the rule by using the builder it would have used anyway.
 *
 *  `follow: false` as well as `index: false`: these pages carry the explorer's
 *  own rail, so a crawler that guessed one URL would otherwise walk the tabs
 *  and the position listing and enumerate the whole surface from it. */
const NOINDEX = { robots: { index: false, follow: false } } as const;

function unlaunchedRobots(entry: ProtocolEntry | undefined, path: string): Pick<Metadata, "robots"> {
  return (entry ?? protocolForPath(path))?.unlaunched ? NOINDEX : {};
}

/** The same rule, for the handful of routes that state a `metadata` literal
 *  rather than going through a builder — a protocol view whose title is the
 *  view's own rather than the explorer's. Spread it beside the literal.
 *
 *  It resolves the explorer by path PREFIX, so it wants a path and not a URL
 *  with a query on it (the builders pass their resolved entry for that case). */
export function unlaunchedRobotsForPath(path: string): Pick<Metadata, "robots"> {
  return unlaunchedRobots(undefined, path);
}

function shareMetadata(opts: {
  entry: ProtocolEntry | undefined;
  title: string;
  description: string;
  canonicalPath: string;
  /** `"dynamic"` when this route carries its own `opengraph-image.tsx` — see
   *  the "Share cards" block above. Omits `images` from both blocks so the
   *  file-convention image is the only one either surface can pick up. */
  image?: "dynamic";
  /** An explicit card to advertise, for a route whose live card cannot be a
   *  file-convention `opengraph-image.tsx` at all. A share image is per ROUTE,
   *  and App Router's image convention never sees `searchParams` — so a view
   *  that IS a query string (the wallet view: a listing at `?q=<holder>`) points
   *  at a route handler of its own instead, and states it here. Wins over
   *  `image`; the alt travels with it, since a card of a wallet's own positions
   *  is not "Explore <protocol> on Rails". */
  images?: { url: string; alt: string };
}): Pick<Metadata, "openGraph" | "twitter"> {
  const image = opts.entry ? protocolShareImage(opts.entry.id) : HOME_SHARE_IMAGE;
  const alt = opts.entry ? `Explore ${opts.entry.label} on Rails` : "Explore DeFi protocols on Rails";
  const dynamic = opts.image === "dynamic" && !opts.images;
  const shown = opts.images ?? { url: image, alt };
  return {
    openGraph: {
      type: "website",
      siteName: "Rails",
      title: opts.title,
      description: opts.description,
      // Relative — resolved against the root `metadataBase`, like `canonical`.
      url: opts.canonicalPath,
      ...(dynamic ? {} : { images: [{ url: shown.url, width: 1200, height: 630, alt: shown.alt }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      ...(dynamic ? {} : { images: [shown.url] }),
      creator: TWITTER_HANDLE,
      site: TWITTER_HANDLE,
    },
  };
}

const FOUNDATION = "replayed from the protocol's own on-chain events, with a receipt on every number.";

const isAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);

/** Truncate an address-shaped subject to 6+4 with a Unicode ellipsis — the form
 *  the 13 asset-catalog `shortAddress` copies produce, so a tab matches the page
 *  body it names. Non-address subjects (numeric ids, "#1234", "0x… #0") pass
 *  through untouched. Exported so a dynamic share card (lib/share/) states the
 *  same shortened subject the tab title does, off the same rule rather than a
 *  second copy of it. */
export function shortSubject(s: string): string {
  return isAddress(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

/** Per-position page title — "Rails | <protocol> <noun> <subject>". `market` is an optional
 *  segment between the protocol and its noun ("USDC" → "Compound V3 USDC
 *  Position 0x…"). `canonicalPath` is this route's path (e.g. "/ethereum/makerdao/31245").
 *  MUST be called from a server `layout.tsx` (position `page.tsx` files are
 *  "use client" and cannot export metadata). */
export function positionMetadata(opts: {
  session: SessionProtocol;
  subject: string;
  market?: string;
  canonicalPath: string;
  /** `"dynamic"` for a route that carries its own `opengraph-image.tsx` —
   *  the position's own live card, not this explorer's generic one. */
  image?: "dynamic";
}): Metadata {
  const entry = protocolForSession(opts.session);
  // Text cannot carry the chain mark, so a Base explorer's title says it in
  // words ("Aave V3 on Base Position 0x…"); Ethereum stays unsaid.
  const label = entry ? explorerName(entry) : "Rails";
  const noun = POSITION_NOUN[opts.session];
  const title = [label, opts.market, noun, shortSubject(opts.subject)].filter(Boolean).join(" ");
  // The description leads with Rails for the same reason the title carries
  // the prefix: a preview that shows only title + description must say whose
  // page this is, and "every event of this Moonwell position…" on its own
  // reads as Moonwell's.
  const description = `A Rails replay of this ${label} ${noun.toLowerCase()}: every event from the protocol's own on-chain events, with a receipt on every number.`;
  return {
    // Plain, so the root `template: "Rails | %s"` wraps it — see the header.
    title,
    description,
    alternates: { canonical: opts.canonicalPath },
    ...unlaunchedRobots(entry, opts.canonicalPath),
    // The share title carries the prefix explicitly: `openGraph.title` is not
    // run through the root template, only `title` is.
    ...shareMetadata({
      entry,
      title: `Rails | ${title}`,
      description,
      canonicalPath: opts.canonicalPath,
      image: opts.image,
    }),
  };
}

/** Per-position page title for a surface that names its own SUBJECT rather than
 *  its explorer — the two vault-position routes, today.
 *
 *  It is `positionMetadata`'s twin. Those routes DO sit inside an explorer now
 *  (rails-ops decision 0028), but the word a reader needs in the title is
 *  "Vaults" and the vault's name, not the explorer's label a third time: the
 *  caller states the label and chain it wants. The same two rules apply as
 *  everywhere else — the chain is said in WORDS because a title cannot carry
 *  the chain mark, and Ethereum stays unsaid.
 *
 *  The noun is "Position", which is what the routes are; `market` is the vault
 *  the position is in, and sits between the label and the noun exactly as an
 *  explorer's market does. `image: "dynamic"` opts into the route's own
 *  `opengraph-image.tsx`. */
export function sectionPositionMetadata(opts: {
  section: { label: string; chainId: ChainId };
  market?: string;
  subject: string;
  canonicalPath: string;
  description: string;
  /** `"dynamic"` for a route that carries its own `opengraph-image.tsx`. */
  image?: "dynamic";
}): Metadata {
  const label =
    opts.section.chainId === MAINNET_CHAIN_ID
      ? opts.section.label
      : `${opts.section.label} on ${CHAINS[opts.section.chainId].name}`;
  const title = [label, opts.market, "Position", shortSubject(opts.subject)].filter(Boolean).join(" ");
  return {
    title,
    description: opts.description,
    alternates: { canonical: opts.canonicalPath },
    ...unlaunchedRobots(undefined, opts.canonicalPath),
    ...shareMetadata({
      // No roster entry, so no explorer card: `shareMetadata` falls back to the
      // home card, which is the right one for a surface that is Rails' own
      // rather than any protocol's.
      entry: undefined,
      title: `Rails | ${title}`,
      description: opts.description,
      canonicalPath: opts.canonicalPath,
      image: opts.image,
    }),
  };
}

/** `event/[eventId]`'s one decode, shared by every family's `generateMetadata`
 *  and `opengraph-image.tsx` (six call sites across the Phase 3 batch) rather
 *  than six copies of the same try/catch — a malformed percent-escape (a
 *  hand-edited URL) must not throw through either route; it is instead an id
 *  nothing will match, which both routes already treat as "not found". */
export function decodeEventId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Per-EVENT page title — "<explorer> <noun> <subject> · <verb>", beside
 *  `positionMetadata`. `event` is what the caller's server loader found for
 *  this id (already decoded, already looked up in the tail the page itself
 *  awaits) — `null`/`undefined` when it could not be read in time (an older
 *  event outside a windowed family's served slice, a fabricated id, a
 *  backend blip), in which case the title drops the verb and the description
 *  falls back to the position's own, with no event to name. `canonicalPath`
 *  is the EVENT's own path (`/<chain>/<slug>/<subject>/event/<id>`), unlike
 *  `positionMetadata`'s which is the position's. `image` defaults to
 *  `"dynamic"` — an event route normally carries its own
 *  `opengraph-image.tsx` — and is `"explorer"` on the one route that cannot;
 *  see the option's own note. */
export function eventMetadata(opts: {
  session: SessionProtocol;
  subject: string;
  market?: string;
  canonicalPath: string;
  event?: { actionLabel: string; timestamp: number } | null;
  /** `"explorer"` for an event route with NO `opengraph-image.tsx` beside it,
   *  so the link unfurls with that explorer's static roster card instead of
   *  advertising a file-convention image that does not exist (which emits no
   *  `og:image` at all, and an unfurl with no card at all). Yearn's vault
   *  holder lane is the one such route: its family keeps no stored history, so
   *  there is nothing an image route could read without running the page's own
   *  log sweeps — see `lib/vaults/event-share-card.ts`. */
  image?: "dynamic" | "explorer";
}): Metadata {
  const entry = protocolForSession(opts.session);
  const label = entry ? explorerName(entry) : "Rails";
  const noun = POSITION_NOUN[opts.session];
  const base = [label, opts.market, noun, shortSubject(opts.subject)].filter(Boolean).join(" ");
  const title = opts.event ? `${base} · ${opts.event.actionLabel}` : base;
  const description = opts.event
    ? `One on-chain event from this ${label} ${noun.toLowerCase()}, replayed by Rails: ${opts.event.actionLabel} on ${formatEventStamp(opts.event.timestamp)}, with a receipt on every number.`
    : `A Rails replay of this ${label} ${noun.toLowerCase()}: every event from the protocol's own on-chain events, with a receipt on every number.`;
  return {
    title,
    description,
    alternates: { canonical: opts.canonicalPath },
    ...unlaunchedRobots(entry, opts.canonicalPath),
    ...shareMetadata({
      entry,
      title: `Rails | ${title}`,
      description,
      canonicalPath: opts.canonicalPath,
      image: opts.image === "explorer" ? undefined : "dynamic",
    }),
  };
}

/** "2026-09-02 09:15 UTC" for `eventMetadata`'s description — built by hand
 *  for the same reason `shortSubject`'s siblings in `lib/share/` are: a
 *  locale-agnostic figure needs a fixed order, not `toLocaleString`'s. */
function formatEventStamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Info page ("/…/info") title — "About <explorer>", canonical at the roster's
 *  derived `infoHref`. The description is the explorer's roster one-liner, the
 *  same thing the listing card says. */
export function infoMetadata(session: SessionProtocol): Metadata {
  const entry = protocolForSession(session);
  const label = entry ? explorerName(entry) : "Rails";
  const title = `About ${label}`;
  const description = entry ? `${entry.desc}.` : `Every position ${FOUNDATION}`;
  const canonicalPath = entry?.infoHref ?? "/";
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    ...unlaunchedRobots(entry, canonicalPath),
    ...shareMetadata({ entry, title: `Rails | ${title}`, description, canonicalPath }),
  };
}

/** Listing (explorer discovery) page title — a plain string the root template
 *  wraps. Pass the "Explore …" body only. `description` is optional: the
 *  explorer's roster one-liner is the default, which is also what the share
 *  card carries. */
export function listingMetadata(opts: { title: string; canonicalPath: string; description?: string }): Metadata {
  const entry = protocolForPath(opts.canonicalPath);
  const description = opts.description ?? (entry ? `${entry.desc}.` : `Every position ${FOUNDATION}`);
  return {
    title: opts.title,
    description,
    alternates: { canonical: opts.canonicalPath },
    ...unlaunchedRobots(entry, opts.canonicalPath),
    // Share titles carry the brand the way the tab does ("Rails | Explore …").
    ...shareMetadata({ entry, title: `Rails | ${opts.title}`, description, canonicalPath: opts.canonicalPath }),
  };
}

/** The WALLET view's metadata — a listing at `?q=<holder>`, which on Polaris and
 *  Liquity V2 is the holder's own page (the middle path made the wallet view the
 *  listing's own search, so there is no second route to give it a card).
 *
 *  It is `positionMetadata`'s sibling, and it differs in exactly two places,
 *  both because the view is a query string rather than a path:
 *
 *   • the canonical is `<basePath>?q=<holder>` — the ONE param that names the
 *     view. A status selection, a sort, a page: none of those name a different
 *     wallet, and a canonical that carried them would split one wallet's page
 *     into as many URLs as a reader can reach it by. The caller lowercases an
 *     address and passes an ENS name as typed;
 *   • the share card is a route handler, `imagePath`, because App Router's
 *     `opengraph-image.tsx` convention cannot read `searchParams` — see
 *     `shareMetadata`'s `images`.
 *
 *  `subject` is the holder as the page names it: an ENS name when the search was
 *  one, else the address (shortened here, the same way a position title shortens
 *  its own). */
export function holderListingMetadata(opts: {
  session: SessionProtocol;
  subject: string;
  /** `<basePath>?q=<holder>` — this view's one canonical URL. */
  canonicalPath: string;
  /** The share route that renders this wallet's card, with its own `?q=`. */
  imagePath: string;
}): Metadata {
  const entry = protocolForSession(opts.session);
  // The BARE label, not `explorerName`. A position page says the chain in words
  // because a title cannot carry the chain mark ("Polaris on Sepolia CDP 0x…"),
  // but this page is a LISTING view, and a listing's own titles have always said
  // the explorer bare ("Explore Polaris CDPs") — putting the chain between the
  // explorer and its noun here reads as "Polaris on Sepolia CDPs held by …",
  // which splits the one phrase the title is built around. The chain is on the
  // card, which names it beside the mark, and in the URL.
  const label = entry?.label ?? "Rails";
  const noun = POSITION_NOUN[opts.session];
  const plural = positionNounPlural(opts.session);
  const title = `${label} ${plural} held by ${shortSubject(opts.subject)}`;
  const description = `A Rails replay of every ${label} ${noun} this wallet holds or held — counts, collateral and debt, and the ${noun} nearest its floor — from the protocol's own on-chain events, with a receipt on every number.`;
  return {
    title,
    description,
    alternates: { canonical: opts.canonicalPath },
    ...unlaunchedRobots(entry, opts.canonicalPath),
    ...shareMetadata({
      entry,
      title: `Rails | ${title}`,
      description,
      canonicalPath: opts.canonicalPath,
      images: { url: opts.imagePath, alt: `This wallet's ${label} ${plural} at a glance` },
    }),
  };
}
