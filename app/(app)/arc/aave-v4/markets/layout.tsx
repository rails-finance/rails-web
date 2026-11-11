import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Aave V4 markets on Arc", canonicalPath: "/arc/aave-v4/markets" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
