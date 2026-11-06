// The hover tile on the chrome's controls (ui-jobs 514, 516): the sidebar
// toggles, the chooser's chain tabs and its explorer rows, and the menu
// triggers that open a menu in place (the profile control, H20; the wallet
// heading's address, H13, takes CANVAS_HOVER below), which stay neutral. A step past the raised
// surface the rail and the panel are drawn on (rb-100 / rb-800), so it shows
// there and on the canvas alike; the selected chain tab is the full step.
export const CHROME_HOVER = "hover:bg-rb-200/70 dark:hover:bg-rb-700/70";
/** The same tile held while the control's menu is open (ui-jobs 516). */
export const CHROME_HOVER_ON = "bg-rb-200/70 dark:bg-rb-700/70";

/** The tile for a trigger on the page canvas (the wallet heading's address,
 *  H13). In dark the chrome's rb-700 is a hair off the canvas and does not
 *  show, so the tile steps the other way: rb-800, darker than the canvas and
 *  lighter than the menu it opens (rb-900), the Back button's ground (Miles,
 *  6 Nov 2026). Light keeps the chrome's tile. */
export const CANVAS_HOVER = "hover:bg-rb-200/70 dark:hover:bg-rb-800";
/** CANVAS_HOVER held while the trigger's menu is open. */
export const CANVAS_HOVER_ON = "bg-rb-200/70 dark:bg-rb-800";
