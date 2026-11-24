/** The lead column's name for a screen reader: "Protocol" where the table
 *  draws no chain glyph (`chainless`), "Protocol and chain" where it does. */
export function leadHeaderName(chainless?: boolean): string {
  return chainless ? "Protocol" : "Protocol and chain";
}
