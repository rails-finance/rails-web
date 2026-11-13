"use client";

// The theme switch: Light, Dark or the system's (Auto), a radio group with a
// sun, a moon and a monitor, the one chosen on the chrome's selected tile
// (rb-200 / rb-700, a step past the raised ground it stands on). It left the
// profile menu (H20) on Miles's ruling of 13 Nov 2026 for the chrome's left
// side: from md at the brand rail's foot, over the beta pill, icons alone
// stacked down the rail (`placement="rail"`, components/nav/brand-rail.tsx);
// below md at the foot of the wallet panel, the slide-out the header's
// sidebar toggle opens, icons and words in a row (`placement="panel"`,
// components/nav/wallet-panel.tsx).
//
// One stop in the tab order (the chosen option); the arrow keys move the
// choice, as radios do. Until the stored theme is read on the client nothing
// shows chosen, so the server's render and the first client render agree.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { CHROME_HOVER } from "@/components/nav/chrome-hover";

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Auto", Icon: Monitor },
] as const;

type Placement = "rail" | "panel";

const CHOSEN = "bg-rb-200 text-foreground dark:bg-rb-700";
const OTHER = `text-rb-500 hover:text-foreground ${CHROME_HOVER}`;

export function ThemeSwitch({ placement }: { placement: Placement }) {
  const { theme, setTheme } = useTheme();
  const [read, setRead] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => setRead(true), []);
  const chosen = read ? (theme ?? "system") : null;
  const at = THEMES.findIndex((t) => t.value === chosen);
  const rail = placement === "rail";

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = THEMES[(Math.max(at, 0) + step + THEMES.length) % THEMES.length];
    setTheme(next.value);
    group.current?.querySelector<HTMLElement>(`[data-theme-option="${next.value}"]`)?.focus();
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="Theme"
      aria-orientation={rail ? "vertical" : "horizontal"}
      onKeyDown={onKey}
      className={rail ? "flex flex-col items-center gap-1" : "flex gap-1"}
      data-theme-switch={placement}
      data-anatomy={rail ? "H1.1" : undefined}
    >
      {THEMES.map(({ value, label, Icon }, i) => {
        const on = chosen === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={rail ? label : undefined}
            title={rail ? label : undefined}
            tabIndex={on || (at < 0 && i === 0) ? 0 : -1}
            onClick={() => setTheme(value)}
            className={`flex cursor-pointer items-center justify-center rounded-lg transition-colors focus-ring ${
              rail ? "size-8" : "min-h-10 flex-1 gap-2 px-2 text-sm"
            } ${on ? `${CHOSEN} ${rail ? "" : "font-medium"}` : OTHER}`}
            data-theme-option={value}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {!rail && label}
          </button>
        );
      })}
    </div>
  );
}
