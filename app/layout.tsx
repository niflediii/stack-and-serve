import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stack & Serve - Court Management",
  description: "Professional pickleball court management and player queue system.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-body bg-ink text-mist antialiased">{children}</body>
    </html>
  );
}
