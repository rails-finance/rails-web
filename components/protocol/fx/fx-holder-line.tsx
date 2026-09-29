// The current holder of an f(x) position and since when: one line under the
// card's figures, for a position whose NFT has changed hands.

import { formatDate } from "@/lib/date";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function FxHolderLine({ holder }: { holder: { owner: string; since: number; openedBy: string | null } }) {
  return (
    <div className="text-xs text-rb-500 tabular-nums">
      Held by {short(holder.owner)} since {formatDate(holder.since)}
      {holder.openedBy ? `; opened by ${short(holder.openedBy)}` : ""}.
    </div>
  );
}
