import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Aave V3 Market", canonicalPath: "/ethereum/aave-v3/market" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
