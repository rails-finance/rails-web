import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "SparkLend Market", canonicalPath: "/ethereum/spark/market" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
