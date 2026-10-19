// Mounts the settle-waterfall shell probe (lib/perf/settle-marks.ts) around
// every render state of the detail route, skeleton included.
import { SettleShellMark } from "@/components/shared/settle-shell-mark";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
