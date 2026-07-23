"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";

export function DropdownMenu({
  trigger,
  children,
  align = "right",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2">
        {trigger}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-20 mt-2 w-56 rounded-2xl border border-sourcehub-border bg-white p-2 shadow-soft",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-sourcehub-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
