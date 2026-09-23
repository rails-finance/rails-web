// Mounts the §3.4 settle-waterfall shell probe (lib/perf/settle-marks.ts)
// around every render state of the detail route — skeleton included, which is
// why it lives in the layout rather than the page's post-fetch JSX.
//
// `generateMetadata` moved down to the page, which is the segment that reads
// the position.
//
// NOTE the route depth: /dolomite/[owner]/[accountNumber] — two segments,
// because the position grain is Account.Info. /dolomite/[owner] alone has no
// page and 404s DELIBERATELY: one page per owner would assert a single
// collateralisation across independently-liquidated accounts.
import { SettleShellMark } from "@/components/shared/settle-shell-mark";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
