import type { Metadata } from "next";
import Script from "next/script";

import { FirebaseAnalytics } from "@/components/firebase-analytics";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SourceHub",
    template: "%s | SourceHub",
  },
  description: "SourceHub service management platform foundation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="sourcehub-theme-init" strategy="beforeInteractive">
          {`(() => { try { const stored = localStorage.getItem("sourcehub-theme"); const mode = stored === "dark" || stored === "light" || stored === "system" ? stored : "system"; const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", dark); document.documentElement.style.colorScheme = dark ? "dark" : "light"; } catch {} })();`}
        </Script>
        <ThemeProvider>
          {children}
          <FirebaseAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
