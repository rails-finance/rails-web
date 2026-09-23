"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/** Icon-only theme toggle that sits to the left of the hamburger in the
 *  HeaderBar. No pill/background — only the line art recolours to teal on
 *  hover, matching the footer affordance. At rest the icon shares the
 *  hamburger's ink (rb-700 / dark:rb-300) so the two read as one control
 *  cluster. Uses next-themes (the app's canonical theme mechanism); the
 *  mounted flag avoids the SSR/CSR mismatch on resolvedTheme, and a fixed-size
 *  placeholder keeps the header from shifting before hydration. */
export function HeaderThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="p-2.5" aria-hidden="true">
        <div className="h-4 w-4" />
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="group cursor-pointer p-2.5 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Moon
          className="h-4 w-4 text-rb-700 transition-colors group-hover:text-teal-500 dark:text-rb-300"
          aria-hidden="true"
        />
      ) : (
        <Sun
          className="h-4 w-4 text-rb-700 transition-colors group-hover:text-teal-500 dark:text-rb-300"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
