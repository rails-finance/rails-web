export function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Rails",
    applicationCategory: "FinanceApplication",
    description:
      "DeFi activity timeline and transaction analysis platform for Liquity V2 and beyond",
    url: "https://rails.finance",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    provider: {
      "@type": "Organization",
      name: "Rails",
      url: "https://rails.finance",
      sameAs: [
        "https://x.com/rails_finance",
        "https://youtube.com/@rails_finance",
      ],
    },
    featureList: [
      "DeFi transaction timeline visualization",
      "Transaction analysis and explanations",
      "Liquity V2 Trove tracking",
      "Multi-collateral support (ETH, wstETH, rETH)",
      "Real-time protocol statistics",
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
