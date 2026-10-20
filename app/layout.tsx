import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DentAssist",
  description: "Imenik stomatoloških ordinacija",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sr">
      <body>{children}</body>
    </html>
  );
}
