import { SettleShellMark } from "@/components/shared/settle-shell-mark";

// Shell only. `generateMetadata` moved down to the page, which is the segment
// that reads the trove — a layout that exists just to describe its child is the
// shape to leave behind, not to copy.
export default function TroveLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SettleShellMark />
    </>
  );
}
