"use client";

import { useState } from "react";
import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui";

export function EnterpriseSsoButtons() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  async function signIn(provider: "GOOGLE" | "MICROSOFT_ENTRA") {
    setError(null); setLoading(provider);
    try {
      const credentialProvider = provider === "GOOGLE" ? new GoogleAuthProvider() : new OAuthProvider("microsoft.com");
      if (provider === "MICROSOFT_ENTRA") credentialProvider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, credentialProvider);
      const response = await fetch("/api/auth/enterprise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, idToken: await result.user.getIdToken() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Enterprise sign-in was rejected.");
      window.location.assign(body.redirect ?? "/dashboard");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enterprise sign-in failed."); } finally { setLoading(null); }
  }
  return <div className="space-y-3 border-t border-sourcehub-border pt-5"><div className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Enterprise sign-in</div>{error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}<div className="grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" loading={loading === "GOOGLE"} onClick={() => signIn("GOOGLE")}>Continue with Google</Button><Button type="button" variant="outline" loading={loading === "MICROSOFT_ENTRA"} onClick={() => signIn("MICROSOFT_ENTRA")}>Continue with Microsoft</Button></div><p className="text-center text-xs text-slate-500">Only providers enabled by a SourceHub administrator can complete sign-in.</p></div>;
}
