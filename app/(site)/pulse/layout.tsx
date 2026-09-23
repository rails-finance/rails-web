import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({ title: "Pulse", canonicalPath: "/pulse" });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
