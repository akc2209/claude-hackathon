import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeuroScan — Cortical Activation Modeling",
  description: "See what a video does to a human brain, second by second.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
