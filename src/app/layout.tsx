import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="bg-ink text-ivory">{children}</body>
    </html>
  );
}
