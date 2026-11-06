import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/resilience/ErrorBoundary";
import { Web3Provider } from "@/components/providers/Web3Provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FreshMarket | Portable, Wallet-Owned Second-Hand Marketplace",
  description:
    "A wallet-owned second-hand marketplace with time-limited listings powered by Arkiv Rabdi testnet. Built for ETHGlobal Mumbai 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-background focus:p-3">Skip to content</a>
        <ThemeProvider><ErrorBoundary><Web3Provider>
          <Suspense fallback={<div className="h-16 border-b border-border/40 bg-background" />}>
            <Navbar />
          </Suspense>
          <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </Web3Provider></ErrorBoundary></ThemeProvider>
      </body>
    </html>
  );
}
