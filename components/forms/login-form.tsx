"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type LoginState } from "@/lib/actions/auth";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { EnterpriseSsoButtons } from "@/components/forms/enterprise-sso";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <Card className="w-full border-white/40 bg-white/95 shadow-glow backdrop-blur">
      <CardHeader className="border-b-0 px-8 pb-2 pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sourcehub-primary">SourceHub Access</p>
        <CardTitle className="mt-2 text-2xl">Sign in to continue</CardTitle>
        <CardDescription>
          Use your administrator-issued credentials to access the SourceHub workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-8 pb-8 pt-4">
        {state.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </div>
        ) : null}
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-sourcehub-text">
              Email <span className="text-sourcehub-primary">*</span>
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="admin@sourcehub.local"
              required
              defaultValue={state.values?.email}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-sourcehub-text">
              Password <span className="text-sourcehub-primary">*</span>
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" size="lg" loading={pending}>
            Sign in
          </Button>
        </form>
        <EnterpriseSsoButtons />
        <div className="text-center text-xs text-slate-500">
          Development access only. Contact your Source IT Services administrator for a production account.
        </div>
        <Link href="/" className="block text-center text-sm font-medium text-sourcehub-primary transition hover:text-sourcehub-secondary">
          Return home
        </Link>
      </CardContent>
    </Card>
  );
}
