import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";
import { IconSymbols } from "@/components/icons/iconSymbols";
import { Header } from "@/components/header";
import { ThemeScript } from "@/components/ThemeScript";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rails",
  description: "Rails Web3 App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body
        className={`${inter.className} antialiased bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 min-h-screen overflow-x-hidden min-w-[320px]`}
      >
        <IconSymbols />
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
