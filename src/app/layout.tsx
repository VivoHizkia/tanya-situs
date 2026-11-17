import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tanya Situs: a chatbot that answers from your own website",
    template: "%s | Tanya Situs",
  },
  description:
    "Add a chatbot to your website in five minutes. It answers visitors from your own pages, links its sources, and hands you the questions it could not answer.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
