import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./daylight.css";
import { daylightFonts } from "./daylight-fonts";
import { Bebas_Neue, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import PublicOnly from "@/components/landing/public-only";

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
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#447244",
};

const toastTop = "max(16px, env(safe-area-inset-top))";
// Sonner uses the left mobile offset for both sides of the toast width.
const toastMobileSide = "max(16px, env(safe-area-inset-left), env(safe-area-inset-right))";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("scroll-smooth", jakarta.variable, athletic.variable, space.variable, daylightFonts)}
      suppressHydrationWarning
    >
      <body className="bg-cream font-sans text-ink" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Header />
          <ConfirmProvider>{children}</ConfirmProvider>
          <PublicOnly><Footer /></PublicOnly>
          <Toaster
            richColors
            position="top-right"
            offset={{ top: toastTop, right: "max(16px, env(safe-area-inset-right))" }}
            mobileOffset={{ top: toastTop, left: toastMobileSide, right: toastMobileSide }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}