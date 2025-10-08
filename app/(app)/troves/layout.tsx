import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore Liquity V2 Troves",
  description:
    "Explore all Liquity V2 Troves across ETH, wstETH, and rETH collateral types. Filter by owner, status, collateral ratio, and more. View detailed transaction timelines for any trove.",
  openGraph: {
    title: "Rails | Explore Liquity V2 Troves",
    description:
      "Explore all Liquity V2 Troves across ETH, wstETH, and rETH collateral types. Filter and analyze troves with detailed transaction timelines.",
    url: "https://rails.finance/troves",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rails | Explore Liquity V2 Troves",
    description:
      "Explore all Liquity V2 Troves across ETH, wstETH, and rETH collateral types.",
  },
};

export default function TrovesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
