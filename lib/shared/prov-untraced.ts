// The receipt's untraced-input self-audit (components/shared/provenance.tsx):
// every identifier a formula names should match one of its input rows. Matching
// is lenient (substring, either direction: "shares" ↔ "borrowShares"), so only
// a wholly missing operand flags. Pure, so a unit test runs the same rule.

/** Formula words that are not operands. */
const FORMULA_STOPWORDS = new Set([
  "rounded",
  "rounding",
  "up",
  "down",
  "the",
  "of",
  "at",
  "to",
  "per",
  "and",
  "or",
  "wei",
  "abs",
  "min",
  "max",
  "sum",
]);

/** The words a formula names that no input label carries; none where the
 *  receipt has no formula or no input rows. */
export function untracedInputs(formula: string | undefined, leaves: readonly { label: string }[]): string[] {
  if (!formula || leaves.length === 0) return [];
  return [
    ...new Set(
      (formula.match(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g) ?? []).filter((t) => {
        const lt = t.toLowerCase();
        if (FORMULA_STOPWORDS.has(lt)) return false;
        return !leaves.some((l) => {
          const ll = l.label.toLowerCase();
          return ll.includes(lt) || lt.includes(ll);
        });
      }),
    ),
  ];
}
