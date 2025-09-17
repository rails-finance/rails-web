import { SiteNavigation } from "@/components/site/SiteNavigation";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div 
      className="fixed inset-0 bg-white text-gray-900 z-50 overflow-auto"
      style={{ 
        background: '#ffffff',
        color: '#111827'
      }}
    >
      <SiteNavigation />
      {children}
      <SiteFooter />
    </div>
  );
}