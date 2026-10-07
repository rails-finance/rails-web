import type { ReactNode } from "react";
import {
  PositionCardHeader,
  PositionCardRegion,
  PositionCardRow,
  PositionSummaryHeading,
} from "@/components/shared/position-card-disclosure";

export interface OpenPositionStatsColumn {
  label: string;
  /** What the heading means, shown on hover or tap (MakerDAO). */
  labelTip?: string;
  value: ReactNode;
  footnote?: ReactNode;
  /** Token icon shown after the column label */
  headerIcon?: ReactNode;
  /** Larger asset cluster rendered between the column label and the value.
   *  When ANY column sets this, the leading `icons` slot is suppressed so the
   *  cluster sits next to the data it identifies. */
  assetIcons?: ReactNode;
  /** On a disclosing card, whether the row's lines stand open before a
   *  viewer moves them (ui-jobs 295). Default: the first two rows (the
   *  position's assets) open, the rest closed. */
  defaultOpen?: boolean;
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
  /** Below `sm`, one headline per row, value and asset icons side by side.
   *  Opt-in: the closed card of ui-jobs 209, whose nine-digit headlines
   *  collide two to a row at 390px. */
  stackOnPhone?: boolean;
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

export function OpenPositionStats({
  columns,
  icons,
  identity,
  leadingIdentity,
  statusPill,
  stackOnPhone = false,
}: OpenPositionStatsProps) {
  const count = columns.length;
  // When any column carries its own asset cluster, drop the leading icons
  // slot — the cluster moves into the column it describes.
  const hasInColumnAssets = columns.some((c) => c?.assetIcons != null);
  const useLeadingIcons = !!icons && !hasInColumnAssets;
  const baseGrid = useLeadingIcons
    ? (GRID_WITH_ICONS[count] ?? GRID_WITH_ICONS[3])
    : (GRID_WITHOUT_ICONS[count] ?? GRID_WITHOUT_ICONS[3]);
  const gridClass = stackOnPhone ? baseGrid.replace("grid-cols-2 ", "grid-cols-1 ") : baseGrid;
  const visibleCount = columns.filter(Boolean).length;
  return (
    <div>
      <PositionCardHeader className="flex items-center justify-between gap-2 flex-wrap" spacing="mb-3" anatomy="C5">
        {/* Wraps between pieces: at 390px the owner address used to break in
            two beside a squeezed pair label. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <PositionSummaryHeading />
          {statusPill}
          {leadingIdentity}
        </span>
        {identity}
      </PositionCardHeader>
      <PositionCardRegion className={gridClass} anatomy="C10">
        {useLeadingIcons && <div className="hidden sm:flex items-center self-stretch">{icons}</div>}
        {columns.map((col, i) => {
          if (!col) return <div key={`empty-${i}`} className="hidden sm:block" />;
          // Single-visible-column 3-col layouts span both mobile cells so the
          // value isn't stranded next to a phantom slot; multi-column layouts
          // keep the original 3-cols-spanning-last behaviour.
          const spanLast = !stackOnPhone && visibleCount === 3 && i === columns.length - 1;
          return (
            <PositionCardRow
              key={col.label || `col-${i}`}
              index={i}
              defaultOpen={col.defaultOpen ?? i < 2}
              label={col.label}
              labelTip={col.labelTip}
              headerIcon={col.headerIcon}
              className={spanLast ? "col-span-2 sm:col-span-1" : undefined}
            >
              {col.assetIcons ? (
                <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                  {col.value}
                  {col.assetIcons}
                </div>
              ) : (
                col.value
              )}
              {col.footnote}
            </PositionCardRow>
          );
        })}
      </PositionCardRegion>
    </div>
  );
}
