import { AppFooter } from "@/components/AppFooter";
import { RailShell } from "@/components/nav/rail-shell";
import { TodayPricesProvider } from "@/components/shared/price-basis";
import { PositionCardStripProvider } from "@/components/shared/position-card-strip";
import { SkeletonSizeRecorder } from "@/components/shared/skeleton-size-recorder";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TodayPricesProvider>
      <PositionCardStripProvider>
        {/* The brand rail, the app column and H20 (components/nav/rail-shell.tsx). */}
        <RailShell column="app" footer={<AppFooter />}>
          {children}
        </RailShell>
        {/* Invisible: measures the tagged real sections and feeds the skeleton
          memory layer, so the next visit's loading blocks are the right size. */}
        <SkeletonSizeRecorder />
      </PositionCardStripProvider>
    </TodayPricesProvider>
  );
}
