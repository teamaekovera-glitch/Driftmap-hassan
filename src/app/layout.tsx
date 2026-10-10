import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { GameStateProvider } from "@/components/game-state";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

/*
 * Editorial display face with system fallbacks — a failed font fetch stays
 * cosmetic, never structural.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: {
    default: "Driftmap",
    template: "%s · Driftmap",
  },
  description:
    "Get lost. On purpose. Driftmap turns exploring a real city into a playable game — and the finished run into a cinematic travel film.",
};

export const viewport: Viewport = {
  themeColor: "#0f0e0c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body className="bg-ink font-sans text-ivory antialiased">
        <GameStateProvider>
          <SiteHeader />
          {children}
          <div
            aria-hidden
            className="grain-overlay pointer-events-none fixed inset-0 z-40 opacity-[0.04]"
          />
        </GameStateProvider>
      </body>
    </html>
  );
}
