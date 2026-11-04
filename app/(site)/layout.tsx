import { RailShell } from "@/components/nav/rail-shell";
import { SiteFooter } from "@/components/site/SiteFooter";

/** Site routes (home, about, blog, coverage, pulse, privacy, terms, export):
 *  the brand rail and H20 from md, as the app pages have them (ui-jobs 498),
 *  in the site column, with the marketing footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <RailShell column="site" footer={<SiteFooter />}>
      {children}
    </RailShell>
  );
}
