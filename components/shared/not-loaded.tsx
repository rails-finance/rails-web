// "Not loaded": what a card says where a chain read did not answer. A missing
// figure is stated in words with a hover line, never drawn as a dash or a zero,
// and never scaled by a guessed number of decimals.
//
// Only for a TRANSIENT failure: the RPC refused or timed out and the next load
// asks again. A figure the chain can never give is a coverage `{ why }`, and says
// why in its own words.

/** A figure the chain did not answer for. `title` is the hover line; the
 *  default fits any figure, and a caller names the figure where it can.
 *  `inline` lowercases the words for use inside a sentence. */
export function NotLoaded({
  title = "The chain didn't answer for this figure. It shows once it does.",
  className = "text-rb-500",
  inline = false,
}: {
  title?: string;
  className?: string;
  inline?: boolean;
}) {
  return (
    <span className={className || undefined} title={title}>
      {inline ? "not loaded" : "Not loaded"}
    </span>
  );
}

/** The stand-in for a token amount whose `decimals` did not load: the raw
 *  balance is known and its scale is not, so the card names the token (its
 *  symbol, or the truncated address that stands in for one) and states no
 *  amount. The full address, where the row carries one, rides the hover line. */
export function TokenAmountNotLoaded({ address, label }: { address?: string; label: string }) {
  return (
    <span
      className="text-rb-500"
      title={`${address || label}: the chain didn't answer for this token's decimals. The amount shows once it does.`}
    >
      Not loaded <span className="font-mono text-sm font-normal">{label}</span>
    </span>
  );
}

/** Symbols for an icon cluster, leaving out tokens whose metadata did not load:
 *  their placeholder symbol is an address, which has no icon. */
export function loadedSymbols(tokens: { symbol: string; decimalsUnread?: true }[]): string[] {
  return tokens.filter((t) => !t.decimalsUnread).map((t) => t.symbol);
}
