// Mounts the settle-waterfall shell probe (lib/perf/settle-marks.ts) around
// every render state of the detail route — skeleton included, which is why it
// lives in the layout rather than the page's post-fetch JSX.
//
// `generateMetadata` moved down to the page, which is the segment that reads
// the position.
//
// NOTE the route depth: /frankencoin/[position] — ONE segment, because a
// Frankencoin position is its own contract: the address IS the identity, the
// owner a transferable fact shown on the card, never the key.
import { SettleShellMark } from "@/components/shared/settle-shell-mark";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
