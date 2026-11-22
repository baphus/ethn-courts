import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Bebas_Neue, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import Header from "@/components/landing/header";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const athletic = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-athletic", display: "swap" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  title: "ETHN Courts — Pickleball court reservations",
  description: "Choose your court time at ETHN Courts in Balamban, Cebu. Guest reservations require payment verification by staff.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("scroll-smooth", jakarta.variable, athletic.variable, space.variable)}
      suppressHydrationWarning
    >
      <body className="bg-cream font-sans text-ink" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <Header />
          {children}
          <Toaster richColors position="top-center" mobileOffset={{ top: "max(16px, env(safe-area-inset-top))" }} />
        </ThemeProvider>
      </body>
    </html>
  );
}