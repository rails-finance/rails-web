"use client";

import { ThemeProvider } from "next-themes";
import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function Providers({ children }: Props) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
