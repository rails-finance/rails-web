// The event page's party chip beside its h1 (components/shared/event-card.tsx, anatomy P4): where the sentence
// already names the party, the chip draws its mark alone. Imports nothing through `@/`, so scripts/test reads it.

/** Whether a sentence names the party: its name as a whole word, any case ("CoW" in "through CoW", never in
 *  "CoWswap"). */
export function sentenceNamesParty(sentence: string | undefined, name: string | undefined): boolean {
  if (!sentence || !name) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "iu").test(sentence);
}
