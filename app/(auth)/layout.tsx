import Link from "next/link";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_0.85fr]">
      <div className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#092058_0%,#11386D_45%,#0F46B0_100%)] p-12 text-white lg:block">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-[#0BBCEB] blur-3xl" />
          <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative flex h-full flex-col justify-between">
          <Link href="/" className="inline-flex items-center gap-3 text-xl font-bold">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">S</span>
            SourceHub
          </Link>
          <div className="max-w-xl space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#0BBCEB]">Source IT Services</p>
            <h1 className="text-5xl font-bold tracking-tight text-balance">
              A service operations foundation built for clarity, control, and growth.
            </h1>
            <p className="max-w-lg text-base leading-7 text-white/80">
              Phase 1 establishes authentication, user administration, auditability, and a shared design system for everything that follows.
            </p>
          </div>
          <div className="grid gap-4 text-sm text-white/75 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="font-semibold text-white">Secure access</p>
              <p className="mt-1">Protected routes, role checks, and database-backed sessions.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="font-semibold text-white">Operational clarity</p>
              <p className="mt-1">Audit logs, notifications, and admin workflows in one place.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="font-semibold text-white">Scalable foundation</p>
              <p className="mt-1">Built to support future modules without reworking the core.</p>
            </div>
          </div>
        </div>
      </div>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
