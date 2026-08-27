import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// PixelMix by Andrew Tyler - see app/fonts/pixelmix/NOTES.md for the license situation. Exposed
// as a variable only (not applied to body/html) so it stays opt-in for headers/eyebrows/brand
// moments, never body copy - it's unreadable at paragraph sizes.
const pixelmix = localFont({
  src: [
    { path: "./fonts/pixelmix/pixelmix.ttf", weight: "400", style: "normal" },
    { path: "./fonts/pixelmix/pixelmix_bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ThatFridge",
  description: "Your AI kitchen assistant — track groceries, freshness, and what to cook next.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pixelmix.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
