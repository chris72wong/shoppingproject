import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FORM — Your personal style, figured out.",
  description:
    "Find and refine three considered outfits in one conversation with your personal style assistant.",
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
