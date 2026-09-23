// Mounts the §3.4 settle-waterfall shell probe (lib/perf/settle-marks.ts)
// around every render state of the detail route.
//
// Shell only. `generateMetadata` moved down to the page, which is the segment
// that reads the position — a layout that exists just to describe its child is
// the shape to leave behind, not to copy.
import { SettleShellMark } from "@/components/shared/settle-shell-mark";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
