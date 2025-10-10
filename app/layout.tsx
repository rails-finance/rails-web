import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";
import { IconSymbols } from "@/components/icons/iconSymbols";
import { Header } from "@/components/header";
import { ThemeScript } from "@/components/ThemeScript";
import { StructuredData } from "@/components/StructuredData";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12151E" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://rails.finance"),
  title: {
    default: "Rails - DeFi Self-Service Support",
    template: "Rails | %s",
  },
  description:
    "Self-service support for DeFi users. Rails displays your DeFi activity on simple timelines with clear explanations and in-depth transaction analysis. Track Liquity V2 Troves and more.",
  keywords: [
    "DeFi",
    "Liquity V2",
    "Trove",
    "Transaction Analysis",
    "Ethereum",
    "BOLD",
    "Stablecoin",
    "ETH",
    "wstETH",
    "rETH",
    "Lending Protocol",
  ],
  authors: [{ name: "Rails", url: "https://rails.finance" }],
  creator: "Rails",
  publisher: "Rails",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://rails.finance",
    title: "Rails - DeFi Self-Service Support",
    description:
      "Self-service support for DeFi users. Rails displays your DeFi activity with clear explanations and in-depth transaction analysis.",
    siteName: "Rails",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Rails - DeFi Self-Service Support",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rails - DeFi Self-Service Support",
    description:
      "Self-service support for DeFi users. Rails displays your DeFi activity with clear explanations and in-depth transaction analysis.",
    images: ["/twitter-image.png"],
    creator: "@rails_finance",
    site: "@rails_finance",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://rails.finance",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#12151E" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <ThemeScript />
        <StructuredData />
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
