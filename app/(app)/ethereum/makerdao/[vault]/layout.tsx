// Mounts the §3.4 settle-waterfall shell probe (lib/perf/settle-marks.ts)
// around every render state of the detail route — skeleton included, which is
// why it lives in the layout rather than the page's post-fetch JSX.
//
// `generateMetadata` moved down to the page, which is the segment that reads
// the vault.
import { SettleShellMark } from "@/components/shared/settle-shell-mark";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
