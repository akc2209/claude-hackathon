import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";

const serif = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const mono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});

const bodyFont = Inter({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Grey Matter — Cortical Activation Modeling",
  description: "See what a video does to a human brain, second by second.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${serif.variable} ${mono.variable} ${bodyFont.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
