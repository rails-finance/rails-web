/** lucide's list-chevrons-up-down and list-chevrons-down-up (the installed
 *  lucide-react predates both). `open`: the down-up form, for a switch that
 *  hides. */
export function ListChevronsIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 5h8" />
      <path d="M3 12h8" />
      <path d="M3 19h8" />
      {open ? (
        <>
          <path d="m15 5 3 3 3-3" />
          <path d="m15 19 3-3 3 3" />
        </>
      ) : (
        <>
          <path d="m15 8 3-3 3 3" />
          <path d="m15 16 3 3 3-3" />
        </>
      )}
    </svg>
  );
}
