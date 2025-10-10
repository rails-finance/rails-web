import { SiteNavigation } from "@/components/site/SiteNavigation";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 z-50 overflow-auto min-w-[320px]">
      <div className="absolute top-0 left-0 right-0 z-50">
        <SiteNavigation />
      </div>
      <main className="relative">{children}</main>
      <SiteFooter />
    </div>
  );
}
