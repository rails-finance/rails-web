// What a press on a linked value does (ui-jobs 872 and 878, anatomy L14 and
// L3.2; components/shared/linked-value.tsx). A touch or a pen opens the
// value's tooltip first, and a second press follows the link; the link in
// the tooltip follows it, and a press elsewhere closes it. A mouse click and a
// keyboard Enter follow at once. With no pointer event seen (a screen reader's
// activation), a screen without hover opens the tooltip first. Tested by
// scripts/test/spine-amount-link.test.mjs and linked-value.test.mjs.

export type ValuePress = {
  /** The value (872's "amount"), the link in its tooltip, or anywhere else. */
  on: "value" | "amount" | "tip" | "outside";
  /** The pointerdown's `pointerType` ahead of the click, if one came. */
  pointer?: string;
  /** The screen matches `(hover: none)`: read where no pointer event came. */
  hoverless: boolean;
  /** The click came from the keyboard (Enter on the link: `detail` 0). */
  keyboard: boolean;
};

export function valuePress(open: boolean, p: ValuePress): { open: boolean; follow: boolean } {
  if (p.on === "outside") return { open: false, follow: false };
  if (p.on === "tip") return { open, follow: true };
  if (open || p.keyboard) return { open, follow: true };
  const tapFirst = p.pointer ? p.pointer === "touch" || p.pointer === "pen" : p.hoverless;
  return tapFirst ? { open: true, follow: false } : { open, follow: true };
}

/** 872's name for the rule, kept for its callers. */
export function spineAmountPress(open: boolean, p: ValuePress): { open: boolean; follow: boolean } {
  return valuePress(open, p);
}
