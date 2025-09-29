import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";
import { IconSymbols } from "@/components/icons/iconSymbols";
import { Header } from "@/components/header";

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
      <body
        className={`${inter.className} antialiased bg-slate-800 text-white min-h-screen overflow-x-hidden`}
      >
        <IconSymbols />
        <Providers>
          <Header />
          <main className="max-w-7xl mx-auto px-4 md:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
