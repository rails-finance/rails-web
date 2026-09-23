// Consolidated interaction grammar — one visual affordance per meaning, so a
// control's appearance always tells the user what it does. Import these strings
// rather than hand-rolling hover/border treatments, so the language stays
// consistent as new surfaces are added.
//
// The three meanings:
//
//  1. NAVIGATION — a control (button or text) that takes you to another page.
//     Signalled by BLUE on hover (a blue border for buttons, blue text for
//     links). Blue is reserved exclusively for "this goes somewhere" — never
//     used for in-place toggles — so a blue hover edge always means navigation.
//
//  2. IN-PLACE CONTROL — sort / filter / date / display / chart toggles that
//     change the current view without leaving the page. "Reactive ghost": no
//     resting fill (just a muted icon/label), a soft surface fill appears on
//     hover, and a persistent fill marks the engaged/open state. Never a border
//     (borders mean navigation).
//
//  3. PASSIVE PILL — labels like "NO DEBT", durations, percentages. They keep a
//     soft resting fill but never react to hover. Because only passive pills
//     carry an always-on fill and only controls react to hover, the two never
//     read as the same thing. (Pills are styled at their call sites; there's no
//     token here — this comment documents the third leg of the grammar.)

// Dark-mode note: the app's dark page canvas is rb-800, so control fills go
// *lighter* in dark (rb-700/600) to read as a lift; light mode darkens slightly
// (rb-200/300) against the rb-50 canvas. This keeps the hover/engaged states
// visible on both the bare page and the rb-900 panels controls also sit on.

/** Button that navigates to another page. Blue border appears on hover. */
export const NAV_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-rb-100 dark:border-rb-800 bg-rb-100 dark:bg-rb-800 px-3 py-1.5 text-sm text-rb-500 hover:text-foreground hover:bg-rb-200/60 dark:hover:bg-rb-700/50 hover:border-blue-500 transition-colors cursor-pointer";

/** Text/inline link that navigates to another page. Turns blue on hover. */
export const NAV_LINK = "text-rb-500 hover:text-blue-500 transition-colors";

/**
 * Marketing-page CTA pill — the bordered rounded-full navigation button the
 * home page uses ("View live position", "See detailed coverage"). Blue text per
 * the one-meaning-per-colour rule (blue = navigation). Visual core only:
 * callers add their own reveal/hover behaviour (the hero pill fades in with
 * its frame's hover; a free-standing pill answers hover with a blue border).
 */
export const PILL_CTA =
  "inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-blue-500 bg-background/90 border border-rb-200 dark:border-rb-800 px-4 py-2 rounded-full backdrop-blur-sm";

/**
 * In-place control — structural base only (layout + transition). Pair with
 * exactly one state token (CTRL_OFF / CTRL_ON / CTRL_ON_ACCENT) so a single
 * hover-fill rule applies, then add size/shape utilities (e.g. `w-7 h-7
 * rounded-md`, `h-7 px-2.5 rounded-md text-xs`).
 */
export const CTRL_GHOST = "inline-flex items-center justify-center transition-colors cursor-pointer";

/** Idle in-place control: muted, gains a soft fill + foreground on hover. */
export const CTRL_OFF = "text-rb-500 hover:bg-rb-100 dark:hover:bg-rb-800 hover:text-foreground";

/** Engaged/open in-place control: holds the same soft fill CTRL_OFF shows on
 * hover, so an open control simply looks "hovered" for as long as it's engaged. */
export const CTRL_ON = "bg-rb-100 dark:bg-rb-800 text-foreground";

/** Optional companion to CTRL_ON, for an open control that is also the thing
 *  that CLOSES the panel — one step deeper on hover, so the pointer still gets
 *  an answer. CTRL_ON alone is deliberately inert (it already looks hovered),
 *  which is right for a state a click cannot undo and wrong for a toggle. */
export const CTRL_ON_HOVER = "hover:bg-rb-200 dark:hover:bg-rb-700";

/** Engaged in-place control carrying a semantic accent (e.g. an active date
 *  filter). Teal — it's an in-place control state, which is the utility hue's
 *  job (color-grammar.md §4c); NOT a status, so not a caution/orange. */
export const CTRL_ON_ACCENT = "bg-teal-500/15 text-teal-600 dark:text-teal-400 hover:bg-teal-500/25";

/**
 * Pre-hydration control state — the attribute a control strip carries until its
 * handlers are attached, so a page that LOOKS ready stops claiming to be.
 *
 * An SSR'd page paints its controls in the first response; React attaches the
 * behaviour behind them only once the bundle has arrived and run. A click in
 * between is not answered late, it is lost. Measured on a production build:
 * ~50ms on a fast machine over localhost, but 286–561ms at 4× CPU on fast 4G
 * and 1,165–1,829ms on slow 4G — up to 1.8 seconds of a finished-looking page
 * that swallows every click (scripts/verify/measure-hydration-window.mjs).
 *
 * The styling lives in globals.css and is DELAYED by 250ms, which is the whole
 * design: the fast path finishes at ~50ms and the muted state is never drawn,
 * so no page picks up a flash of grey on a good connection. Only a load that is
 * genuinely slow crosses the threshold and says so. The threshold sits in
 * measured empty space — nothing landed between 99ms and 286ms.
 *
 * No hue: opacity and the absence of a hover reaction carry it. A colour here
 * would have to mean "not ready", and the palette already spends its meanings
 * (color-grammar.md §4c).
 */
const CTRL_WAKING = "data-ctrl-waking";

/* Deliberately module-local: the attribute is written out as a literal in
   globals.css and in scripts/verify/verify-ctrl-waking.mjs, neither of which can
   import it, and ctrlWaking() below is the only way a component should ever set
   it. Exporting it would offer a second, unchecked way to mark a strip. */

/** Spread onto a control strip's own wrapper: `{...ctrlWaking(useHydrated())}`.
 *  Marks the strip while it is inert, and clears to nothing once it is live.
 *  `aria-busy` carries the same fact to assistive tech, which otherwise has no
 *  way to tell a dead control from a live one. */
export function ctrlWaking(hydrated: boolean): Record<string, string> {
  return hydrated ? {} : { [CTRL_WAKING]: "", "aria-busy": "true" };
}

/**
 * In-panel reset link — the single "Reset" affordance that lives in an open
 * control's / filter panel's header (events filter, date filter, listing
 * Filters, …). One token so the verb ("Reset", never "Clear"/"×"), colour, and
 * styling stay identical everywhere, and the reset always sits in the panel
 * header rather than floating next to the trigger.
 *
 * Colour: teal — the brand's dedicated "utility action / in-place interaction"
 * hue. Its remaining uses are the New pill, active nav, CTRL_ON_ACCENT, and the
 * activity heatmap. Deliberately NOT blue (navigation), pink (external/party),
 * green (marketing brand + positive sign), orange (redemption) or red
 * (negative/liquidation), so per the one-meaning-per-colour rule teal always
 * reads as "utility/in-place interaction", never a status or a nav target.
 * (amber is mid-review — see color-grammar.md §7.)
 *
 * Teal explicitly does NOT cover *disclosure* — a control that only reveals
 * more of the card it sits on (the info-disclosure (i)/chevron triggers, the
 * expand/collapse chevron). Those rest muted and go to foreground on hover.
 */
export const RESET_LINK = "text-xs font-semibold text-teal-600 hover:text-teal-500 transition-colors cursor-pointer";

/**
 * In-panel navigation link — a small link that lives beside a control/section
 * header but, unlike RESET_LINK, *opens a page* rather than mutating state
 * (e.g. the "Compare" link beside the Hub filter → /aave-v4/hubs). Same size +
 * weight as RESET_LINK so the two sit together cleanly; blue per the
 * one-meaning-per-colour rule (blue = navigation), so it reads as "goes
 * somewhere", not "resets". The app-wide rule: any link that opens a page is
 * blue (and a clickable card gets a blue hover border instead).
 */
export const PAGE_LINK = "text-xs font-semibold text-blue-500 hover:underline cursor-pointer";

/**
 * Dropdown / overlay-panel title — the heading row at the top of every
 * `overlay-panel` (sort menu, filter dropdown, filter-section dropdown, …). One
 * token so every dropdown opens with the same title treatment. Canonical
 * structure: this heading sits in a `flex items-center justify-between px-4 py-3`
 * row (with an optional trailing RESET_LINK), immediately followed by a
 * `my-1 mx-3 border-t border-rb-300 dark:border-rb-700` divider, then the
 * `overlay-item` rows. See components/shared/filter-dropdown.tsx for the
 * reference panel.
 */
export const OVERLAY_HEADING = "text-xs uppercase tracking-wider font-bold";

/**
 * Subordinate section label inside a multi-section overlay panel (e.g. the
 * per-dimension headers in a grouped filter-section dropdown). Smaller + muted
 * so it reads one clear level below OVERLAY_HEADING.
 */
export const OVERLAY_SUBHEADING = "text-[10px] uppercase tracking-wider font-bold text-rb-500";

/**
 * Passive metadata pill — a soft, always-on chip that labels (duration, "ago",
 * counts). One height / radius / type size so adjacent pills line up, and never
 * a hover reaction (that's reserved for CTRL_* controls). Add a leading icon as
 * a child; the gap + symmetric padding keep its height matched to text-only
 * pills.
 */
export const PILL_META =
  "inline-flex items-center gap-1 rounded-full bg-rb-100 dark:bg-rb-800 px-2 py-0.5 text-xs text-rb-500";

/**
 * Count badge — a solid chip showing a count of active selections (e.g. the
 * number of engaged filter groups). Its job is to pull the eye to "you have N
 * active", so it lifts off the control surface it nests in (CTRL_ON = rb-100
 * light / rb-800 dark). The fill is theme-split because a single fixed value
 * can't serve both: rb-500 reads as a gentle lift off the dark button but
 * inverts into a heavy saturated stamp on the white one, so light steps a touch
 * darker (rb-400) instead — matched restraint, opposite direction. text is
 * theme-aware via text-foreground.
 * One token so the badge reads identically everywhere a count appears — the
 * listing filter bar, the per-category multi-select pills, and the timeline
 * controls.
 */
export const COUNT_BADGE =
  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-rb-400 dark:bg-rb-500 text-foreground text-[10px] font-semibold";
