import type { ReactNode } from "react";

export interface OpenPositionStatsColumn {
  label: string;
  value: ReactNode;
  footnote?: ReactNode;
  /** Token icon shown after the column label */
  headerIcon?: ReactNode;
  /** Larger asset cluster rendered between the column label and the value.
   *  When ANY column sets this, the leading `icons` slot is suppressed so the
   *  cluster sits next to the data it identifies. */
  assetIcons?: ReactNode;
}

export interface OpenPositionStatsProps {
  /** `null` entries render as empty slots so callers can hold the grid open
   *  at a wider column count (e.g. supply-only spokes that want to line up
   *  with sibling cards that have Collateral / Debt / Ratio / Borrow Rate). */
  columns: (OpenPositionStatsColumn | null)[];
  /** Optional desktop-only first column (typically PositionPairIcons). Hidden
   *  when any column has `assetIcons` — the per-column clusters take over. */
  icons?: ReactNode;
  /** Position-specific identifier (spoke name, trove ID, etc.) shown
   *  top-right opposite the ACTIVE pill. */
  identity?: ReactNode;
  /** Identifier rendered to the right of the ACTIVE pill on the *left* —
   *  used by surfaces (e.g. Aave spokes) that prefer the spoke name as a
   *  status-line companion rather than a top-right tag. */
  leadingIdentity?: ReactNode;
  /** The leading status pill — required so every card states its own axis
   *  explicitly (listing lifecycle pill or detail mode word, the two-axis
   *  rule). The old optional prop fell back to a green-family "ACTIVE"
   *  lifecycle pill no consumer used — dead chrome that would have violated
   *  the settled grammar for the first consumer that forgot the prop. */
  statusPill: ReactNode;
}

const GRID_WITH_ICONS: Record<number, string> = {
  1: "grid grid-cols-2 sm:grid-cols-[80px_repeat(1,_1fr)] lg:grid-cols-[120px_repeat(1,_1fr)] gap-4 sm:items-start",
  2: "grid grid-cols-2 sm:grid-cols-[80px_repeat(2,_1fr)] lg:grid-cols-[120px_repeat(2,_1fr)] gap-4 sm:items-start",
  3: "grid grid-cols-2 sm:grid-cols-[80px_repeat(3,_1fr)] lg:grid-cols-[120px_repeat(3,_1fr)] gap-4 sm:items-start",
  4: "grid grid-cols-2 sm:grid-cols-[80px_repeat(4,_1fr)] lg:grid-cols-[120px_repeat(4,_1fr)] gap-4 sm:items-start",
};
const GRID_WITHOUT_ICONS: Record<number, string> = {
  1: "grid grid-cols-1 gap-4",
  2: "grid grid-cols-2 sm:grid-cols-2 gap-4",
  3: "grid grid-cols-2 sm:grid-cols-3 gap-4",
  4: "grid grid-cols-2 sm:grid-cols-4 gap-4",
};

export function OpenPositionStats({ columns, icons, identity, leadingIdentity, statusPill }: OpenPositionStatsProps) {
  const count = columns.length;
  // When any column carries its own asset cluster, drop the leading icons
  // slot — the cluster moves into the column it describes.
  const hasInColumnAssets = columns.some((c) => c?.assetIcons != null);
  const useLeadingIcons = !!icons && !hasInColumnAssets;
  const gridClass = useLeadingIcons
    ? (GRID_WITH_ICONS[count] ?? GRID_WITH_ICONS[3])
    : (GRID_WITHOUT_ICONS[count] ?? GRID_WITHOUT_ICONS[3]);
  const visibleCount = columns.filter(Boolean).length;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <span className="flex items-center gap-2">
          {statusPill}
          {leadingIdentity}
        </span>
        {identity}
      </div>
      <div className={gridClass}>
        {useLeadingIcons && <div className="hidden sm:flex items-center self-stretch">{icons}</div>}
        {columns.map((col, i) => {
          if (!col) return <div key={`empty-${i}`} className="hidden sm:block" />;
          // Single-visible-column 3-col layouts span both mobile cells so the
          // value isn't stranded next to a phantom slot; multi-column layouts
          // keep the original 3-cols-spanning-last behaviour.
          const spanLast = visibleCount === 3 && i === columns.length - 1;
          return (
            <div key={col.label || `col-${i}`} className={spanLast ? "col-span-2 sm:col-span-1" : undefined}>
              <div className="text-rb-500 text-xs font-semibold flex items-center gap-1.5">
                {col.label}
                {col.headerIcon}
              </div>
              {col.assetIcons ? (
                <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                  {col.value}
                  {col.assetIcons}
                </div>
              ) : (
                col.value
              )}
              {col.footnote}
            </div>
          );
        })}
      </div>
    </div>
  );
}
