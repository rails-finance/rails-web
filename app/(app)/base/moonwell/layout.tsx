// The explorer's own root. Metadata is NOT declared here: `page.tsx` at this
// route owns the listing title (a layout export would only be shadowed by it),
// and the chain is not declared here either — `app/(app)/base/layout.tsx`
// mounts the ChainProvider for everything under /base, so this layout carries
// nothing of its own beyond the route segment.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
