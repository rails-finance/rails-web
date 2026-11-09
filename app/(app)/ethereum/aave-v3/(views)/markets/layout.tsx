import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Aave V3 market", canonicalPath: "/ethereum/aave-v3/markets" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
