import { SiteFooter } from "@/components/site/SiteFooter";

/** Site routes (home, about, blog, pulse, etc.) used to render their own
 *  SiteNavigation in a fixed inset-0 overlay, which hid the root HeaderBar.
 *  The header is now global from app/layout.tsx, so this layout is just a
 *  passthrough plus the marketing footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
