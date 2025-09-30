import { AppFooter } from "@/components/AppFooter";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="max-w-7xl mx-auto px-4 md:px-6">{children}</main>
      <AppFooter />
    </>
  );
}