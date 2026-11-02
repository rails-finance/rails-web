import { listingMetadata } from "@/lib/shared/page-metadata";

export const metadata = listingMetadata({
  title: "Pulse",
  canonicalPath: "/pulse",
  // The page's opening line, said as Rails (ui-jobs 475).
  description: "A timeline of what Rails is building and sharing.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
