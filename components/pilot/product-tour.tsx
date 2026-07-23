"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { saveTourProgressAction } from "@/lib/actions/pilot";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

type TourStep = { title: string; description: string; href: string; permission?: string };
const tourSteps: TourStep[] = [
  { title: "Navigation", description: "Use the workspace navigation to open only the modules available to your role.", href: "/dashboard" },
  { title: "Service Desk", description: "Create and follow support work through triage, assignment, SLA, and resolution.", href: "/tickets", permission: "tickets.view" },
  { title: "Clients and assets", description: "Keep client scope and asset history together without crossing tenant boundaries.", href: "/clients", permission: "clients.view" },
  { title: "Attendance and projects", description: "Use legitimate attendance and project workflows; SourceHub does not monitor idle time or applications.", href: "/attendance", permission: "attendance.view" },
  { title: "Knowledge and reports", description: "Find approved guidance and authorised reports, then send structured feedback when something is unclear.", href: "/knowledge", permission: "knowledge.internal.view" },
  { title: "Feedback and support", description: "Use the feedback form without submitting passwords, tokens, customer exports, AI prompts, or documents.", href: "/feedback" },
];

export function ProductTour({ permissions, initialStep = 0 }: { permissions: string[]; initialStep?: number }) {
  const steps = tourSteps.filter((step) => !step.permission || permissions.includes(step.permission));
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), Math.max(steps.length - 1, 0)));
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!steps.length) return null;
  const current = steps[step];
  const save = (next: number, completed: boolean, dismissed = false) => startTransition(() => { void saveTourProgressAction({ step: next, completed, dismissed }); });
  if (!open) return <Card><CardContent className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Optional product tour</p><p className="mt-1 text-sm text-slate-600">A short, role-aware orientation that never blocks normal use.</p></div><Button variant="outline" onClick={() => { setOpen(true); save(step, false); }}>Start tour</Button></CardContent></Card>;
  return <Card role="dialog" aria-labelledby="sourcehub-tour-title"><CardHeader className="flex items-center justify-between gap-3"><div><Badge tone="info">Step {step + 1} of {steps.length}</Badge><CardTitle id="sourcehub-tour-title" className="mt-2">{current.title}</CardTitle></div><Button variant="ghost" size="sm" onClick={() => { setOpen(false); save(step, false, true); }} aria-label="Dismiss product tour">Dismiss</Button></CardHeader><CardContent><p className="text-sm text-slate-600">{current.description}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><Link href={current.href} className="text-sm font-medium text-sourcehub-primary hover:underline" onClick={() => save(step, false)}>Open this area</Link><div className="flex gap-2"><Button variant="outline" disabled={step === 0 || pending} onClick={() => { const next = step - 1; setStep(next); save(next, false); }}>Back</Button>{step < steps.length - 1 ? <Button disabled={pending} onClick={() => { const next = step + 1; setStep(next); save(next, false); }}>Next</Button> : <Button disabled={pending} onClick={() => { setOpen(false); save(step, true); }}>Finish</Button>}</div></div></CardContent></Card>;
}
