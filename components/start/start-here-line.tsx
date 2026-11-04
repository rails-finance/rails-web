// The one line into the guided way in (rails-ops ui-jobs 478), drawn where a
// reader has found nothing: the wallet view's empty state and the 404 pages.

import Link from "next/link";

export function StartHereLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-rb-500 ${className}`}>
      Not sure where to look?{" "}
      <Link
        href="/start"
        className="text-foreground underline underline-offset-2 hover:text-rb-700 dark:hover:text-rb-300"
        data-start-here=""
      >
        Start here →
      </Link>
    </p>
  );
}
