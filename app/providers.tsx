"use client";

import { ThemeProvider } from "next-themes";
import { type ReactNode } from "react";
import { PreferencesProvider } from "@/lib/shared/preferences-context";

type Props = {
  children: ReactNode;
};

export function Providers({ children }: Props) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <PreferencesProvider>{children}</PreferencesProvider>
    </ThemeProvider>
  );
}
