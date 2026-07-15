import Link from "next/link";

import { buttonClassName } from "@/lib/button";
import { Card, CardContent } from "@/components/ui";

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-xl">
        <CardContent className="space-y-4 p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sourcehub-primary">Access denied</p>
            <h1 className="mt-2 text-2xl font-bold text-sourcehub-text">You do not have access to this area</h1>
            <p className="mt-2 text-sm text-slate-600">
              If you believe this is a mistake, contact an administrator and request the relevant permission.
            </p>
          </div>
          <Link href="/dashboard" className={buttonClassName({ variant: "primary" })}>
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
