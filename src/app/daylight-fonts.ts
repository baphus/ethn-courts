import localFont from "next/font/local";

const geist = localFont({ src: "./fonts/geist-variable.woff2", weight: "100 900", variable: "--font-daylight", display: "swap" });
const mono = localFont({ src: "./fonts/geist-mono-variable.woff2", weight: "100 900", variable: "--font-daylight-mono", display: "swap", preload: false });

export const daylightFonts = `${geist.variable} ${mono.variable}`;
