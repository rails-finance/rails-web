import { AppFooter } from "@/components/AppFooter";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <AppFooter />
    </>
  );
}