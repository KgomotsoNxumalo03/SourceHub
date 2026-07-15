import Link from "next/link";

import { buttonClassName } from "@/lib/button";
import { Card, CardContent } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-xl">
        <CardContent className="space-y-4 p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sourcehub-primary">SourceHub</p>
            <h1 className="mt-2 text-2xl font-bold text-sourcehub-text">Page not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              The page you tried to open does not exist or may have been moved.
            </p>
          </div>
          <Link href="/dashboard" className={buttonClassName({ variant: "primary" })}>
            Go to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
