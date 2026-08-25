import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://articulate.lol"),
  title: "articulate. — speaking well is the original status symbol",
  description:
    "People size you up the second you start talking. Two-minute out-loud reps, scored instantly by AI — sound sharper in every room.",
};

export const viewport: Viewport = {
  themeColor: "#fbfaf5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        {/* DXYZ Dashboard beacon — unique-visitor counting, no cookies. */}
        <script defer src="https://dxyz-dashboard.vercel.app/d/articulate.js" />
      </head>
      <body>
        <Analytics />
        {children}
      </body>
    </html>
  );
}
