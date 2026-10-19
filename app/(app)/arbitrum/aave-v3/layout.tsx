// The explorer's own root: `app/(app)/arbitrum/layout.tsx` mounts the chain,
// and each page owns its metadata, so this layout carries only the segment.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
