import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://articulate.lol"),
  title: "articulate. — training for saying more with less",
  description:
    "A voice-only training ground for becoming more articulate. Describe, explain, make analogies — scored live on conciseness, vocabulary, articulation, and filler. No typing allowed.",
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
      <body>{children}</body>
    </html>
  );
}
