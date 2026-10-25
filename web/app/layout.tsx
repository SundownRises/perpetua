import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perpetua — liquid veBTC with MUSD yield",
  description:
    "Deposit BTC once. Perpetua holds a permanently-locked veBTC position, votes it as a bloc on Mezo's MUSD gauges, and streams the fees back to you in MUSD. No decay, no weekly upkeep, and a liquid token instead of a 28-day lock.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
