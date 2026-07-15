import type { Metadata } from "next";

import { FirebaseAnalytics } from "@/components/firebase-analytics";

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
    <html lang="en">
      <body>
        {children}
        <FirebaseAnalytics />
      </body>
    </html>
  );
}
