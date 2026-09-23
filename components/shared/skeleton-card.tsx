// The one skeleton primitive: a solid, borderless, faintly-filled block — the
// outline of a page section, never its inner anatomy. Placeholders that drew
// pills, stat grids and bar charts drifted the moment the real content changed
// (and nobody looks at a skeleton to notice); a block can't drift. Heights
// come in as measured px (lib/shared/skeleton-sizes defaults, refined per
// route by the localStorage memory layer via useSkeletonSizes), not Tailwind
// classes. The pulse lives on the CONTAINER a stack of blocks sits in, not on
// each block.
//
// `bg-skeleton` is correct here because these blocks sit on the page canvas,
// never inside a raised frame: --surface-skeleton is byte-identical to
// --surface-raised (app/globals.css:113/116, 312/315), which is why the old
// inner bars needed rb-300/70 dark:rb-700/60 to stay visible against a
// bg-raised card. That rule disappears only because no bar is ever nested in
// a card again — a future inner bar would have to bring it back.

export function SkeletonBlock({ height, className = "" }: { height: number; className?: string }) {
  return <div style={{ height }} className={`rounded-2xl bg-skeleton ${className}`} />;
}
