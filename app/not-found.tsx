// The 404 for a URL no route matches, and for a /start path the guided way in
// does not hold. A detail route's 404 is components/shared/route-not-found.tsx.

import Link from "next/link";
import { StartHereLine } from "@/components/start/start-here-line";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-32 pb-24 text-center text-rb-500">
      <h1 className="mb-2 text-lg font-medium text-rb-900 dark:text-rb-100">Page not found</h1>
      <p className="mx-auto mb-6 max-w-md text-sm">There is no page at this address.</p>
      <Link href="/" className="text-sm text-rb-700 underline underline-offset-4 dark:text-rb-300">
        Go to the home page
      </Link>
      <StartHereLine className="mt-4" />
    </main>
  );
}
