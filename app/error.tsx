"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button, Card, CardContent, buttonClassName } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-sourcehub-bg">
        <div className="flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-xl">
            <CardContent className="space-y-4 p-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sourcehub-primary">SourceHub</p>
                <h1 className="mt-2 text-2xl font-bold text-sourcehub-text">Something went wrong</h1>
                <p className="mt-2 text-sm text-slate-600">
                  We hit an unexpected issue while loading the app.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={reset}>Try again</Button>
                <Link href="/dashboard" className={buttonClassName({ variant: "outline" })}>
                  Return to dashboard
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </body>
    </html>
  );
}
