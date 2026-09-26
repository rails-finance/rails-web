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
          `md:-mt-[17px]` pulls the column up to close the gap above the
          protocol title (ui-jobs 71): every page's top-level wrapper carries
          `py-8` (32px) before its content, and the Rails glyph in the rail
          centres 31px below the viewport top, so the column has to land 17px
          above its zero-margin position for the title's centre to meet the
          glyph's. This replaces the positive `md:pt-4` that used to sit here:
          that padding covered for the header band's absence (ui-jobs 68), but
          it stacked on top of the `py-8` below it instead of accounting for
          it, which is what left the title sitting low. Below `md` the bar is
          still there and carries its spacing, so no margin is owed. */}
      <BrandRail />
      <div className="md:pl-14">
        <main className="max-w-7xl mx-auto px-4 md:px-6 md:-mt-[17px]">{children}</main>
        <AppFooter />
      </div>
      {/* Invisible: measures the tagged real sections and feeds the skeleton
          memory layer, so the next visit's loading blocks are the right size. */}
      <SkeletonSizeRecorder />
    </PriceStripProvider>
  );
}
