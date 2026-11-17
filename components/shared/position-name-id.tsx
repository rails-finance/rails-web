import type { PositionName } from "@/lib/shared/position-name";

/** "<Noun> <id>" in a detail card's heading (C5), for a family whose position
 *  has its own id (a trove id, a cdp or NFT number, a loan id, an account
 *  number). An address-keyed family draws none: the page's h1 names the owner.
 *  ui-jobs 703. */
export function PositionNameId({ name }: { name: PositionName }) {
  return (
    <span className="text-xs font-normal tabular-nums text-rb-400" data-position-name-id="">
      {name.noun} {name.id}
    </span>
  );
}
