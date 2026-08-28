import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DejaView",
  description: "Local-first support knowledge capture and search",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
