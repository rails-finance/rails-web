import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "./globals.css";

import { getConfig } from "./wagmi";
import { Providers } from "./providers";
import { IconSymbols } from "@/components/icons/iconSymbols";
import { Header } from "@/components/header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-800 text-white min-h-screen overflow-x-hidden`}
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
