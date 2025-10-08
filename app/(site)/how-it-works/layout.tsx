import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How Rails Works",
  description:
    "Learn about Rails' technical architecture and how we process blockchain data to provide clear DeFi transaction timelines and analysis for Liquity V2 and beyond.",
  openGraph: {
    title: "How Rails Works",
    description:
      "Learn about Rails' technical architecture and data processing pipeline for DeFi transaction analysis.",
    url: "https://rails.finance/how-it-works",
  },
};

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
