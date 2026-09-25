import { AppFooter } from "@/components/AppFooter";
import { BrandRail } from "@/components/nav/brand-rail";
import { PriceStripProvider } from "@/components/shared/price-strip";
import { SkeletonSizeRecorder } from "@/components/shared/skeleton-size-recorder";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PriceStripProvider>
      {/* The brand rail is app-only — this layout is the whole of app/(app),
          and the marketing group never mounts it (rails-ops TO-DO-ui-jobs 67).
          It is fixed to the left edge, so the page column pays for it with
          padding: `md:pl-14` reserves the rail's 56px on the outer block and
          the inner `mx-auto` then centres the content in what is left, rather
          than the rail pushing a viewport-centred column off centre.
          `md:pt-4` replaces the air the header band used to give these pages:
          from `md` up the bar is gone (ui-jobs 68) and the page would
          otherwise open hard against the top of the viewport. It is a quarter
          of what the bar cost, since the pages carry their own `py-8` under
          it. Below `md` the bar is still there, so no padding is owed. */}
      <BrandRail />
      <div className="md:pl-14">
        <main className="max-w-7xl mx-auto px-4 md:px-6 md:pt-4">{children}</main>
        <AppFooter />
      </div>
      {/* Invisible: measures the tagged real sections and feeds the skeleton
          memory layer, so the next visit's loading blocks are the right size. */}
      <SkeletonSizeRecorder />
    </PriceStripProvider>
  );
}
