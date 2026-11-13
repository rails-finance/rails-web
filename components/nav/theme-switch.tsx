"use client";

// The theme switch: one button that shows the theme in force and steps to
// the next on each press, Light → Dark → Auto (the system's) → Light, with a
// sun, a moon and a sun-moon (Miles 13 Nov 2026, in place of the three-way
// radio group). It stands on the chrome's left side: from md at the brand
// rail's foot, over the beta pill, the icon alone (`placement="rail"`,
// components/nav/brand-rail.tsx); below md at the foot of the wallet panel,
// the slide-out the header's sidebar toggle opens, the icon and the word
// (`placement="panel"`, components/nav/wallet-panel.tsx).
//
// Until the stored theme is read on the client the button holds its place
// with no icon, so the server's render and the first client render agree.

import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";

import { CHROME_HOVER } from "@/components/nav/chrome-hover";

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Auto", Icon: SunMoon },
] as const;

type Placement = "rail" | "panel";

export function ThemeSwitch({ placement }: { placement: Placement }) {
  const { theme, setTheme } = useTheme();
  const [read, setRead] = useState(false);
  useEffect(() => setRead(true), []);
  const rail = placement === "rail";

  const at = read
    ? Math.max(
        0,
        THEMES.findIndex((t) => t.value === (theme ?? "system")),
      )
    : -1;
  const now = at < 0 ? null : THEMES[at];
  const next = THEMES[(Math.max(at, 0) + 1) % THEMES.length];
  const name = now ? `Theme: ${now.label}. Press for ${next.label}` : "Theme";

  return (
    <button
      type="button"
      aria-label={name}
      title={now ? `Theme: ${now.label} (press for ${next.label})` : undefined}
      onClick={() => now && setTheme(next.value)}
      className={`flex cursor-pointer items-center rounded-lg text-rb-500 transition-colors hover:text-foreground focus-ring ${CHROME_HOVER} ${
        rail ? "size-8 justify-center" : "min-h-10 gap-2 px-2 text-sm"
      }`}
      data-theme-switch={placement}
      data-theme-current={now?.value}
      data-anatomy={rail ? "H1.1" : undefined}
    >
      {now ? (
        <now.Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <span className="size-4 shrink-0" aria-hidden="true" />
      )}
      {!rail && <span>{now ? `Theme: ${now.label}` : "Theme"}</span>}
    </button>
  );
}
