// Whether a RevealTip's press belongs to the provenance inspector (ui-jobs 623).
// Only a tip inside a value the inspector has made pickable gives its press to
// the trace; every other tip opens with the inspector on. `[data-prov-pickable]`
// is stamped on a <Prov> only while it is a target (armed, scoped to it), so a
// scope armed elsewhere leaves this tip its own press.

/** The selector <Prov> carries while the inspector can pick it. */
export const PICKABLE_SELECTOR = "[data-prov-pickable]";

export function tipYieldsToTrace(el: { closest(selector: string): unknown } | null, armed: boolean): boolean {
  return armed && el != null && el.closest(PICKABLE_SELECTOR) != null;
}
