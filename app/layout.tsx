import type { Metadata } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "./globals.css";

import { getConfig } from "./wagmi";
import { Providers } from "./providers";
import { IconSymbols } from "@/components/icons/iconSymbols";
import { Header } from "@/components/header";


export const metadata: Metadata = {
  title: "Rails",
  description: "Rails Web3 App",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = cookieToInitialState(getConfig(), (await headers()).get("cookie"));

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased bg-slate-800 text-white min-h-screen overflow-x-hidden"
        style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
      >
        <IconSymbols />
        <Providers initialState={initialState}>
          <Header />
          <main className="max-w-7xl mx-auto px-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
