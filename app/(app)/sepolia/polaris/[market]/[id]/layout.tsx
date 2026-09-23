// Mounts the settle-waterfall shell probe (lib/perf/settle-marks.ts) around
// every render state of the detail route — skeleton included, which is why it
// lives in the layout rather than the page's post-fetch JSX.
//
// NOTE the route depth: /sepolia/polaris/[market]/[id] — TWO segments, because
// a CDP id is only unique within its market.
import { SettleShellMark } from "@/components/shared/settle-shell-mark";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
