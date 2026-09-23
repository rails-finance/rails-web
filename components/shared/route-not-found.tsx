// The one 404 body. A detail route that calls `notFound()` composes this
// instead of falling through to Next's stock "404: This page could not be
// found", which names no protocol and offers no way back.
//
// It only reaches a reader who runs JavaScript. Measured on Next 15.5.7: a
// `notFound()` thrown from a page never server-renders its not-found body into
// the HTML — sync or async, dynamic or static, the markup arrives only in the
// flight payload and the browser draws it. (Only an unmatched URL, which never
// reaches a page, renders its 404 in HTML.) The *status* is correct for every
// reader, which is the half that matters to a crawler; the words are the half
// that needs a browser. Worth re-checking on a Next upgrade.
//
// What makes the status correct is not this file. It is the `(views)` route
// group beside every explorer's detail routes: a `loading.tsx` is a Suspense
// boundary over its whole subtree, and while one sat at the explorer root the
// shell flushed before the page's read resolved, so the response status was
// already 200 by the time `notFound()` ran.

import Link from "next/link";
import type { ReactNode } from "react";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import type { SessionProtocol } from "@/lib/shared/sessions";

export function RouteNotFound({
  session,
  heading,
  children,
  backHref,
  backLabel,
}: {
  /** Whose explorer this is — drives the back affordance's fallback route. */
  session: SessionProtocol;
  /** What is missing, in the protocol's own nouns. */
  heading: string;
  /** Why the address does not name anything — one sentence, no apology. */
  children: ReactNode;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="py-8">
      <DetailBackButton session={session} />
      <div className="py-12 text-center text-rb-500">
        <h1 className="mb-2 text-lg font-medium text-rb-900 dark:text-rb-100">{heading}</h1>
        <p className="mx-auto mb-6 max-w-md text-sm">{children}</p>
        <Link href={backHref} className="text-sm text-rb-700 underline underline-offset-4 dark:text-rb-300">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
