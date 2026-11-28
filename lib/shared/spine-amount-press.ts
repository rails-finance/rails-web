// What a press on the spine's linked amount does (ui-jobs 872, anatomy L3.2;
// components/shared/activity-timeline.tsx SpineVal). On a screen without hover
// the first tap opens the amount's tooltip and the second follows the link; the
// link in the tooltip follows it, and a press elsewhere closes it. A mouse
// click and a keyboard Enter follow at once. Tested by
// scripts/test/spine-amount-link.test.mjs.

export type SpineAmountPress = {
  /** The amount itself, the link in its tooltip, or anywhere else. */
  on: "amount" | "tip" | "outside";
  /** The screen matches `(hover: none)`. */
  hoverless: boolean;
  /** The click came from the keyboard (Enter on the link: `detail` 0). */
  keyboard: boolean;
};

export function spineAmountPress(open: boolean, p: SpineAmountPress): { open: boolean; follow: boolean } {
  if (p.on === "outside") return { open: false, follow: false };
  if (p.on === "tip") return { open, follow: true };
  if (open || !p.hoverless || p.keyboard) return { open, follow: true };
  return { open: true, follow: false };
}
