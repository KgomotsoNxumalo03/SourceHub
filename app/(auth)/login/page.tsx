import { LoginForm } from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sourcehub-primary">SourceHub</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-sourcehub-text">Welcome back</h2>
        <p className="mt-2 text-sm text-slate-600">Sign in to manage operations, users, and platform settings.</p>
      </div>
      <LoginForm />
    </div>
  );
}
