import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppMenu } from "@/components/ui/app-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

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
    <html lang="sr" className={cn("font-sans", inter.variable)}>
      <body>
        <TooltipProvider>
          <AppMenu>{children}</AppMenu>
        </TooltipProvider>
      </body>
    </html>
  );
}
