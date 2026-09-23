import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Aave V4 Hubs", canonicalPath: "/ethereum/aave-v4/hubs" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
