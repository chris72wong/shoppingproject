import type { Metadata } from "next";
import "./globals.css";
import "./mirra.css";
export const metadata: Metadata = {
  title: "Mirra — Your personal style, reflected.",
  description:
    "Meet your personal stylist. Explore looks, make them yours, and discover the pieces behind every outfit.",
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
