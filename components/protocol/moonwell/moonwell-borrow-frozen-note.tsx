import Link from "next/link";
import { BASE_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { MOONWELL_BASE_BORROW_FREEZE_BLOCK, MOONWELL_BASE_BORROW_FREEZE_DATE } from "@/lib/moonwell-base/borrow-freeze";

// One sentence where Moonwell Base's borrowing figures show (ui-jobs 533).
// The markets view draws it only while the live cap read says every cap is one
// base unit; the other surfaces carry the dated fact without a read.
export function MoonwellBorrowFrozenNote({ className = "mb-3" }: { className?: string }) {
  return (
    <p className={`${className} max-w-3xl text-[11px] leading-relaxed text-rb-500`} data-borrow-cap-note="">
      Borrowing is frozen: at block{" "}
      <Link
        href={explorerUrl(BASE_CHAIN_ID, "block", MOONWELL_BASE_BORROW_FREEZE_BLOCK)}
        target="_blank"
        rel="noopener noreferrer"
        className={INLINE_LINK}
      >
        {MOONWELL_BASE_BORROW_FREEZE_BLOCK.toLocaleString("en-US")}
      </Link>{" "}
      ({MOONWELL_BASE_BORROW_FREEZE_DATE}) Moonwell set every borrow cap on Base to the smallest amount a token allows.
    </p>
  );
}
