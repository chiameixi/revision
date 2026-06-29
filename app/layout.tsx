import type { Metadata } from "next";
import { Inria_Serif } from "next/font/google";
import "./globals.css";

const inriaSerif = Inria_Serif({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inria-serif",
});

export const metadata: Metadata = {
  title: "Design Workspace",
  description: "Design ideation and exploration workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inriaSerif.variable}>
      <body>{children}</body>
    </html>
  );
}
