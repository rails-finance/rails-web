// Mounts the settle-waterfall shell probe (lib/perf/settle-marks.ts) around
// every render state of the detail route, as the CDP route's layout does.
import { SettleShellMark } from "@/components/shared/settle-shell-mark";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
