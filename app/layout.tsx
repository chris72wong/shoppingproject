import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FORM — Your personal style, figured out.",
  description:
    "Explore outfits on your avatar, swap affordable pieces, and refine your look with your personal style assistant.",
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
