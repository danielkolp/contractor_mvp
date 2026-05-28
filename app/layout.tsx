import type { Metadata } from "next";
import { Manrope, Geist } from "next/font/google";

import "./globals.css";

import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Revenue Recovery",
  description:
    "A contractor-friendly revenue recovery dashboard for invoices, clients, and payment follow-up.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn( "h-full antialiased", "font-sans", geist.variable)}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
