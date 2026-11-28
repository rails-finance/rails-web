// What a press on the spine's linked amount does (ui-jobs 872, anatomy L3.2;
// components/shared/activity-timeline.tsx SpineVal). A touch or a pen opens
// the amount's tooltip first, and a second press follows the link; the link in
// the tooltip follows it, and a press elsewhere closes it. A mouse click and a
// keyboard Enter follow at once. With no pointer event seen (a screen reader's
// activation), a screen without hover opens the tooltip first. Tested by
// scripts/test/spine-amount-link.test.mjs.

export type SpineAmountPress = {
  /** The amount itself, the link in its tooltip, or anywhere else. */
  on: "amount" | "tip" | "outside";
  /** The pointerdown's `pointerType` ahead of the click, if one came. */
  pointer?: string;
  /** The screen matches `(hover: none)`: read where no pointer event came. */
  hoverless: boolean;
  /** The click came from the keyboard (Enter on the link: `detail` 0). */
  keyboard: boolean;
};

export function spineAmountPress(open: boolean, p: SpineAmountPress): { open: boolean; follow: boolean } {
  if (p.on === "outside") return { open: false, follow: false };
  if (p.on === "tip") return { open, follow: true };
  if (open || p.keyboard) return { open, follow: true };
  const tapFirst = p.pointer ? p.pointer === "touch" || p.pointer === "pen" : p.hoverless;
  return tapFirst ? { open: true, follow: false } : { open, follow: true };
}
