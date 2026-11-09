import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Aave V4 markets", canonicalPath: "/ethereum/aave-v4/markets" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
