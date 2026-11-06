// The shell every page stands in from md up (ui-jobs 67, 480, 498): the brand
// rail (H1) fixed at the left edge, the page column beside it, and the profile
// control (H20) at the column's top right. app/(app) draws the app column and
// AppFooter in it; app/(site) and the root 404 draw the site column, whose
// pages set their own widths and full-bleed bands, and SiteFooter.
//
// The rail is fixed to the left edge, so the column pays for it with padding:
// `md:pl-14` reserves the rail's 56px on the outer block and each page's
// `mx-auto` then centres its content in what is left, rather than the rail
// pushing a viewport-centred column off centre. Below md there is no rail and
// the header bar (H2) carries the chrome.
//
// The app column: `md:-mt-[17px]` pulls it up so a page's first row (every
// page's top wrapper carries `py-8`, 32px) centres on the rail's glyph, which
// centres 31px below the viewport top (ui-jobs 71). H20 stands at the
// column's top right, 32px down, centred on that first row, and reaches 10px
// past the content edge as the bar's controls do; pages keep their top row's
// right end clear of it (`PROFILE_CLEARANCE`).
//
// The site column has no width of its own, so H20 stands in a max-w-7xl frame
// laid over its top at the same place as on an app page (15px down: the app
// column's 32px less its 17px pull).
//
// The footer stands at the foot of the viewport on a short page: the body is a
// flex column (app/layout.tsx), the column fills what the strips and the header
// bar leave, and the page grows to push the footer down (ui-jobs 509).

import type { ReactNode } from "react";
import { ProfileMenu } from "@/components/nav/profile-menu";
import { BrandRail } from "@/components/nav/brand-rail";

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
      <BrandRail />
      <div className="flex flex-1 flex-col md:pl-14">
        {column === "app" ? (
          <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 md:-mt-[17px] md:px-6">
            <div className="absolute right-3.5 top-8 z-10 hidden md:block" data-profile-corner="">
              <ProfileMenu />
            </div>
            {children}
          </main>
        ) : (
          <main className="relative flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden md:block">
              <div className="relative mx-auto max-w-7xl px-4 md:px-6">
                <div
                  className="pointer-events-auto absolute right-3.5 top-[15px] flex items-center gap-1"
                  data-profile-corner=""
                >
                  <ProfileMenu />
                </div>
              </div>
            </div>
            {children}
          </main>
        )}
        {footer}
      </div>
    </>
  );
}
