import { SITE_URL } from "@/lib/shared/page-metadata";
import { LAUNCHED_PROTOCOLS } from "@/lib/shared/protocols";

/**
 * The machine-readable half of the home page's coverage claim (JSON-LD in
 * <head>, alongside the OG tags in app/layout.tsx). It says the same thing as
 * the share card, so it is stated off the same source: `LAUNCHED_PROTOCOLS`.
 * An unlaunched explorer is not named here — the feature list is a crawler's
 * copy of the coverage claim, and it must not advertise a door the nav does
 * not open. The copy it
 * replaced named "Liquity V2 and Aave V4" as what was live and went stale the
 * moment a third explorer shipped — a hand-listed roster in a second place is
 * a roster that drifts.
 *
 * The feature list claims only the foundation — the capabilities every explorer
 * shares. Depth varies per explorer and is stated per protocol on the coverage pages
 * (lib/shared/coverage.ts), so it is not asserted here.
 */
export function StructuredData() {
  // The launched roster, every chain it spans — one origin serves all of them,
  // so the count is a claim a crawler can follow rather than an advert for a
  // second site.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Rails",
    applicationCategory: "FinanceApplication",
    description: `Dedicated, on-chain-verifiable explorers for ${LAUNCHED_PROTOCOLS.length} DeFi protocols — every position replayed from the protocol's own on-chain events, with a receipt on every number.`,
    url: SITE_URL,
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    provider: {
      "@type": "Organization",
      name: "Rails",
      url: SITE_URL,
      sameAs: ["https://x.com/rails_finance", "https://youtube.com/@rails_finance"],
    },
    featureList: [
      `Dedicated explorers for ${LAUNCHED_PROTOCOLS.length} DeFi protocols: ${LAUNCHED_PROTOCOLS.map((p) => p.label).join(", ")}`,
      "Every open position in the protocol, searchable by wallet — not just your own",
      "Read-only: no wallet connection, no signatures",
      "On-chain-verifiable positions and balances, with no modeled state",
      "Plain-language event timelines",
      "Provenance receipts on every figure",
      "Real-time protocol statistics",
    ],
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />;
}
