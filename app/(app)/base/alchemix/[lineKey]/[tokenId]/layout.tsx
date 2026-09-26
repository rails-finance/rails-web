import { SettleShellMark } from "@/components/shared/settle-shell-mark";

// Shell only. The page below is the segment that reads the position, so it is
// the segment that describes it — `generateMetadata` lives there.
export default function AlchemixPositionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
