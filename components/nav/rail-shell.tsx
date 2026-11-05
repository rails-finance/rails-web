// The shell every page stands in, under the header bar (H2), which carries
// the chrome at every width (ui-jobs 509: the brand rail, H1, is retired).
// app/(app) draws the app column and AppFooter; app/(site) and the root 404
// draw the site column, whose pages set their own widths and full-bleed
// bands, and SiteFooter.
//
// The footer stands at the foot of the viewport on a short page: the body is a
// flex column (app/layout.tsx), the column fills what the strips and the header
// bar leave, and the page grows to push the footer down (ui-jobs 509).

import type { ReactNode } from "react";

export function RailShell({
  column,
  footer,
  children,
}: {
  column: "app" | "site";
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col">
        {column === "app" ? (
          <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 md:px-6">{children}</main>
        ) : (
          <main className="relative flex-1">{children}</main>
        )}
        {footer}
      </div>
    </>
  );
}
