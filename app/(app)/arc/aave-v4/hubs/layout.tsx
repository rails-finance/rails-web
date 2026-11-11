import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Aave V4 hubs on Arc", canonicalPath: "/arc/aave-v4/hubs" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
