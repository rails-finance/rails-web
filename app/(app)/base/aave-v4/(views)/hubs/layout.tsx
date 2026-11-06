import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Aave V4 Equities hub on Base", canonicalPath: "/base/aave-v4/hubs" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
