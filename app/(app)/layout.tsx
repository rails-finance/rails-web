import { AppFooter } from "@/components/AppFooter";
import { PriceStripProvider } from "@/components/shared/price-strip";
import { SkeletonSizeRecorder } from "@/components/shared/skeleton-size-recorder";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PriceStripProvider>
      <main className="max-w-7xl mx-auto px-4 md:px-6">{children}</main>
      <AppFooter />
      {/* Invisible: measures the tagged real sections and feeds the skeleton
          memory layer, so the next visit's loading blocks are the right size. */}
      <SkeletonSizeRecorder />
    </PriceStripProvider>
  );
}
