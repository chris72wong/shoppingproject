import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FORM — Your personal style, figured out.",
  description:
    "An AI-inspired personal stylist, digital fitting studio, and considered wardrobe.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
