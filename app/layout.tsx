import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";
import { LAUNCHED_PROTOCOLS, launchedProductionChains } from "@/lib/shared/protocols";
import { IconSymbols } from "@/components/icons/iconSymbols";
import { HeaderBar } from "@/components/nav/header-bar";
import { NavigationProgress } from "@/components/nav/navigation-progress";
import { WalletContextProvider } from "@/components/nav/wallet-context";
import { ThemeScript } from "@/components/ThemeScript";
import { WorkInProgressStrip } from "@/components/shared/work-in-progress-strip";
import { StructuredData } from "@/components/StructuredData";
import { SITE_URL, TWITTER_HANDLE } from "@/lib/shared/page-metadata";
import { Analytics } from "@vercel/analytics/next";

const dmSans = DM_Sans({
  variable: "--font-sans-face",
  subsets: ["latin"],
  // `optional` skips the FOUT swap — first paint either has the webfont (if it
  // arrived inside the 100ms block window) or the metric-adjusted fallback.
  display: "optional",
});

export const viewport: Viewport = {
  themeColor: [
    // Light = the paper canvas (--background at the shipped --paper-* knobs),
    // not white: mobile browser chrome sits directly against the page, so a
    // white bar reads as a seam. Re-measure if the knobs move.
    { media: "(prefers-color-scheme: light)", color: "#eee7e9" },
    { media: "(prefers-color-scheme: dark)", color: "#12151E" },
  ],
  width: "device-width",
  initialScale: 1,
};

// The share card's coverage claim, in prose. Both are stated off the roster
// rather than written out: the previous copy named "Liquity V2 and Aave V4" as
// what was live, which was true when there were two explorers and untrue for
// the thirteen that followed. The count is the launched roster's length, and
// the keywords are its labels, so onboarding an explorer updates them.
//
// Every explorer counted here is reachable from this origin — Rails is one
// site now, the chain being a path segment rather than a hostname (rails-ops
// `decisions/0016`) — which is the property that makes the number safe to
// advertise.
//
// Note what is claimed and what isn't: the foundation below (every position,
// replayed from the protocol's own events, receipts) IS identical across every
// explorer. Depth is not — it varies per explorer, and the per-chain coverage
// pages (/coverage/<chain>, off lib/shared/coverage.ts) are the one place that
// states it, so the share copy points there rather than flattening the
// difference into a blanket claim.
// The card itself: `scripts/generate-og-home.mjs` → public/og/home.png.
//
// LAUNCHED explorers only, and launched chains only. This copy is the site's
// own coverage claim: a count that included an explorer nothing links, or a
// coverage page a reader cannot get to, would advertise a door that is not
// open. Both come back on their own when the flags come off.
const EXPLORER_COUNT = LAUNCHED_PROTOCOLS.length;
/** "/coverage/ethereum" — the coverage doors this description points a reader
 *  at, named off the roster rather than written out, so the sentence cannot
 *  cite a page the sitemap has dropped. Production chains only: the sentence
 *  is about how deep Rails goes on real money, and a testnet's coverage page
 *  is not the door it means. */
const COVERAGE_PATHS = launchedProductionChains()
  .map((c) => `/coverage/${c.slug}`)
  .join(" and ");

// No chain is named. Rails spans chains, and marking one would either date the
// copy or under-claim the rest; the per-chain coverage pages are where that
// distinction is drawn.
const SITE_TITLE = "Rails - DeFi Protocol Explorers";
const OG_DESCRIPTION = `Dedicated explorers for ${EXPLORER_COUNT} DeFi protocols — every position replayed from the protocol's own on-chain events, with a receipt on every number.`;
const SITE_DESCRIPTION = `Rails builds a dedicated explorer for each of ${EXPLORER_COUNT} DeFi protocols — browse every open position, not just your own. Every number is replayed from the protocol's own on-chain events, with a receipt showing where it came from. How deep each explorer goes is stated per protocol at ${COVERAGE_PATHS}.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "Rails | %s",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "DeFi",
    "Protocol Explorer",
    "Lending Protocol",
    "CDP",
    "Stablecoin",
    "Position History",
    "Transaction Analysis",
    "On-chain Provenance",
    // The production chains a reader can reach from the nav, and the explorers
    // on them. A testnet is not a keyword anyone searches Rails for.
    ...launchedProductionChains().map((c) => c.name),
    ...LAUNCHED_PROTOCOLS.map((p) => p.label),
  ],
  authors: [{ name: "Rails", url: SITE_URL }],
  creator: "Rails",
  publisher: "Rails",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    title: SITE_TITLE,
    description: OG_DESCRIPTION,
    siteName: "Rails",
    images: [
      {
        url: "/og/home.png",
        width: 1200,
        height: 630,
        alt: `Explore ${EXPLORER_COUNT} DeFi protocols on Rails`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: OG_DESCRIPTION,
    images: ["/og/home.png"],
    creator: TWITTER_HANDLE,
    site: TWITTER_HANDLE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // No root `alternates.canonical`: a root canonical is inherited verbatim by
  // every one of the ~60 routes, so search engines collapse them all to the
  // homepage and no per-page title would surface. Each listing/position route
  // emits its OWN relative canonical via lib/shared/page-metadata.ts instead.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#12151E" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#eee7e9" media="(prefers-color-scheme: light)" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <ThemeScript />
        {/* "Already-seen" animation flags — flipped before first paint so CSS
            in globals.css can disable the entrance animations on subsequent
            visits without a hydration flicker. The hero flag persists across
            tabs/sessions via localStorage (plays once per browser); the track
            lines flag is sessionStorage (replays on the first load of each
            visit, static within the session). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=document.documentElement.dataset;if(localStorage.getItem('rails-hero-seen'))d.heroSeen='1';if(sessionStorage.getItem('rails-tracks-seen'))d.tracksSeen='1'}catch(e){}})()",
          }}
        />
        <StructuredData />
      </head>
      <body
        className={`${dmSans.className} ${dmSans.variable} antialiased bg-background text-foreground min-h-screen overflow-x-hidden min-w-[320px]`}
      >
        <IconSymbols />
        <Providers>
          <WalletContextProvider>
            <NavigationProgress />
            <HeaderBar />
            {/* Renders only on a route inside an unlaunched explorer, or on an
                unlaunched chain's coverage page — nothing at all elsewhere.
                Mounted here so no such route can be missed. */}
            <WorkInProgressStrip />
            {children}
          </WalletContextProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
