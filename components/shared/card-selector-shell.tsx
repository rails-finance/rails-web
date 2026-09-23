"use client";

import { useState, type ReactNode } from "react";
import { ExpandChevron } from "@/components/shared/expand-chevron";

// Generic shell for position/trove/spoke selectors: sticky active card + expandable
// chooser list + chevron button. Each protocol supplies its own card body via
// `renderCard`.

export type PositionCardStatus = "open" | "closed" | "liquidated";

/**
 * Shared hover surface for position chooser cards. Four states:
 *  - staticCard: only one position, no hover affordance.
 *  - active card while the chooser is expanded (`isSelected`): soft blue
 *    tint matching the "currently selected" treatment used by header nav
 *    dropdowns. Only shown while the user is actively choosing — collapsed
 *    view stays neutral so the page doesn't carry a permanent blue accent.
 *  - active card collapsed (`noHover`): transparent, with a subtle bg bump
 *    when the parent group is hovered to hint the card is interactive.
 *  - chooser cards: transparent at rest, hover bumps bg + flips the border
 *    blue to advertise that clicking switches the active position.
 */
export function positionCardSurface(
  _status: PositionCardStatus,
  opts: { noHover?: boolean; staticCard?: boolean; isSelected?: boolean } = {},
): string {
  if (opts.staticCard) return "border border-transparent";
  if (opts.isSelected) return "border border-blue-500/30 bg-blue-500/5 group-hover/card:bg-blue-500/10";
  if (opts.noHover) return "border border-transparent group-hover/card:bg-blue-500/10";
  return "border border-transparent hover:bg-blue-500/10 hover:border-blue-500";
}

export interface CardSelectorItem {
  id: string;
  /** Optional — when present, the count pill above the chevron splits into
   * open vs. closed/liquidated so users can see both at a glance. */
  status?: PositionCardStatus;
}

export interface CardRenderProps {
  isActive: boolean;
  isSelected: boolean;
  noHover: boolean;
  staticCard: boolean;
  onClick: () => void;
}

export interface CardSelectorShellProps<T extends CardSelectorItem> {
  items: T[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  renderCard: (item: T, props: CardRenderProps) => ReactNode;
  /** Optional reorder for the chooser list (e.g. active first, then by recency). */
  orderItems?: (items: T[]) => T[];
}

export function CardSelectorShell<T extends CardSelectorItem>({
  items,
  selected,
  onSelect,
  renderCard,
  orderItems,
}: CardSelectorShellProps<T>) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const activeItem = items.find((i) => i.id === selected) ?? items[0];
  const hasMultiple = items.length > 1;
  const orderedItems = (orderItems ? orderItems(items) : items).filter((i) => i.id !== activeItem.id);

  return (
    <div className="group/card flex items-stretch gap-2">
      <div className="flex-1 min-w-0 space-y-3">
        <div>
          {renderCard(activeItem, {
            isActive: true,
            isSelected: expanded,
            noHover: true,
            staticCard: !hasMultiple,
            onClick: hasMultiple ? () => setExpanded((v) => !v) : () => {},
          })}
        </div>

        {hasMultiple && orderedItems.length > 0 && (
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="overflow-hidden">
              <div className="space-y-3">
                {orderedItems.map((item) => (
                  <div key={item.id}>
                    {renderCard(item, {
                      isActive: false,
                      isSelected: false,
                      noHover: false,
                      staticCard: false,
                      onClick: () => {
                        onSelect(item.id);
                        setExpanded(false);
                      },
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {hasMultiple && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-col items-center justify-start pt-10 gap-1 shrink-0 cursor-pointer"
          aria-label={expanded ? "Collapse list" : "Expand list"}
        >
          <ExpandChevron isOpen={expanded} group="card" />
        </button>
      )}
    </div>
  );
}
