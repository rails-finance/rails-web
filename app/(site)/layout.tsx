import { SiteNavigation } from "@/components/site/SiteNavigation";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-white text-slate-600 z-50 overflow-auto"
      style={{
        background: '#ffffff',
        color: '#111827'
      }}
    >
      <div className="absolute top-0 left-0 right-0 z-50">
        <SiteNavigation />
      </div>
      <div className="relative">
        {children}
      </div>
    </div>
  );
}